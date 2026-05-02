import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { parseStreamLine, extractSessionId } from './stream-parser';
import { saveSession, getSession } from './session-store';
import type { AgentRunHandle, SDKMessage } from '../../types';

export const FULL_COMMAND_LOG_STORAGE_KEY = 'omni.show-full-claude-command';

export type EventCallback = (event: SDKMessage) => void;
export type ErrorCallback = (text: string) => void;
export type DoneCallback = (code: number | null) => void;
export type StatusCallback = (text: string) => void;

export interface RunAgentOptions {
  projectPath: string;
  agentName: string;
  prompt: string;
  runId?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  allowedTools?: string[];
  onEvent: EventCallback;
  onError?: ErrorCallback;
  onStatus?: StatusCallback;
  onDone?: DoneCallback;
  resume?: boolean;
}

function quoteCliArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[^\w@%+=:,./-]/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderCommandPreview(args: string[], promptIndex: number): string {
  const rendered = args.map((arg, idx) => {
    if (idx === promptIndex) {
      const singleLine = arg.replace(/\s+/g, ' ').trim();
      const maxLen = 200;
      const clipped = singleLine.length > maxLen ? `${singleLine.slice(0, maxLen)}...` : singleLine;
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

export async function runAgent(options: RunAgentOptions): Promise<AgentRunHandle> {
  const {
    projectPath,
    agentName,
    prompt,
    runId,
    maxTurns,
    maxBudgetUsd,
    model,
    allowedTools,
    onEvent,
    onError,
    onStatus,
    onDone,
    resume = false,
  } = options;

  // Find agent definition file: .claude/agents/{Name}.md
  const agentDefPath = await join(projectPath, '.claude', 'agents', `${agentName}.md`);
  const agentDefExists: boolean = await invoke<string>('read_text_file', { path: agentDefPath })
    .then(() => true)
    .catch(() => false);

  if (agentDefExists) {
    onStatus?.(`[agent] Definition file: ${agentDefPath}`);
  } else {
    onStatus?.(`[agent] No definition file ${agentDefPath}, using Claude defaults`);
  }

  const args: string[] = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ];

  if (maxTurns) {
    args.push('--max-turns', String(maxTurns));
  }

  if (maxBudgetUsd) {
    args.push('--max-budget-usd', String(maxBudgetUsd));
  }

  if (model) {
    args.push('--model', model);
  }

  // Agent prompt as system prompt file
  if (agentDefExists) {
    args.push('--system-prompt-file', agentDefPath);
  }

  // Session resume
  if (resume && runId) {
    const sessionId = getSession(runId, agentName);
    if (sessionId) {
      args.push('--resume', sessionId);
    }
  }

  // Prompt as last positional arg
  const promptIndex = args.length;
  args.push(prompt);

  // Allowed tools
  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowedTools', ...allowedTools);
  }

  onStatus?.(`[command] ${renderCommandPreview(args, promptIndex)}`);
  if (shouldShowFullCommand()) {
    onStatus?.(`[command:full] claude ${args.map(quoteCliArg).join(' ')}`);
  }

  const cmd = Command.create('run-claude', args, { cwd: projectPath });
  const startedAt = Date.now();
  let lastActivityAt = startedAt;

  cmd.stdout.on('data', (line: string) => {
    lastActivityAt = Date.now();
    const event = parseStreamLine(line);
    if (!event) {
      if (line.trim()) {
        onEvent({ type: 'raw', text: line.trim() } as SDKMessage);
      }
      return;
    }

    const sid = extractSessionId(event);
    if (sid && runId) {
      saveSession(runId, agentName, sid);
    }

    onEvent(event);
  });

  cmd.stderr.on('data', (line: string) => {
    lastActivityAt = Date.now();
    const text = line.trim();
    if (!text) return;
    if (isBenignStdinWarning(text)) {
      onStatus?.(`Warning: ${text}`);
      return;
    }
    onError?.(text);
  });

  const child = await cmd.spawn();
  onStatus?.(`[spawn] pid=${child.pid}`);

  const heartbeat = setInterval(() => {
    const now = Date.now();
    const idleSec = Math.floor((now - lastActivityAt) / 1000);
    if (idleSec < 15) return;
    const elapsedSec = Math.floor((now - startedAt) / 1000);
    onStatus?.(`Running... elapsed ${elapsedSec}s, last output ${idleSec}s ago (pid=${child.pid})`);
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
    logs.push('  Command created, executing...');
    const output = await cmd.execute();
    logs.push(`  exit code: ${output.code}`);
    logs.push(`  stdout: ${output.stdout?.trim() || '(empty)'}`);
    logs.push(`  stderr: ${output.stderr?.trim() || '(empty)'}`);
    return {
      ok: output.code === 0,
      version: output.stdout?.trim() || '',
      logs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`  Error: ${msg}`);
    return { ok: false, version: '', logs };
  }
}
