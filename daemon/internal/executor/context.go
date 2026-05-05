package executor

// NodeContext holds the output of a completed node execution.
type NodeContext struct {
	NodeID   string            `json:"nodeId"`
	Outputs  map[string]string `json:"outputs"`
	ExitCode int               `json:"exitCode,omitempty"`
	Metadata map[string]any    `json:"metadata,omitempty"`
}

// ConstraintFailure records details when a constraint check fails.
type ConstraintFailure struct {
	ConstraintName string       `json:"constraintName"`
	CheckType      string       `json:"checkType"`
	Command        string       `json:"command,omitempty"`
	ExitCode       int          `json:"exitCode,omitempty"`
	Stdout         string       `json:"stdout,omitempty"`
	Stderr         string       `json:"stderr,omitempty"`
	Attempt        int          `json:"attempt"`
	SourceNodeID   string       `json:"sourceNodeId"`
	SourceNodeCtx  *NodeContext `json:"sourceNodeContext,omitempty"`
}

// ConstraintCheck describes what to verify after an agent run.
type ConstraintCheck struct {
	Type    string `json:"type"`              // "shell", "file_contains", "expression"
	Command string `json:"command,omitempty"` // for shell
	Path    string `json:"path,omitempty"`    // for file_contains
	Pattern string `json:"pattern,omitempty"` // for file_contains
	Expr    string `json:"expr,omitempty"`    // for expression
}

// OnFailAction determines what happens when a constraint fails.
type OnFailAction struct {
	Type         string `json:"type"`                   // "retry", "route", "abort"
	TargetNodeID string `json:"targetNodeId,omitempty"` // for route
}

// Constraint is a named check with an on-fail policy.
type Constraint struct {
	Name       string         `json:"name"`
	Check      ConstraintCheck `json:"check"`
	OnFail     OnFailAction    `json:"onFail"`
	MaxRetries *int            `json:"maxRetries,omitempty"` // default 3
}

// ConstraintResult is the outcome of a single constraint check.
type ConstraintResult struct {
	Name     string `json:"name"`
	Passed   bool   `json:"passed"`
	ExitCode int    `json:"exitCode,omitempty"`
	Stdout   string `json:"stdout,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	Error    string `json:"error,omitempty"`
}

// CheckAllResult aggregates results from checking all constraints on a node.
type CheckAllResult struct {
	AllPassed       bool
	Results         []ConstraintResult
	FailedConstraint *Constraint
	FailedResult     *ConstraintResult
}

// HarnessNodeType identifies the kind of node in a harness DAG.
type HarnessNodeType string

const (
	NodeTypeAgent     HarnessNodeType = "agent"
	NodeTypeCondition HarnessNodeType = "condition"
	NodeTypeGate      HarnessNodeType = "gate"
)

// RoutingConfig configures dynamic downstream routing for an agent node.
type RoutingConfig struct {
	OutputKey      string            `json:"outputKey"`
	Branches       map[string]string `json:"branches"`       // value -> nodeId
	DefaultBranch  string            `json:"defaultBranch,omitempty"`
}

// SlotBinding maps a source slot to a target slot on a connection.
type SlotBinding struct {
	FromSlot string `json:"fromSlot"`
	ToSlot   string `json:"toSlot"`
}

// AgentConfig holds agent-specific configuration for a harness node.
type AgentConfig struct {
	AgentID       string          `json:"agentId,omitempty"`
	Constraints   []Constraint    `json:"constraints,omitempty"`
	ContextFilter []string        `json:"contextFilter,omitempty"`
	Overrides     *AgentOverrides `json:"overrides,omitempty"`
	Routing       *RoutingConfig  `json:"routing,omitempty"`
}

// AgentOverrides are per-node overrides for model, turns, tools, etc.
type AgentOverrides struct {
	Model        string   `json:"model,omitempty"`
	MaxTurns     int      `json:"maxTurns,omitempty"`
	MaxBudgetUSD float64  `json:"maxBudgetUsd,omitempty"`
	AllowedTools []string `json:"allowedTools,omitempty"`
	PromptExtra  string   `json:"promptExtra,omitempty"`
}

// ConditionConfig holds the expression and branches for a condition node.
type ConditionConfig struct {
	Expression string            `json:"expression"`
	Branches   map[string]string `json:"branches"` // value -> nodeId
}

// GateConfig holds the message for a gate node.
type GateConfig struct {
	GateMessage string `json:"gateMessage,omitempty"`
}

// HarnessNode is a single node in a harness DAG.
type HarnessNode struct {
	ID        string          `json:"id"`
	Type      HarnessNodeType `json:"type"`
	Agent     *AgentConfig    `json:"agent,omitempty"`
	Condition *ConditionConfig `json:"condition,omitempty"`
	Gate      *GateConfig     `json:"gate,omitempty"`
}

// Connection links two nodes in the harness DAG.
type Connection struct {
	ID           string        `json:"id"`
	SourceNodeID string        `json:"sourceNodeId"`
	TargetNodeID string        `json:"targetNodeId"`
	SlotBinding  *SlotBinding  `json:"slotBinding,omitempty"`
}

// HarnessDefinition is the full DAG definition.
type HarnessDefinition struct {
	ID          string       `json:"id"`
	Nodes       []HarnessNode `json:"nodes"`
	Connections []Connection  `json:"connections"`
}

// AgentDefinition is the resolved agent config (from disk).
type AgentDefinition struct {
	ID           string   `json:"id"`
	Name         string   `json:"Name"`
	MaxTurns     int      `json:"maxTurns,omitempty"`
	AllowedTools []string `json:"allowedTools,omitempty"`
}
