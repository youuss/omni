# Revert to Claude Code CLI — Design Spec

## Goal

Remove `@anthropic-ai/claude-agent-sdk` and the `sdk-runner.mjs` sidecar. Restore direct Claude Code CLI invocation as in the initial commit.

## Motivation

The SDK wrapper adds an unnecessary abstraction layer. The original approach of directly spawning `claude` CLI with args is simpler and sufficient.

## Scope

- Remove SDK dependency and sidecar
- Revert claude-runner.ts to direct CLI spawning
- Simplify types (remove RunRequest, McpServerConfig, HooksConfig, etc.)
- Skills: no injection — Claude Code discovers them autonomously
- Remove MCP servers, hooks, subagent mode support

## Architecture

### Current (SDK)

```
UI → claude-runner.ts → spawn node sdk-runner.mjs → SDK query() → claude CLI
```

### Target (CLI)

```
UI → claude-runner.ts → spawn claude CLI directly
```

## Changes

### 1. claude-runner.ts

Revert to direct CLI spawning. The `runAgent` function:

```ts
interface RunAgentOptions {
  projectPath: string;
  agentName: string;
  prompt: string;
  runId?: string;
  maxTurns?: number;
  allowedTools?: string[];
  model?: string;
  onEvent: EventCallback;
  onError?: ErrorCallback;
  onStatus?: StatusCallback;
  onDone?: DoneCallback;
  resume?: boolean;
}
```

CLI args:
```
claude \
  --print \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --max-turns {maxTurns} \
  --system-prompt-file {agentDefPath} \
  --append-system-prompt-file {extensionPath} \  # per extension
  --resume {sessionId} \                         # if resume
  {prompt} \                                     # last positional arg
  --allowedTools {tool1} {tool2} ...             # if tools specified
```

- Agent prompt: `--system-prompt-file .claude/agents/{Name}.md`
- Extensions: `--append-system-prompt-file .harness/extensions/{id}/prompt.md` (one per extension)
- Skills: not injected (Claude Code discovers autonomously)
- Abort: `child.kill()` (no stdin command)

### 2. state-machine.ts

`executeAgentNode` changes:
- Single agent name instead of array
- Pass assembled prompt directly (no skills/mcpServers/hooks)
- Extensions resolved and passed as append files

### 3. Types (src/types/claude.ts)

**Keep:**
- `AgentName`, `AgentConfig`, `AgentRunHandle`
- `SDKMessage` and subtypes (for parsing stream-json output)

**Remove:**
- `RunRequest`
- `AgentOverride`
- `McpServerConfig`
- `HooksConfig`, `HookEvent`, `HookEntry`
- `PermissionMode`, `SettingSource`

### 4. Delete files

- `scripts/sdk-runner.mjs`

### 5. Configuration cleanup

**package.json:**
- Remove `@anthropic-ai/claude-agent-sdk`
- Remove `zod` (only used by sdk-runner)

**tauri.conf.json:**
- Remove `"../scripts/sdk-runner.mjs"` from `bundle.resources`

**capabilities/default.json:**
- Remove `run-sdk-runner` entries from `shell:allow-spawn` and `shell:allow-execute`

### 6. Prompt assembly

`prompt-assembler.ts` continues to assemble the full prompt string. The runner handles `--system-prompt-file` and `--append-system-prompt-file` args.

The runner reads enabled extensions from `.harness/extensions.json` and appends each as `--append-system-prompt-file`.

## Files to modify

| File | Action |
|------|--------|
| `src/services/claude/claude-runner.ts` | Rewrite to direct CLI |
| `src/services/engine/state-machine.ts` | Update runAgent call |
| `src/types/claude.ts` | Remove SDK-specific types |
| `src/types/index.ts` | Update exports |
| `scripts/sdk-runner.mjs` | Delete |
| `package.json` | Remove SDK dep + zod |
| `src-tauri/tauri.conf.json` | Remove sidecar resource |
| `src-tauri/capabilities/default.json` | Remove sdk-runner permissions |
| `src/pages/Workspace/useHarnessRunner.ts` | Update if it references SDK types |

## Non-changes

- `prompt-assembler.ts` — keeps assembling prompts
- `constraint-checker.ts` — unchanged
- `context-resolver.ts` — unchanged
- `logger.ts` — unchanged
- `stream-parser.ts` — unchanged (still parses JSONL)
- `session-store.ts` — unchanged
- `agent-config-service.ts` — unchanged
- `harness-executor.ts` — unchanged
