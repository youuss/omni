# Harness Engineering Pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Omni Fabric from a spec-driven tool to a harness engineering tool — replacing fixed category/file conventions with flexible node types (agent/condition/gate), a constraint system with failure routing, an event-driven state machine executor, and JSONL logging.

**Architecture:** Bottom-up approach: types first, then engine services (logger, constraint checker, context resolver, state machine), then store updates, then UI components. The Rust backend needs minimal changes since `read_run_file`/`write_run_file` already use generic subpaths.

**Tech Stack:** TypeScript, React 19, Zustand, ReactFlow, Tauri Shell API, Node.js sidecar (sdk-runner.mjs)

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/engine.ts` | NodeContext, ConstraintFailure, LogEvent, ExecutionState, all engine-related types |
| `src/services/engine/logger.ts` | JSONL log writer — per-node logs + harness-level execution.jsonl |
| `src/services/engine/constraint-checker.ts` | Runs shell/file/expression constraint checks via Tauri Shell |
| `src/services/engine/context-resolver.ts` | Resolves upstream context for a node (auto-inherit, slot binding, contextFilter) |
| `src/services/engine/prompt-assembler.ts` | Assembles final prompt: template + extensions + upstream context + promptExtra |
| `src/services/engine/state-machine.ts` | Event-driven execution engine replacing topoSort + for loop |
| `src/pages/Workspace/ConditionNode.tsx` | ReactFlow node component for condition nodes |
| `src/pages/Workspace/GateNode.tsx` | ReactFlow node component for gate nodes |
| `src/pages/Workspace/InputPanel.tsx` | Dynamic input panel (replaces ContentTabs) |
| `src/pages/Workspace/LogViewer.tsx` | Per-node JSONL log browser with attempt switching |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/harness.ts` | Rewrite: new HarnessNode (type + agent/condition/gate configs), HarnessDefinition (failureRoutes, inputs, defaults), NodeConstraint, SlotDef, remove AgentCategory/CATEGORY_FILES types |
| `src/types/claude.ts` | Add constraintContext field to RunRequest |
| `src/services/harness-executor.ts` | Rewrite: thin wrapper that creates StateMachine and delegates |
| `src/services/harness-service.ts` | Remove CATEGORY_FILES, deriveFileTabs; update getDefaultHarness for new schema; keep load/save |
| `src/services/claude/claude-runner.ts` | Add constraintFailure context injection to RunAgentOptions |
| `src/stores/harnessStore.ts` | Add failureRoutes, new node type support, enhanced addNode/removeNode |
| `src/stores/outputStore.ts` | Add nodeId tracking per line for per-node filtering |
| `src/pages/Workspace/AgentNode.tsx` | Show constraints badge, retry count, enhanced status |
| `src/pages/Workspace/HarnessCanvas.tsx` | Register condition/gate node types, render failure route edges |
| `src/pages/Workspace/NodeDetailPanel.tsx` | Add Slots, Constraints, Logs tabs |
| `src/pages/Workspace/WorkspaceHeader.tsx` | Add execution mode dropdown (Run All / Run From Node / Step) |
| `src/pages/Workspace/useHarnessRunner.ts` | Rewrite to use new StateMachine + callbacks |
| `src/pages/Workspace/index.tsx` | Replace ContentTabs with InputPanel, layout adjustments |
| `scripts/sdk-runner.mjs` | Accept constraintContext in RunRequest, inject into prompt |

### Removed

| File | Replaced By |
|------|-------------|
| `src/pages/Workspace/ContentTabs.tsx` | `InputPanel.tsx` |
| `src/pages/Workspace/useRunFiles.ts` | Per-node output browsing via LogViewer + run-service |

---

## Task 1: Core Type System

**Files:**
- Modify: `src/types/harness.ts` (full rewrite)
- Create: `src/types/engine.ts`
- Modify: `src/types/claude.ts:147-161`

- [ ] **Step 1: Rewrite `src/types/harness.ts`**

Replace the entire file contents with the new type system:

```typescript
// src/types/harness.ts

// ── Slot & Constraint primitives ──

export interface SlotDef {
  name: string;
  description?: string;
  filePattern?: string;
}

export type ConstraintCheck =
  | { type: 'shell'; command: string }
  | { type: 'file_contains'; path: string; pattern: string }
  | { type: 'expression'; expr: string };

export type OnFailAction =
  | { type: 'retry' }
  | { type: 'route'; targetNodeId: string }
  | { type: 'abort' };

export interface NodeConstraint {
  name: string;
  check: ConstraintCheck;
  onFail: OnFailAction;
  maxRetries?: number; // default 3
}

// ── Node configs per type ──

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface AgentNodeConfig {
  agentId?: string;
  agentPreset?: 'planner' | 'coder' | 'verifier' | 'reviewer';
  inputSlots?: SlotDef[];
  outputSlots?: SlotDef[];
  constraints?: NodeConstraint[];
  contextFilter?: string[];
  overrides?: {
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    promptExtra?: string;
    permissionMode?: PermissionMode;
  };
}

export interface ConditionNodeConfig {
  expression: string;
  branches: Record<string, string>; // value → nodeId
}

export interface GateNodeConfig {
  gateMessage?: string;
}

// ── Node ──

export type HarnessNodeType = 'agent' | 'condition' | 'gate';

export interface HarnessNode {
  id: string;
  type: HarnessNodeType;
  position: { x: number; y: number };
  agent?: AgentNodeConfig;
  condition?: ConditionNodeConfig;
  gate?: GateNodeConfig;
}

// ── Connections & Failure Routes ──

export interface HarnessConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  slotBinding?: {
    fromSlot: string;
    toSlot: string;
  };
}

export interface FailureRoute {
  fromNodeId: string;
  constraintName: string;
  toNodeId: string;
}

// ── Harness-level input ──

export interface HarnessInput {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

// ── Harness Definition ──

export interface HarnessDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: HarnessNode[];
  connections: HarnessConnection[];
  failureRoutes: FailureRoute[];
  inputs?: HarnessInput[];
  defaults?: {
    model?: string;
    maxBudgetUsd?: number;
    permissionMode?: PermissionMode;
  };
  builtin?: boolean;
}

// ── Templates ──

export interface HarnessTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
}

// ── Runtime state ──

export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'checking'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting'; // gate waiting for user

export interface NodeRuntimeState {
  status: NodeStatus;
  attempt: number;
  outputs: Record<string, string>;
  error?: string;
}

// ── Agent Definition (kept for agent CRUD) ──

export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  promptTemplate?: string;
  allowedTools?: string[];
  maxTurns?: number;
  builtin?: boolean;
}

// ── Domain types (unchanged) ──

export interface DomainSlot {
  id: string;
  label: string;
  filename: string;
  description: string;
}

export interface DomainMeta {
  name: string;
  description: string;
  tags: string[];
}

export interface DomainInfo {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  files: string[];
}
```

- [ ] **Step 2: Create `src/types/engine.ts`**

```typescript
// src/types/engine.ts

import type { NodeConstraint, NodeStatus } from './harness';

// ── Node execution context ──

export interface NodeContext {
  nodeId: string;
  outputs: Record<string, string>; // slotName → file path or content
  exitCode: number | null;
  metadata: Record<string, unknown>;
}

// ── Constraint failure context ──

export interface ConstraintFailure {
  constraintName: string;
  checkType: string;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  attempt: number;
  sourceNodeId: string;
  sourceNodeContext: NodeContext;
}

// ── Log event types ──

export type LogEvent =
  | { ts: string; type: 'node_start'; nodeId: string; attempt: number }
  | { ts: string; type: 'node_end'; nodeId: string; exitCode: number | null; durationMs: number }
  | { ts: string; type: 'sdk_message'; data: unknown }
  | { ts: string; type: 'context_inject'; nodeId: string; slots: Record<string, string> }
  | { ts: string; type: 'context_output'; nodeId: string; outputs: Record<string, string> }
  | { ts: string; type: 'constraint_check'; name: string; command?: string; exitCode?: number; stdout?: string; stderr?: string }
  | { ts: string; type: 'constraint_retry'; attempt: number; reason: string; injectedContext?: string }
  | { ts: string; type: 'constraint_route'; name: string; from: string; to: string }
  | { ts: string; type: 'condition_eval'; nodeId: string; expression: string; result: string; branch: string }
  | { ts: string; type: 'gate_wait'; nodeId: string; message?: string }
  | { ts: string; type: 'gate_resume'; nodeId: string }
  | { ts: string; type: 'error'; nodeId?: string; message: string };

// ── Harness-level execution log events ──

export type ExecutionLogEvent =
  | { ts: string; type: 'harness_start'; harnessId: string; nodes: string[] }
  | { ts: string; type: 'node_dispatch'; nodeId: string; attempt: number }
  | { ts: string; type: 'node_complete'; nodeId: string; exitCode: number | null; logFile: string }
  | { ts: string; type: 'node_failed'; nodeId: string; error: string }
  | { ts: string; type: 'node_skipped'; nodeId: string; reason: string }
  | { ts: string; type: 'constraint_route'; fromNode: string; constraint: string; toNode: string }
  | { ts: string; type: 'condition_branch'; nodeId: string; branch: string }
  | { ts: string; type: 'harness_end'; success: boolean; durationMs: number };

// ── Execution state snapshot (persisted to state.json) ──

export interface ExecutionState {
  harnessId: string;
  runId: string;
  nodeStates: Record<string, { status: NodeStatus; attempt: number; error?: string }>;
  contexts: Record<string, NodeContext>;
  startedAt: string;
  updatedAt: string;
}

// ── State machine callbacks ──

export interface StateMachineCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, attempt: number, error?: string) => void;
  onNodeContext: (nodeId: string, context: NodeContext) => void;
  onSdkEvent: (nodeId: string, event: unknown) => void;
  onLogEvent: (event: LogEvent) => void;
  onExecutionEvent: (event: ExecutionLogEvent) => void;
  onGateWait: (nodeId: string, message?: string) => Promise<boolean>; // returns true to continue
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onDone: (success: boolean) => void;
}
```

