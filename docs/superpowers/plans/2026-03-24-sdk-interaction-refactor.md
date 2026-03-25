# SDK Interaction Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Claude Agent SDK integration to a fat sidecar architecture where the Node.js sidecar reads agent files, assembles SDK Options, and streams results — frontend sends only intent.

**Architecture:** Fat sidecar pattern. Frontend constructs a lightweight `RunRequest` (projectPath, agentNames, prompt, overrides) and writes it to sidecar stdin as JSON. Sidecar reads `.claude/agents/*.md` and `.harness/agents/*.json`, builds SDK `Options.agents`, calls `query()`, streams SDKMessage JSONL to stdout. Control commands (abort/interrupt) sent via subsequent stdin lines.

**Tech Stack:** TypeScript (frontend), Node.js ESM (sidecar), Tauri plugin-shell (spawn/IPC), @anthropic-ai/claude-agent-sdk

---

### Task 1: Update frontend types (`src/types/claude.ts`)

**Files:**
- Modify: `src/types/claude.ts`

- [ ] **Step 1: Remove deprecated types and add new RunRequest types**

Replace the entire file content. Remove `SDKAgentDef`, `SDKRunnerConfig`, `ClaudeStreamEvent`. Add `RunRequest`, `AgentOverride`, `McpServerConfig`, `HooksConfig`, `SDKStreamEvent`. Keep all SDKMessage types unchanged.

```typescript
export type AgentName = string;

export interface AgentConfig {
  name: AgentName;
  systemPromptFile: string;
  allowedTools: string[];
  maxTurns: number;
}

// --- SDK-aligned message types ---

/** Matches SDK SDKAssistantMessage */
export interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    role: 'assistant';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    >;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
}

/** Matches SDK SDKUserMessage */
export interface SDKUserMessage {
  type: 'user';
  uuid?: string;
  session_id: string;
  message: {
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_result'; tool_use_id: string; content: unknown }
    >;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
}

/** Matches SDK SDKResultMessage (success) */
export interface SDKResultSuccess {
  type: 'result';
  subtype: 'success';
  uuid: string;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
}

/** Matches SDK SDKResultMessage (error) */
export interface SDKResultError {
  type: 'result';
  subtype: 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
  uuid: string;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
  errors: string[];
}

/** Matches SDK SDKSystemMessage */
export interface SDKSystemMessage {
  type: 'system';
  subtype: 'init';
  uuid: string;
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
  permissionMode: string;
}

/** Matches SDK SDKPartialAssistantMessage (stream_event) */
export interface SDKStreamEvent {
  type: 'stream_event';
  event: unknown;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

/** Union of all SDK message types we handle */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultSuccess
  | SDKResultError
  | SDKSystemMessage
  | SDKStreamEvent
  | { type: string; [key: string]: unknown }; // catch-all for compact_boundary, etc.

export interface AgentRunHandle {
  abort: () => void;
  pid: number;
}

// --- RunRequest: Frontend → Sidecar ---

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
export type SettingSource = 'user' | 'project' | 'local';

export interface AgentOverride {
  maxTurns?: number;
  allowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  promptExtra?: string;
}

export interface McpServerConfig {
  type?: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop';

export interface HookEntry {
  matcher?: string;
  command: string;
}

export type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>;

export interface RunRequest {
  projectPath: string;
  prompt: string;
  agents: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  permissionMode?: PermissionMode;
  settingSources?: SettingSource[];
  resume?: string;
  overrides?: Record<string, AgentOverride>;
  includePartialMessages?: boolean;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: HooksConfig;
}
```

- [ ] **Step 2: Verify no compile errors from type changes**

Run: `cd /Users/eric/Desktop/projects/omni-fabric && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors in `claude-runner.ts` (references removed types) — this is expected and will be fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/types/claude.ts
git commit -m "refactor: replace SDKAgentDef/SDKRunnerConfig with RunRequest types"
```

---

### Task 2: Rewrite sidecar (`scripts/sdk-runner.mjs`)

**Files:**
- Modify: `scripts/sdk-runner.mjs`

- [ ] **Step 1: Rewrite sdk-runner.mjs with stdin-based RunRequest**

