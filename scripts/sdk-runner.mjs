#!/usr/bin/env node
/**
 * SDK Runner — Fat sidecar for Tauri.
 *
 * Reads a RunRequest JSON from stdin (first line), loads agent definitions
 * from the project directory, assembles SDK Options, calls query(), and
 * streams each SDKMessage as a JSON line to stdout.
 *
 * Control commands (abort, interrupt) are sent as subsequent stdin JSON lines.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// --- Read first stdin line as RunRequest ---
const rl = createInterface({ input: process.stdin, terminal: false });

function readFirstLine() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('stdin timeout')), 30_000);
    rl.once('line', (line) => {
      clearTimeout(timeout);
      resolve(line);
    });
    rl.once('close', () => {
      clearTimeout(timeout);
      reject(new Error('stdin closed before RunRequest'));
    });
  });
}

let request;
try {
  const line = await readFirstLine();
  request = JSON.parse(line);
} catch (err) {
  process.stderr.write(`sdk-runner: failed to read RunRequest: ${err.message}\n`);
  process.exit(1);
}

const {
  projectPath,
  prompt,
  agents: agentNames = [],
  maxTurns,
  maxBudgetUsd,
  model,
  permissionMode = 'bypassPermissions',
  settingSources,
  resume,
  overrides = {},
  includePartialMessages,
  mcpServers,
  hooks,
} = request;

if (!projectPath || !prompt) {
  process.stderr.write('sdk-runner: projectPath and prompt are required\n');
  process.exit(1);
}

// --- Read agent definitions from disk ---

async function readAgentPrompt(name) {
  const mdPath = join(projectPath, '.claude', 'agents', `${name}.md`);
  try {
    return await readFile(mdPath, 'utf-8');
  } catch {
    return `You are the ${name} agent.`;
  }
}

async function readAgentConfig(name) {
  const jsonPath = join(projectPath, '.harness', 'agents', `${name}.json`);
  try {
    const content = await readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { allowedTools: [], maxTurns: 20 };
  }
}

async function readEnabledExtensions() {
  const configPath = join(projectPath, '.harness', 'extensions.json');
  let enabledIds;
  try {
    const content = await readFile(configPath, 'utf-8');
    enabledIds = JSON.parse(content).enabled ?? [];
  } catch {
    return [];
  }

  const extDir = join(projectPath, '.harness', 'extensions');
  const prompts = [];
  for (const id of enabledIds) {
    const mdPath = join(extDir, id, 'prompt.md');
    try {
      prompts.push(await readFile(mdPath, 'utf-8'));
    } catch {
      // extension missing or unreadable — skip
    }
  }
  return prompts;
}

// Build SDK agents record
const sdkAgents = {};
const extensionPrompts = await readEnabledExtensions();

for (const name of agentNames) {
  let agentPrompt = await readAgentPrompt(name);
  const config = await readAgentConfig(name);
  const override = overrides[name] ?? {};

  // Append extension prompts
  if (extensionPrompts.length > 0) {
    agentPrompt += '\n\n---\n\n' + extensionPrompts.join('\n\n---\n\n');
  }

  // Append promptExtra from override
  if (override.promptExtra) {
    agentPrompt += '\n\n---\n\n' + override.promptExtra;
  }

  const tools = override.allowedTools ?? (config.allowedTools?.length ? config.allowedTools : undefined);
  const agentModel = override.model ?? config.model;

  sdkAgents[name] = {
    description: `Use the ${name} agent for its designated tasks.`,
    prompt: agentPrompt,
    ...(tools && { tools }),
    ...(agentModel && agentModel !== 'inherit' && { model: agentModel }),
  };
}

// --- Assemble SDK Options ---

const ac = new AbortController();

const options = {
  cwd: projectPath,
  permissionMode,
  allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
  abortController: ac,
};

if (Object.keys(sdkAgents).length > 0) options.agents = sdkAgents;
if (maxTurns) options.maxTurns = maxTurns;
if (maxBudgetUsd) options.maxBudgetUsd = maxBudgetUsd;
if (model) options.model = model;
if (settingSources) options.settingSources = settingSources;
if (resume) options.resume = resume;
if (includePartialMessages) options.includePartialMessages = true;
if (mcpServers && Object.keys(mcpServers).length > 0) options.mcpServers = mcpServers;
if (hooks && Object.keys(hooks).length > 0) options.hooks = hooks;

// --- Listen for control commands on stdin ---

process.on('SIGTERM', () => ac.abort());
process.on('SIGINT', () => ac.abort());

rl.on('line', (line) => {
  try {
    const cmd = JSON.parse(line);
    if (cmd.cmd === 'abort') {
      ac.abort();
    }
    // Future: handle 'interrupt', 'setModel', etc.
  } catch {
    // Non-JSON line — ignore
  }
});

// --- Run query and stream output ---

try {
  const q = query({ prompt, options });

  for await (const message of q) {
    process.stdout.write(JSON.stringify(message) + '\n');
  }
} catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  if (errMsg.includes('abort')) {
    process.exit(0);
  }
  process.stderr.write(`sdk-runner error: ${errMsg}\n`);
  process.exit(2);
}
