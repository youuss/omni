package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/user/omni-fabric-daemon/internal/adapter"
)

const defaultMaxRetries = 3

// NodeStatus represents the execution state of a harness node.
type NodeStatus string

const (
	StatusPending   NodeStatus = "pending"
	StatusReady     NodeStatus = "ready"
	StatusRunning   NodeStatus = "running"
	StatusChecking  NodeStatus = "checking"
	StatusCompleted NodeStatus = "completed"
	StatusFailed    NodeStatus = "failed"
	StatusSkipped   NodeStatus = "skipped"
	StatusWaiting   NodeStatus = "waiting"
)

// NodeRuntime tracks the live state of a node during execution.
type NodeRuntime struct {
	Status             NodeStatus
	Attempt            int
	Error              string
	ConstraintFailure  *ConstraintFailure
}

// Callbacks are hooks the state machine calls during execution.
type Callbacks struct {
	OnNodeStatusChange func(nodeID string, status NodeStatus, attempt int, errMsg string)
	OnNodeContext       func(nodeID string, ctx *NodeContext)
	OnStreamEvent       func(nodeID string, event adapter.AgentEvent)
	OnGateWait          func(nodeID string, message string) bool
	OnDone              func(success bool)
}

// Options configures a state machine run.
type Options struct {
	ProjectDir  string
	RunID       string
	Harness     HarnessDefinition
	Agents      []AgentDefinition
	Executor    adapter.AgentExecutor
	Callbacks   Callbacks
	StartFrom   string // optional: start from a specific node
	StepMode    bool
}

// StateMachine is the core event-driven harness executor.
type StateMachine struct {
	opts          Options
	nodeStates    map[string]*NodeRuntime
	contexts      map[string]*NodeContext
	activeHandles map[string]context.CancelFunc
	aborted       bool
	startedAt     time.Time
	mu            sync.Mutex
}

// NewStateMachine creates a new state machine for the given harness.
func NewStateMachine(opts Options) *StateMachine {
	return &StateMachine{
		opts:          opts,
		nodeStates:    make(map[string]*NodeRuntime),
		contexts:      make(map[string]*NodeContext),
		activeHandles: make(map[string]context.CancelFunc),
		startedAt:     time.Now(),
	}
}

// Execute runs the harness to completion.
func (sm *StateMachine) Execute() error {
	harness := sm.opts.Harness
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)

	// Initialize all nodes to pending
	for i := range harness.Nodes {
		sm.nodeStates[harness.Nodes[i].ID] = &NodeRuntime{Status: StatusPending}
	}

	// Mark entry nodes (no incoming connections) as ready
	hasIncoming := make(map[string]bool)
	for _, conn := range harness.Connections {
		hasIncoming[conn.TargetNodeID] = true
	}
	for _, node := range harness.Nodes {
		if !hasIncoming[node.ID] {
			sm.setNodeStatus(node.ID, StatusReady, "")
		}
	}

	// Log harness start
	nodeIDs := make([]string, len(harness.Nodes))
	for i, n := range harness.Nodes {
		nodeIDs[i] = n.ID
	}
	logger.AppendExecutionLog(map[string]any{
		"type":    "harness_start",
		"harnessId": harness.ID,
		"nodes":   nodeIDs,
	})

	// Event loop
	for !sm.aborted {
		readyNodes := sm.getNodesByStatus(StatusReady)
		if len(readyNodes) == 0 {
			running := sm.getNodesByStatus(StatusRunning)
			checking := sm.getNodesByStatus(StatusChecking)
			waiting := sm.getNodesByStatus(StatusWaiting)
			if len(running) == 0 && len(checking) == 0 && len(waiting) == 0 {
				break
			}
			time.Sleep(100 * time.Millisecond)
			continue
		}

		// Dispatch all ready nodes in parallel
		var wg sync.WaitGroup
		for _, nodeID := range readyNodes {
			wg.Add(1)
			go func(nid string) {
				defer wg.Done()
				sm.dispatchNode(nid)
			}(nodeID)
		}
		wg.Wait()

		// Step mode: pause after each batch
		if sm.opts.StepMode {
			nextReady := sm.getNodesByStatus(StatusReady)
			if len(nextReady) > 0 && sm.opts.Callbacks.OnGateWait != nil {
				shouldContinue := sm.opts.Callbacks.OnGateWait("__step_mode__", "Step mode: continue to next nodes?")
				if !shouldContinue {
					sm.aborted = true
					break
				}
			}
		}
	}

	// Determine success
	allDone := true
	for _, node := range harness.Nodes {
		rt := sm.nodeStates[node.ID]
		if rt != nil && rt.Status != StatusCompleted && rt.Status != StatusSkipped {
			allDone = false
			break
		}
	}

	logger.AppendExecutionLog(map[string]any{
		"type":       "harness_end",
		"success":    allDone,
		"durationMs": time.Since(sm.startedAt).Milliseconds(),
	})

	sm.persistState()

	if sm.opts.Callbacks.OnDone != nil {
		sm.opts.Callbacks.OnDone(allDone)
	}

	return nil
}

