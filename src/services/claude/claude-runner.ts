import { Command } from '@tauri-apps/plugin-shell';
import { resolveResource } from '@tauri-apps/api/path';
import { parseStreamLine, extractSessionId } from './stream-parser';
import { saveSession, getSession } from './session-store';
import type {
  AgentRunHandle,
  SDKMessage,
  RunRequest,
  AgentOverride,
  McpServerConfig,
  HooksConfig,
  PermissionMode,
  SettingSource,
  SkillBinding,
} from '../../types';

export const FULL_COMMAND_LOG_STORAGE_KEY = 'omni.show-full-claude-command';

export type EventCallback = (event: SDKMessage) => void;
export type ErrorCallback = (text: string) => void;
export type DoneCallback = (code: number | null) => void;
export type StatusCallback = (text: string) => void;

export interface RunAgentOptions {
  projectPath: string;
  agentNames: string[];
  prompt: string;
  runId?: string;
  onEvent: EventCallback;
  onError?: ErrorCallback;
  onStatus?: StatusCallback;
  onDone?: DoneCallback;
  overrides?: Record<string, AgentOverride>;
  resume?: boolean;
  model?: string;
  maxBudgetUsd?: number;
  permissionMode?: PermissionMode;
  settingSources?: SettingSource[];
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: HooksConfig;
  includePartialMessages?: boolean;
  skills?: SkillBinding[];
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
    projectPath,
    agentNames,
    prompt,
    runId,
    onEvent,
    onError,
    onStatus,
    onDone,
    overrides,
    resume = false,
    model,
    maxBudgetUsd,
    permissionMode = 'bypassPermissions',
    settingSources = ['project'],
    mcpServers,
    hooks,
    includePartialMessages,
    skills,
  } = options;

  // Build RunRequest
  const runRequest: RunRequest = {
    projectPath,
    prompt,
    agents: agentNames,
    permissionMode,
    settingSources,
  };

  if (overrides && Object.keys(overrides).length > 0) runRequest.overrides = overrides;
  if (model) runRequest.model = model;
  if (maxBudgetUsd) runRequest.maxBudgetUsd = maxBudgetUsd;
  if (mcpServers && Object.keys(mcpServers).length > 0) runRequest.mcpServers = mcpServers;
  if (hooks && Object.keys(hooks).length > 0) runRequest.hooks = hooks;
  if (includePartialMessages) runRequest.includePartialMessages = true;
  if (skills && skills.length > 0) runRequest.skills = skills;

  // Handle session resume
  if (resume && runId && agentNames.length === 1) {
    const sessionId = getSession(runId, agentNames[0]);
    if (sessionId) {
      runRequest.resume = sessionId;
    }
  }

  let runnerScript: string;
  if (import.meta.env.DEV) {
    // In dev, resolveResource points into src-tauri/target/debug/ which lacks bundled resources.
    // Resolve from the debug dir up to the project root.
    const debugDir = await resolveResource('');
    runnerScript = debugDir.replace(/src-tauri\/target\/debug\/?$/, 'scripts/sdk-runner.mjs');
  } else {
    runnerScript = await resolveResource('scripts/sdk-runner.mjs');
  }

  onStatus?.(`[sdk] Starting agents [${agentNames.join(', ')}] via Agent SDK`);

  const cmd = Command.create('run-sdk-runner', [runnerScript], { cwd: projectPath });
  const startedAt = Date.now();
  let lastActivityAt = startedAt;

  cmd.stdout.on('data', (line: string) => {
    lastActivityAt = Date.now();
    const message = parseStreamLine(line);
    if (!message) {
      if (line.trim()) {
        onEvent({ type: 'raw', text: line.trim() } as SDKMessage);
      }
      return;
    }

    const sid = extractSessionId(message);
    if (sid && runId && agentNames.length > 0) {
      saveSession(runId, agentNames[0], sid);
    }

    onEvent(message);
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
  onStatus?.(`[sdk] Spawned sdk-runner pid=${child.pid}`);

  // Write RunRequest as first stdin line
  await child.write(JSON.stringify(runRequest) + '\n');

  const heartbeat = setInterval(() => {
    const now = Date.now();
    const idleSec = Math.floor((now - lastActivityAt) / 1000);
    if (idleSec < 15) return;
    const elapsedSec = Math.floor((now - startedAt) / 1000);
    onStatus?.(
      `Running... elapsed ${elapsedSec}s, last output ${idleSec}s ago (pid=${child.pid})`
    );
  }, 15000);

  cmd.on('close', (data: { code: number | null }) => {
    clearInterval(heartbeat);
    onDone?.(data.code);
  });

  return {
    abort: () => {
      child.write('{"cmd":"abort"}\n').catch(() => {});
      setTimeout(() => child.kill(), 1000);
    },
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
