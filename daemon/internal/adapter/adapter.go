package adapter

import "context"

// CLIType identifies a supported agent CLI backend.
type CLIType string

const (
	CLIClaudeCode CLIType = "claude-code"
)

// ExecuteRequest holds all parameters needed to run an agent.
type ExecuteRequest struct {
	ExecutionID  string
	AgentName    string
	Prompt       string
	SystemPrompt string
	WorkingDir   string
	AllowedTools []string
	MaxTurns     int
	MaxBudgetUSD float64
	SessionID    string
}

// EventType categorizes streaming events from an agent run.
type EventType string

const (
	EventText       EventType = "text"
	EventToolUse    EventType = "tool_use"
	EventToolResult EventType = "tool_result"
	EventError      EventType = "error"
	EventDone       EventType = "done"
)

// AgentEvent is a single event emitted during agent execution.
type AgentEvent struct {
	Type      EventType
	Content   string
	ToolName  string
	ToolInput string
}

// AgentExecutor is the interface that all CLI adapters must implement.
type AgentExecutor interface {
	// Execute spawns the agent CLI and returns a channel of streaming events.
	Execute(ctx context.Context, req ExecuteRequest) (<-chan AgentEvent, error)

	// Abort kills a running execution by its ID.
	Abort(executionID string) error

	// SupportsCLI returns the CLI type this adapter handles.
	SupportsCLI() CLIType
}
