import type { HarnessNode, HarnessConnection, AgentDefinition } from '../../types/harness';
import type { NodeContext, ConstraintFailure } from '../../types/engine';
import type { SkillMeta } from '../../types/skill';
import { resolveContext, formatContextForPrompt } from './context-resolver';

// === AssembleOptions ===

export interface AssembleOptions {
  node: HarnessNode;
  agent: AgentDefinition;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  extensions?: string[];
  skills?: SkillMeta[];
  constraintFailure?: ConstraintFailure;
}

// === Helpers ===

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
 *  3. Upstream context — resolved from allContexts via resolveContext() and
 *     formatted via formatContextForPrompt()
 *  4. Constraint failure context — if provided, formatted as a
 *     <constraint-failure> block
 *  5. Node-level promptExtra override
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

  // 2.5 Skill metadata index (Level 1)
  const { skills } = options;
  if (skills && skills.length > 0) {
    const index = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n');
    parts.push(
      `## Available Skills\n\n${index}\n\n` +
      'Use the `skill` tool with action "load" and the skill name to get detailed instructions when relevant.'
    );
  }

  // 3. Upstream context
  const { inheritedContexts, slotBindings } = resolveContext(node.id, allNodes, connections, allContexts);
  const formattedContext = formatContextForPrompt(inheritedContexts, slotBindings);
  if (formattedContext.trim()) {
    parts.push(formattedContext);
  }

  // 4. Constraint failure context
  if (constraintFailure) {
    parts.push(formatConstraintFailure(constraintFailure));
  }

  // 5. Node-level promptExtra
  const promptExtra = node.agent?.overrides?.promptExtra;
  if (promptExtra && promptExtra.trim()) {
    parts.push(promptExtra);
  }

  return parts.join('\n\n');
}
