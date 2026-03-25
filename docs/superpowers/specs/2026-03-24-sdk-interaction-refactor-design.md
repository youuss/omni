# SDK Interaction Refactor Design

## Overview

Refactor the Claude Agent SDK integration to use a **fat sidecar** architecture. The Node.js sidecar (`sdk-runner.mjs`) takes full responsibility for reading agent definitions, assembling SDK Options, and calling `query()`. The frontend becomes a thin orchestration layer that sends intent and receives streamed results.

## Goals

- Frontend sends intent only (project path, agent names, prompt, overrides) — zero file reads
- Sidecar reads `.claude/agents/*.md` and `.harness/agents/*.json`, assembles SDK Options internally
- Support all SDK features: model selection, hooks, mcpServers, maxBudgetUsd, includePartialMessages
- Stdin-based communication (line-delimited JSON) replaces base64 argv
- Hybrid orchestration (frontend controls phases, Claude dispatches agents within each phase), targeting full Claude self-orchestration

## Architecture

```
┌─────────────┐   stdin (JSON lines)   ┌──────────────────┐
│   Frontend   │ ───────────────────► │   sdk-runner.mjs   │
│  (Tauri)     │ ◄─────────────────── │   (Node.js)        │
│              │   stdout (JSONL)      │                    │
│  RunRequest  │                       │  1. Parse request  │
│  → stdin     │   stderr (logs)       │  2. Read .md/.json │
│              │ ◄─────────────────── │  3. Build Options  │
│  SDKMessage  │                       │  4. query()        │
│  ← stdout    │                       │  5. Stream output  │
└─────────────┘                       └──────────────────┘
```

## Section 1 — RunRequest Protocol

### Frontend → Sidecar (stdin, first line)

```typescript
interface RunRequest {
  projectPath: string;
  prompt: string;
  agents: string[];                // agent names to load
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

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
type SettingSource = 'user' | 'project' | 'local';

interface AgentOverride {
  maxTurns?: number;
  allowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  promptExtra?: string;           // appended to .md prompt
}

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

type HooksConfig = Record<string, HookEntry[]>;
interface HookEntry {
  matcher?: string;
  command: string;
}
```

### Control Commands (stdin, subsequent lines)

```json
{"cmd": "abort"}
{"cmd": "interrupt", "toolUseId": "xxx"}
```

### Sidecar → Frontend

- **stdout**: One SDKMessage JSON per line
- **stderr**: Logs and error messages

## Section 2 — Sidecar Internal Implementation

### Startup Flow

```
stdin line 1 → JSON RunRequest
  ↓
1. Parse projectPath, agents[], prompt
2. For each agentName:
   a. Read {projectPath}/.claude/agents/{name}.md → prompt
   b. Read {projectPath}/.harness/agents/{name}.json → config (tools, maxTurns, model)
   c. Merge overrides[name] over config fields
   d. Read enabled extensions → append to prompt
3. Assemble SDK Options:
   agents: Record<string, AgentDefinition>
   maxTurns, maxBudgetUsd, model, permissionMode, settingSources
   hooks, mcpServers (pass through)
   abortController
4. query({ prompt, options }) → AsyncGenerator<SDKMessage>
5. Each message → JSON line → stdout
```

### Stdin Communication

Line-delimited JSON protocol:
- Line 1: RunRequest (startup config)
- Subsequent lines: Control commands (`abort`, `interrupt`)
- Benefits: no base64 encoding, extensible for future commands (setModel, etc.)

### Extension Injection

Sidecar reads `{projectPath}/.harness/extensions/` directory, finds enabled extension `.md` files, appends to corresponding agent prompt (separated by `---`).

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Startup failure | stderr + exit(1) |
| SDK query error | stderr + exit(2) |
| Abort | exit(0) |
| Stdin parse error | stderr warning, continue running |

## Section 3 — Frontend Types

### New Types (`src/types/claude.ts`)

Add:
- `RunRequest`, `AgentOverride`, `McpServerConfig`, `HooksConfig`, `HookEntry`
- `PermissionMode`, `SettingSource` (type aliases)
- `SDKStreamEvent` (for partial messages)

Remove:
- `SDKAgentDef` — now internal to sidecar
- `SDKRunnerConfig` — replaced by RunRequest

Keep unchanged:
- `SDKAssistantMessage`, `SDKUserMessage`, `SDKResultSuccess`, `SDKResultError`, `SDKSystemMessage`
- `SDKMessage` union type (only add SDKStreamEvent)
- `AgentRunHandle`, `AgentConfig`, `AgentName`

### claude-runner.ts Interface

```typescript
interface RunAgentOptions {
  projectPath: string;          // replaces cwd
  agentNames: string[];         // supports multi-agent
  prompt: string;
  runId?: string;
  onEvent: (msg: SDKMessage) => void;
  onError?: (text: string) => void;
  onStatus?: (text: string) => void;
  onDone?: (code: number | null) => void;
  overrides?: Record<string, AgentOverride>;
  resume?: boolean;
  model?: string;
  maxBudgetUsd?: number;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: HooksConfig;
}
```

The function constructs a `RunRequest`, spawns the sidecar, writes the request to stdin, and pipes stdout through `stream-parser.ts`.

## Section 4 — SDKMessage Processing & Output Store

### Partial Message Support

When `includePartialMessages: true`, SDK sends `stream_event` messages:

```typescript
interface SDKStreamEvent {
  type: 'stream_event';
  event: string;          // 'content_block_delta', 'content_block_start', etc.
  data: unknown;
  session_id: string;
}
```

### outputStore Changes

New state:
- `partialText: string` — currently streaming text
- `isStreaming: boolean` — whether receiving partial messages

Processing logic:
- `stream_event` → concatenate delta to `partialText`, set `isStreaming = true`
- `assistant` → complete message arrived, clear `partialText`, set `isStreaming = false`, write to messages array
- `result` → record cost, duration, usage
- `result` with `subtype === 'error_max_budget_usd'` → show budget exceeded prompt (not generic error)

## Section 5 — Migration Plan

### Files to Modify

| File | Change |
|------|--------|
| `scripts/sdk-runner.mjs` | **Rewrite** — stdin-based RunRequest, reads files, assembles SDK Options |
| `src/services/claude/claude-runner.ts` | **Simplify** — remove `buildAgentDef()`, construct RunRequest, write to stdin |
| `src/types/claude.ts` | **Add** RunRequest types; **Remove** SDKAgentDef/SDKRunnerConfig |
| `src/stores/outputStore.ts` | **Add** partialText/isStreaming, handle stream_event and error_max_budget_usd |
| `src/services/claude/agent-config-service.ts` | **May remove or slim down** — frontend no longer needs full config reads |
| `src/services/extension-service.ts` | **Slim down** — frontend no longer reads extension content |

### Files Unchanged

| File | Reason |
|------|--------|
| `src/services/claude/stream-parser.ts` | JSONL parsing unchanged |
| `src/services/claude/session-store.ts` | Session storage unchanged |
| `src/services/harness-executor.ts` | Adapts to new `runAgent()` signature |
| `src-tauri/tauri.conf.json` | Sidecar config already in place |
| `src-tauri/capabilities/default.json` | Shell permissions already configured |

### Strategy

Single-step migration (no incremental). The rewrite simplifies the frontend and the sidecar logic is self-contained. Type changes would prevent intermediate states from compiling.

### Backward Compatibility

- `.claude/agents/*.md` and `.harness/agents/*.json` formats unchanged
- SDKMessage union type only gains members, no removals
- harness-executor adapts to new RunAgentOptions signature