// Abort cancels all active agent executions.
func (sm *StateMachine) Abort() {
	sm.mu.Lock()
	sm.aborted = true
	for _, cancel := range sm.activeHandles {
		cancel()
	}
	sm.mu.Unlock()
}

// --- dispatch ---

func (sm *StateMachine) dispatchNode(nodeID string) {
	harness := sm.opts.Harness
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)

	var node *HarnessNode
	for i := range harness.Nodes {
		if harness.Nodes[i].ID == nodeID {
			node = &harness.Nodes[i]
			break
		}
	}
	if node == nil {
		return
	}

	runtime := sm.nodeStates[nodeID]
	sm.setNodeStatus(nodeID, StatusRunning, "")

	logger.AppendExecutionLog(map[string]any{
		"type":    "node_dispatch",
		"nodeId":  nodeID,
		"attempt": runtime.Attempt,
	})

	switch node.Type {
	case NodeTypeAgent:
		sm.executeAgentNode(node, runtime)
	case NodeTypeCondition:
		sm.executeConditionNode(node)
	case NodeTypeGate:
		sm.executeGateNode(node)
	}
}

// --- agent node ---

func (sm *StateMachine) executeAgentNode(node *HarnessNode, runtime *NodeRuntime) {
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)

	// Find the agent definition
	agentID := ""
	if node.Agent != nil {
		agentID = node.Agent.AgentID
	}
	var agentDef *AgentDefinition
	for i := range sm.opts.Agents {
		if sm.opts.Agents[i].ID == agentID || sm.opts.Agents[i].Name == agentID {
			agentDef = &sm.opts.Agents[i]
			break
		}
	}
	if agentDef == nil {
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Agent not found: %s", agentID))
		return
	}

	// Assemble prompt
	prompt := AssemblePrompt(node, sm.opts.Harness.Nodes, sm.opts.Harness.Connections, sm.contexts, runtime.ConstraintFailure)
	if prompt == "" {
		prompt = "Execute the task as instructed by your system prompt."
	}

	// Log node start
	logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
		"type":    "node_start",
		"nodeId":  node.ID,
		"attempt": runtime.Attempt,
	})

	startTime := time.Now()

	// Build execute request
	maxTurns := agentDef.MaxTurns
	if node.Agent != nil && node.Agent.Overrides != nil && node.Agent.Overrides.MaxTurns > 0 {
		maxTurns = node.Agent.Overrides.MaxTurns
	}
	allowedTools := agentDef.AllowedTools
	if node.Agent != nil && node.Agent.Overrides != nil && len(node.Agent.Overrides.AllowedTools) > 0 {
		allowedTools = node.Agent.Overrides.AllowedTools
	}

	ctx, cancel := context.WithCancel(context.Background())
	sm.mu.Lock()
	sm.activeHandles[node.ID] = cancel
	sm.mu.Unlock()

	req := adapter.ExecuteRequest{
		ExecutionID:  fmt.Sprintf("%s-%s-%d", sm.opts.RunID, node.ID, runtime.Attempt),
		AgentName:    agentDef.Name,
		Prompt:       prompt,
		WorkingDir:   sm.opts.ProjectDir,
		AllowedTools: allowedTools,
		MaxTurns:     maxTurns,
	}

	events, err := sm.opts.Executor.Execute(ctx, req)
	if err != nil {
		cancel()
		sm.mu.Lock()
		delete(sm.activeHandles, node.ID)
		sm.mu.Unlock()
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("agent execute: %v", err))
		return
	}

	// Consume events
	var exitCode int
	for event := range events {
		if sm.opts.Callbacks.OnStreamEvent != nil {
			sm.opts.Callbacks.OnStreamEvent(node.ID, event)
		}
		logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
			"type": "stream_message",
			"data": map[string]any{
				"type":      string(event.Type),
				"content":   event.Content,
				"toolName":  event.ToolName,
				"toolInput": event.ToolInput,
			},
		})
		if event.Type == adapter.EventDone {
			exitCode = 0
		}
		if event.Type == adapter.EventError {
			exitCode = 1
		}
	}

	cancel()
	sm.mu.Lock()
	delete(sm.activeHandles, node.ID)
	sm.mu.Unlock()

	// Log node end
	logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
		"type":       "node_end",
		"nodeId":     node.ID,
		"exitCode":   exitCode,
		"durationMs": time.Since(startTime).Milliseconds(),
	})

	// Build node context
	ctx_out := &NodeContext{
		NodeID:   node.ID,
		Outputs:  make(map[string]string),
		ExitCode: exitCode,
		Metadata: make(map[string]any),
	}
	sm.contexts[node.ID] = ctx_out
	if sm.opts.Callbacks.OnNodeContext != nil {
		sm.opts.Callbacks.OnNodeContext(node.ID, ctx_out)
	}

	// Check constraints
	constraints := []Constraint{}
	if node.Agent != nil {
		constraints = node.Agent.Constraints
	}
	if len(constraints) > 0 {
		sm.setNodeStatus(node.ID, StatusChecking, "")
		sm.checkNodeConstraints(node, runtime, ctx_out)
	} else {
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		logger.AppendExecutionLog(map[string]any{
			"type":     "node_complete",
			"nodeId":   node.ID,
			"exitCode": ctx_out.ExitCode,
			"logFile":  fmt.Sprintf("logs/%s.%d.jsonl", node.ID, runtime.Attempt),
		})
		if node.Agent != nil && node.Agent.Routing != nil {
			sm.applyDynamicRouting(node, ctx_out)
		} else {
			sm.advanceDownstream(node.ID)
		}
	}
}

