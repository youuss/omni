# Omni Fabric

> AI-powered spec-driven development platform

Omni Fabric is a desktop application that orchestrates multiple Claude AI agents through a visual harness editor. Define requirements, compose agent workflows on a drag-and-drop canvas, and execute them — from planning to implementation to verification — all powered by the Claude Agent SDK.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| State Management | Zustand |
| Routing | React Router DOM v7 |
| Styling | Tailwind CSS v4 |
| UI Components | base-ui + shadcn/ui + Lucide Icons |
| Graph Editor | ReactFlow (@xyflow/react) |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |
| AI Engine | @anthropic-ai/claude-agent-sdk (Node.js sidecar) |

## Core Concepts

### Agent

An Agent is an AI role that performs a specific development task. Each agent has a system prompt (`.claude/agents/{Name}.md`) and a config (`.harness/agents/{Name}.json`) defining allowed tools and max turns.

Built-in agents:

| Agent | Role | Tools | Max Turns |
|-------|------|-------|-----------|
| Planner | Analyze requirements, produce dev plan | Read, Glob, Grep, Write | 20 |
| Implementer | Execute code changes per plan | Read, Edit, Write, Bash, Glob, Grep | 50 |
| Verifier | Verify implementation correctness | Read, Glob, Grep | 15 |
| Analyzer | Analyze bugs, produce fix plan | Read, Glob, Grep, Write | 20 |

Custom agents can be created with any prompt, tools, and turn limit.

### Harness

A Harness is a directed acyclic graph (DAG) of agent nodes. Nodes represent agents; edges represent execution dependencies. The harness editor is a visual ReactFlow canvas where you drag agents from a palette, connect them, and configure per-node overrides (maxTurns, allowedTools, promptExtra).

Execution follows topological order — each node runs only after its predecessors complete. If a node fails, downstream dependents are skipped.

Built-in templates:
- **Plan-Implement-Verify**: Planner -> Implementer -> Verifier
- **Analyze-Fix-Verify**: Analyzer -> Implementer -> Verifier

### Run

A Run is a single execution of a harness. Each run gets a directory under `.harness/runs/{runId}/` with input files (requirements) and output files (dev plan, verification report, etc.). Completed runs can be archived.

### Extension

Extensions are injectable prompt modules stored in `.harness/extensions/`. Each extension has a `prompt.md` that gets appended to agent prompts when enabled. Use them for project-specific context, coding standards, or domain knowledge.

### Domain

Domains are reusable knowledge modules in `.harness/domains/`. Each domain has metadata (name, description, tags) and slots (context files, examples, references) that provide structured context to agents.

## Architecture

### System Overview

```
+-------------------+    stdin (JSON)    +--------------------+
|    Tauri App       | ----------------> |   sdk-runner.mjs   |
|    (React + Rust)  | <---------------- |   (Node.js)        |
|                    |   stdout (JSONL)  |                    |
|  RunRequest        |                   |  1. Read .md/.json |
|  -> stdin          |   stderr (logs)   |  2. Build Options  |
|                    | <---------------- |  3. SDK query()    |
|  SDKMessage        |                   |  4. Stream output  |
|  <- stdout         |                   |                    |
+-------------------+                   +--------------------+
```

The app uses a **fat sidecar** pattern. The frontend sends a lightweight `RunRequest` (project path, agent names, prompt, overrides) to a Node.js sidecar via stdin. The sidecar reads agent definition files, assembles SDK options, calls the Claude Agent SDK `query()`, and streams results back as JSONL.

### Frontend Structure

```
src/
├── App.tsx                       # Router
├── components/
│   ├── Layout.tsx                # Global layout: sidebar nav + content
│   ├── MarkdownRenderer.tsx      # Markdown rendering
│   └── ui/                       # shadcn/ui components
├── pages/
│   ├── Projects/                 # Project list, create workspace
│   ├── Workspace/                # Core page: harness editor + execution
│   │   ├── index.tsx             # Main workspace layout
│   │   ├── HarnessCanvas.tsx     # ReactFlow graph editor
│   │   ├── AgentNode.tsx         # Custom node component
│   │   ├── AgentPalette.tsx      # Draggable agent list
│   │   ├── CanvasToolbar.tsx     # Canvas actions
│   │   ├── NodeDetailPanel.tsx   # Selected node detail panel
│   │   ├── ContentTabs.tsx       # File editor tabs (requirements, outputs)
│   │   ├── OutputStream.tsx      # Terminal output
│   │   ├── WorkspaceDrawer.tsx   # Right sidebar (runs, agents, settings...)
│   │   ├── DomainPanel.tsx       # Domain knowledge management
│   │   ├── RunList.tsx           # Run list
│   │   ├── ArchivePanel.tsx      # Archived runs
│   │   ├── useHarnessRunner.ts   # Execution orchestration hook
│   │   └── useRunFiles.ts        # Run file management hook
│   ├── Agents/                   # Agent CRUD page
│   ├── Extensions/               # Extension management page
│   └── Settings/                 # Agent config + environment checks
├── services/
│   ├── harness-executor.ts       # Execution engine (topo sort, node runner)
│   ├── harness-service.ts        # Harness definition I/O
│   ├── harness-template-service.ts # Template management
│   ├── agent-service.ts          # Agent scanning & CRUD
│   ├── extension-service.ts      # Extension management
│   ├── domain-service.ts         # Domain knowledge modules
│   ├── run-service.ts            # Run lifecycle
│   ├── project.ts                # Project management
│   └── claude/
│       ├── claude-runner.ts      # Spawn sidecar, send RunRequest, parse output
│       ├── agent-config-service.ts # Agent config (tools, maxTurns)
│       ├── stream-parser.ts      # JSONL -> SDKMessage parser
│       └── session-store.ts      # Session persistence for resume
├── stores/
│   ├── harnessStore.ts           # Harness graph, templates, node runtime state
│   ├── runStore.ts               # Current run state
│   ├── projectStore.ts           # Project list + current project
│   └── outputStore.ts            # Terminal output + streaming state
└── types/
    ├── claude.ts                 # SDK message types, RunRequest protocol
    ├── harness.ts                # Harness, Agent, Node, Connection types
    ├── run.ts                    # Run state types
    ├── extension.ts              # Extension types
    ├── project.ts                # Project types
    └── index.ts                  # Re-exports
```

