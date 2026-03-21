import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { loadAgentConfig } from './agent-config-service';
import { getEnabledSkillPaths } from '../skill-service';
import { parseStreamLine, extractSessionId } from './stream-parser';
import { saveSession, getSession } from './session-store';
import type { AgentName, ClaudeStreamEvent, AgentRunHandle } from '../../types';

export type EventCallback = (event: ClaudeStreamEvent) => void;
export type ErrorCallback = (text: string) => void;
export type DoneCallback = (code: number | null) => void;
export type StatusCallback = (text: string) => void;
export const FULL_COMMAND_LOG_STORAGE_KEY = 'omni.show-full-claude-command';

interface RunAgentOptions {
  agentName: AgentName;
  prompt: string;
  cwd: string;
  changeName?: string;
  onEvent: EventCallback;
  onError?: ErrorCallback;
  onStatus?: StatusCallback;
  onDone?: DoneCallback;
  resumeSession?: boolean;
  maxTurnsOverride?: number;
  allowedToolsOverride?: string[];
}

function quoteCliArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[^\w@%+=:,./-]/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderCommandPreview(args: string[], promptIndex: number): string {
  const rendered = args.map((arg, idx) => {
    // prompt 可能不是最后一个参数（例如 --allowedTools 为可变参数）
    if (idx === promptIndex) {
      const singleLine = arg.replace(/\s+/g, ' ').trim();
      const maxLen = 200;
      const clipped =
        singleLine.length > maxLen
          ? `${singleLine.slice(0, maxLen)}...`
          : singleLine;
      return quoteCliArg(clipped);
    }
    return quoteCliArg(arg);
  });
  return `claude ${rendered.join(' ')}`;
}

function shouldShowFullCommand(): boolean {
  try {
    return window.localStorage.getItem(FULL_COMMAND_LOG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isBenignStdinWarning(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('warning: no stdin data received in 3s') ||
    normalized.includes('redirect stdin explicitly: < /dev/null')
  );
}

export async function runAgent(
  options: RunAgentOptions
): Promise<AgentRunHandle> {
  const {
    agentName,
    prompt,
    cwd,
    changeName,
    onEvent,
    onError,
    onStatus,
    onDone,
    resumeSession = false,
    maxTurnsOverride,
    allowedToolsOverride,
  } = options;

  const [config, enabledSkillPaths] = await Promise.all([
    loadAgentConfig(cwd, agentName),
    getEnabledSkillPaths(cwd),
  ]);

  const effectiveMaxTurns = maxTurnsOverride ?? config.maxTurns;
  const effectiveTools = allowedToolsOverride ?? config.allowedTools;

  // 查找 agent 定义文件：.claude/agents/{Name}.md
  const agentDefPath = await join(cwd, '.claude', 'agents', `${agentName}.md`);
  const agentDefExists: boolean = await invoke<string>('read_text_file', {
    path: agentDefPath,
  })
    .then(() => true)
    .catch(() => false);

  if (agentDefExists) {
    onStatus?.(`[agent] 定义文件: ${agentDefPath}`);
  } else {
    onStatus?.(
      `[agent] 未找到定义文件 ${agentDefPath}，将使用 Claude 默认行为`
    );
  }

  if (enabledSkillPaths.length > 0) {
    onStatus?.(
      `[skills] 注入 ${enabledSkillPaths.length} 个技能: ${enabledSkillPaths
        .map((p) => p.split('/').slice(-2, -1)[0])
        .join(', ')}`
    );
  }

  const args: string[] = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--max-turns',
    String(effectiveMaxTurns),
  ];

  // agent 定义作为主 system prompt（--system-prompt-file 会替换默认 prompt）
  if (agentDefExists) {
    args.push('--system-prompt-file', agentDefPath);
  }

  // 技能追加在 agent system prompt 之后（--append-system-prompt-file 叠加，不替换）
  for (const skillPath of enabledSkillPaths) {
    args.push('--append-system-prompt-file', skillPath);
  }

  if (resumeSession && changeName) {
    const sessionId = getSession(changeName, agentName);
    if (sessionId) {
      args.push('--resume', sessionId);
    }
  }

  const promptIndex = args.length;
  args.push(prompt);

  if (effectiveTools.length > 0) {
    args.push('--allowedTools', ...effectiveTools);
  }

  onStatus?.(`[command] ${renderCommandPreview(args, promptIndex)}`);
  if (shouldShowFullCommand()) {
    onStatus?.(`[command:full] claude ${args.map(quoteCliArg).join(' ')}`);
  }

  const cmd = Command.create('run-claude', args, { cwd });
  const startedAt = Date.now();
  let lastActivityAt = startedAt;

  cmd.stdout.on('data', (line: string) => {
    lastActivityAt = Date.now();
    const event = parseStreamLine(line);
    if (!event) {
      // 非 JSON 行（如 claude 启动时的纯文本）直接作为 raw 事件透传
      if (line.trim()) {
        onEvent({ type: 'raw', text: line.trim() } as ClaudeStreamEvent);
      }
      return;
    }

    const sid = extractSessionId(event);
    if (sid && changeName) {
      saveSession(changeName, agentName, sid);
    }

    onEvent(event);
  });

  cmd.stderr.on('data', (line: string) => {
    lastActivityAt = Date.now();
    const text = line.trim();
    if (!text) return;
    if (isBenignStdinWarning(text)) {
      onStatus?.(`⚠ ${text}`);
      return;
    }
    onError?.(text);
  });

  const child = await cmd.spawn();
  onStatus?.(`[spawn ok] pid=${child.pid}`);

  const heartbeat = setInterval(() => {
    const now = Date.now();
    const idleSec = Math.floor((now - lastActivityAt) / 1000);
    // 仅在一段时间无输出时提示，避免刷屏
    if (idleSec < 15) return;
    const elapsedSec = Math.floor((now - startedAt) / 1000);
    onStatus?.(
      `⏳ 运行中... 已运行 ${elapsedSec}s，最近输出 ${idleSec}s 前 (pid=${child.pid})`
    );
  }, 15000);

  cmd.on('close', (data: { code: number | null }) => {
    clearInterval(heartbeat);
    onDone?.(data.code);
  });

  return {
    abort: () => child.kill(),
    pid: child.pid,
  };
}

export interface CheckResult {
  ok: boolean;
  version: string;
  logs: string[];
}

export async function checkClaudeAvailable(): Promise<CheckResult> {
  const logs: string[] = [];
  try {
    logs.push('> Command.create("run-claude", ["--version"])');
    const cmd = Command.create('run-claude', ['--version']);
    logs.push('  命令已创建，正在执行...');
    const output = await cmd.execute();
    logs.push(`  exit code: ${output.code}`);
    logs.push(`  stdout: ${output.stdout?.trim() || '(空)'}`);
    logs.push(`  stderr: ${output.stderr?.trim() || '(空)'}`);
    return {
      ok: output.code === 0,
      version: output.stdout?.trim() || '',
      logs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`  异常: ${msg}`);
    return { ok: false, version: '', logs };
  }
}
