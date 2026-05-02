# Revert to Claude Code CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `@anthropic-ai/claude-agent-sdk` and `sdk-runner.mjs`, restore direct Claude Code CLI invocation.

**Architecture:** `claude-runner.ts` spawns `claude` CLI directly with `--system-prompt-file` for agent prompt. Prompt assembler only builds upstream context + constraint failures + promptExtra. Skills/extensions discovered autonomously by Claude Code.

**Tech Stack:** TypeScript, Tauri shell plugin (`@tauri-apps/plugin-shell`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/claude.ts` | Modify | Remove SDK-specific types (RunRequest, AgentOverride, McpServerConfig, HooksConfig, etc.) |
| `src/types/harness.ts` | Modify | Remove `skills` from AgentNodeConfig.overrides, keep PermissionMode |
| `src/services/claude/claude-runner.ts` | Rewrite | Direct `claude` CLI spawning with `--system-prompt-file` |
| `src/services/engine/prompt-assembler.ts` | Simplify | Only assemble upstream context + constraint failure + promptExtra |
| `src/services/engine/state-machine.ts` | Modify | Single agent name, remove skills from options and calls |
| `src/services/harness-executor.ts` | Modify | Remove `skills` from ExecutorOptions |
| `src/pages/Workspace/useHarnessRunner.ts` | Modify | Remove `scanSkills` call and skills passing |
| `scripts/sdk-runner.mjs` | Delete | No longer needed |
| `package.json` | Modify | Remove `@anthropic-ai/claude-agent-sdk` and `zod` |
| `src-tauri/tauri.conf.json` | Modify | Remove sidecar from bundle resources |
| `src-tauri/capabilities/default.json` | Modify | Remove `run-sdk-runner` permissions |

---

### Task 1: Clean up types — `src/types/claude.ts`

**Files:**
- Modify: `src/types/claude.ts`

- [ ] **Step 1: Remove SDK-specific types from claude.ts**

Remove everything after `AgentRunHandle` (lines 112-175): `PermissionMode`, `SettingSource`, `AgentOverride`, `McpServerConfig`, `HookEvent`, `HookEntry`, `HooksConfig`, `RunRequest`.

Keep: `AgentName`, `AgentConfig`, `AgentRunHandle`, all `SDK*` message types (needed for stream-json parsing).

The file should end at line ~110 after `AgentRunHandle`.

- [ ] **Step 2: Remove `skills` from harness.ts overrides**

In `src/types/harness.ts:36-44`, remove `skills?: string[]` from the `AgentNodeConfig.overrides` interface.

```ts
// Before
overrides?: {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  allowedTools?: string[];
  promptExtra?: string;
  permissionMode?: PermissionMode;
  skills?: string[];        // ← remove this line
};

// After
overrides?: {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  allowedTools?: string[];
  promptExtra?: string;
  permissionMode?: PermissionMode;
};
```

- [ ] **Step 3: Type-check**

Run: `npm run vite:build`
Expected: Compilation errors from files still referencing removed types (fixed in later tasks).

---

### Task 2: Rewrite `claude-runner.ts` — Direct CLI spawning

**Files:**
- Rewrite: `src/services/claude/claude-runner.ts`

- [ ] **Step 1: Rewrite claude-runner.ts**

Replace the entire file. The new version spawns `claude` CLI directly using `Command.create('run-claude', args)`.

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npm run vite:build`
Expected: Errors from state-machine.ts and other files still using old RunAgentOptions interface.

---

### Task 3: Simplify prompt assembler

**Files:**
- Modify: `src/services/engine/prompt-assembler.ts`

- [ ] **Step 1: Simplify assemblePrompt()**

Remove agent template, extensions, and skill metadata from the assembler. Keep only: upstream context, constraint failure, promptExtra.

```ts
import type { HarnessNode, HarnessConnection } from '../../types/harness';
import type { NodeContext, ConstraintFailure } from '../../types/engine';
import { resolveContext, formatContextForPrompt } from './context-resolver';

// === AssembleOptions ===

export interface AssembleOptions {
  node: HarnessNode;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  constraintFailure?: ConstraintFailure;
}

// === Helpers ===

function formatConstraintFailure(failure: ConstraintFailure): string {
  const lines: string[] = [
    `<constraint-failure name="${failure.constraintName}">`,
  ];

  if (failure.command !== undefined) {
    lines.push(`  <command>${failure.command}</command>`);
  }

  if (failure.exitCode !== undefined) {
    lines.push(`  <exitCode>${failure.exitCode}</exitCode>`);
  }

  if (failure.stdout !== undefined) {
    lines.push(`  <stdout>${failure.stdout}</stdout>`);
  }

  if (failure.stderr !== undefined) {
    lines.push(`  <stderr>${failure.stderr}</stderr>`);
  }

  lines.push(`  <attempt>${failure.attempt}</attempt>`);
  lines.push('</constraint-failure>');

  return lines.join('\n');
}

// === Public API ===

/**
 * Assembles the prompt argument for an agent node execution.
 *
 * This only builds the dynamic context portion — the agent's base system
 * prompt is passed via --system-prompt-file by the runner.
 *
 * Assembly order (each non-empty part joined with double newlines):
 *  1. Upstream context — resolved from allContexts via resolveContext()
 *  2. Constraint failure context — if provided, formatted as <constraint-failure>
 *  3. Node-level promptExtra override
 */
export function assemblePrompt(options: AssembleOptions): string {
  const {
    node,
    allNodes,
    connections,
    allContexts,
    constraintFailure,
  } = options;

  const parts: string[] = [];

  // 1. Upstream context
  const { inheritedContexts, slotBindings } = resolveContext(node.id, allNodes, connections, allContexts);
  const formattedContext = formatContextForPrompt(inheritedContexts, slotBindings);
  if (formattedContext.trim()) {
    parts.push(formattedContext);
  }

  // 2. Constraint failure context
  if (constraintFailure) {
    parts.push(formatConstraintFailure(constraintFailure));
  }

  // 3. Node-level promptExtra
  const promptExtra = node.agent?.overrides?.promptExtra;
  if (promptExtra && promptExtra.trim()) {
    parts.push(promptExtra);
  }

  return parts.join('\n\n');
}
```

- [ ] **Step 2: Type-check**

Run: `npm run vite:build`
Expected: Errors from state-machine.ts (passing removed params to assemblePrompt).

---

### Task 4: Update state machine

**Files:**
- Modify: `src/services/engine/state-machine.ts`

- [ ] **Step 1: Remove skills from StateMachineOptions**

Remove `skills` and `extensions` from `StateMachineOptions` interface (lines 24-34):

```ts
export interface StateMachineOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: StateMachineCallbacks;
  startFromNodeId?: string;
  stepMode?: boolean;
}
```

- [ ] **Step 2: Update executeAgentNode()**

Rewrite `executeAgentNode` (lines 154-213) to:
- Use single `agentName` instead of array
- Remove skills/extensions resolution
- Pass simplified options to `assemblePrompt()`
- Call `runAgent` with the new interface

```ts
private executeAgentNode(node: HarnessNode, runtime: NodeRuntime): Promise<void> {
  const { harness, agents, callbacks, projectPath, runId } = this.opts;
  const agentId = node.agent?.agentId || '';
  const agent = agents.find((a) => a.id === agentId || a.name === agentId);
  if (!agent) {
    this.setNodeStatus(node.id, 'failed', `Agent not found: ${agentId}`);
    return Promise.resolve();
  }

  // Assemble prompt (upstream context + constraints + promptExtra only)
  const prompt = assemblePrompt({
    node,
    allNodes: harness.nodes,
    connections: harness.connections,
    allContexts: Object.fromEntries(this.contexts),
    constraintFailure: runtime.constraintFailure,
  });

  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    appendNodeLog(projectPath, runId, node.id, runtime.attempt,
      createLogEvent('node_start', { nodeId: node.id, attempt: runtime.attempt }))
      .then(() => runAgent({
        projectPath,
        agentName: agent.name,
        prompt,
        runId,
        onEvent: (event: SDKMessage) => {
          callbacks.onSdkEvent(node.id, event);
          appendNodeLog(projectPath, runId, node.id, runtime.attempt,
            createLogEvent('sdk_message', { data: event })).catch(() => {});
        },
        onError: (text: string) => callbacks.onError(node.id, text),
        onStatus: (text: string) => callbacks.onStatus(node.id, text),
        onDone: (code: number | null) => {
          this.handleAgentDone(node, runtime, code, startTime)
            .then(resolve)
            .catch(reject);
        },
        maxTurns: node.agent?.overrides?.maxTurns || agent.maxTurns,
        allowedTools: node.agent?.overrides?.allowedTools || agent.allowedTools,
      }))
      .then((handle) => {
        this.activeHandles.set(node.id, handle);
      })
      .catch(reject);
  });
}
```

- [ ] **Step 3: Remove unused imports**

Remove `SkillMeta` import and `resolveAgentSkills`/`buildSkillBindings` imports from state-machine.ts (lines 19-20).

- [ ] **Step 4: Type-check**

Run: `npm run vite:build`
Expected: Errors from harness-executor.ts (passing skills to StateMachine).

---

### Task 5: Update harness executor and useHarnessRunner

**Files:**
- Modify: `src/services/harness-executor.ts`
- Modify: `src/pages/Workspace/useHarnessRunner.ts`

- [ ] **Step 1: Remove skills from harness-executor.ts**

Remove `skills` from `ExecutorOptions` interface and from the `StateMachine` constructor call:

```ts
// Remove from imports
import type { SkillMeta } from '../types/skill';  // delete this line

// Remove from ExecutorOptions
interface ExecutorOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: ExecutorCallbacks;
  startFromNodeId?: string;
  stepMode?: boolean;
}

// Remove from StateMachine constructor (line 59)
// skills: opts.skills,  ← delete this line
```

- [ ] **Step 2: Remove skills from useHarnessRunner.ts**

Remove the `scanSkills` import and call, and remove `skills` from the `HarnessExecutor` constructor:

```ts
// Remove import (line 5)
// import { scanSkills } from '../../services/skill-service';  ← delete

// Remove skill scanning (line 67)
// const allSkills = await scanSkills(projectPath);  ← delete

// Remove skills from HarnessExecutor constructor
const exec = new HarnessExecutor({
  projectPath,
  runId,
  harness: currentHarness,
  agents,
  // skills: allSkills,  ← delete this line
  callbacks: { ... },
  startFromNodeId: ...,
  stepMode: ...,
});
```

- [ ] **Step 3: Type-check**

Run: `npm run vite:build`
Expected: Clean compilation (or only config-related errors).

---

### Task 6: Delete sidecar and clean up configs

**Files:**
- Delete: `scripts/sdk-runner.mjs`
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Delete sdk-runner.mjs**

```bash
rm scripts/sdk-runner.mjs
```

- [ ] **Step 2: Remove SDK dependency from package.json**

Remove these lines from `dependencies`:
- `"@anthropic-ai/claude-agent-sdk": "^0.2.81",`
- `"zod": "..."` (if present — check first)

- [ ] **Step 3: Remove sidecar from tauri.conf.json**

In `src-tauri/tauri.conf.json`, change:
```json
"resources": ["resources/**/*", "../scripts/sdk-runner.mjs"]
```
to:
```json
"resources": ["resources/**/*"]
```

- [ ] **Step 4: Remove sdk-runner permissions from capabilities**

In `src-tauri/capabilities/default.json`, remove the `run-sdk-runner` entries from both `shell:allow-spawn` and `shell:allow-execute` allow arrays.

Final permissions should look like:
```json
{
  "identifier": "shell:allow-spawn",
  "allow": [
    {
      "name": "run-claude",
      "cmd": "claude",
      "args": true
    }
  ]
},
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "run-claude",
      "cmd": "claude",
      "args": true
    }
  ]
}
```

- [ ] **Step 5: Remove unused skill types if needed**

Check if `src/types/skill.ts` types (`SkillMeta`, `SkillBinding`, `SkillPoolConfig`) are still used elsewhere. If only used by removed code, clean up the imports. `SkillMeta` may still be used by skill-service.ts for the Skills UI page — keep it if so.

- [ ] **Step 6: Install dependencies and type-check**

```bash
npm install
npm run vite:build
```

Expected: Clean compilation with no errors.

---

### Task 7: Verify and commit

- [ ] **Step 1: Full type-check**

```bash
npm run vite:build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Verify no SDK references remain in src/**

```bash
grep -r "sdk-runner\|claude-agent-sdk\|RunRequest\|McpServerConfig\|HooksConfig" src/
```

Expected: No matches (except possibly comments or unrelated strings).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: revert to direct Claude CLI, remove SDK sidecar"
```
