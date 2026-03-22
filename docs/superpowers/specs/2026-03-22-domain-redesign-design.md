# Domain Redesign: Knowledge Module for Agent Context

## Summary

Redesign the Domain concept from a simple spec file organizer into a structured, pluggable knowledge module system that agents can query on-demand during execution.

## Core Concept

A **Domain** is a project-level knowledge module (e.g., "Payments", "User Management") that provides structured reference documentation for agents. Each domain contains multiple documents organized by fixed-but-configurable slot types. Agents discover and read domain knowledge through two dedicated tools during execution.

## Design Principles

- **Convention over configuration**: Domains follow a standardized directory structure with agreed-upon file slots
- **On-demand retrieval**: Agents query domains themselves (no pre-injection into prompts), keeping token usage efficient
- **Pluggable slots**: Document types are configurable per project, not hardcoded
- **Read-only for agents**: Agents consume domain knowledge but don't modify it; management is done through UI

## Directory Structure

```
.harness/domains/
├── slots.json                    # Project-level slot registry
├── payments/
│   ├── domain.json               # Manifest: name, description, tags
│   ├── spec.md                   # Functional specification
│   ├── api.md                    # Interface definitions
│   ├── rules.md                  # Business rules
│   └── models.md                 # Data models
└── user-management/
    ├── domain.json
    ├── spec.md
    └── glossary.md
```

### Domain Name Constraints

Domain names are used as directory names and tool identifiers. Valid names must:
- Contain only lowercase alphanumeric characters and hyphens (`[a-z0-9-]+`)
- Start with a letter
- Max 64 characters
- Not start or end with a hyphen

The UI must validate and sanitize input accordingly. The backend rejects invalid names with an error.

### slots.json (Project-Level Slot Registry)

Defines the available document slot types. When `read_domain_slots` is called and `slots.json` does not exist, the backend returns the default configuration in-memory without writing to disk. The file is only written when the user explicitly modifies slots through the UI (via `write_domain_slots`).

```json
{
  "slots": [
    { "id": "spec", "label": "Spec", "filename": "spec.md", "description": "Functional specification: purpose, features, user stories" },
    { "id": "api", "label": "API", "filename": "api.md", "description": "Interface definitions: REST/GraphQL/RPC endpoints, request/response formats" },
    { "id": "rules", "label": "Rules", "filename": "rules.md", "description": "Business rules: validation logic, state transitions, permission constraints" },
    { "id": "models", "label": "Models", "filename": "models.md", "description": "Data models: entity definitions, field descriptions, relationships" },
    { "id": "glossary", "label": "Glossary", "filename": "glossary.md", "description": "Glossary: domain-specific terms and abbreviations" }
  ]
}
```

Users can add/remove slots (e.g., `testing.md`, `deployment.md`). Changes apply globally to all domains.

**Validation**: Both slot `id` and `filename` must be unique across the registry. `write_domain_slots` rejects duplicates with an error.

### domain.json (Per-Domain Manifest)

```json
{
  "name": "Payments",
  "description": "Payment system: order payments, refunds, reconciliation",
  "tags": ["billing", "refund", "reconciliation"]
}
```

All file slots are optional. A new domain only requires `domain.json`.

## Agent Tool Interface

Two read-only tools for agent use during execution:

### ListDomains

- **Input**: none
- **Output**:

```json
[
  {
    "name": "Payments",
    "description": "Payment system: order payments, refunds, reconciliation",
    "tags": ["billing", "refund", "reconciliation"],
    "files": ["spec", "api", "rules"]
  }
]
```

The `files` array lists slot IDs where the corresponding file actually exists, so the agent knows what's available before requesting.

- **Errors**: Returns empty array if `.harness/domains/` does not exist (not an error).

### ReadDomainFile(domain, fileType)

- **Input**: `{ "domain": "payments", "fileType": "api" }`
- **Output**: Full file content as string
- **Errors**: Returns error string (consistent with existing Tauri `Result<T, String>` pattern):
  - `"Domain 'xxx' not found"` — directory does not exist
  - `"File type 'xxx' not found in domain 'yyy'"` — slot file does not exist
  - `"Unknown file type 'xxx'"` — slot ID not in `slots.json`

### Tool Injection

Agent tool injection (via MCP tool or CLI extension) is a separate follow-up concern. This spec covers the data layer and UI; the tool integration will be designed independently.

## Type Definitions

Added to `src/types/harness.ts`:

```typescript
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
  name: string;
  description: string;
  tags: string[];
  files: string[];  // Slot IDs where files actually exist
}
```

## Backend (Tauri Commands)

