import type { HarnessNode, HarnessConnection, AgentDefinition } from '../../types/harness';
import type { NodeContext, ConstraintFailure } from '../../types/engine';
import { resolveContext, formatContextForPrompt } from './context-resolver';

// === AssembleOptions ===

export interface AssembleOptions {
  node: HarnessNode;
  agent: AgentDefinition;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  extensions?: string[];
  constraintFailure?: ConstraintFailure;
  harnessInputs?: Record<string, string>;
}

// === Helpers ===

/**
 * Returns true if the given node has no incoming connections (i.e. it is an
 * entry node in the DAG).
 */
function isEntryNode(nodeId: string, connections: HarnessConnection[]): boolean {
  return !connections.some((c) => c.targetNodeId === nodeId);
}

/**
 * Formats harness inputs as XML-style `<input>` blocks suitable for prompt
 * injection.
 */
function formatHarnessInputs(inputs: Record<string, string>): string {
  return Object.entries(inputs)
    .map(([name, value]) => `<input name="${name}">\n${value}\n</input>`)
    .join('\n\n');
}

/**
 * Formats a constraint failure as an XML-style `<constraint-failure>` block
 * so the agent can understand what went wrong and retry with corrected output.
 */
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
 * Assembles the final prompt string for an agent node execution.
 *
 * Assembly order (each non-empty part joined with double newlines):
 *  1. Agent prompt template
 *  2. Extension strings (each appended in order)
 *  3. Harness inputs — only injected for entry nodes (no incoming connections)
 *  4. Upstream context — resolved from allContexts via resolveContext() and
 *     formatted via formatContextForPrompt()
 *  5. Constraint failure context — if provided, formatted as a
 *     <constraint-failure> block
 *  6. Node-level promptExtra override
 */
export function assemblePrompt(options: AssembleOptions): string {
  const {
    node,
    agent,
    allNodes,
    connections,
    allContexts,
    extensions,
    constraintFailure,
    harnessInputs,
  } = options;

  const parts: string[] = [];

  // 1. Agent prompt template
  if (agent.promptTemplate) {
    parts.push(agent.promptTemplate);
  }

  // 2. Extensions
  if (extensions && extensions.length > 0) {
    for (const ext of extensions) {
      if (ext.trim()) {
        parts.push(ext);
      }
    }
  }

  // 3. Harness inputs — entry nodes only
  if (
    harnessInputs &&
    Object.keys(harnessInputs).length > 0 &&
    isEntryNode(node.id, connections)
  ) {
    parts.push(formatHarnessInputs(harnessInputs));
  }

  // 4. Upstream context
  const { inheritedContexts, slotBindings } = resolveContext(node.id, allNodes, connections, allContexts);
  const formattedContext = formatContextForPrompt(inheritedContexts, slotBindings);
  if (formattedContext.trim()) {
    parts.push(formattedContext);
  }

  // 5. Constraint failure context
  if (constraintFailure) {
    parts.push(formatConstraintFailure(constraintFailure));
  }

  // 6. Node-level promptExtra
  const promptExtra = node.agent?.overrides?.promptExtra;
  if (promptExtra && promptExtra.trim()) {
    parts.push(promptExtra);
  }

  return parts.join('\n\n');
}
