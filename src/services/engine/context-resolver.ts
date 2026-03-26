import type { HarnessNode, HarnessConnection, AgentNodeConfig } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

// === Types ===

export interface ResolvedContext {
  inheritedContexts: NodeContext[];
  slotBindings: Record<string, string>;
}

// === Helpers ===

/**
 * Collects all ancestor node IDs by walking connections transitively.
 * Uses a visited set to avoid cycles.
 */
function collectAncestors(
  nodeId: string,
  connections: HarnessConnection[],
  visited: Set<string> = new Set()
): string[] {
  const directParents = connections
    .filter((conn) => conn.targetNodeId === nodeId)
    .map((conn) => conn.sourceNodeId);

  const ancestors: string[] = [];

  for (const parentId of directParents) {
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    ancestors.push(parentId);
    const grandAncestors = collectAncestors(parentId, connections, visited);
    ancestors.push(...grandAncestors);
  }

  return ancestors;
}

// === Exports ===

/**
 * Resolves the upstream context for a given node in the harness DAG.
 *
 * Returns:
 * - `inheritedContexts`: All transitive ancestor contexts, filtered by
 *   `node.config.contextFilter` when set.
 * - `slotBindings`: Explicit slot-to-value mappings from connections that
 *   carry a `slotBinding`.
 */
export function resolveContext(
  nodeId: string,
  nodes: HarnessNode[],
  connections: HarnessConnection[],
  allContexts: Record<string, NodeContext>
): ResolvedContext {
  // 1. Find the node
  const node = nodes.find((n) => n.id === nodeId);

  // 2. Find direct parent IDs
  const directParentIds = connections
    .filter((conn) => conn.targetNodeId === nodeId)
    .map((conn) => conn.sourceNodeId);

  // 3. Apply contextFilter if set on an agent node
  const agentConfig = node?.config as AgentNodeConfig | undefined;
  const contextFilter = agentConfig?.contextFilter;

  const allowedParentIds =
    contextFilter && contextFilter.length > 0
      ? directParentIds.filter((id) => contextFilter.includes(id))
      : directParentIds;

  // 4. Collect all transitive ancestor IDs (from allowed parents upward)
  const visited = new Set<string>(allowedParentIds);
  const allAncestorIds: string[] = [...allowedParentIds];

  for (const parentId of allowedParentIds) {
    const transitive = collectAncestors(parentId, connections, visited);
    allAncestorIds.push(...transitive);
  }

  // Deduplicate while preserving order
  const seenIds = new Set<string>();
  const uniqueAncestorIds: string[] = [];
  for (const id of allAncestorIds) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      uniqueAncestorIds.push(id);
    }
  }

  // Resolve to NodeContext objects (skip ancestors with no recorded context)
  const inheritedContexts: NodeContext[] = uniqueAncestorIds
    .map((id) => allContexts[id])
    .filter((ctx): ctx is NodeContext => ctx !== undefined);

  // 5. Collect explicit slot bindings from connections targeting this node
  const slotBindings: Record<string, string> = {};

  for (const conn of connections) {
    if (conn.targetNodeId !== nodeId) continue;
    if (!conn.slotBinding) continue;

    const sourceContext = allContexts[conn.sourceNodeId];
    if (!sourceContext) continue;

    const value = sourceContext.outputs[conn.slotBinding.sourceSlot];
    if (value !== undefined) {
      slotBindings[conn.slotBinding.targetSlot] = value;
    }
  }

  return { inheritedContexts, slotBindings };
}

/**
 * Formats resolved context into an XML-tagged prompt string suitable for
 * injection into an agent's system prompt or user message.
 *
 * Slot-bound content appears first, then any remaining inherited outputs
 * that are not already covered by a slot binding.
 */
export function formatContextForPrompt(
  inheritedContexts: NodeContext[],
  slotBindings: Record<string, string>
): string {
  const parts: string[] = [];

  // First: slot-bound content
  for (const [slotName, content] of Object.entries(slotBindings)) {
    parts.push(`<context slot="${slotName}">\n${content}\n</context>`);
  }

  // Then: inherited outputs not already covered by slot bindings
  const boundValues = new Set(Object.values(slotBindings));

  for (const ctx of inheritedContexts) {
    for (const [slotName, content] of Object.entries(ctx.outputs)) {
      if (boundValues.has(content)) continue;
      parts.push(`<context from="${ctx.nodeId}" slot="${slotName}">\n${content}\n</context>`);
    }
  }

  return parts.join('\n\n');
}
