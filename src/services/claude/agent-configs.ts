import type { AgentConfig, AgentName } from '../../types';

export const AGENT_CONFIGS: Record<AgentName, AgentConfig> = {
  Planner: {
    name: 'Planner',
    systemPromptFile: 'resources/agents/Planner.md',
    allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
    maxTurns: 20,
  },
  Implementer: {
    name: 'Implementer',
    systemPromptFile: 'resources/agents/Implementer.md',
    allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
    maxTurns: 50,
  },
  Verifier: {
    name: 'Verifier',
    systemPromptFile: 'resources/agents/Verifier.md',
    allowedTools: ['Read', 'Glob', 'Grep'],
    maxTurns: 15,
  },
  Analyzer: {
    name: 'Analyzer',
    systemPromptFile: 'resources/agents/Analyzer.md',
    allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
    maxTurns: 20,
  },
};