- [ ] **Step 3: Update `src/types/claude.ts` — add constraintContext**

Add `constraintContext` to the `RunRequest` interface. Find the existing `RunRequest` interface (around line 147) and add the field:

```typescript
// Add to RunRequest interface, after the hooks field:
  constraintContext?: {
    failure?: {
      constraintName: string;
      command?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    upstreamOutputs?: Record<string, string>; // nodeId → output summary
  };
```

- [ ] **Step 4: Update `src/types/index.ts` barrel export**

Ensure both `harness.ts` and `engine.ts` types are re-exported from the barrel file. Check if `src/types/index.ts` exists; if so add `export * from './engine';`. If not, no action needed — files import directly.

- [ ] **Step 5: Run type check**

Run: `npm run vite:build`
Expected: Build succeeds OR produces errors only in files that import old types (which we'll fix in subsequent tasks).

- [ ] **Step 6: Commit**

```bash
git add src/types/harness.ts src/types/engine.ts src/types/claude.ts
git commit -m "feat: rewrite core types for harness engineering pivot

New node type system (agent/condition/gate), constraint definitions,
context/logging types, and execution state machine types."
```

---

## Task 2: Logger Service

**Files:**
- Create: `src/services/engine/logger.ts`

- [ ] **Step 1: Create `src/services/engine/logger.ts`**

```typescript
// src/services/engine/logger.ts

import { writeRunFile } from '../run-service';
import type { LogEvent, ExecutionLogEvent } from '../../types/engine';

function now(): string {
  return new Date().toISOString();
}

export function createLogEvent<T extends LogEvent['type']>(
  type: T,
  data: Omit<Extract<LogEvent, { type: T }>, 'ts' | 'type'>
): Extract<LogEvent, { type: T }> {
  return { ts: now(), type, ...data } as Extract<LogEvent, { type: T }>;
}

export function createExecutionEvent<T extends ExecutionLogEvent['type']>(
  type: T,
  data: Omit<Extract<ExecutionLogEvent, { type: T }>, 'ts' | 'type'>
): Extract<ExecutionLogEvent, { type: T }> {
  return { ts: now(), type, ...data } as Extract<ExecutionLogEvent, { type: T }>;
}

/**
 * Appends a JSONL line to a per-node log file.
 * Path: logs/{nodeId}.{attempt}.jsonl
 */
export async function appendNodeLog(
  projectPath: string,
  runId: string,
  nodeId: string,
  attempt: number,
  event: LogEvent
): Promise<void> {
  const subpath = `logs/${nodeId}.${attempt}.jsonl`;
  const line = JSON.stringify(event) + '\n';
  try {
    const existing = await readRunFileSafe(projectPath, runId, subpath);
    await writeRunFile(projectPath, runId, subpath, existing + line);
  } catch {
    await writeRunFile(projectPath, runId, subpath, line);
  }
}

/**
 * Appends a JSONL line to execution.jsonl (harness-level log).
 */
export async function appendExecutionLog(
  projectPath: string,
  runId: string,
  event: ExecutionLogEvent
): Promise<void> {
  const subpath = 'execution.jsonl';
  const line = JSON.stringify(event) + '\n';
  try {
    const existing = await readRunFileSafe(projectPath, runId, subpath);
    await writeRunFile(projectPath, runId, subpath, existing + line);
  } catch {
    await writeRunFile(projectPath, runId, subpath, line);
  }
}

async function readRunFileSafe(
  projectPath: string,
  runId: string,
  subpath: string
): Promise<string> {
  try {
    const { readRunFile } = await import('../run-service');
    return await readRunFile(projectPath, runId, subpath);
  } catch {
    return '';
  }
}

/**
 * Reads a per-node log file and parses JSONL lines.
 */
export async function readNodeLog(
  projectPath: string,
  runId: string,
  nodeId: string,
  attempt: number
): Promise<LogEvent[]> {
  const subpath = `logs/${nodeId}.${attempt}.jsonl`;
  try {
    const { readRunFile } = await import('../run-service');
    const content = await readRunFile(projectPath, runId, subpath);
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as LogEvent);
  } catch {
    return [];
  }
}

/**
 * Reads execution.jsonl and parses lines.
 */
export async function readExecutionLog(
  projectPath: string,
  runId: string
): Promise<ExecutionLogEvent[]> {
  try {
    const { readRunFile } = await import('../run-service');
    const content = await readRunFile(projectPath, runId, 'execution.jsonl');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ExecutionLogEvent);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npm run vite:build`
Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/logger.ts
git commit -m "feat: add JSONL logger service for per-node and harness-level execution logs"
```

---

## Task 3: Constraint Checker Service

**Files:**
- Create: `src/services/engine/constraint-checker.ts`

- [ ] **Step 1: Create `src/services/engine/constraint-checker.ts`**

```typescript
// src/services/engine/constraint-checker.ts

import { Command } from '@tauri-apps/plugin-shell';
import type { NodeConstraint } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

export interface ConstraintResult {
  name: string;
  passed: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Runs a single constraint check against a node's context.
 */
export async function checkConstraint(
  constraint: NodeConstraint,
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<ConstraintResult> {
  const { check } = constraint;

  switch (check.type) {
    case 'shell':
      return runShellCheck(constraint.name, check.command, projectPath);

    case 'file_contains':
      return runFileContainsCheck(constraint.name, check.path, check.pattern, projectPath);

    case 'expression':
      return runExpressionCheck(constraint.name, check.expr, nodeContext, allContexts);
  }
}

async function runShellCheck(
  name: string,
  command: string,
  cwd: string
): Promise<ConstraintResult> {
  try {
    // Split command into program and args
    const parts = command.split(/\s+/);
    const program = parts[0];
    const args = parts.slice(1);

    const cmd = Command.create('run-constraint-check', ['-c', command], { cwd });
    const output = await cmd.execute();

    return {
      name,
      passed: output.code === 0,
      exitCode: output.code ?? undefined,
      stdout: output.stdout?.trim() || undefined,
      stderr: output.stderr?.trim() || undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, passed: false, error: msg };
  }
}

async function runFileContainsCheck(
  name: string,
  filePath: string,
  pattern: string,
  projectPath: string
): Promise<ConstraintResult> {
  try {
    const { readFile } = await import('../run-service');
    const fullPath = filePath.startsWith('/') ? filePath : `${projectPath}/${filePath}`;
    // Use Tauri file read
    const cmd = Command.create('run-constraint-check', ['-c', `cat "${fullPath}"`]);
    const output = await cmd.execute();
    const content = output.stdout || '';
    const regex = new RegExp(pattern);
    const passed = regex.test(content);
    return { name, passed, stdout: passed ? 'Pattern matched' : 'Pattern not found' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, passed: false, error: msg };
  }
}

function runExpressionCheck(
  name: string,
  expr: string,
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>
): ConstraintResult {
  try {
    // Build evaluation context
    const nodes: Record<string, { exitCode: number | null; outputs: Record<string, string>; metadata: Record<string, unknown> }> = {};
    for (const [nodeId, ctx] of Object.entries(allContexts)) {
      nodes[nodeId] = {
        exitCode: ctx.exitCode,
        outputs: ctx.outputs,
        metadata: ctx.metadata,
      };
    }
    nodes['self'] = {
      exitCode: nodeContext.exitCode,
      outputs: nodeContext.outputs,
      metadata: nodeContext.metadata,
    };

    // Evaluate expression in a safe-ish context
    const fn = new Function('nodes', 'self', `return Boolean(${expr})`);
    const result = fn(nodes, nodes['self']);
    return { name, passed: result, stdout: `Expression evaluated to: ${result}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, passed: false, error: `Expression error: ${msg}` };
  }
}

/**
 * Runs all constraints for a node sequentially.
 * Returns on first failure or after all pass.
 */
export async function checkAllConstraints(
  constraints: NodeConstraint[],
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<{ allPassed: boolean; results: ConstraintResult[]; failedConstraint?: NodeConstraint; failedResult?: ConstraintResult }> {
  const results: ConstraintResult[] = [];

  for (const constraint of constraints) {
    const result = await checkConstraint(constraint, nodeContext, allContexts, projectPath);
    results.push(result);

    if (!result.passed) {
      return {
        allPassed: false,
        results,
        failedConstraint: constraint,
        failedResult: result,
      };
    }
  }

  return { allPassed: true, results };
}
```

- [ ] **Step 2: Update Tauri shell permissions for constraint check commands**

In `src-tauri/capabilities/default.json`, add permission for `run-constraint-check`. Find the existing shell permissions section and add:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    { "name": "run-constraint-check", "cmd": "sh", "args": ["-c", { "validator": ".*" }] }
  ]
}
```

Note: also update `src-tauri/tauri.conf.json` shell scope to include the `sh` command for constraint execution. The exact location depends on the Tauri shell plugin config format.

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`
Expected: No new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/constraint-checker.ts src-tauri/capabilities/default.json
git commit -m "feat: add constraint checker service with shell/file/expression check types"
```

---

## Task 4: Context Resolver Service

**Files:**
- Create: `src/services/engine/context-resolver.ts`

- [ ] **Step 1: Create `src/services/engine/context-resolver.ts`**

```typescript
// src/services/engine/context-resolver.ts

import type { HarnessNode, HarnessConnection } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

/**
 * Resolves the accumulated upstream context for a given node.
 *
 * Rules:
 * 1. Auto-inherit: node gets all upstream contexts by default
 * 2. contextFilter: if set, only inherit from specified nodes
 * 3. Slot binding: if connection has slotBinding, override specific input slots
 */
export function resolveContext(
  nodeId: string,
  nodes: HarnessNode[],
  connections: HarnessConnection[],
  allContexts: Record<string, NodeContext>
): { inheritedContexts: NodeContext[]; slotBindings: Record<string, string> } {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { inheritedContexts: [], slotBindings: {} };

  // Find all upstream node IDs (direct parents)
  const upstreamNodeIds = connections
    .filter((c) => c.targetNodeId === nodeId)
    .map((c) => c.sourceNodeId);

  // Apply contextFilter if set
  const filter = node.agent?.contextFilter;
  const filteredIds = filter
    ? upstreamNodeIds.filter((id) => filter.includes(id))
    : upstreamNodeIds;

  // Collect inherited contexts (transitively — all ancestors)
  const visited = new Set<string>();
  const inheritedContexts: NodeContext[] = [];

  function collectAncestors(nid: string) {
    if (visited.has(nid)) return;
    visited.add(nid);
    const ctx = allContexts[nid];
    if (ctx) inheritedContexts.push(ctx);
    // Walk further upstream
    connections
      .filter((c) => c.targetNodeId === nid)
      .forEach((c) => collectAncestors(c.sourceNodeId));
  }

  for (const id of filteredIds) {
    collectAncestors(id);
  }

  // Collect explicit slot bindings from connections
  const slotBindings: Record<string, string> = {};
  for (const conn of connections.filter((c) => c.targetNodeId === nodeId)) {
    if (conn.slotBinding) {
      const sourceCtx = allContexts[conn.sourceNodeId];
      if (sourceCtx && sourceCtx.outputs[conn.slotBinding.fromSlot]) {
        slotBindings[conn.slotBinding.toSlot] = sourceCtx.outputs[conn.slotBinding.fromSlot];
      }
    }
  }

  return { inheritedContexts, slotBindings };
}

/**
 * Formats resolved context into a string block for prompt injection.
 */
export function formatContextForPrompt(
  inheritedContexts: NodeContext[],
  slotBindings: Record<string, string>
): string {
  const parts: string[] = [];

  // Add slot-bound content first (explicit bindings)
  for (const [slotName, content] of Object.entries(slotBindings)) {
    parts.push(`<context slot="${slotName}">\n${content}\n</context>`);
  }

  // Add inherited outputs from upstream nodes
  for (const ctx of inheritedContexts) {
    for (const [slotName, content] of Object.entries(ctx.outputs)) {
      // Skip if already provided by explicit binding
      if (slotBindings[slotName]) continue;
      parts.push(`<context from="${ctx.nodeId}" slot="${slotName}">\n${content}\n</context>`);
    }
  }

  return parts.join('\n\n');
}
```

- [ ] **Step 2: Run type check**

Run: `npm run vite:build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/context-resolver.ts
git commit -m "feat: add context resolver with auto-inherit, contextFilter, and slot binding"
```

---

## Task 5: Prompt Assembler Service

**Files:**
- Create: `src/services/engine/prompt-assembler.ts`

- [ ] **Step 1: Create `src/services/engine/prompt-assembler.ts`**

```typescript
// src/services/engine/prompt-assembler.ts

import type { HarnessNode, HarnessConnection, AgentDefinition } from '../../types/harness';
import type { NodeContext, ConstraintFailure } from '../../types/engine';
import { resolveContext, formatContextForPrompt } from './context-resolver';

interface AssembleOptions {
  node: HarnessNode;
  agent: AgentDefinition;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  extensions?: string[];
  constraintFailure?: ConstraintFailure;
  harnessInputs?: Record<string, string>; // name → user-provided value
}

/**
 * Assembles the final prompt for an agent node execution.
 *
 * Order:
 * 1. Agent prompt template
 * 2. Extensions
 * 3. Harness inputs (if this is an entry node)
 * 4. Upstream context
 * 5. Constraint failure context (if retrying or routed)
 * 6. Node-level promptExtra
 */
export function assemblePrompt(options: AssembleOptions): string {
  const { node, agent, allNodes, connections, allContexts, extensions, constraintFailure, harnessInputs } = options;
  const parts: string[] = [];

  // 1. Agent prompt template
  if (agent.promptTemplate) {
    parts.push(agent.promptTemplate);
  }

  // 2. Extensions
  if (extensions && extensions.length > 0) {
    for (const ext of extensions) {
      parts.push(ext);
    }
  }

  // 3. Harness inputs (for entry nodes with no upstream)
  if (harnessInputs && Object.keys(harnessInputs).length > 0) {
    const hasUpstream = connections.some((c) => c.targetNodeId === node.id);
    if (!hasUpstream) {
      const inputParts = Object.entries(harnessInputs)
        .map(([name, value]) => `<input name="${name}">\n${value}\n</input>`)
        .join('\n\n');
      parts.push(inputParts);
    }
  }

  // 4. Upstream context
  const { inheritedContexts, slotBindings } = resolveContext(
    node.id,
    allNodes,
    connections,
    allContexts
  );
  const contextBlock = formatContextForPrompt(inheritedContexts, slotBindings);
  if (contextBlock) {
    parts.push(contextBlock);
  }

  // 5. Constraint failure context
  if (constraintFailure) {
    const failureParts = [
      `<constraint-failure name="${constraintFailure.constraintName}">`,
      `Check type: ${constraintFailure.checkType}`,
    ];
    if (constraintFailure.command) failureParts.push(`Command: ${constraintFailure.command}`);
    if (constraintFailure.exitCode !== undefined) failureParts.push(`Exit code: ${constraintFailure.exitCode}`);
    if (constraintFailure.stdout) failureParts.push(`Stdout:\n${constraintFailure.stdout}`);
    if (constraintFailure.stderr) failureParts.push(`Stderr:\n${constraintFailure.stderr}`);
    failureParts.push(`Attempt: ${constraintFailure.attempt}`);
    failureParts.push('</constraint-failure>');
    parts.push(failureParts.join('\n'));
  }

  // 6. Node-level promptExtra
  const promptExtra = node.agent?.overrides?.promptExtra;
  if (promptExtra) {
    parts.push(promptExtra);
  }

  return parts.join('\n\n');
}
```

- [ ] **Step 2: Run type check**

Run: `npm run vite:build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/prompt-assembler.ts
git commit -m "feat: add prompt assembler with context injection and constraint failure support"
```

---

## Task 6: State Machine Execution Engine

**Files:**
- Create: `src/services/engine/state-machine.ts`
- Modify: `src/services/harness-executor.ts`

- [ ] **Step 1: Create `src/services/engine/state-machine.ts`**

```typescript
// src/services/engine/state-machine.ts

import { runAgent } from '../claude/claude-runner';
import { checkAllConstraints } from './constraint-checker';
import { assemblePrompt } from './prompt-assembler';
import { appendNodeLog, appendExecutionLog, createLogEvent, createExecutionEvent } from './logger';
import type {
  HarnessDefinition,
  HarnessNode,
  AgentDefinition,
  NodeStatus,
  FailureRoute,
} from '../../types/harness';
import type {
  NodeContext,
  ConstraintFailure,
  ExecutionState,
  StateMachineCallbacks,
} from '../../types/engine';
import type { AgentRunHandle, SDKMessage } from '../../types/claude';
import { writeRunFile, readRunFile } from '../run-service';

const DEFAULT_MAX_RETRIES = 3;

interface StateMachineOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: StateMachineCallbacks;
  harnessInputs?: Record<string, string>;
  extensions?: string[];
  startFromNodeId?: string; // Run From Node mode
  stepMode?: boolean;       // Step mode: pause after each node
}

interface NodeRuntime {
  status: NodeStatus;
  attempt: number;
  error?: string;
  constraintFailure?: ConstraintFailure;
}

export class StateMachine {
  private nodeStates: Map<string, NodeRuntime> = new Map();
  private contexts: Map<string, NodeContext> = new Map();
  private activeHandles: Map<string, AgentRunHandle> = new Map();
  private aborted = false;
  private startedAt = Date.now();

  constructor(private opts: StateMachineOptions) {}

  async execute(): Promise<void> {
    const { harness, callbacks, runId, projectPath } = this.opts;

    // Initialize node states
    for (const node of harness.nodes) {
      this.nodeStates.set(node.id, { status: 'pending', attempt: 0 });
    }

    // Mark entry nodes (no incoming connections) as ready
    const hasIncoming = new Set(harness.connections.map((c) => c.targetNodeId));
    for (const node of harness.nodes) {
      if (!hasIncoming.has(node.id)) {
        this.setNodeStatus(node.id, 'ready');
      }
    }

    // Log harness start
    await appendExecutionLog(projectPath, runId, createExecutionEvent('harness_start', {
      harnessId: harness.id,
      nodes: harness.nodes.map((n) => n.id),
    }));

    // Event loop
    while (!this.aborted) {
      const readyNodes = this.getNodesByStatus('ready');
      if (readyNodes.length === 0) {
        // Check if anything is still running
        const running = this.getNodesByStatus('running');
        const checking = this.getNodesByStatus('checking');
        if (running.length === 0 && checking.length === 0) break;
        // Wait for running nodes to complete
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      // Dispatch all ready nodes in parallel
      const dispatches = readyNodes.map((nodeId) => this.dispatchNode(nodeId));
      await Promise.all(dispatches);

      // In step mode, pause after each batch
      if (this.opts.stepMode) {
        const nextReady = this.getNodesByStatus('ready');
        if (nextReady.length > 0) {
          // Use gate callback to pause
          const shouldContinue = await callbacks.onGateWait('__step_mode__', 'Step mode: continue to next nodes?');
          if (!shouldContinue) {
            this.aborted = true;
            break;
          }
        }
      }
    }

    // Determine success
    const allCompleted = harness.nodes.every((n) => {
      const state = this.nodeStates.get(n.id);
      return state?.status === 'completed' || state?.status === 'skipped';
    });

    await appendExecutionLog(projectPath, runId, createExecutionEvent('harness_end', {
      success: allCompleted,
      durationMs: Date.now() - this.startedAt,
    }));

    // Persist final state
    await this.persistState();

    callbacks.onDone(allCompleted);
  }

  private async dispatchNode(nodeId: string): Promise<void> {
    const { harness, agents, callbacks, projectPath, runId } = this.opts;
    const node = harness.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const runtime = this.nodeStates.get(nodeId)!;
    this.setNodeStatus(nodeId, 'running');

    await appendExecutionLog(projectPath, runId, createExecutionEvent('node_dispatch', {
      nodeId,
      attempt: runtime.attempt,
    }));

    const startTime = Date.now();

    try {
      switch (node.type) {
        case 'agent':
          await this.executeAgentNode(node, runtime);
          break;
        case 'condition':
          await this.executeConditionNode(node);
          break;
        case 'gate':
          await this.executeGateNode(node);
          break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setNodeStatus(nodeId, 'failed', msg);
      await appendNodeLog(projectPath, runId, nodeId, runtime.attempt,
        createLogEvent('error', { nodeId, message: msg }));
      await appendExecutionLog(projectPath, runId, createExecutionEvent('node_failed', {
        nodeId, error: msg,
      }));
    }
  }

  private async executeAgentNode(node: HarnessNode, runtime: NodeRuntime): Promise<void> {
    const { harness, agents, callbacks, projectPath, runId, extensions, harnessInputs } = this.opts;
    const agentId = node.agent?.agentId || node.agent?.agentPreset || '';
    const agent = agents.find((a) => a.id === agentId || a.name === agentId);
    if (!agent) {
      this.setNodeStatus(node.id, 'failed', `Agent not found: ${agentId}`);
      return;
    }

    // Assemble prompt
    const prompt = assemblePrompt({
      node,
      agent,
      allNodes: harness.nodes,
      connections: harness.connections,
      allContexts: Object.fromEntries(this.contexts),
      extensions,
      constraintFailure: runtime.constraintFailure,
      harnessInputs,
    });

    await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
      createLogEvent('node_start', { nodeId: node.id, attempt: runtime.attempt }));

    // Run agent
    const startTime = Date.now();
    const handle = await runAgent({
      projectPath,
      agentNames: [agent.name],
      prompt,
      runId,
      onEvent: (event: SDKMessage) => {
        callbacks.onSdkEvent(node.id, event);
        appendNodeLog(projectPath, runId, node.id, runtime.attempt,
          createLogEvent('sdk_message', { data: event })).catch(() => {});
      },
      onError: (text: string) => callbacks.onError(node.id, text),
      onStatus: (text: string) => callbacks.onStatus(node.id, text),
      onDone: async (code: number | null) => {
        await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
          createLogEvent('node_end', { nodeId: node.id, exitCode: code, durationMs: Date.now() - startTime }));

        // Build node context
        const context: NodeContext = {
          nodeId: node.id,
          outputs: {},  // TODO: collect from agent outputs
          exitCode: code,
          metadata: {},
        };
        this.contexts.set(node.id, context);
        callbacks.onNodeContext(node.id, context);

        // Check constraints
        const constraints = node.agent?.constraints || [];
        if (constraints.length > 0) {
          this.setNodeStatus(node.id, 'checking');
          await this.checkNodeConstraints(node, runtime, context);
        } else {
          this.setNodeStatus(node.id, 'completed');
          await appendExecutionLog(projectPath, runId, createExecutionEvent('node_complete', {
            nodeId: node.id,
            exitCode: code,
            logFile: `logs/${node.id}.${runtime.attempt}.jsonl`,
          }));
          this.advanceDownstream(node.id);
        }
      },
      model: node.agent?.overrides?.model || harness.defaults?.model,
      maxBudgetUsd: node.agent?.overrides?.maxBudgetUsd || harness.defaults?.maxBudgetUsd,
      permissionMode: node.agent?.overrides?.permissionMode || harness.defaults?.permissionMode || 'bypassPermissions',
    });

    this.activeHandles.set(node.id, handle);
  }

  private async checkNodeConstraints(node: HarnessNode, runtime: NodeRuntime, context: NodeContext): Promise<void> {
    const { harness, projectPath, runId, callbacks } = this.opts;
    const constraints = node.agent?.constraints || [];
    const allContexts = Object.fromEntries(this.contexts);

    const { allPassed, results, failedConstraint, failedResult } = await checkAllConstraints(
      constraints, context, allContexts, projectPath
    );

    // Log each constraint check
    for (const r of results) {
      await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
        createLogEvent('constraint_check', {
          name: r.name,
          command: r.stdout ? undefined : undefined,
          exitCode: r.exitCode,
          stdout: r.stdout,
          stderr: r.stderr,
        }));
    }

    if (allPassed) {
      this.setNodeStatus(node.id, 'completed');
      await appendExecutionLog(projectPath, runId, createExecutionEvent('node_complete', {
        nodeId: node.id,
        exitCode: context.exitCode,
        logFile: `logs/${node.id}.${runtime.attempt}.jsonl`,
      }));
      this.advanceDownstream(node.id);
      return;
    }

    // Constraint failed
    const maxRetries = failedConstraint!.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (runtime.attempt >= maxRetries) {
      this.setNodeStatus(node.id, 'failed', `Constraint "${failedConstraint!.name}" failed after ${maxRetries} retries`);
      return;
    }

    const failure: ConstraintFailure = {
      constraintName: failedConstraint!.name,
      checkType: failedConstraint!.check.type,
      command: failedConstraint!.check.type === 'shell' ? (failedConstraint!.check as { command: string }).command : undefined,
      exitCode: failedResult!.exitCode,
      stdout: failedResult!.stdout,
      stderr: failedResult!.stderr,
      attempt: runtime.attempt,
      sourceNodeId: node.id,
      sourceNodeContext: context,
    };

    const action = failedConstraint!.onFail;

    switch (action.type) {
      case 'retry':
        runtime.attempt++;
        runtime.constraintFailure = failure;
        this.setNodeStatus(node.id, 'ready');
        await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
          createLogEvent('constraint_retry', {
            attempt: runtime.attempt,
            reason: `${failedConstraint!.name} failed`,
          }));
        break;

      case 'route': {
        const targetNodeId = action.targetNodeId;
        // Find or verify the failure route
        const route = harness.failureRoutes.find(
          (r) => r.fromNodeId === node.id && r.constraintName === failedConstraint!.name
        );
        if (route) {
          // Inject failure context into target node
          const targetRuntime = this.nodeStates.get(targetNodeId);
          if (targetRuntime) {
            targetRuntime.constraintFailure = failure;
            this.setNodeStatus(targetNodeId, 'ready');
          }
          await appendExecutionLog(projectPath, runId, createExecutionEvent('constraint_route', {
            fromNode: node.id,
            constraint: failedConstraint!.name,
            toNode: targetNodeId,
          }));
        }
        // Mark this node as failed (the route target will handle recovery)
        this.setNodeStatus(node.id, 'failed', `Routed to ${targetNodeId}`);
        break;
      }

      case 'abort':
        this.setNodeStatus(node.id, 'failed', `Constraint "${failedConstraint!.name}" failed, aborting`);
        this.aborted = true;
        break;
    }
  }

  private async executeConditionNode(node: HarnessNode): Promise<void> {
    const { harness, projectPath, runId, callbacks } = this.opts;
    const config = node.condition;
    if (!config) return;

    const allContexts = Object.fromEntries(this.contexts);
    const nodes: Record<string, unknown> = {};
    for (const [id, ctx] of this.contexts) {
      nodes[id] = { exitCode: ctx.exitCode, outputs: ctx.outputs, metadata: ctx.metadata };
    }

    try {
      const fn = new Function('nodes', `return String(${config.expression})`);
      const result = fn(nodes);

      await appendNodeLog(projectPath, runId, node.id, 0,
        createLogEvent('condition_eval', {
          nodeId: node.id,
          expression: config.expression,
          result,
          branch: config.branches[result] ? result : 'default',
        }));

      await appendExecutionLog(projectPath, runId, createExecutionEvent('condition_branch', {
        nodeId: node.id,
        branch: result,
      }));

      // Set context for condition node
      this.contexts.set(node.id, {
        nodeId: node.id,
        outputs: { result },
        exitCode: 0,
        metadata: { branch: result },
      });

      this.setNodeStatus(node.id, 'completed');

      // Activate selected branch, skip others
      const selectedTargetId = config.branches[result];
      for (const [branchValue, targetId] of Object.entries(config.branches)) {
        if (targetId === selectedTargetId) {
          this.setNodeStatus(targetId, 'ready');
        } else {
          this.setNodeStatus(targetId, 'skipped');
          await appendExecutionLog(projectPath, runId, createExecutionEvent('node_skipped', {
            nodeId: targetId,
            reason: `Condition branch "${branchValue}" not selected`,
          }));
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setNodeStatus(node.id, 'failed', `Condition eval error: ${msg}`);
    }
  }

  private async executeGateNode(node: HarnessNode): Promise<void> {
    const { projectPath, runId, callbacks } = this.opts;

    this.setNodeStatus(node.id, 'waiting');
    await appendNodeLog(projectPath, runId, node.id, 0,
      createLogEvent('gate_wait', { nodeId: node.id, message: node.gate?.gateMessage }));

    const shouldContinue = await callbacks.onGateWait(node.id, node.gate?.gateMessage);

    await appendNodeLog(projectPath, runId, node.id, 0,
      createLogEvent('gate_resume', { nodeId: node.id }));

    if (shouldContinue) {
      this.contexts.set(node.id, {
        nodeId: node.id,
        outputs: {},
        exitCode: 0,
        metadata: { approved: true },
      });
      this.setNodeStatus(node.id, 'completed');
      this.advanceDownstream(node.id);
    } else {
      this.setNodeStatus(node.id, 'failed', 'Gate rejected by user');
    }
  }

  private advanceDownstream(completedNodeId: string): void {
    const { harness } = this.opts;

    // Find all downstream nodes
    const downstream = harness.connections
      .filter((c) => c.sourceNodeId === completedNodeId)
      .map((c) => c.targetNodeId);

    for (const targetId of downstream) {
      // Check if ALL upstream dependencies are completed
      const upstreamIds = harness.connections
        .filter((c) => c.targetNodeId === targetId)
        .map((c) => c.sourceNodeId);

      const allUpstreamDone = upstreamIds.every((id) => {
        const state = this.nodeStates.get(id);
        return state?.status === 'completed';
      });

      if (allUpstreamDone) {
        const targetState = this.nodeStates.get(targetId);
        if (targetState && targetState.status === 'pending') {
          this.setNodeStatus(targetId, 'ready');
        }
      }
    }
  }

  private setNodeStatus(nodeId: string, status: NodeStatus, error?: string): void {
    const runtime = this.nodeStates.get(nodeId);
    if (runtime) {
      runtime.status = status;
      if (error) runtime.error = error;
    }
    this.opts.callbacks.onNodeStatusChange(nodeId, status, runtime?.attempt ?? 0, error);
  }

  private getNodesByStatus(status: NodeStatus): string[] {
    const result: string[] = [];
    for (const [id, state] of this.nodeStates) {
      if (state.status === status) result.push(id);
    }
    return result;
  }

  private async persistState(): Promise<void> {
    const { projectPath, runId, harness } = this.opts;
    const state: ExecutionState = {
      harnessId: harness.id,
      runId,
      nodeStates: Object.fromEntries(
        Array.from(this.nodeStates.entries()).map(([id, s]) => [id, {
          status: s.status,
          attempt: s.attempt,
          error: s.error,
        }])
      ),
      contexts: Object.fromEntries(this.contexts),
      startedAt: new Date(this.startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeRunFile(projectPath, runId, 'state.json', JSON.stringify(state, null, 2));
  }

  abort(): void {
    this.aborted = true;
    for (const handle of this.activeHandles.values()) {
      handle.abort();
    }
  }
}
```

- [ ] **Step 2: Rewrite `src/services/harness-executor.ts` as thin wrapper**

Replace the entire file:

```typescript
// src/services/harness-executor.ts

import { StateMachine } from './engine/state-machine';
import type { HarnessDefinition, AgentDefinition, NodeStatus } from '../types/harness';
import type { NodeContext, StateMachineCallbacks } from '../types/engine';
import type { SDKMessage } from '../types/claude';

export interface ExecutorCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, error?: string) => void;
  onNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  onEvent: (nodeId: string, event: SDKMessage) => void;
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onGateWait: (nodeId: string, message?: string) => Promise<boolean>;
  onHarnessDone: (success: boolean) => void;
}

interface ExecutorOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: ExecutorCallbacks;
  harnessInputs?: Record<string, string>;
  extensions?: string[];
  startFromNodeId?: string;
  stepMode?: boolean;
}

export class HarnessExecutor {
  private machine: StateMachine;

  constructor(opts: ExecutorOptions) {
    const smCallbacks: StateMachineCallbacks = {
      onNodeStatusChange: (nodeId, status, attempt, error) => {
        opts.callbacks.onNodeStatusChange(nodeId, status, error);
      },
      onNodeContext: (nodeId, context) => {
        opts.callbacks.onNodeOutputs(nodeId, context.outputs);
      },
      onSdkEvent: (nodeId, event) => {
        opts.callbacks.onEvent(nodeId, event as SDKMessage);
      },
      onLogEvent: () => {},
      onExecutionEvent: () => {},
      onGateWait: (nodeId, message) => {
        return opts.callbacks.onGateWait(nodeId, message);
      },
      onStatus: opts.callbacks.onStatus,
      onError: opts.callbacks.onError,
      onDone: opts.callbacks.onHarnessDone,
    };

    this.machine = new StateMachine({
      projectPath: opts.projectPath,
      runId: opts.runId,
      harness: opts.harness,
      agents: opts.agents,
      callbacks: smCallbacks,
      harnessInputs: opts.harnessInputs,
      extensions: opts.extensions,
      startFromNodeId: opts.startFromNodeId,
      stepMode: opts.stepMode,
    });
  }

  async execute(): Promise<void> {
    return this.machine.execute();
  }

  abort(): void {
    this.machine.abort();
  }
}
```

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`
Expected: Compilation errors in files that still import old `ExecutorCallbacks` signature (like useHarnessRunner.ts). These will be fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/state-machine.ts src/services/harness-executor.ts
git commit -m "feat: replace linear executor with event-driven state machine

Supports parallel execution, constraint checking with retry/route/abort,
condition branching, gate nodes, and JSONL logging at every step."
```

---

## Task 7: Update harness-service.ts — Remove Spec-Driven Code

**Files:**
- Modify: `src/services/harness-service.ts`

- [ ] **Step 1: Read current file to confirm exact contents**

Read: `src/services/harness-service.ts`

- [ ] **Step 2: Remove `CATEGORY_FILES` and `deriveFileTabs`**

Delete the `CATEGORY_FILES` constant (around lines 106-135) and the `deriveFileTabs` function (around lines 143-190). Also remove the `FileTab` import if it's no longer used.

- [ ] **Step 3: Update `getDefaultHarness()` for new schema**

Replace the default harness to use the new `HarnessNode` type with `type: 'agent'`:

```typescript
export function getDefaultHarness(): HarnessDefinition {
  return {
    id: 'default',
    name: 'Default Harness',
    description: 'A simple single-agent harness',
    nodes: [
      {
        id: 'node-1',
        type: 'agent',
        position: { x: 250, y: 200 },
        agent: { agentPreset: 'coder' },
      },
    ],
    connections: [],
    failureRoutes: [],
    inputs: [
      { name: 'task', description: 'What to work on', required: true },
    ],
  };
}
```

- [ ] **Step 4: Keep `topoSort` function** (still used by state machine for initial ordering)

No changes to `topoSort`.

- [ ] **Step 5: Run type check**

Run: `npm run vite:build`
Expected: Errors in files that imported `deriveFileTabs` or `FileTab` — will be fixed when updating store/UI.

- [ ] **Step 6: Commit**

```bash
git add src/services/harness-service.ts
git commit -m "refactor: remove CATEGORY_FILES and deriveFileTabs from harness-service

Replaced fixed spec-driven file conventions with dynamic harness inputs
and per-node slot definitions."
```

---

## Task 8: Update Stores

**Files:**
- Modify: `src/stores/harnessStore.ts`
- Modify: `src/stores/outputStore.ts`
- Modify: `src/stores/runStore.ts`

- [ ] **Step 1: Read current store files**

Read: `src/stores/harnessStore.ts`, `src/stores/outputStore.ts`, `src/stores/runStore.ts`

- [ ] **Step 2: Update `harnessStore.ts`**

Key changes:
- Remove `tabs: FileTab[]` from state (no more derived file tabs)
- Remove `recomputeTabs` method
- Update `addNode` to support node type parameter
- Add `failureRoutes` management (add/remove)
- Update `NodeRuntimeState` usage to match new `NodeStatus` values (includes 'checking', 'waiting', 'pending', 'ready')
- Add `updateNodeConfig` method for editing agent/condition/gate config
- Update `addConnection` to support `slotBinding`

Replace the store state interface:

```typescript
interface HarnessState {
  currentHarness: HarnessDefinition | null;
  currentTemplateId: string | null;
  agents: AgentDefinition[];
  templates: HarnessTemplateInfo[];
  nodeStates: Record<string, NodeRuntimeState>;
  harnessRunning: boolean;
  dirty: boolean;
  selectedNodeId: string | null;
}
```

Update `addNode` to accept a `HarnessNodeType`:

```typescript
addNode: (agentId: string, position: { x: number; y: number }, nodeType: HarnessNodeType = 'agent') => {
  // ... create node with type field
}
```

Add methods:

```typescript
addFailureRoute: (route: FailureRoute) => void;
removeFailureRoute: (fromNodeId: string, constraintName: string) => void;
updateNodeConfig: (nodeId: string, config: Partial<HarnessNode>) => void;
```

- [ ] **Step 3: Update `outputStore.ts`**

Add `nodeId` to `OutputLine`:

```typescript
interface OutputLine {
  id: string;
  type: 'text' | 'tool' | 'error' | 'system';
  content: string;
  timestamp: number;
  nodeId?: string; // which node produced this line
}
```

Update `appendLine` and `appendEvent` to accept optional `nodeId`.

- [ ] **Step 4: Update `runStore.ts`**

Add execution mode tracking:

```typescript
interface RunStoreState {
  currentRunId: string | null;
  currentRunState: RunState;
  isRunning: boolean;
  executionMode: 'all' | 'fromNode' | 'step';
  startFromNodeId: string | null;
}
```

Add methods: `setExecutionMode`, `setStartFromNode`.

- [ ] **Step 5: Run type check**

Run: `npm run vite:build`
Expected: Errors in UI components that reference removed `tabs` property or old method signatures.

- [ ] **Step 6: Commit**

```bash
git add src/stores/harnessStore.ts src/stores/outputStore.ts src/stores/runStore.ts
git commit -m "refactor: update stores for harness engineering model

Remove file tabs from harnessStore, add failureRoutes and nodeConfig
management. Add nodeId tracking to outputStore. Add execution mode
to runStore."
```

---

## Task 9: Update useHarnessRunner Hook

**Files:**
- Modify: `src/pages/Workspace/useHarnessRunner.ts`

- [ ] **Step 1: Read current file**

Read: `src/pages/Workspace/useHarnessRunner.ts`

- [ ] **Step 2: Rewrite to use new ExecutorCallbacks signature**

The new `ExecutorCallbacks` includes `onGateWait`. Update the hook to:
- Pass `harnessInputs` from a new parameter
- Handle gate wait callbacks (show dialog, return user decision)
- Support execution modes (all / fromNode / step)
- Remove old `deriveFileTabs` / tab recompute calls

Key changes to `runHarness()`:

```typescript
const runHarness = async (harnessInputs?: Record<string, string>) => {
  // ... validation ...

  const executor = new HarnessExecutor({
    projectPath,
    runId,
    harness: currentHarness,
    agents,
    callbacks: {
      onNodeStatusChange: (nodeId, status, error) => {
        setNodeStatus(nodeId, status, error);
        appendLine('system', `[${nodeId}] ${status}${error ? ': ' + error : ''}`, nodeId);
      },
      onNodeOutputs: (nodeId, outputs) => {
        setNodeOutputs(nodeId, outputs);
      },
      onEvent: (nodeId, event) => {
        appendEvent(event, nodeId);
      },
      onGateWait: async (nodeId, message) => {
        // This will be connected to a UI dialog in Task 12
        return true;
      },
      onStatus: (nodeId, text) => {
        appendLine('system', `[${nodeId}] ${text}`, nodeId);
      },
      onError: (nodeId, text) => {
        appendLine('error', `[${nodeId}] ${text}`, nodeId);
      },
      onHarnessDone: (success) => {
        setHarnessRunning(false);
        setRunning(false);
        setState(success ? 'completed' : 'failed');
        appendLine('system', success ? 'Harness completed successfully' : 'Harness failed');
      },
    },
    harnessInputs,
    startFromNodeId: executionMode === 'fromNode' ? startFromNodeId : undefined,
    stepMode: executionMode === 'step',
  });

  // ... rest of execution
};
```

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`
Expected: May have errors from UI components not yet updated.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Workspace/useHarnessRunner.ts
git commit -m "refactor: update useHarnessRunner for new executor with gate/constraint support"
```

---

## Task 10: Update claude-runner.ts and sdk-runner.mjs

**Files:**
- Modify: `src/services/claude/claude-runner.ts`
- Modify: `scripts/sdk-runner.mjs`

- [ ] **Step 1: Update claude-runner.ts**

Add `constraintContext` to `RunAgentOptions`:

```typescript
export interface RunAgentOptions {
  // ... existing fields ...
  constraintContext?: {
    failure?: {
      constraintName: string;
      command?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    upstreamOutputs?: Record<string, string>;
  };
}
```

In `runAgent()`, pass it through to the `RunRequest`:

```typescript
if (options.constraintContext) runRequest.constraintContext = options.constraintContext;
```

- [ ] **Step 2: Update sdk-runner.mjs**

Read the `constraintContext` from RunRequest and inject it into the agent prompt. Find the prompt assembly section (around line 111-135) and add:

```javascript
// After extension prompt assembly, before calling query()
if (runRequest.constraintContext?.failure) {
  const f = runRequest.constraintContext.failure;
  let ctx = `\n\n<constraint-failure name="${f.constraintName}">`;
  if (f.command) ctx += `\nCommand: ${f.command}`;
  if (f.exitCode !== undefined) ctx += `\nExit code: ${f.exitCode}`;
  if (f.stdout) ctx += `\nStdout:\n${f.stdout}`;
  if (f.stderr) ctx += `\nStderr:\n${f.stderr}`;
  ctx += '\n</constraint-failure>';
  prompt += ctx;
}

if (runRequest.constraintContext?.upstreamOutputs) {
  for (const [nodeId, output] of Object.entries(runRequest.constraintContext.upstreamOutputs)) {
    prompt += `\n\n<context from="${nodeId}">\n${output}\n</context>`;
  }
}
```

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/claude/claude-runner.ts scripts/sdk-runner.mjs
git commit -m "feat: pass constraint failure context through claude-runner to sdk-runner"
```

---

## Task 11: New Node Components (ConditionNode, GateNode)

**Files:**
- Create: `src/pages/Workspace/ConditionNode.tsx`
- Create: `src/pages/Workspace/GateNode.tsx`
- Modify: `src/pages/Workspace/AgentNode.tsx`

- [ ] **Step 1: Read AgentNode.tsx to understand existing patterns**

Read: `src/pages/Workspace/AgentNode.tsx`

- [ ] **Step 2: Create `ConditionNode.tsx`**

```typescript
// src/pages/Workspace/ConditionNode.tsx

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import type { NodeStatus } from '@/types/harness';

export interface ConditionNodeData {
  expression: string;
  branches: Record<string, string>;
  status: NodeStatus;
  selectedBranch?: string;
}

function ConditionNodeInner({ data, selected }: NodeProps & { data: ConditionNodeData }) {
  const statusColors: Record<NodeStatus, string> = {
    pending: 'border-muted/30',
    ready: 'border-muted/50',
    running: 'border-blue-500',
    checking: 'border-amber-500',
    completed: 'border-emerald-500',
    failed: 'border-red-500',
    skipped: 'border-muted/20',
    waiting: 'border-amber-400',
  };

  return (
    <div
      className={`glass-card rounded-xl px-4 py-3 min-w-[180px] border-2 ${statusColors[data.status] || 'border-muted/30'} ${selected ? 'ring-2 ring-primary/30' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted/50 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-foreground/80">Condition</span>
      </div>

      <div className="text-[10px] text-muted font-mono truncate mb-1">
        {data.expression}
      </div>

      <div className="flex gap-1 flex-wrap">
        {Object.entries(data.branches).map(([value, targetId]) => (
          <span
            key={value}
            className={`text-[9px] px-1.5 py-0.5 rounded-full ${
              data.selectedBranch === value
                ? 'bg-emerald-500/20 text-emerald-700'
                : 'bg-muted/10 text-muted'
            }`}
          >
            {value}
          </span>
        ))}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-muted/50 !w-2 !h-2" />
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeInner);
```

- [ ] **Step 3: Create `GateNode.tsx`**

```typescript
// src/pages/Workspace/GateNode.tsx

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ShieldCheck, Pause, CheckCircle2 } from 'lucide-react';
import type { NodeStatus } from '@/types/harness';

export interface GateNodeData {
  gateMessage?: string;
  status: NodeStatus;
}

function GateNodeInner({ data, selected }: NodeProps & { data: GateNodeData }) {
  const isWaiting = data.status === 'waiting';
  const isCompleted = data.status === 'completed';

  const borderColor = isWaiting
    ? 'border-amber-400 animate-pulse'
    : isCompleted
      ? 'border-emerald-500'
      : 'border-muted/30';

  return (
    <div
      className={`glass-card rounded-xl px-4 py-3 min-w-[160px] border-2 ${borderColor} ${selected ? 'ring-2 ring-primary/30' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted/50 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-foreground/80">Gate</span>
        {isWaiting && <Pause className="w-3 h-3 text-amber-500 animate-pulse" />}
        {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
      </div>

      {data.gateMessage && (
        <div className="text-[10px] text-muted truncate">
          {data.gateMessage}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-muted/50 !w-2 !h-2" />
    </div>
  );
}

export const GateNode = memo(GateNodeInner);
```

- [ ] **Step 4: Update `AgentNode.tsx`**

Add constraints badge and retry counter. Read the current file first, then add after the status bar section:

```tsx
{/* Constraints badge */}
{data.constraints && data.constraints.length > 0 && (
  <div className="flex items-center gap-1 mt-1">
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700">
      {data.constraints.length} constraint{data.constraints.length > 1 ? 's' : ''}
    </span>
    {data.attempt > 0 && (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700">
        retry {data.attempt}
      </span>
    )}
  </div>
)}
```

Update `AgentNodeData` to include:
```typescript
constraints?: NodeConstraint[];
attempt?: number;
```

- [ ] **Step 5: Run type check**

Run: `npm run vite:build`

- [ ] **Step 6: Commit**

```bash
git add src/pages/Workspace/ConditionNode.tsx src/pages/Workspace/GateNode.tsx src/pages/Workspace/AgentNode.tsx
git commit -m "feat: add ConditionNode and GateNode components, enhance AgentNode with constraint badge"
```

---

## Task 12: Update HarnessCanvas — New Node Types & Failure Routes

**Files:**
- Modify: `src/pages/Workspace/HarnessCanvas.tsx`

- [ ] **Step 1: Read current file**

Read: `src/pages/Workspace/HarnessCanvas.tsx`

- [ ] **Step 2: Register new node types**

At the top of the file, import and register:

```typescript
import { ConditionNode } from './ConditionNode';
import { GateNode } from './GateNode';

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  gate: GateNode,
};
```

Pass `nodeTypes` to `<ReactFlow nodeTypes={nodeTypes} ... />`.

- [ ] **Step 3: Map harness nodes to ReactFlow nodes with correct type**

Update the node mapping to use `node.type` instead of hardcoded 'agent':

```typescript
const rfNodes = harness.nodes.map((node) => ({
  id: node.id,
  type: node.type, // 'agent' | 'condition' | 'gate'
  position: node.position,
  data: buildNodeData(node), // build type-specific data
}));
```

- [ ] **Step 4: Render failure routes as styled edges**

Map `harness.failureRoutes` to additional edges with distinct styling:

```typescript
const failureEdges = (harness.failureRoutes || []).map((route) => ({
  id: `failure-${route.fromNodeId}-${route.constraintName}`,
  source: route.fromNodeId,
  target: route.toNodeId,
  type: 'default',
  animated: true,
  style: { stroke: 'oklch(0.55 0.2 25)', strokeDasharray: '5,5' }, // red dashed
  label: route.constraintName,
  labelStyle: { fontSize: 10, fill: 'oklch(0.55 0.2 25)' },
}));
```

Merge with normal edges: `const allEdges = [...normalEdges, ...failureEdges];`

- [ ] **Step 5: Update drag-and-drop to support node type selection**

The palette will need to indicate what type of node to create. Update `onDrop` to read the node type from the drag data:

```typescript
const nodeType = event.dataTransfer.getData('application/reactflow-type') || 'agent';
```

- [ ] **Step 6: Run type check**

Run: `npm run vite:build`

- [ ] **Step 7: Commit**

```bash
git add src/pages/Workspace/HarnessCanvas.tsx
git commit -m "feat: register condition/gate node types and render failure route edges on canvas"
```

---

## Task 13: InputPanel (Replaces ContentTabs)

**Files:**
- Create: `src/pages/Workspace/InputPanel.tsx`
- Delete: `src/pages/Workspace/ContentTabs.tsx`
- Delete: `src/pages/Workspace/useRunFiles.ts`

- [ ] **Step 1: Create `InputPanel.tsx`**

```typescript
// src/pages/Workspace/InputPanel.tsx

import { useState, useEffect } from 'react';
import { Pencil, Save, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HarnessInput } from '@/types/harness';

interface InputPanelProps {
  inputs: HarnessInput[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  isRunning: boolean;
}

export function InputPanel({ inputs, values, onChange, isRunning }: InputPanelProps) {
  const [editingInput, setEditingInput] = useState<string | null>(null);

  if (!inputs || inputs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No inputs defined for this harness. Add inputs in the harness settings.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Input tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
        {inputs.map((input) => (
          <button
            key={input.name}
            onClick={() => setEditingInput(input.name)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              editingInput === input.name
                ? 'bg-primary/10 text-primary'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <FileText className="w-3 h-3" />
            {input.name}
            {input.required && <span className="text-red-500">*</span>}
          </button>
        ))}
      </div>

      {/* Active input editor */}
      <div className="flex-1 overflow-hidden">
        {editingInput ? (
          <textarea
            className="w-full h-full p-3 bg-transparent text-sm font-mono resize-none focus:outline-none"
            value={values[editingInput] || ''}
            onChange={(e) => onChange(editingInput, e.target.value)}
            placeholder={inputs.find((i) => i.name === editingInput)?.description || `Enter ${editingInput}...`}
            disabled={isRunning}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an input to edit
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete old files**

Delete `src/pages/Workspace/ContentTabs.tsx` and `src/pages/Workspace/useRunFiles.ts`.

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`
Expected: Errors in `index.tsx` referencing deleted components — fixed in Task 14.

- [ ] **Step 4: Commit**

```bash
git rm src/pages/Workspace/ContentTabs.tsx src/pages/Workspace/useRunFiles.ts
git add src/pages/Workspace/InputPanel.tsx
git commit -m "feat: add InputPanel, remove spec-driven ContentTabs and useRunFiles"
```

---

## Task 14: LogViewer Component

**Files:**
- Create: `src/pages/Workspace/LogViewer.tsx`

- [ ] **Step 1: Create `LogViewer.tsx`**

```typescript
// src/pages/Workspace/LogViewer.tsx

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import { readNodeLog } from '@/services/engine/logger';
import type { LogEvent } from '@/types/engine';

interface LogViewerProps {
  projectPath: string;
  runId: string;
  nodeId: string;
  maxAttempt: number; // total attempts for this node
}

export function LogViewer({ projectPath, runId, nodeId, maxAttempt }: LogViewerProps) {
  const [attempt, setAttempt] = useState(maxAttempt);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    readNodeLog(projectPath, runId, nodeId, attempt).then(setEvents);
  }, [projectPath, runId, nodeId, attempt]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [events]);

  const formatEvent = (event: LogEvent): { color: string; text: string } => {
    switch (event.type) {
      case 'node_start':
        return { color: 'text-blue-400', text: `▶ Node started (attempt ${event.attempt})` };
      case 'node_end':
        return {
          color: event.exitCode === 0 ? 'text-emerald-400' : 'text-red-400',
          text: `■ Node ended (exit: ${event.exitCode}, ${event.durationMs}ms)`,
        };
      case 'sdk_message':
        return { color: 'text-foreground/80', text: JSON.stringify(event.data).slice(0, 200) };
      case 'constraint_check':
        return {
          color: event.exitCode === 0 ? 'text-emerald-400' : 'text-amber-400',
          text: `⚡ Constraint "${event.name}": ${event.exitCode === 0 ? 'PASS' : 'FAIL'}${event.stderr ? ' — ' + event.stderr.slice(0, 100) : ''}`,
        };
      case 'constraint_retry':
        return { color: 'text-amber-400', text: `↻ Retry #${event.attempt}: ${event.reason}` };
      case 'constraint_route':
        return { color: 'text-red-400', text: `→ Routed "${event.name}" from ${event.from} to ${event.to}` };
      case 'condition_eval':
        return { color: 'text-indigo-400', text: `? ${event.expression} → "${event.result}" → branch: ${event.branch}` };
      case 'gate_wait':
        return { color: 'text-amber-400', text: `⏸ Waiting for approval${event.message ? ': ' + event.message : ''}` };
      case 'gate_resume':
        return { color: 'text-emerald-400', text: '▶ Gate approved, continuing' };
      case 'error':
        return { color: 'text-red-500', text: `✗ ${event.message}` };
      default:
        return { color: 'text-muted', text: JSON.stringify(event) };
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Attempt selector */}
      {maxAttempt > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
          <Terminal className="w-3 h-3 text-muted" />
          <span className="text-[10px] text-muted">Attempt:</span>
          {Array.from({ length: maxAttempt + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => setAttempt(i)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                attempt === i ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
              }`}
            >
              #{i}
            </button>
          ))}
        </div>
      )}

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
        {events.map((event, i) => {
          const { color, text } = formatEvent(event);
          return (
            <div key={i} className={`${color} leading-relaxed`}>
              <span className="text-muted/50 mr-2">{event.ts.split('T')[1]?.slice(0, 8)}</span>
              {text}
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-muted text-center py-4">No log entries</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run vite:build`

- [ ] **Step 3: Commit**

```bash
git add src/pages/Workspace/LogViewer.tsx
git commit -m "feat: add LogViewer component for per-node JSONL log browsing"
```

---

## Task 15: Update NodeDetailPanel

**Files:**
- Modify: `src/pages/Workspace/NodeDetailPanel.tsx`

- [ ] **Step 1: Read current file**

Read: `src/pages/Workspace/NodeDetailPanel.tsx`

- [ ] **Step 2: Rewrite with tabbed interface**

Replace the component to show tabs: Config, Slots, Constraints, Prompt, Logs.

Key structure:

```tsx
const tabs = ['Config', 'Slots', 'Constraints', 'Prompt', 'Logs'] as const;
const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Config');

// Config tab: agent select, model, maxTurns, budget, permissionMode
// Slots tab: input/output slot list with add/edit/remove
// Constraints tab: constraint list with check type, onFail config
// Prompt tab: read-only prompt template preview + promptExtra textarea
// Logs tab: LogViewer component
```

Each tab renders a focused editor for its section. The exact implementation depends on the current `NodeDetailPanel` structure — read the file, then adapt.

For the Constraints tab, render each constraint with:
- Name input
- Check type dropdown (shell / file_contains / expression)
- Check config fields (command / path+pattern / expr)
- OnFail dropdown (retry / route / abort)
- If route: target node selector
- maxRetries number input

- [ ] **Step 3: Run type check**

Run: `npm run vite:build`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Workspace/NodeDetailPanel.tsx
git commit -m "feat: rewrite NodeDetailPanel with Config/Slots/Constraints/Prompt/Logs tabs"
```

---

## Task 16: Update WorkspaceHeader — Execution Modes

**Files:**
- Modify: `src/pages/Workspace/WorkspaceHeader.tsx`

- [ ] **Step 1: Read current file**

Read: `src/pages/Workspace/WorkspaceHeader.tsx`

- [ ] **Step 2: Add execution mode dropdown**

Add a dropdown next to the Run button for selecting execution mode:

```tsx
<select
  value={executionMode}
  onChange={(e) => setExecutionMode(e.target.value as 'all' | 'fromNode' | 'step')}
  className="text-xs bg-transparent border border-white/10 rounded px-2 py-1"
  disabled={isRunning}
>
  <option value="all">Run All</option>
  <option value="fromNode">From Node</option>
  <option value="step">Step</option>
</select>
```

Wire `executionMode` to `runStore.setExecutionMode()`.

- [ ] **Step 3: Add inputs quick-entry button**

Add a button that toggles the input panel visibility:

```tsx
<Button variant="ghost" size="icon-xs" onClick={onToggleInputs}>
  <FileInput className="w-3.5 h-3.5" />
</Button>
```

- [ ] **Step 4: Run type check**

Run: `npm run vite:build`

- [ ] **Step 5: Commit**

```bash
git add src/pages/Workspace/WorkspaceHeader.tsx
git commit -m "feat: add execution mode selector and inputs toggle to workspace header"
```

---

## Task 17: Integrate Everything in Workspace index.tsx

**Files:**
- Modify: `src/pages/Workspace/index.tsx`

- [ ] **Step 1: Read current file**

Read: `src/pages/Workspace/index.tsx`

- [ ] **Step 2: Replace ContentTabs with InputPanel**

Remove `ContentTabs` import and usage. Replace with `InputPanel`:

```tsx
import { InputPanel } from './InputPanel';

// In the layout where ContentTabs was:
<InputPanel
  inputs={currentHarness?.inputs || []}
  values={harnessInputs}
  onChange={(name, value) => setHarnessInputs((prev) => ({ ...prev, [name]: value }))}
  isRunning={isRunning}
/>
```

Add `harnessInputs` state:

```tsx
const [harnessInputs, setHarnessInputs] = useState<Record<string, string>>({});
```

- [ ] **Step 3: Remove useRunFiles hook usage**

Remove the `useRunFiles()` call and all references to `loadFiles`, `documents`, `updateDocument`, `saveDocument`.

- [ ] **Step 4: Pass harnessInputs to runHarness**

Update the run handler to pass inputs:

```tsx
const handleRunHarness = () => {
  harness.runHarness(harnessInputs);
};
```

- [ ] **Step 5: Update NodeDetailPanel props**

Remove the old file-tab-related props. Pass the new props:

```tsx
<NodeDetailPanel
  nodeId={selectedNodeId}
  node={selectedNode}
  projectPath={currentProject?.path}
  runId={currentRunId}
  isRunning={isRunning}
/>
```

- [ ] **Step 6: Run type check**

Run: `npm run vite:build`
Expected: Clean build (all components integrated).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Workspace/index.tsx
git commit -m "feat: integrate InputPanel, remove spec-driven ContentTabs from workspace"
```

---

## Task 18: Built-In Templates

**Files:**
- Modify: `src/services/harness-service.ts` (add template definitions)

- [ ] **Step 1: Add built-in template definitions**

Add after the `getDefaultHarness` function:

```typescript
export function getBuiltinTemplates(): HarnessDefinition[] {
  return [developTemplate(), fixTemplate(), reviewTemplate()];
}

function developTemplate(): HarnessDefinition {
  return {
    id: 'builtin-develop',
    name: 'Develop',
    description: 'Plan → Code (with build constraint) → Review',
    builtin: true,
    nodes: [
      {
        id: 'planner',
        type: 'agent',
        position: { x: 100, y: 200 },
        agent: { agentPreset: 'planner' },
      },
      {
        id: 'coder',
        type: 'agent',
        position: { x: 400, y: 200 },
        agent: {
          agentPreset: 'coder',
          constraints: [
            {
              name: 'build-pass',
              check: { type: 'shell', command: 'npm run build' },
              onFail: { type: 'retry' },
              maxRetries: 3,
            },
          ],
        },
      },
      {
        id: 'reviewer',
        type: 'agent',
        position: { x: 700, y: 200 },
        agent: { agentPreset: 'reviewer' },
      },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'planner', targetNodeId: 'coder' },
      { id: 'c2', sourceNodeId: 'coder', targetNodeId: 'reviewer' },
    ],
    failureRoutes: [],
    inputs: [
      { name: 'task', description: 'Feature or task description', required: true },
    ],
  };
}

function fixTemplate(): HarnessDefinition {
  return {
    id: 'builtin-fix',
    name: 'Fix',
    description: 'Diagnose → Fix (with build+test constraints)',
    builtin: true,
    nodes: [
      {
        id: 'diagnostor',
        type: 'agent',
        position: { x: 100, y: 200 },
        agent: { agentId: 'Analyzer' },
      },
      {
        id: 'fixer',
        type: 'agent',
        position: { x: 400, y: 200 },
        agent: {
          agentPreset: 'coder',
          constraints: [
            {
              name: 'build-pass',
              check: { type: 'shell', command: 'npm run build' },
              onFail: { type: 'retry' },
              maxRetries: 3,
            },
            {
              name: 'tests-pass',
              check: { type: 'shell', command: 'npm test' },
              onFail: { type: 'retry' },
              maxRetries: 2,
            },
          ],
        },
      },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'diagnostor', targetNodeId: 'fixer' },
    ],
    failureRoutes: [],
    inputs: [
      { name: 'bugReport', description: 'Bug description or error log', required: true },
    ],
  };
}

function reviewTemplate(): HarnessDefinition {
  return {
    id: 'builtin-review',
    name: 'Review',
    description: 'Analyze → Review → Gate (human approval)',
    builtin: true,
    nodes: [
      {
        id: 'analyzer',
        type: 'agent',
        position: { x: 100, y: 200 },
        agent: { agentId: 'Analyzer' },
      },
      {
        id: 'reviewer',
        type: 'agent',
        position: { x: 400, y: 200 },
        agent: { agentPreset: 'reviewer' },
      },
      {
        id: 'approval',
        type: 'gate',
        position: { x: 700, y: 200 },
        gate: { gateMessage: 'Review the analysis and review report before approving' },
      },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'analyzer', targetNodeId: 'reviewer' },
      { id: 'c2', sourceNodeId: 'reviewer', targetNodeId: 'approval' },
    ],
    failureRoutes: [],
    inputs: [
      { name: 'codeContext', description: 'Code or PR to review', required: true },
    ],
  };
}
```

- [ ] **Step 2: Run type check**

Run: `npm run vite:build`

- [ ] **Step 3: Commit**

```bash
git add src/services/harness-service.ts
git commit -m "feat: add built-in harness templates (develop, fix, review)"
```

---

## Task 19: Update Rust Backend — Run Directory Structure

**Files:**
- Modify: `src-tauri/src/commands/harness.rs`

- [ ] **Step 1: Update `create_run` to create new directory structure**

The new run directory needs `logs/` and `outputs/` subdirectories instead of the old `inputs/` + `outputs/`:

```rust
#[tauri::command]
pub fn create_run(project_path: String, run_id: String) -> Result<(), String> {
    let run_dir = runs_dir(&project_path).join(&run_id);
    fs::create_dir_all(run_dir.join("logs")).map_err(|e| e.to_string())?;
    fs::create_dir_all(run_dir.join("outputs")).map_err(|e| e.to_string())?;

    let meta = serde_json::json!({
        "harnessId": "",
        "state": "draft",
        "createdAt": chrono::Utc::now().to_rfc3339()
    });
    fs::write(
        run_dir.join("run.json"),
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Update `list_active_runs` to scan new structure**

Change `read_dir_files` calls from `inputs/`+`outputs/` to `logs/`+`outputs/`:

```rust
let log_files = read_dir_files(&path.join("logs"))?;
let output_files = read_dir_files(&path.join("outputs"))?;
```

Update `RunInfo` struct to use `log_files` instead of `input_files`:

```rust
pub struct RunInfo {
    pub id: String,
    pub harness_id: String,
    pub state: String,
    pub created_at: Option<String>,
    pub log_files: Vec<String>,
    pub output_files: Vec<String>,
}
```

- [ ] **Step 3: Run Rust build check**

Run: `cd src-tauri && cargo check`
Expected: Clean or with only warnings.

- [ ] **Step 4: Update TypeScript `RunInfo` type in `src/types/run.ts`**

Match the Rust change:

```typescript
export interface RunInfo {
  id: string;
  harnessId: string;
  state: RunState;
  createdAt?: string;
  logFiles: string[];
  outputFiles: string[];
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/harness.rs src/types/run.ts
git commit -m "refactor: update run directory structure — logs/ replaces inputs/"
```

---

## Task 20: Final Type Check & Cleanup

**Files:**
- Various files with remaining type errors

- [ ] **Step 1: Run full type check**

Run: `npm run vite:build`

- [ ] **Step 2: Fix all remaining type errors**

Common issues to expect:
- Old `FileTab` imports in files that haven't been updated
- Old `AgentCategory` references
- Old `NodeConstraints` (renamed) vs new `NodeConstraint`
- `ExecutorCallbacks` signature changes in any remaining consumers
- `runStore` new fields not initialized

Fix each error, working through the compiler output systematically.

- [ ] **Step 3: Verify Rust build**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Run full dev build**

Run: `npm run vite:build`
Expected: Clean build, zero errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: resolve all remaining type errors from harness engineering pivot"
```

---

## Task 21: Smoke Test & Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run `npm run dev` to verify the app launches**

Run: `npm run dev`
Expected: App opens, workspace loads, canvas renders.

- [ ] **Step 2: Update CLAUDE.md**

Update the Architecture section to reflect the new execution engine, node types, constraint system, and logging. Remove references to `CATEGORY_FILES`, `deriveFileTabs`, `ContentTabs`. Add the new engine services directory.

Key updates:
- Execution flow: mention state machine, constraint checking, failure routing
- Key layers: add `src/services/engine/` directory
- Node types: agent, condition, gate
- Logging: JSONL per-node + harness-level

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for harness engineering architecture"
```