// --- constraint checking ---

func (sm *StateMachine) checkNodeConstraints(node *HarnessNode, runtime *NodeRuntime, ctx *NodeContext) {
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)
	constraints := []Constraint{}
	if node.Agent != nil {
		constraints = node.Agent.Constraints
	}

	result := CheckAllConstraints(constraints, ctx, sm.contexts, sm.opts.ProjectDir)

	// Log each constraint check
	for _, r := range result.Results {
		logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
			"type":     "constraint_check",
			"name":     r.Name,
			"passed":   r.Passed,
			"exitCode": r.ExitCode,
			"stdout":   r.Stdout,
			"stderr":   r.Stderr,
		})
	}

	if result.AllPassed {
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		logger.AppendExecutionLog(map[string]any{
			"type":     "node_complete",
			"nodeId":   node.ID,
			"exitCode": ctx.ExitCode,
			"logFile":  fmt.Sprintf("logs/%s.%d.jsonl", node.ID, runtime.Attempt),
		})
		if node.Agent != nil && node.Agent.Routing != nil {
			sm.applyDynamicRouting(node, ctx)
		} else {
			sm.advanceDownstream(node.ID)
		}
		return
	}

	// Constraint failed
	maxRetries := defaultMaxRetries
	if result.FailedConstraint.MaxRetries != nil {
		maxRetries = *result.FailedConstraint.MaxRetries
	}

	if runtime.Attempt >= maxRetries {
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Constraint %q failed after %d retries", result.FailedConstraint.Name, maxRetries))
		return
	}

	failure := &ConstraintFailure{
		ConstraintName: result.FailedConstraint.Name,
		CheckType:      result.FailedConstraint.Check.Type,
		Command:        result.FailedConstraint.Check.Command,
		ExitCode:       result.FailedResult.ExitCode,
		Stdout:         result.FailedResult.Stdout,
		Stderr:         result.FailedResult.Stderr,
		Attempt:        runtime.Attempt,
		SourceNodeID:   node.ID,
		SourceNodeCtx:  ctx,
	}

	action := result.FailedConstraint.OnFail

	switch action.Type {
	case "retry":
		runtime.Attempt++
		runtime.ConstraintFailure = failure
		sm.setNodeStatus(node.ID, StatusReady, "")
		logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
			"type":   "constraint_retry",
			"attempt": runtime.Attempt,
			"reason": fmt.Sprintf("%s failed", result.FailedConstraint.Name),
		})

	case "route":
		targetNodeID := action.TargetNodeID
		if targetRuntime, ok := sm.nodeStates[targetNodeID]; ok {
			targetRuntime.ConstraintFailure = failure
			sm.setNodeStatus(targetNodeID, StatusReady, "")
		}
		logger.AppendExecutionLog(map[string]any{
			"type":       "constraint_route",
			"fromNode":   node.ID,
			"constraint": result.FailedConstraint.Name,
			"toNode":     targetNodeID,
		})
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Routed to %s", targetNodeID))

	case "abort":
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Constraint %q failed, aborting", result.FailedConstraint.Name))
		sm.aborted = true
	}
}

