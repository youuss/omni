import type { HarnessNode, HarnessConnection } from '../../types/harness';
import type { NodeContext, ConstraintFailure } from '../../types/engine';
import { resolveContext, formatContextForPrompt } from './context-resolver';

// === AssembleOptions ===

export interface AssembleOptions {
  node: HarnessNode;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  constraintFailure?: ConstraintFailure;
}

// === Helpers ===

function formatConstraintFailure(failure: ConstraintFailure): string {
  const lines: string[] = [
    `<constraint-failure name="${failure.constraintName}">`,
  ];

  if (failure.command !== undefined) {
    lines.push(`  <command>${failure.command}</command>`);
  }

  if (failure.exitCode !== undefined) {
    lines.push(`  <exitCode>${failure.exitCode}</exitCode>`);
  }

  if (failure.stdout !== undefined) {
    lines.push(`  <stdout>${failure.stdout}</stdout>`);
  }

  if (failure.stderr !== undefined) {
    lines.push(`  <stderr>${failure.stderr}</stderr>`);
  }

  lines.push(`  <attempt>${failure.attempt}</attempt>`);
  lines.push('</constraint-failure>');

  return lines.join('\n');
}

// === Public API ===

/**
 * Assembles the prompt argument for an agent node execution.
 *
 * This only builds the dynamic context portion — the agent's base system
 * prompt is passed via --system-prompt-file by the runner.
 *
 * Assembly order (each non-empty part joined with double newlines):
 *  1. Upstream context — resolved from allContexts via resolveContext()
 *  2. Constraint failure context — if provided, formatted as <constraint-failure>
 *  3. Node-level promptExtra override
 */
export function assemblePrompt(options: AssembleOptions): string {
  const {
    node,
    allNodes,
    connections,
    allContexts,
    constraintFailure,
  } = options;

  const parts: string[] = [];

  // 1. Upstream context
  const { inheritedContexts, slotBindings } = resolveContext(node.id, allNodes, connections, allContexts);
  const formattedContext = formatContextForPrompt(inheritedContexts, slotBindings);
  if (formattedContext.trim()) {
    parts.push(formattedContext);
  }

  // 2. Constraint failure context
  if (constraintFailure) {
    parts.push(formatConstraintFailure(constraintFailure));
  }

  // 3. Node-level promptExtra
  const promptExtra = node.agent?.overrides?.promptExtra;
  if (promptExtra && promptExtra.trim()) {
    parts.push(promptExtra);
  }

  return parts.join('\n\n');
}
