import { invoke } from '@tauri-apps/api/core';
import type { AgentDefinition } from '../types/harness';

export interface AgentInfo {
  id: string;
  prompt_path: string;
  config_path: string;
  name: string;
  description: string;
  category: string;
  builtin: boolean;
}

export interface AgentToolConfig {
  allowedTools: string[];
  maxTurns: number;
  category?: string;
  promptTemplate?: string;
}

const AGENTS_CONFIG_FILE = '.harness/agents.json';

interface AgentsEnableConfig {
  enabled: string[];
}

function agentsConfigPath(projectPath: string): string {
  return `${projectPath}/${AGENTS_CONFIG_FILE}`;
}

export async function scanAgents(projectPath: string): Promise<AgentInfo[]> {
  return invoke<AgentInfo[]>('scan_agents', { projectPath });
}

export async function loadAgentsConfig(
  projectPath: string
): Promise<AgentsEnableConfig> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: agentsConfigPath(projectPath),
    });
    return JSON.parse(content) as AgentsEnableConfig;
  } catch {
    const agents = await scanAgents(projectPath);
    return { enabled: agents.map((a) => a.id) };
  }
}

export async function saveAgentsConfig(
  projectPath: string,
  config: AgentsEnableConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: agentsConfigPath(projectPath),
    content: JSON.stringify(config, null, 2),
  });
}

export async function toggleAgent(
  projectPath: string,
  agentId: string,
  enabled: boolean
): Promise<void> {
  const config = await loadAgentsConfig(projectPath);
  const next = new Set(config.enabled);
  if (enabled) {
    next.add(agentId);
  } else {
    next.delete(agentId);
  }
  await saveAgentsConfig(projectPath, { enabled: Array.from(next) });
}

export async function loadAgentToolConfig(
  configPath: string
): Promise<AgentToolConfig | null> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: configPath,
    });
    return JSON.parse(content) as AgentToolConfig;
  } catch {
    return null;
  }
}

export async function saveAgentToolConfig(
  projectPath: string,
  agentId: string,
  config: AgentToolConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: `${projectPath}/.harness/agents/${agentId}.json`,
    content: JSON.stringify(config, null, 2),
  });
}

export async function readAgentPrompt(promptPath: string): Promise<string> {
  return invoke<string>('read_text_file', { path: promptPath });
}

export async function saveAgentPrompt(
  projectPath: string,
  agentId: string,
  content: string
): Promise<void> {
  await invoke('write_agent_file', { projectPath, agentId, content });
}

export async function createAgent(
  projectPath: string,
  id: string,
  name: string,
  description: string,
  body: string,
  config: Omit<AgentToolConfig, 'category'> & { category?: string }
): Promise<void> {
  const frontMatter = `---\nname: ${name}\ndescription: ${description}\n---\n\n`;
  await invoke('write_agent_file', {
    projectPath,
    agentId: id,
    content: frontMatter + body,
  });
  await saveAgentToolConfig(projectPath, id, {
    allowedTools: config.allowedTools,
    maxTurns: config.maxTurns,
    category: config.category,
    promptTemplate: config.promptTemplate,
  });
  await toggleAgent(projectPath, id, true);
}

export async function deleteAgent(
  projectPath: string,
  agentId: string
): Promise<void> {
  await invoke('delete_agent', { projectPath, agentId });
  await toggleAgent(projectPath, agentId, false);
}

const BUILTIN_TEMPLATES: Record<string, string> = {
  Planner: 'Based on the following requirements, generate a development plan and write it to .harness/runs/{{runId}}/outputs/dev-plan.md.\n\nRequirements: Read .harness/runs/{{runId}}/inputs/requirements.md',
  Analyzer: 'Analyze the following bug description, investigate the codebase to find the root cause, and write a fix plan to .harness/runs/{{runId}}/outputs/fix-plan.md.\n\nBug description: Read .harness/runs/{{runId}}/inputs/requirements.md',
  Implementer: 'Implement the code according to the dev plan in .harness/runs/{{runId}}/outputs/dev-plan.md. After completion, append the delivery checklist to the plan.',
  Verifier: 'Verify whether the implementation meets the plan requirements.\nRead .harness/runs/{{runId}}/outputs/dev-plan.md for plan details, then review the code and write the verification report to .harness/runs/{{runId}}/outputs/verification-report.md',
};

export async function loadAgentMeta(
  _projectPath: string,
  agentInfo: AgentInfo
): Promise<AgentDefinition> {
  const config = await loadAgentToolConfig(agentInfo.config_path);
  const builtinTemplate = BUILTIN_TEMPLATES[agentInfo.id];

  return {
    id: agentInfo.id,
    name: agentInfo.name,
    description: agentInfo.description,
    promptTemplate: config?.promptTemplate ?? builtinTemplate ?? '',
    allowedTools: config?.allowedTools ?? ['Read', 'Glob', 'Grep'],
    maxTurns: config?.maxTurns ?? 20,
    builtin: agentInfo.builtin,
  };
}

export async function listAgentMetas(
  projectPath: string
): Promise<AgentDefinition[]> {
  const agents = await scanAgents(projectPath);
  return Promise.all(agents.map((a) => loadAgentMeta(projectPath, a)));
}

export async function saveAgentMeta(
  projectPath: string,
  meta: AgentDefinition
): Promise<void> {
  const config: AgentToolConfig = {
    allowedTools: meta.allowedTools ?? [],
    maxTurns: meta.maxTurns ?? 20,
    promptTemplate: meta.promptTemplate,
  };
  await saveAgentToolConfig(projectPath, meta.id, config);
}
