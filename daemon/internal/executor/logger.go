package executor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Logger writes JSONL log files for harness executions.
type Logger struct {
	projectDir string
	runID      string
}

// NewLogger creates a logger for the given project and run.
func NewLogger(projectDir, runID string) *Logger {
	return &Logger{projectDir: projectDir, runID: runID}
}

func (l *Logger) logDir() string {
	return filepath.Join(l.projectDir, ".harness", "runs", l.runID, "logs")
}

// AppendNodeLog appends an event to the per-node JSONL log file.
func (l *Logger) AppendNodeLog(nodeID string, attempt int, event map[string]any) error {
	dir := l.logDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create log dir: %w", err)
	}
	filename := filepath.Join(dir, fmt.Sprintf("%s.%d.jsonl", nodeID, attempt))
	return appendJSONL(filename, event)
}

// AppendExecutionLog appends an event to the harness-level execution log.
func (l *Logger) AppendExecutionLog(event map[string]any) error {
	dir := l.logDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create log dir: %w", err)
	}
	filename := filepath.Join(dir, "execution.jsonl")
	return appendJSONL(filename, event)
}

// appendJSONL marshals the event as JSON and appends it as a line to the file.
func appendJSONL(filename string, event map[string]any) error {
	event["ts"] = time.Now().UnixMilli()

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	data = append(data, '\n')

	f, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write log: %w", err)
	}
	return nil
}
