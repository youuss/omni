# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Omni Fabric is a Tauri v2 desktop app for spec-driven AI development. Users define agent harnesses (DAGs of AI agents), configure them visually on a ReactFlow canvas, and execute them against the Claude Agent SDK. The app streams real-time output from agent runs.

## Tech Stack

- **Desktop shell**: Tauri 2 (Rust)
- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS v4 (OKLCH design tokens)
- **State**: Zustand stores
- **Canvas**: ReactFlow (`@xyflow/react`)
- **UI**: shadcn/ui (base-nova style), lucide-react icons
- **AI**: `@anthropic-ai/claude-agent-sdk` via Node.js sidecar (`scripts/sdk-runner.mjs`)

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Full Tauri dev mode (Vite at :1420 + desktop window) |
| `npm run vite:dev` | Browser-only Vite dev (no Tauri APIs) |
| `npm run vite:build` | Type-check (`tsc`) + production build to `dist/` |
| `npm run build` | Full Tauri production build |

No test framework is configured. Type-check via `npm run vite:build`.

## Architecture

### Execution Flow (Fat Sidecar Pattern)

```
UI (useHarnessRunner) → HarnessExecutor.execute()
  → topoSort nodes by DAG edges
  → For each node: runAgent() (claude-runner.ts)
    → Tauri Shell spawns: node sdk-runner.mjs
    → RunRequest JSON written to stdin (first line)
    → sdk-runner loads agent prompts + configs from disk
    → Calls Claude Agent SDK query()
    → Streams SDKMessage as JSONL to stdout
    → claude-runner parses lines, emits to callbacks
    → outputStore accumulates for terminal display
```

Control: `{"cmd":"abort"}` sent via stdin to stop a running agent.

### Key Layers

**Services** (`src/services/`) — Business logic, Tauri IPC calls:
- `claude/claude-runner.ts` — Spawns sdk-runner, manages stdin/stdout protocol
- `claude/stream-parser.ts` — Parses JSONL SDKMessage lines
- `claude/session-store.ts` — Session resume tracking
- `harness-executor.ts` — DAG topological sort + sequential node execution
- `harness-service.ts`, `run-service.ts`, `agent-service.ts`, `extension-service.ts`, `domain-service.ts` — CRUD via Tauri invoke

**Stores** (`src/stores/`) — Zustand state:
- `harnessStore` — Graph (nodes/connections), templates, runtime status
- `runStore` — Current run state
- `projectStore` — Project list
- `outputStore` — Terminal output with streaming partial text

**Types** (`src/types/`) — Shared TypeScript definitions:
- `claude.ts` — RunRequest, SDKMessage, AgentRunHandle, protocol types
- `harness.ts` — Node, connection, agent definition types

**Rust Backend** (`src-tauri/src/commands/`) — Filesystem operations:
- `project.rs`, `harness.rs`, `agents.rs`, `extensions.rs`, `file.rs`
- Registered in `lib.rs` via `invoke_handler!`

**Sidecar** (`scripts/sdk-runner.mjs`) — Node.js process that wraps Claude Agent SDK. Reads RunRequest from stdin, loads files from disk, calls `query()`, streams JSONL to stdout.

### Per-Project Directory Convention

Projects managed by Omni Fabric follow this structure on disk:
```
{project}/
  .claude/agents/{Name}.md          # Agent prompt files
  .harness/harness.json             # Current harness DAG definition
  .harness/agents/{Name}.json       # Per-agent config (model, maxTurns, tools)
  .harness/extensions/{id}/prompt.md # Reusable prompt modules
  .harness/templates/               # Saved harness templates
  .harness/runs/{runId}/            # Active run data
  .harness/archive/                 # Archived runs
  .harness/domains/{slug}/          # Domain knowledge modules
```

### Routing

`src/App.tsx`: `/projects` (list/create) and `/workspace/:projectPath` (main editor).

## Design System

Defined in `.cursor/rules/design-system.mdc` and `src/styles/global.css`:

- **Colors**: OKLCH color space. Background 0.98, foreground 0.18. Status colors: planning (blue), implementing (indigo), verifying (amber), done (emerald).
- **Glassmorphism layers**: `.glass-subtle` (0.40), `.glass` (0.55), `.glass-strong` (0.72), `.glass-card` (0.55 + border). Use these CSS classes, not raw backdrop-filter.
- **Typography**: DejaVu Sans / Inter (sans), DejaVu Sans Mono / SF Mono (mono). Body: text-sm. Buttons: text-xs.
- **Buttons**: `size-xs gap-1 h-7 text-[11px]` for action bars; `variant="ghost" size="icon-xs"` for toolbars.
- **Z-index tiers**: z-0 (content), z-10 (sticky), z-20 (dropdowns), z-30 (drawers), z-50 (dialogs). No arbitrary z-values.
- **Spacing**: p-8 (pages), p-5 (workspace), p-3 (lists), gap-1 to gap-1.5 (buttons).

## Key Conventions

- Path alias: `@/` maps to `src/` (configured in both vite.config.ts and tsconfig.json)
- Dev server port 1420 is `strictPort` — must match `tauri.conf.json` devUrl
- Tauri shell permissions in `src-tauri/capabilities/default.json` must be updated when adding new executable spawns
- `claude` CLI must be in PATH for agent execution to work
- Documentation (README.md, DEVELOP.md, SDK.md, DESIGN.md) is in Chinese