// --- condition node ---

func (sm *StateMachine) executeConditionNode(node *HarnessNode) {
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)
	config := node.Condition
	if config == nil {
		return
	}

	// Build nodes map for expression evaluation
	nodesMap := make(map[string]map[string]any)
	for id, ctx := range sm.contexts {
		nodesMap[id] = map[string]any{
			"exitCode": ctx.ExitCode,
			"outputs":  ctx.Outputs,
			"metadata": ctx.Metadata,
		}
	}

	// NOTE: Expression evaluation in Go is limited. We use a simple string match approach.
	// For complex expressions, a JS VM or CEL evaluator would be needed.
	result := evaluateSimpleExpression(config.Expression, nodesMap)

	logger.AppendNodeLog(node.ID, 0, map[string]any{
		"type":       "condition_eval",
		"nodeId":     node.ID,
		"expression": config.Expression,
		"result":     result,
	})

	branch := "default"
	if _, ok := config.Branches[result]; ok {
		branch = result
	}

	logger.AppendExecutionLog(map[string]any{
		"type":   "condition_branch",
		"nodeId": node.ID,
		"branch": branch,
	})

	sm.contexts[node.ID] = &NodeContext{
		NodeID:  node.ID,
		Outputs: map[string]string{"result": result},
		Metadata: map[string]any{"branch": branch},
	}

	sm.setNodeStatus(node.ID, StatusCompleted, "")

	// Activate selected branch, skip others
	selectedTargetID := config.Branches[result]
	for _, targetID := range config.Branches {
		if targetID == selectedTargetID {
			sm.setNodeStatus(targetID, StatusReady, "")
		} else {
			sm.setNodeStatus(targetID, StatusSkipped, "")
			logger.AppendExecutionLog(map[string]any{
				"type":   "node_skipped",
				"nodeId": targetID,
				"reason": "Condition branch not selected",
			})
		}
	}
}

// evaluateSimpleExpression handles basic expression evaluation.
// For now, it supports direct value lookups like: nodes["id"].exitCode == 0
func evaluateSimpleExpression(expr string, nodes map[string]map[string]any) string {
	// This is a placeholder. A full implementation would use a JS VM or CEL.
	// For now, return "default" to indicate no branch matched.
	return "default"
}

// --- gate node ---

func (sm *StateMachine) executeGateNode(node *HarnessNode) {
	logger := NewLogger(sm.opts.ProjectDir, sm.opts.RunID)

	sm.setNodeStatus(node.ID, StatusWaiting, "")

	message := ""
	if node.Gate != nil {
		message = node.Gate.GateMessage
	}

	logger.AppendNodeLog(node.ID, 0, map[string]any{
		"type":    "gate_wait",
		"nodeId":  node.ID,
		"message": message,
	})

	shouldContinue := false
	if sm.opts.Callbacks.OnGateWait != nil {
		shouldContinue = sm.opts.Callbacks.OnGateWait(node.ID, message)
	}

	logger.AppendNodeLog(node.ID, 0, map[string]any{
		"type":   "gate_resume",
		"nodeId": node.ID,
	})

	if shouldContinue {
		sm.contexts[node.ID] = &NodeContext{
			NodeID:   node.ID,
			Outputs:  make(map[string]string),
			Metadata: map[string]any{"approved": true},
		}
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		sm.advanceDownstream(node.ID)
	} else {
		sm.setNodeStatus(node.ID, StatusFailed, "Gate rejected by user")
	}
}

