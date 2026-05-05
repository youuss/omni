package executor

import (
	"fmt"
	"strings"
)

// AssemblePrompt builds the prompt argument for an agent node execution.
//
// Assembly order (non-empty parts joined with double newlines):
//  1. Upstream context resolved from allContexts
//  2. Constraint failure context (if retrying)
//  3. Node-level promptExtra override
func AssemblePrompt(node *HarnessNode, allNodes []HarnessNode, connections []Connection, allContexts map[string]*NodeContext, failure *ConstraintFailure) string {
	var parts []string

	// 1. Upstream context
	inherited, slotBindings := resolveContext(node.ID, allNodes, connections, allContexts)
	formatted := formatContextForPrompt(inherited, slotBindings)
	if strings.TrimSpace(formatted) != "" {
		parts = append(parts, formatted)
	}

	// 2. Constraint failure context
	if failure != nil {
		parts = append(parts, formatConstraintFailure(failure))
	}

	// 3. Node-level promptExtra
	if node.Agent != nil && node.Agent.Overrides != nil {
		extra := strings.TrimSpace(node.Agent.Overrides.PromptExtra)
		if extra != "" {
			parts = append(parts, extra)
		}
	}

	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n")
}

// --- Context resolution ---

// resolveContext collects all ancestor contexts for a node, applying contextFilter.
func resolveContext(nodeID string, nodes []HarnessNode, connections []Connection, allContexts map[string]*NodeContext) ([]NodeContext, map[string]string) {
	// Find direct parent IDs
	var directParentIDs []string
	for _, conn := range connections {
		if conn.TargetNodeID == nodeID {
			directParentIDs = append(directParentIDs, conn.SourceNodeID)
		}
	}

	// Apply contextFilter if set
	var node *HarnessNode
	for i := range nodes {
		if nodes[i].ID == nodeID {
			node = &nodes[i]
			break
		}
	}

	allowedParentIDs := directParentIDs
	if node != nil && node.Agent != nil && len(node.Agent.ContextFilter) > 0 {
		filterSet := make(map[string]bool, len(node.Agent.ContextFilter))
		for _, id := range node.Agent.ContextFilter {
			filterSet[id] = true
		}
		var filtered []string
		for _, id := range directParentIDs {
			if filterSet[id] {
				filtered = append(filtered, id)
			}
		}
		allowedParentIDs = filtered
	}

	// Collect all transitive ancestors
	visited := make(map[string]bool, len(allowedParentIDs))
	for _, id := range allowedParentIDs {
		visited[id] = true
	}
	allAncestorIDs := make([]string, len(allowedParentIDs))
	copy(allAncestorIDs, allowedParentIDs)

	for _, parentID := range allowedParentIDs {
		ancestors := collectAncestors(parentID, connections, visited)
		allAncestorIDs = append(allAncestorIDs, ancestors...)
	}

	// Deduplicate preserving order
	seen := make(map[string]bool)
	var uniqueIDs []string
	for _, id := range allAncestorIDs {
		if !seen[id] {
			seen[id] = true
			uniqueIDs = append(uniqueIDs, id)
		}
	}

	// Gather contexts
	var inherited []NodeContext
	for _, id := range uniqueIDs {
		if ctx, ok := allContexts[id]; ok {
			inherited = append(inherited, *ctx)
		}
	}

	// Slot bindings from connections
	slotBindings := make(map[string]string)
	for _, conn := range connections {
		if conn.TargetNodeID != nodeID || conn.SlotBinding == nil {
			continue
		}
		sourceCtx, ok := allContexts[conn.SourceNodeID]
		if !ok {
			continue
		}
		if val, ok := sourceCtx.Outputs[conn.SlotBinding.FromSlot]; ok {
			slotBindings[conn.SlotBinding.ToSlot] = val
		}
	}

	return inherited, slotBindings
}

// collectAncestors recursively collects ancestor node IDs.
func collectAncestors(nodeID string, connections []Connection, visited map[string]bool) []string {
	var directParents []string
	for _, conn := range connections {
		if conn.TargetNodeID == nodeID {
			directParents = append(directParents, conn.SourceNodeID)
		}
	}

	var ancestors []string
	for _, parentID := range directParents {
		if visited[parentID] {
			continue
		}
		visited[parentID] = true
		ancestors = append(ancestors, parentID)
		ancestors = append(ancestors, collectAncestors(parentID, connections, visited)...)
	}
	return ancestors
}

// formatContextForPrompt renders inherited contexts and slot bindings as XML-like tags.
func formatContextForPrompt(inherited []NodeContext, slotBindings map[string]string) string {
	var parts []string

	// Slot bindings first
	for slotName, content := range slotBindings {
		parts = append(parts, fmt.Sprintf("<context slot=%q>\n%s\n</context>", slotName, content))
	}

	// Build set of already-bound values to avoid duplication
	boundValues := make(map[string]bool)
	for _, v := range slotBindings {
		boundValues[v] = true
	}

	// Inherited contexts
	for _, ctx := range inherited {
		for slotName, content := range ctx.Outputs {
			if boundValues[content] {
				continue
			}
			parts = append(parts, fmt.Sprintf("<context from=%q slot=%q>\n%s\n</context>", ctx.NodeID, slotName, content))
		}
	}

	return strings.Join(parts, "\n\n")
}

// formatConstraintFailure renders a ConstraintFailure as an XML-like block.
func formatConstraintFailure(f *ConstraintFailure) string {
	var lines []string
	lines = append(lines, fmt.Sprintf("<constraint-failure name=%q>", f.ConstraintName))

	if f.Command != "" {
		lines = append(lines, fmt.Sprintf("  <command>%s</command>", f.Command))
	}
	if f.ExitCode != 0 {
		lines = append(lines, fmt.Sprintf("  <exitCode>%d</exitCode>", f.ExitCode))
	}
	if f.Stdout != "" {
		lines = append(lines, fmt.Sprintf("  <stdout>%s</stdout>", f.Stdout))
	}
	if f.Stderr != "" {
		lines = append(lines, fmt.Sprintf("  <stderr>%s</stderr>", f.Stderr))
	}
	lines = append(lines, fmt.Sprintf("  <attempt>%d</attempt>", f.Attempt))
	lines = append(lines, "</constraint-failure>")

	return strings.Join(lines, "\n")
}