Replace the entire file. The new sidecar reads RunRequest from stdin line 1, reads agent `.md` and `.json` files from disk, assembles SDK Options, calls `query()`, streams JSONL to stdout.

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sdk-runner.mjs
git commit -m "refactor: rewrite sdk-runner with stdin RunRequest and file reading"
```

---

### Task 3: Simplify claude-runner.ts

**Files:**
- Modify: `src/services/claude/claude-runner.ts`

- [ ] **Step 1: Rewrite claude-runner.ts to construct RunRequest and write to stdin**

Remove `buildAgentDef()`, remove file reading logic, remove `loadAgentConfig` and `getEnabledExtensionPaths` imports. The new `runAgent()` accepts `RunAgentOptions`, constructs a `RunRequest`, spawns the sidecar, and writes the request as the first stdin line.

```typescript
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

  // Handle session resume
  if (resume && runId && agentNames.length === 1) {
    const sessionId = getSession(runId, agentNames[0]);
    if (sessionId) {
      runRequest.resume = sessionId;
    }
  }

  const runnerScript = await resolveResource('scripts/sdk-runner.mjs');

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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/claude/claude-runner.ts
git commit -m "refactor: simplify claude-runner to thin RunRequest sender"
```

---

### Task 4: Update harness-executor.ts for new runAgent signature

**Files:**
- Modify: `src/services/harness-executor.ts`

- [ ] **Step 1: Update executeNode() to use new RunAgentOptions**

The key changes: `agentName` → `agentNames` (array), `cwd` → `projectPath`, `maxTurnsOverride`/`allowedToolsOverride` → `overrides` record.

In `src/services/harness-executor.ts`, replace the `executeNode` method's `runAgent` call. Change the import and the call site:

```typescript
import { runAgent } from './claude/claude-runner';
import type { AgentDefinition, HarnessDefinition, HarnessConnection, NodeStatus } from '../types/harness';
import type { SDKMessage, AgentRunHandle } from '../types/claude';

// ... (NodeState, ExecutorCallbacks, ExecutorContext, topoSort, interpolateTemplate unchanged) ...

  // Inside executeNode(), replace the runAgent call (lines 176-214):
  async executeNode(nodeId: string): Promise<void> {
    const harnessNode = this.harness.nodes.find((n) => n.id === nodeId);
    if (!harnessNode) throw new Error(`Node ${nodeId} not found`);

    const agentDef = this.agents.get(harnessNode.agentId);
    if (!agentDef) throw new Error(`Agent ${harnessNode.agentId} not found`);

    this.callbacks.onNodeStatusChange(nodeId, 'running');

    const vars: Record<string, string> = {
      runId: this.context.runId,
    };

    const prompt = agentDef.promptTemplate
      ? interpolateTemplate(agentDef.promptTemplate, vars)
      : `Execute ${agentDef.name} task`;

    // Build overrides from node constraints
    const nodeOverrides: Record<string, { maxTurns?: number; allowedTools?: string[]; promptExtra?: string }> = {};
    const maxTurns = harnessNode.constraints?.maxTurns ?? agentDef.maxTurns;
    const allowedTools = harnessNode.constraints?.allowedTools ?? agentDef.allowedTools;

    nodeOverrides[harnessNode.agentId] = {
      ...(maxTurns && { maxTurns }),
      ...(allowedTools?.length && { allowedTools }),
      ...(harnessNode.constraints?.promptExtra && { promptExtra: harnessNode.constraints.promptExtra }),
    };

    const state = this.nodeStates.get(nodeId)!;

    return new Promise<void>((resolve, reject) => {
      runAgent({
        projectPath: this.context.projectPath,
        agentNames: [harnessNode.agentId],
        prompt,
        runId: this.context.runId,
        overrides: nodeOverrides,
        onEvent: (event) => this.callbacks.onEvent(nodeId, event),
        onStatus: (text) => this.callbacks.onStatus(nodeId, text),
        onError: (text) => this.callbacks.onError(nodeId, text),
        onDone: (code) => {
          this.currentHandle = null;
          const success = code === 0;
          state.status = success ? 'success' : 'failure';

          if (!success) {
            state.error = `Exit code ${code}`;
          }

          this.callbacks.onNodeStatusChange(
            nodeId,
            success ? 'success' : 'failure',
            state.error
          );

          if (success) {
            this.callbacks.onNodeOutputs(nodeId, {});
          }

          success ? resolve() : reject(new Error(state.error));
        },
      }).then((handle) => {
        this.currentHandle = handle;
      }).catch((e) => {
        state.status = 'failure';
        state.error = String(e);
        this.callbacks.onNodeStatusChange(nodeId, 'failure', state.error);
        reject(e);
      });
    });
  }
```

- [ ] **Step 2: Verify compile**

Run: `cd /Users/eric/Desktop/projects/omni-fabric && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors in harness-executor.ts

- [ ] **Step 3: Commit**

```bash
git add src/services/harness-executor.ts
git commit -m "refactor: adapt harness-executor to new runAgent signature"
```

---

### Task 5: Update outputStore for streaming and budget errors

**Files:**
- Modify: `src/stores/outputStore.ts`

- [ ] **Step 1: Add partialText, isStreaming state and stream_event handling**

Add new state fields and update `extractLinesFromMessage` to handle `stream_event` and `error_max_budget_usd`. Replace the entire file:

