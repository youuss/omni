import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import type { AgentName } from '../../types';
import { ensureDefaultPipeline } from '../pipeline-service';

export interface AgentConfig {
  /** system prompt 已迁移至 {project}/.claude/agents/{Name}.md，此字段保留兼容旧配置 */
  systemPrompt?: string;
  allowedTools: string[];
  maxTurns: number;
}

const AGENT_NAMES: AgentName[] = ['Planner', 'Implementer', 'Verifier', 'Analyzer'];

const BUILT_IN_DEFAULTS: Record<
  string,
  Omit<AgentConfig, 'systemPrompt'>
> = {
  Planner: { allowedTools: ['Read', 'Glob', 'Grep', 'Write'], maxTurns: 20 },
  Implementer: {
    allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
    maxTurns: 50,
  },
  Verifier: { allowedTools: ['Read', 'Glob', 'Grep'], maxTurns: 15 },
  Analyzer: { allowedTools: ['Read', 'Glob', 'Grep', 'Write'], maxTurns: 20 },
};

const LOW_RATE_LIMIT_TURNS: Record<string, number> = {
  Planner: 12,
  Implementer: 30,
  Verifier: 10,
  Analyzer: 12,
};

function configPath(projectPath: string, agentName: AgentName): string {
  return `${projectPath}/.omni/agents/${agentName}.json`;
}

/** 从项目目录加载 agent 工具/轮次配置，不存在时返回内置默认值 */
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

/** 将 agent 配置写回项目目录 */
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

/**
 * 项目首次打开时初始化 agent 配置：
 * 1. 将内置 .md agent 定义写入 {projectPath}/.claude/agents/（Claude Code 标准目录，可被 --agent 发现）
 * 2. 将工具/轮次配置写入 {projectPath}/.omni/agents/{Name}.json
 * 已存在则跳过（用户可自由修改）。
 * 抛出错误而不是静默吞掉，便于调用方感知失败。
 */
export async function ensureAgentConfigs(projectPath: string): Promise<void> {
  ensureDefaultPipeline(projectPath).catch(() => {});

  for (const name of AGENT_NAMES) {
    // ── 1. 写入 .claude/agents/{Name}.md ──
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
      // 通过编译时嵌入的 Rust 命令获取内容，不依赖运行时文件路径
      const mdContent = await invoke<string>('get_default_agent_prompt', {
        name,
      });
      await invoke('write_text_file', {
        path: claudeAgentPath,
        content: mdContent,
      });
    }

    // ── 2. 写入 .omni/agents/{Name}.json（工具/轮次配置） ──
    const jsonDest = configPath(projectPath, name);
    const jsonExists = await invoke<string>('read_text_file', {
      path: jsonDest,
    })
      .then(() => true)
      .catch(() => false);

    if (!jsonExists) {
      const config: Omit<AgentConfig, 'systemPrompt'> = BUILT_IN_DEFAULTS[name];
      await invoke('write_text_file', {
        path: jsonDest,
        content: JSON.stringify(config, null, 2),
      });
    }
  }
}

/** 加载指定项目下所有 agent 的配置 */
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