### Backend Structure (Tauri/Rust)

```
src-tauri/
├── src/
│   ├── lib.rs                    # Plugin & command registration
│   └── commands/
│       ├── mod.rs                # Command module exports
│       ├── project.rs            # Project list/open/add/remove
│       ├── harness.rs            # Harness CRUD, runs, archive, domains
│       ├── agents.rs             # Agent scanning, default prompts
│       ├── extensions.rs         # Extension scanning
│       └── file.rs               # Generic file read/write
├── resources/agents/             # Built-in agent prompts
│   ├── Planner.md
│   ├── Implementer.md
│   ├── Verifier.md
│   └── Analyzer.md
├── capabilities/default.json     # Tauri permissions (shell, dialog)
└── Cargo.toml
```

### SDK Runner Sidecar

```
scripts/
└── sdk-runner.mjs                # Node.js sidecar for Claude Agent SDK
```

The sidecar receives a `RunRequest` JSON via stdin, then:

1. Reads agent prompts from `.claude/agents/{name}.md`
2. Reads agent configs from `.harness/agents/{name}.json`
3. Reads enabled extensions and appends to agent prompts
4. Assembles SDK `Options` with agents, hooks, mcpServers, etc.
5. Calls `query()` from `@anthropic-ai/claude-agent-sdk`
6. Streams each `SDKMessage` as a JSON line to stdout
7. Listens for control commands (`{"cmd":"abort"}`) on subsequent stdin lines

### Project Directory Convention

```
{project}/
├── .claude/
│   └── agents/                   # Agent prompt files
│       ├── Planner.md
│       ├── Implementer.md
│       ├── Verifier.md
│       └── Analyzer.md
├── .harness/
│   ├── harness.json              # Current harness definition
│   ├── agents.json               # Enabled agents config
│   ├── agents/                   # Per-agent config
│   │   ├── Planner.json          # { allowedTools, maxTurns }
│   │   └── ...
│   ├── extensions.json           # Enabled extensions
│   ├── extensions/               # Extension prompt files
│   │   └── {extensionId}/
│   │       └── prompt.md
│   ├── templates/                # Saved harness templates
│   │   └── {templateId}.json
│   ├── runs/                     # Active runs
│   │   └── {runId}/
│   │       ├── run.json          # Run metadata
│   │       ├── inputs/
│   │       │   └── requirements.md
│   │       └── outputs/
│   │           ├── dev-plan.md
│   │           └── verification-report.md
│   ├── archive/                  # Archived runs
│   │   └── {YYYY-MM-DD-name}/
│   └── domains/                  # Domain knowledge modules
│       └── {domain-slug}/
│           ├── domain.json
│           ├── slots.json
│           └── {slot-files}
```

## Workflow

```
Create Run -> Edit Requirements -> Configure Harness -> Execute -> Review -> Archive
```

1. **Create Run** — Name the run and select a harness template
2. **Edit Requirements** — Write `requirements.md` in the file editor
3. **Configure Harness** — Drag agents onto canvas, draw connections, set overrides
4. **Execute** — Click Run; the engine topologically sorts nodes and executes agents sequentially via the SDK sidecar
5. **Review** — Watch real-time terminal output; inspect generated files (dev plan, code, verification report)
6. **Archive** — Archive the completed run for reference

## Execution Engine

The `HarnessExecutor` drives execution:

1. **Topological sort** — Compute node execution order from edge dependencies
2. **Sequential execution** — For each node in order:
   - Skip if a predecessor failed
   - Build `RunRequest` with agent name, prompt, and overrides
   - Spawn SDK sidecar, stream output
   - Track status: idle -> waiting -> running -> success/failure
3. **Streaming output** — SDKMessage events are parsed and rendered in real-time (assistant text, tool calls, tool results, system info)
4. **Partial streaming** — When `includePartialMessages` is enabled, text deltas are displayed as they arrive
5. **Session resume** — Session IDs are persisted; runs can be resumed with conversation context

## SDK Features

The RunRequest protocol supports the full Claude Agent SDK feature set:

| Feature | Description |
|---------|-------------|
| `agents` | Multi-agent definitions (prompt, tools, model per agent) |
| `model` | Model selection (sonnet, opus, haiku) |
| `maxTurns` | Maximum conversation turns |
| `maxBudgetUsd` | Cost cap per run |
| `permissionMode` | Permission control (default, acceptEdits, bypassPermissions, plan) |
| `mcpServers` | MCP server configuration (stdio, sse, http) |
| `hooks` | Lifecycle hooks (PreToolUse, PostToolUse, Stop, etc.) |
| `includePartialMessages` | Real-time streaming of text deltas |
| `overrides` | Per-agent overrides (maxTurns, allowedTools, model, promptExtra) |
| `resume` | Session resume via session ID |

## Development

### Prerequisites

- Node.js
- Rust toolchain
- Tauri CLI
- Claude CLI (`npm install -g @anthropic-ai/claude-code`)

### Dev Server

```bash
npm install
npm run dev          # Tauri + Vite dev server
npm run vite:dev     # Vite only (browser debug)
```

### Build

```bash
npm run build        # Full Tauri desktop build
```

## License

Private
