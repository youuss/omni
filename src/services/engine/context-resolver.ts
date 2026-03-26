import type { HarnessNode, HarnessConnection } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

export interface ResolvedContext {
  inheritedContexts: NodeContext[];
  slotBindings: Record<string, string>;
}

function collectAncestors(
  nodeId: string,
  connections: HarnessConnection[],
  visited: Set<string>
): string[] {
  const directParents = connections
    .filter((conn) => conn.targetNodeId === nodeId)
    .map((conn) => conn.sourceNodeId);

  const ancestors: string[] = [];
  for (const parentId of directParents) {
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    ancestors.push(parentId);
    ancestors.push(...collectAncestors(parentId, connections, visited));
  }
  return ancestors;
}

export function resolveContext(
  nodeId: string,
  nodes: HarnessNode[],
  connections: HarnessConnection[],
  allContexts: Record<string, NodeContext>
): ResolvedContext {
  const node = nodes.find((n) => n.id === nodeId);

  // Direct parent IDs
  const directParentIds = connections
    .filter((conn) => conn.targetNodeId === nodeId)
    .map((conn) => conn.sourceNodeId);

  // Apply contextFilter if set
  const contextFilter = node?.agent?.contextFilter;
  const allowedParentIds =
    contextFilter && contextFilter.length > 0
      ? directParentIds.filter((id) => contextFilter.includes(id))
      : directParentIds;

  // Collect all transitive ancestors
  const visited = new Set<string>(allowedParentIds);
  const allAncestorIds: string[] = [...allowedParentIds];
  for (const parentId of allowedParentIds) {
    allAncestorIds.push(...collectAncestors(parentId, connections, visited));
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const id of allAncestorIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  const inheritedContexts = uniqueIds
    .map((id) => allContexts[id])
    .filter((ctx): ctx is NodeContext => ctx !== undefined);

  // Explicit slot bindings
  const slotBindings: Record<string, string> = {};
  for (const conn of connections) {
    if (conn.targetNodeId !== nodeId || !conn.slotBinding) continue;
    const sourceCtx = allContexts[conn.sourceNodeId];
    if (!sourceCtx) continue;
    const value = sourceCtx.outputs[conn.slotBinding.fromSlot];
    if (value !== undefined) {
      slotBindings[conn.slotBinding.toSlot] = value;
    }
  }

  return { inheritedContexts, slotBindings };
}

export function formatContextForPrompt(
  inheritedContexts: NodeContext[],
  slotBindings: Record<string, string>
): string {
  const parts: string[] = [];

  for (const [slotName, content] of Object.entries(slotBindings)) {
    parts.push(`<context slot="${slotName}">\n${content}\n</context>`);
  }

  const boundValues = new Set(Object.values(slotBindings));
  for (const ctx of inheritedContexts) {
    for (const [slotName, content] of Object.entries(ctx.outputs)) {
      if (boundValues.has(content)) continue;
      parts.push(`<context from="${ctx.nodeId}" slot="${slotName}">\n${content}\n</context>`);
    }
  }

  return parts.join('\n\n');
}