```typescript
import { create } from 'zustand';
import type { SDKMessage } from '../types';

interface OutputLine {
  id: number;
  type: 'text' | 'tool' | 'error' | 'system';
  content: string;
  timestamp: number;
}

interface OutputState {
  lines: OutputLine[];
  rawEvents: SDKMessage[];
  partialText: string;
  isStreaming: boolean;

  appendLine: (type: OutputLine['type'], content: string) => void;
  appendEvent: (event: SDKMessage) => void;
  clear: () => void;
}

let lineCounter = 0;

function makeLine(type: OutputLine['type'], content: string): OutputLine {
  return { id: ++lineCounter, type, content, timestamp: Date.now() };
}

function extractLinesFromMessage(msg: SDKMessage): OutputLine[] {
  switch (msg.type) {
    case 'assistant': {
      const content = (msg as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> } })
        .message?.content ?? [];

      const lines: OutputLine[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          lines.push(makeLine('text', block.text));
        } else if (block.type === 'tool_use') {
          lines.push(
            makeLine('tool', `[${block.name}] ${JSON.stringify(block.input ?? '').slice(0, 200)}`)
          );
        }
      }
      return lines;
    }

    case 'user': {
      const content = (msg as { message?: { content?: Array<{ type: string; content?: unknown }> } })
        .message?.content ?? [];

      const lines: OutputLine[] = [];
      for (const block of content) {
        if (block.type === 'tool_result' && block.content) {
          const text = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
          lines.push(makeLine('tool', `→ ${text.slice(0, 500)}`));
        }
      }
      return lines;
    }

    case 'result': {
      const result = msg as { subtype?: string; result?: string; errors?: string[]; total_cost_usd?: number };
      if (result.subtype === 'success' && result.result) {
        return [makeLine('text', String(result.result))];
      }
      if (result.subtype === 'error_max_budget_usd') {
        return [makeLine('error', `Budget limit exceeded (cost: $${result.total_cost_usd?.toFixed(2) ?? '?'})`)];
      }
      if (result.errors?.length) {
        return result.errors.map((e) => makeLine('error', e));
      }
      return [];
    }

    case 'system': {
      const sys = msg as { subtype?: string; model?: string; tools?: string[] };
      if (sys.subtype === 'init') {
        return [makeLine('system', `Model: ${sys.model ?? 'unknown'}, Tools: ${sys.tools?.length ?? 0}`)];
      }
      return [];
    }

    default: {
      const text = (msg as { text?: string }).text;
      if (text) return [makeLine('system', text)];
      return [];
    }
  }
}

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],
  rawEvents: [],
  partialText: '',
  isStreaming: false,

  appendLine: (type, content) =>
    set((state) => ({
      lines: [...state.lines, makeLine(type, content)],
    })),

  appendEvent: (event) =>
    set((state) => {
      // Handle stream_event for partial message streaming
      if (event.type === 'stream_event') {
        const streamEvent = event as { event?: { type?: string; delta?: { type?: string; text?: string } } };
        const delta = streamEvent.event?.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          return {
            ...state,
            partialText: state.partialText + delta.text,
            isStreaming: true,
            rawEvents: [...state.rawEvents, event],
          };
        }
        return { ...state, rawEvents: [...state.rawEvents, event] };
      }

      // When a complete assistant message arrives, clear partial state
      const clearPartial = event.type === 'assistant' || event.type === 'result';

      return {
        lines: [...state.lines, ...extractLinesFromMessage(event)],
        rawEvents: [...state.rawEvents, event],
        ...(clearPartial ? { partialText: '', isStreaming: false } : {}),
      };
    }),

  clear: () => {
    lineCounter = 0;
    set({ lines: [], rawEvents: [], partialText: '', isStreaming: false });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/outputStore.ts
git commit -m "feat: add streaming partial text and budget error handling to outputStore"
```

---

### Task 6: Slim down agent-config-service.ts

**Files:**
- Modify: `src/services/claude/agent-config-service.ts`

- [ ] **Step 1: Remove functions no longer needed by frontend**

The frontend no longer calls `loadAgentConfig()` for building SDK config (sidecar does that). However, the UI still needs agent config for display/editing (e.g., showing maxTurns, allowedTools in panels). Keep `loadAgentConfig`, `saveAgentConfig`, `loadAllAgentConfigs`, `ensureAgentConfigs`, `applyMaxTurnsPreset`. No changes needed — the service is still used by UI panels for config editing.

After reviewing callers, this file can remain unchanged. Skip to commit.

- [ ] **Step 2: Commit (skip if no changes)**

No changes needed — the agent-config-service is used by UI panels for editing agent settings, not by the SDK runner path.

---

### Task 7: Verify full compilation and integration

**Files:**
- No new files

- [ ] **Step 1: Run TypeScript compiler**

Run: `cd /Users/eric/Desktop/projects/omni-fabric && npx tsc --noEmit`
Expected: Clean compilation (0 errors)

- [ ] **Step 2: Check for remaining references to removed types**

Run: `grep -rn 'SDKAgentDef\|SDKRunnerConfig\|ClaudeStreamEvent' src/ --include='*.ts' --include='*.tsx'`
Expected: No matches (all references removed)

- [ ] **Step 3: Check sidecar script syntax**

Run: `node --check scripts/sdk-runner.mjs`
Expected: No syntax errors

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "fix: resolve any remaining compilation issues from SDK refactor"
```

(Only if there were fixups needed. Skip if Step 1-3 all passed clean.)
