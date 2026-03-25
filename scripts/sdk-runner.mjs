#!/usr/bin/env node
/**
 * SDK Runner — Node.js sidecar for Tauri.
 *
 * Receives a base64-encoded JSON config via argv[2], calls the Agent SDK
 * `query()` function, and streams each SDKMessage as a JSON line to stdout.
 *
 * Tauri frontend spawns this script via plugin-shell and reads stdout lines.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';

const configJson = Buffer.from(process.argv[2] ?? '', 'base64').toString();
let config;
try {
  config = JSON.parse(configJson);
} catch {
  process.stderr.write('sdk-runner: invalid config JSON\n');
  process.exit(1);
}

const {
  prompt,
  cwd,
  systemPrompt,
  maxTurns,
  allowedTools,
  disallowedTools,
  permissionMode = 'bypassPermissions',
  resume,
  model,
  appendSystemPrompt,
  settingSources,
} = config;

// Build SDK options
const options = {
  cwd: cwd || process.cwd(),
  permissionMode,
  allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
};

if (systemPrompt) {
  // If it's a path-like string, use claude_code preset + append
  // Otherwise use as raw system prompt
  if (typeof systemPrompt === 'object') {
    options.systemPrompt = systemPrompt;
  } else {
    options.systemPrompt = systemPrompt;
  }
}

if (appendSystemPrompt) {
  // If systemPrompt is already a preset object, add append
  if (options.systemPrompt && typeof options.systemPrompt === 'object') {
    options.systemPrompt.append = appendSystemPrompt;
  }
}

if (maxTurns) options.maxTurns = maxTurns;
if (allowedTools?.length) options.allowedTools = allowedTools;
if (disallowedTools?.length) options.disallowedTools = disallowedTools;
if (resume) options.resume = resume;
if (model) options.model = model;
if (settingSources) options.settingSources = settingSources;

// AbortController for graceful shutdown
const ac = new AbortController();
options.abortController = ac;

process.on('SIGTERM', () => ac.abort());
process.on('SIGINT', () => ac.abort());

// Read stdin for abort signal from Tauri
process.stdin.on('data', (chunk) => {
  const text = chunk.toString().trim();
  if (text === '__ABORT__') {
    ac.abort();
  }
});
process.stdin.resume();

try {
  const q = query({ prompt, options });

  for await (const message of q) {
    const line = JSON.stringify(message);
    process.stdout.write(line + '\n');
  }
} catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  // Don't fail on abort
  if (errMsg.includes('abort')) {
    process.exit(0);
  }
  process.stderr.write(`sdk-runner error: ${errMsg}\n`);
  process.exit(1);
}
