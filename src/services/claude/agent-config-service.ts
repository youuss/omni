import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import type { AgentName } from '../../types';
import { ensureDefaultHarness } from '../harness-service';

export interface AgentConfig {
  systemPrompt?: string;
  allowedTools: string[];
  maxTurns: number;
}

const AGENT_NAMES: AgentName[] = ['Planner', 'Implementer', 'Verifier', 'Analyzer'];

interface AgentDefaults extends Omit<AgentConfig, 'systemPrompt'> {
  promptTemplate: string;
}

const BUILT_IN_DEFAULTS: Record<string, AgentDefaults> = {
  Planner: {
    allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
    maxTurns: 20,
    promptTemplate: 'Based on the following requirements, generate a development plan and write it to .harness/runs/{{runId}}/outputs/dev-plan.md.\n\nRequirements: Read .harness/runs/{{runId}}/inputs/requirements.md',
  },
  Implementer: {
    allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
    maxTurns: 50,
    promptTemplate: 'Implement the code according to the dev plan in .harness/runs/{{runId}}/outputs/dev-plan.md. After completion, append the delivery checklist to the plan.',
  },
  Verifier: {
    allowedTools: ['Read', 'Glob', 'Grep'],
    maxTurns: 15,
    promptTemplate: 'Verify whether the implementation meets the plan requirements.\nRead .harness/runs/{{runId}}/outputs/dev-plan.md for plan details, then review the code and write the verification report to .harness/runs/{{runId}}/outputs/verification-report.md',
  },
  Analyzer: {
    allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
    maxTurns: 20,
    promptTemplate: 'Analyze the following bug description, investigate the codebase to find the root cause, and write a fix plan to .harness/runs/{{runId}}/outputs/fix-plan.md.\n\nBug description: Read .harness/runs/{{runId}}/inputs/requirements.md',
  },
};

const LOW_RATE_LIMIT_TURNS: Record<string, number> = {
  Planner: 12,
  Implementer: 30,
  Verifier: 10,
  Analyzer: 12,
};

function configPath(projectPath: string, agentName: AgentName): string {
  return `${projectPath}/.harness/agents/${agentName}.json`;
}

export async function loadAgentConfig(
  projectPath: string,
  agentName: AgentName
): Promise<AgentConfig> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: configPath(projectPath, agentName),
    });
    return JSON.parse(content) as AgentConfig;
  } catch {
    const defaults = BUILT_IN_DEFAULTS[agentName];
    if (defaults) return { ...defaults };
    return { allowedTools: ['Read', 'Glob', 'Grep'], maxTurns: 20 };
  }
}

export async function saveAgentConfig(
  projectPath: string,
  agentName: AgentName,
  config: AgentConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: configPath(projectPath, agentName),
    content: JSON.stringify(config, null, 2),
  });
}

export async function applyMaxTurnsPreset(
  projectPath: string,
  preset: 'default' | 'low-rate-limit'
): Promise<void> {
  const current = await loadAllAgentConfigs(projectPath);
  const targetTurns =
    preset === 'default'
      ? (Object.fromEntries(
          AGENT_NAMES.map((name) => [name, BUILT_IN_DEFAULTS[name].maxTurns])
        ) as Record<AgentName, number>)
      : LOW_RATE_LIMIT_TURNS;

  await Promise.all(
    AGENT_NAMES.map(async (name) => {
      const next: AgentConfig = {
        ...current[name],
        maxTurns: targetTurns[name],
      };
      await saveAgentConfig(projectPath, name, next);
    })
  );
}

export async function ensureAgentConfigs(projectPath: string): Promise<void> {
  ensureDefaultHarness(projectPath).catch(() => {});

  for (const name of AGENT_NAMES) {
    // Write .claude/agents/{Name}.md
    const claudeAgentPath = await join(
      projectPath,
      '.claude',
      'agents',
      `${name}.md`
    );
    const claudeAgentExists = await invoke<string>('read_text_file', {
      path: claudeAgentPath,
    })
      .then(() => true)
      .catch(() => false);

    if (!claudeAgentExists) {
      const mdContent = await invoke<string>('get_default_agent_prompt', {
        name,
      });
      await invoke('write_text_file', {
        path: claudeAgentPath,
        content: mdContent,
      });
    }

    // Write .harness/agents/{Name}.json
    const jsonDest = configPath(projectPath, name);
    const jsonExists = await invoke<string>('read_text_file', {
      path: jsonDest,
    })
      .then(() => true)
      .catch(() => false);

    if (!jsonExists) {
      const { allowedTools, maxTurns, promptTemplate } = BUILT_IN_DEFAULTS[name];
      await invoke('write_text_file', {
        path: jsonDest,
        content: JSON.stringify({ allowedTools, maxTurns, promptTemplate }, null, 2),
      });
    }
  }
}

export async function loadAllAgentConfigs(
  projectPath: string
): Promise<Record<AgentName, AgentConfig>> {
  const entries = await Promise.all(
    AGENT_NAMES.map(
      async (name) => [name, await loadAgentConfig(projectPath, name)] as const
    )
  );
  return Object.fromEntries(entries) as Record<AgentName, AgentConfig>;
}
