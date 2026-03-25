import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { join, resolveResource } from '@tauri-apps/api/path';
import { loadAgentConfig } from './agent-config-service';
import { getEnabledExtensionPaths } from '../extension-service';
import { parseStreamLine, extractSessionId } from './stream-parser';
import { saveSession, getSession } from './session-store';
import type { AgentName, SDKMessage, SDKRunnerConfig, AgentRunHandle } from '../../types';

export const FULL_COMMAND_LOG_STORAGE_KEY = 'omni.show-full-claude-command';

export type EventCallback = (event: SDKMessage) => void;
export type ErrorCallback = (text: string) => void;
export type DoneCallback = (code: number | null) => void;
export type StatusCallback = (text: string) => void;

interface RunAgentOptions {
  agentName: AgentName;
  prompt: string;
  cwd: string;
  runId?: string;
  onEvent: EventCallback;
  onError?: ErrorCallback;
  onStatus?: StatusCallback;
  onDone?: DoneCallback;
  resumeSession?: boolean;
  maxTurnsOverride?: number;
  allowedToolsOverride?: string[];
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
    runId,
    onEvent,
    onError,
    onStatus,
    onDone,
    resumeSession = false,
    maxTurnsOverride,
    allowedToolsOverride,
  } = options;

  const [config, enabledExtPaths] = await Promise.all([
    loadAgentConfig(cwd, agentName),
    getEnabledExtensionPaths(cwd),
  ]);

  const effectiveMaxTurns = maxTurnsOverride ?? config.maxTurns;
  const effectiveTools = allowedToolsOverride ?? config.allowedTools;

  // Read agent system prompt from .claude/agents/{Name}.md
  const agentDefPath = await join(cwd, '.claude', 'agents', `${agentName}.md`);
  let systemPrompt: string | undefined;
  try {
    systemPrompt = await invoke<string>('read_text_file', { path: agentDefPath });
    onStatus?.(`[agent] Definition file: ${agentDefPath}`);
  } catch {
    onStatus?.(`[agent] Definition file not found: ${agentDefPath}, using Claude defaults`);
  }

  // Append extension prompts
  let appendSystemPrompt: string | undefined;
  if (enabledExtPaths.length > 0) {
    onStatus?.(
      `[extensions] Injecting ${enabledExtPaths.length} extensions: ${enabledExtPaths
        .map((p) => p.split('/').slice(-2, -1)[0])
        .join(', ')}`
    );
    const extContents = await Promise.all(
      enabledExtPaths.map((p) => invoke<string>('read_text_file', { path: p }).catch(() => ''))
    );
    const merged = extContents.filter(Boolean).join('\n\n---\n\n');
    if (merged) appendSystemPrompt = merged;
  }

  // Build SDK runner config
  const sdkConfig: SDKRunnerConfig = {
    prompt,
    cwd,
    maxTurns: effectiveMaxTurns,
    permissionMode: 'bypassPermissions',
    settingSources: ['project'],
  };

  if (systemPrompt) {
    sdkConfig.systemPrompt = systemPrompt;
  }
  if (appendSystemPrompt) {
    sdkConfig.appendSystemPrompt = appendSystemPrompt;
  }
  if (effectiveTools.length > 0) {
    sdkConfig.allowedTools = effectiveTools;
  }
  if (resumeSession && runId) {
    const sessionId = getSession(runId, agentName);
    if (sessionId) {
      sdkConfig.resume = sessionId;
    }
  }

  // Base64-encode the config for CLI arg
  const configB64 = btoa(JSON.stringify(sdkConfig));

  // Resolve the SDK runner script path
  const runnerScript = await resolveResource('scripts/sdk-runner.mjs');

  onStatus?.(`[sdk] Starting agent "${agentName}" via Agent SDK`);

  const cmd = Command.create('run-sdk-runner', [runnerScript, configB64], { cwd });
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
    if (sid && runId) {
      saveSession(runId, agentName, sid);
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
      // Send abort signal via stdin, then kill
      child.write('__ABORT__\n').catch(() => {});
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
