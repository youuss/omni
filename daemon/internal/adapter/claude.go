package adapter

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

// ClaudeAdapter implements AgentExecutor by spawning the claude CLI.
type ClaudeAdapter struct {
	mu    sync.Mutex
	procs map[string]*exec.Cmd
}

// NewClaudeAdapter returns a ready-to-use ClaudeAdapter.
func NewClaudeAdapter() *ClaudeAdapter {
	return &ClaudeAdapter{procs: make(map[string]*exec.Cmd)}
}

func (a *ClaudeAdapter) SupportsCLI() CLIType {
	return CLIClaudeCode
}

// Execute spawns claude with --print --output-format stream-json and streams events.
func (a *ClaudeAdapter) Execute(ctx context.Context, req ExecuteRequest) (<-chan AgentEvent, error) {
	args := []string{
		"--print",
		"--output-format", "stream-json",
		"--max-turns", fmt.Sprintf("%d", req.MaxTurns),
	}

	if req.SystemPrompt != "" {
		args = append(args, "--system-prompt", req.SystemPrompt)
	}

	if len(req.AllowedTools) > 0 {
		args = append(args, "--allowedTools", strings.Join(req.AllowedTools, ","))
	}

	args = append(args, "--", req.Prompt)

	cmd := exec.CommandContext(ctx, "claude", args...)
	if req.WorkingDir != "" {
		cmd.Dir = req.WorkingDir
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}

	a.mu.Lock()
	a.procs[req.ExecutionID] = cmd
	a.mu.Unlock()

	events := make(chan AgentEvent, 100)

	go func() {
		defer close(events)
		defer func() {
			a.mu.Lock()
			delete(a.procs, req.ExecutionID)
			a.mu.Unlock()
		}()

		// Read stdout (JSONL stream).
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			var raw map[string]any
			if err := json.Unmarshal([]byte(line), &raw); err != nil {
				// Non-JSON line: emit as plain text.
				events <- AgentEvent{Type: EventText, Content: line}
				continue
			}

			msgType, _ := raw["type"].(string)
			switch msgType {
			case "assistant":
				a.parseAssistantMessage(raw, events)
			case "result":
				events <- AgentEvent{Type: EventDone, Content: "completed"}
			}
		}

		// Read stderr.
		errScanner := bufio.NewScanner(stderr)
		for errScanner.Scan() {
			events <- AgentEvent{Type: EventError, Content: errScanner.Text()}
		}

		// Wait for process to exit.
		cmd.Wait()
	}()

	return events, nil
}

// parseAssistantMessage extracts text and tool_use blocks from an assistant message.
func (a *ClaudeAdapter) parseAssistantMessage(raw map[string]any, events chan<- AgentEvent) {
	content, ok := raw["message"].(map[string]any)
	if !ok {
		return
	}
	blocks, ok := content["content"].([]any)
	if !ok {
		return
	}
	for _, block := range blocks {
		b, ok := block.(map[string]any)
		if !ok {
			continue
		}
		blockType, _ := b["type"].(string)
		switch blockType {
		case "text":
			if text, ok := b["text"].(string); ok {
				events <- AgentEvent{Type: EventText, Content: text}
			}
		case "tool_use":
			name, _ := b["name"].(string)
			input, _ := json.Marshal(b["input"])
			events <- AgentEvent{Type: EventToolUse, ToolName: name, ToolInput: string(input)}
		}
	}
}

// Abort kills the running process for the given execution ID.
func (a *ClaudeAdapter) Abort(executionID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if cmd, ok := a.procs[executionID]; ok {
		return cmd.Process.Kill()
	}
	return nil
}