// --- downstream advancement ---

func (sm *StateMachine) advanceDownstream(completedNodeID string) {
	harness := sm.opts.Harness

	// Find all downstream nodes
	var downstream []string
	for _, conn := range harness.Connections {
		if conn.SourceNodeID == completedNodeID {
			downstream = append(downstream, conn.TargetNodeID)
		}
	}

	for _, targetID := range downstream {
		// Find all upstream nodes of target
		var upstreamIDs []string
		for _, conn := range harness.Connections {
			if conn.TargetNodeID == targetID {
				upstreamIDs = append(upstreamIDs, conn.SourceNodeID)
			}
		}

		// Check if all upstream are completed
		allDone := true
		for _, uid := range upstreamIDs {
			state := sm.nodeStates[uid]
			if state == nil || state.Status != StatusCompleted {
				allDone = false
				break
			}
		}

		if allDone {
			targetState := sm.nodeStates[targetID]
			if targetState != nil && targetState.Status == StatusPending {
				sm.setNodeStatus(targetID, StatusReady, "")
			}
		}
	}
}

// --- dynamic routing ---

func (sm *StateMachine) applyDynamicRouting(node *HarnessNode, ctx *NodeContext) {
	if node.Agent == nil || node.Agent.Routing == nil {
		return
	}

	routing := node.Agent.Routing
	decision := ctx.Outputs[routing.OutputKey]
	selectedNodeID := routing.Branches[decision]
	if selectedNodeID == "" {
		selectedNodeID = routing.DefaultBranch
	}

	// Find downstream nodes
	var downstream []string
	for _, conn := range sm.opts.Harness.Connections {
		if conn.SourceNodeID == node.ID {
			downstream = append(downstream, conn.TargetNodeID)
		}
	}

	for _, targetID := range downstream {
		if targetID == selectedNodeID {
			sm.setNodeStatus(targetID, StatusReady, "")
		} else {
			sm.setNodeStatus(targetID, StatusSkipped, "")
		}
	}
}

// --- helpers ---

func (sm *StateMachine) setNodeStatus(nodeID string, status NodeStatus, errMsg string) {
	sm.mu.Lock()
	runtime := sm.nodeStates[nodeID]
	if runtime != nil {
		runtime.Status = status
		if errMsg != "" {
			runtime.Error = errMsg
		}
	}
	sm.mu.Unlock()

	if sm.opts.Callbacks.OnNodeStatusChange != nil {
		attempt := 0
		if runtime != nil {
			attempt = runtime.Attempt
		}
		sm.opts.Callbacks.OnNodeStatusChange(nodeID, status, attempt, errMsg)
	}
}

func (sm *StateMachine) getNodesByStatus(status NodeStatus) []string {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var result []string
	for id, rt := range sm.nodeStates {
		if rt.Status == status {
			result = append(result, id)
		}
	}
	return result
}

func (sm *StateMachine) persistState() {
	state := map[string]any{
		"harnessId": sm.opts.Harness.ID,
		"runId":     sm.opts.RunID,
		"startedAt": sm.startedAt.UTC().Format(time.RFC3339),
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	}

	nodeStates := make(map[string]map[string]any)
	sm.mu.Lock()
	for id, rt := range sm.nodeStates {
		nodeStates[id] = map[string]any{
			"status":  string(rt.Status),
			"attempt": rt.Attempt,
			"error":   rt.Error,
		}
	}
	sm.mu.Unlock()

	state["nodeStates"] = nodeStates

	contexts := make(map[string]*NodeContext)
	sm.mu.Lock()
	for id, ctx := range sm.contexts {
		contexts[id] = ctx
	}
	sm.mu.Unlock()

	state["contexts"] = contexts

	data, _ := json.MarshalIndent(state, "", "  ")

	dir := filepath.Join(sm.opts.ProjectDir, ".harness", "runs", sm.opts.RunID)
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "state.json"), data, 0644)
}
