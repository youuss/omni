import { invoke } from '@tauri-apps/api/core';
import type { AgentMeta, Port } from '../types/pipeline';

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
  inputPorts?: Port[];
  outputPorts?: Port[];
  promptTemplate?: string;
}

const AGENTS_CONFIG_FILE = '.omni/agents-config.json';

interface AgentsEnableConfig {
  enabled: string[];
}

function agentsConfigPath(projectPath: string): string {
  return `${projectPath}/${AGENTS_CONFIG_FILE}`;
}

/** 扫描项目 .claude/agents/ 下的所有 agent */
export async function scanAgents(projectPath: string): Promise<AgentInfo[]> {
  return invoke<AgentInfo[]>('scan_agents', { projectPath });
}

/** 读取 agent 启用配置，不存在时返回全部启用 */
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

/** 保存 agent 启用配置 */
export async function saveAgentsConfig(
  projectPath: string,
  config: AgentsEnableConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: agentsConfigPath(projectPath),
    content: JSON.stringify(config, null, 2),
  });
}

/** 切换单个 agent 的启用状态 */
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

/** 读取 agent prompt 内容 */
export async function readAgentPrompt(promptPath: string): Promise<string> {
  return invoke<string>('read_text_file', { path: promptPath });
}

/** 保存 agent prompt 文件 */
export async function saveAgentPrompt(
  projectPath: string,
  agentId: string,
  content: string
): Promise<void> {
  await invoke('write_agent_file', { projectPath, agentId, content });
}

/** 读取 agent 工具/轮次配置 */
export async function loadAgentToolConfig(
  configPath: string
): Promise<AgentToolConfig | null> {
  try {
    const content = await invoke<string>('read_text_file', { path: configPath });
    return JSON.parse(content) as AgentToolConfig;
  } catch {
    return null;
  }
}

/** 保存 agent 工具/轮次配置 */
export async function saveAgentToolConfig(
  projectPath: string,
  agentId: string,
  config: AgentToolConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: `${projectPath}/.omni/agents/${agentId}.json`,
    content: JSON.stringify(config, null, 2),
  });
}

/** 新建 agent */
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
    inputPorts: config.inputPorts,
    outputPorts: config.outputPorts,
    promptTemplate: config.promptTemplate,
  });
  await toggleAgent(projectPath, id, true);
}

/** 删除 agent */
export async function deleteAgent(
  projectPath: string,
  agentId: string
): Promise<void> {
  await invoke('delete_agent', { projectPath, agentId });
  await toggleAgent(projectPath, agentId, false);
}

const BUILTIN_PORTS: Record<string, { inputPorts: Port[]; outputPorts: Port[] }> = {
  Planner: {
    inputPorts: [
      { id: 'requirements', name: '需求文档', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/requirements.md' },
    ],
    outputPorts: [
      { id: 'devPlan', name: '开发规划', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/dev-plan.md' },
    ],
  },
  Analyzer: {
    inputPorts: [
      { id: 'requirements', name: 'Bug 描述', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/requirements.md' },
    ],
    outputPorts: [
      { id: 'fixPlan', name: '修复方案', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/fix-plan.md' },
    ],
  },
  Implementer: {
    inputPorts: [
      { id: 'devPlan', name: '开发规划', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/dev-plan.md' },
    ],
    outputPorts: [
      { id: 'code', name: '代码产物', type: 'text', required: false },
    ],
  },
  Verifier: {
    inputPorts: [
      { id: 'devPlan', name: '开发规划', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/dev-plan.md' },
    ],
    outputPorts: [
      { id: 'report', name: '验证报告', type: 'file', required: true, defaultValue: '.specs/active/{{changeName}}/verification-report.md' },
    ],
  },
};

const BUILTIN_TEMPLATES: Record<string, string> = {
  Planner: '请基于以下需求文档生成开发规划，并将规划写入 {{devPlan}}。\n\n需求文档内容：请阅读 {{requirements}}',
  Analyzer: '请分析以下 Bug 描述，调查代码库定位问题根因，制定修复方案并写入 {{fixPlan}}。\n\nBug 描述：请阅读 {{requirements}}',
  Implementer: '请根据 {{devPlan}} 中的开发规划实现代码。完成后将交付清单追加到开发规划末尾。',
  Verifier: '请验证实现是否符合规划要求。\n阅读 {{devPlan}} 获取规划信息，然后审查代码，输出验证报告到 {{report}}',
};

export async function loadAgentMeta(
  _projectPath: string,
  agentInfo: AgentInfo
): Promise<AgentMeta> {
  const config = await loadAgentToolConfig(agentInfo.config_path);
  const builtinPorts = BUILTIN_PORTS[agentInfo.id];
  const builtinTemplate = BUILTIN_TEMPLATES[agentInfo.id];

  return {
    id: agentInfo.id,
    name: agentInfo.name,
    description: agentInfo.description,
    category: (config?.category ?? agentInfo.category ?? 'custom') as AgentMeta['category'],
    inputPorts: config?.inputPorts ?? builtinPorts?.inputPorts ?? [],
    outputPorts: config?.outputPorts ?? builtinPorts?.outputPorts ?? [],
    promptTemplate: config?.promptTemplate ?? builtinTemplate ?? '',
    allowedTools: config?.allowedTools ?? ['Read', 'Glob', 'Grep'],
    maxTurns: config?.maxTurns ?? 20,
    builtin: agentInfo.builtin,
  };
}

export async function listAgentMetas(
  projectPath: string
): Promise<AgentMeta[]> {
  const agents = await scanAgents(projectPath);
  return Promise.all(agents.map((a) => loadAgentMeta(projectPath, a)));
}

export async function saveAgentMeta(
  projectPath: string,
  meta: AgentMeta
): Promise<void> {
  const config: AgentToolConfig = {
    allowedTools: meta.allowedTools,
    maxTurns: meta.maxTurns,
    category: meta.category,
    inputPorts: meta.inputPorts,
    outputPorts: meta.outputPorts,
    promptTemplate: meta.promptTemplate,
  };
  await saveAgentToolConfig(projectPath, meta.id, config);
}