| Command | Purpose | Notes |
|---|---|---|
| `list_domains(projectPath)` | Return `DomainInfo[]` with manifest data | Replaces existing `Vec<String>` return type. For domains missing `domain.json`, synthesizes info in-memory (name = directory name, empty description/tags). Does NOT write `domain.json` as side effect. Reads `slots.json` (or defaults) once, then checks file existence per domain. |
| `read_domain_meta(projectPath, domain)` | Read `domain.json` | Returns error if domain directory does not exist. |
| `write_domain_meta(projectPath, domain, content)` | Write `domain.json` | Creates domain directory if it does not exist (this is the domain creation path). Validates domain name against naming constraints. |
| `read_domain_file(projectPath, domain, fileType)` | Read file by slot ID | Resolves filename via `slots.json` (or defaults). Returns error if domain or file not found. |
| `write_domain_file(projectPath, domain, fileType, content)` | Write file by slot ID | Resolves filename via `slots.json`. Creates file if not present. Domain must already exist. |
| `delete_domain(projectPath, domain)` | Delete entire domain directory | Uses `remove_dir_all`. Returns error if directory does not exist (consistent with `delete_run` pattern). No protection against active runs — domains are read-only reference material. |
| `read_domain_slots(projectPath)` | Read `slots.json` | Returns hardcoded defaults if file not present (does NOT write to disk). |
| `write_domain_slots(projectPath, content)` | Write `slots.json` | Validates uniqueness of slot IDs and filenames. Creates `.harness/domains/` directory if needed. |

**Breaking change note**: `list_domains` return type changes from `Vec<String>` to a serialized `Vec<DomainInfo>`. The old caller in `run-service.ts` is removed as part of this work; the new `domain-service.ts` expects the new return type. This is a coordinated frontend+backend change within a single implementation step.

## Frontend Service Layer

New file: `src/services/domain-service.ts`

- Wraps all Tauri invoke calls for domain operations
- `listDomains(projectPath)` -> `DomainInfo[]`
- `readDomainMeta(projectPath, domain)` -> `DomainMeta`
- `writeDomainMeta(projectPath, domain, meta: DomainMeta)` -> `void`
- `readDomainFile(projectPath, domain, fileType)` -> `string`
- `writeDomainFile(projectPath, domain, fileType, content)` -> `void`
- `deleteDomain(projectPath, domain)` -> `void`
- `getSlots(projectPath)` -> `DomainSlot[]`
- `saveSlots(projectPath, slots: DomainSlot[])` -> `void`
- Remove existing `listDomains` from `run-service.ts`

**State management**: Domain state is managed as local React state within `DomainPanel` (consistent with the current pattern). No Zustand store needed — domains are reference material with no cross-component reactive dependencies. If future features require reactive domain state (e.g., agent tool integration showing which domains are being read), a store can be introduced then.

## UI Design

All within the existing workspace drawer `domains` panel. Achromatic glassmorphic style.

### Domain List (Left Area)

- Each item: name + description (from `domain.json`) + tag badges
- Create: dialog with name (validated against naming constraints), description, tags fields; calls `writeDomainMeta` to create
- Delete: confirmation dialog, calls `deleteDomain`
- Click to select and show detail

### Domain Detail (Right Area, After Selection)

- Header: domain description (inline editable). Domain name is **read-only** (renaming would require directory rename, which is out of scope — users can delete and recreate instead)
- Tags: editable tag badges
- Document tabs: one tab per slot from `slots.json` (or defaults)
  - Tabs with content: normal display
  - Empty tabs: dimmed with "click to create" prompt
- Editor: markdown text editor with save, consistent with existing spec editor

### Slots Management

- Accessible from domain detail bottom or drawer settings
- Simple list UI: add/remove slots, edit label and description
- Validates uniqueness of IDs and filenames before saving
- Writes to `slots.json`, applies globally

## Migration

- Existing domains with only `spec.md` continue to work (all slots are optional)
- `read_domain_slots` returns defaults in-memory if `slots.json` absent — no auto-write
- Existing `spec.md` files are recognized by the default `spec` slot
- `list_domains` synthesizes `DomainInfo` in-memory for domains missing `domain.json` (name derived from directory name, empty description and tags). No `domain.json` is written automatically — the user can edit the domain in the UI to persist a `domain.json`

## Performance Considerations

`list_domains` reads `slots.json` once, then for each domain: reads `domain.json` (if present) and stats each slot file for existence. For N domains with M slots, this is O(N * M) filesystem operations. This is acceptable for the expected scale (tens of domains, single-digit slots). No caching needed at this stage.

## Out of Scope

- Agent tool injection mechanism (MCP tool / CLI extension) — separate follow-up
- Domain renaming (delete + recreate instead)
- Domain search/indexing beyond `ListDomains` metadata
- Domain versioning or history
- Cross-domain references
