# Domain Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Domain from a simple spec file viewer into a structured, pluggable knowledge module system with convention-based file slots, manifest metadata, and a new service layer.

**Architecture:** Backend Tauri commands handle filesystem CRUD for domains, slots, and domain files. A new `domain-service.ts` wraps these commands. The `DomainPanel` component is rewritten to support multi-document tabbed editing, tag management, and slot configuration. Types are added to `harness.ts`.

**Tech Stack:** Rust (Tauri v2), TypeScript, React 19, Zustand (local state only), Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-22-domain-redesign-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/types/harness.ts` | Add `DomainSlot`, `DomainMeta`, `DomainInfo` types |
| Modify | `src-tauri/src/commands/harness.rs` | Replace `list_domains`, add 7 new domain commands |
| Modify | `src-tauri/src/lib.rs` | Register new Tauri commands |
| Create | `src/services/domain-service.ts` | Frontend service wrapping all domain Tauri invokes |
| Modify | `src/services/run-service.ts` | Remove `listDomains` function |
| Rewrite | `src/pages/Workspace/DomainPanel.tsx` | Full domain management UI with tabs, slots, tags |

---

### Task 1: Add TypeScript Type Definitions

**Files:**
- Modify: `src/types/harness.ts` (append after line 69)

- [ ] **Step 1: Add domain types to harness.ts**

Append these types at the end of `src/types/harness.ts`:

```typescript
// === Domain Knowledge Modules ===
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
  slug: string;       // Directory name (filesystem identifier)
  name: string;       // Display name from domain.json
  description: string;
  tags: string[];
  files: string[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/harness.ts
git commit -m "feat: add DomainSlot, DomainMeta, DomainInfo types"
```

---

### Task 2: Implement Rust Backend Commands

**Files:**
- Modify: `src-tauri/src/commands/harness.rs` (replace `list_domains` at lines 316-329, add new commands after)
- Modify: `src-tauri/src/lib.rs` (register commands at lines 31-32)

- [ ] **Step 1: Add domain name validation helper and default slots constant**

Add before the existing `list_domains` function in `harness.rs`:

```rust
fn domains_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("domains")
}

fn validate_domain_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("Domain name must be 1-64 characters".to_string());
    }
    let bytes = name.as_bytes();
    if !bytes[0].is_ascii_lowercase() {
        return Err("Domain name must start with a lowercase letter".to_string());
    }
    if bytes.len() > 1 && bytes[bytes.len() - 1] == b'-' {
        return Err("Domain name must not end with a hyphen".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Domain name must contain only lowercase letters, numbers, and hyphens".to_string());
    }
    Ok(())
}

const DEFAULT_SLOTS_JSON: &str = r#"{
  "slots": [
    { "id": "spec", "label": "Spec", "filename": "spec.md", "description": "Functional specification: purpose, features, user stories" },
    { "id": "api", "label": "API", "filename": "api.md", "description": "Interface definitions: REST/GraphQL/RPC endpoints, request/response formats" },
    { "id": "rules", "label": "Rules", "filename": "rules.md", "description": "Business rules: validation logic, state transitions, permission constraints" },
    { "id": "models", "label": "Models", "filename": "models.md", "description": "Data models: entity definitions, field descriptions, relationships" },
    { "id": "glossary", "label": "Glossary", "filename": "glossary.md", "description": "Glossary: domain-specific terms and abbreviations" }
  ]
}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainSlot {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SlotsFile {
    slots: Vec<DomainSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainInfoResult {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub files: Vec<String>,
}

fn read_slots(project_path: &str) -> Result<Vec<DomainSlot>, String> {
    let slots_path = domains_dir(project_path).join("slots.json");
    if slots_path.exists() {
        let content = fs::read_to_string(&slots_path).map_err(|e| e.to_string())?;
        let slots_file: SlotsFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(slots_file.slots)
    } else {
        let slots_file: SlotsFile = serde_json::from_str(DEFAULT_SLOTS_JSON).unwrap();
        Ok(slots_file.slots)
    }
}
```

- [ ] **Step 2: Replace `list_domains` and add all new commands**

Replace the existing `list_domains` function (lines 316-329) with:

```rust
#[tauri::command]
pub fn list_domains(project_path: String) -> Result<Vec<DomainInfoResult>, String> {
    let dir = domains_dir(&project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let slots = read_slots(&project_path)?;

    let mut result = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().into_owned();

        // Read domain.json if present, else synthesize
        let meta_path = path.join("domain.json");
        let meta: DomainMeta = if meta_path.exists() {
            let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())?
        } else {
            DomainMeta {
                name: dir_name.clone(),
                description: String::new(),
                tags: vec![],
            }
        };

        // Check which slot files exist
        let files: Vec<String> = slots
            .iter()
            .filter(|s| path.join(&s.filename).exists())
            .map(|s| s.id.clone())
            .collect();

        result.push(DomainInfoResult {
            slug: dir_name,
            name: meta.name,
            description: meta.description,
            tags: meta.tags,
            files,
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn read_domain_meta(project_path: String, domain: String) -> Result<String, String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let meta_path = domain_dir.join("domain.json");
    if !meta_path.exists() {
        // Synthesize default
        let meta = DomainMeta {
            name: domain.clone(),
            description: String::new(),
            tags: vec![],
        };
        return serde_json::to_string_pretty(&meta).map_err(|e| e.to_string());
    }
    fs::read_to_string(&meta_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_meta(
    project_path: String,
    domain: String,
    content: String,
) -> Result<(), String> {
    validate_domain_name(&domain)?;
    let domain_dir = domains_dir(&project_path).join(&domain);
    fs::create_dir_all(&domain_dir).map_err(|e| e.to_string())?;
    fs::write(domain_dir.join("domain.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_domain_file(
    project_path: String,
    domain: String,
    file_type: String,
) -> Result<String, String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let slots = read_slots(&project_path)?;
    let slot = slots
        .iter()
        .find(|s| s.id == file_type)
        .ok_or_else(|| format!("Unknown file type '{}'", file_type))?;
    let file_path = domain_dir.join(&slot.filename);
    if !file_path.exists() {
        return Err(format!(
            "File type '{}' not found in domain '{}'",
            file_type, domain
        ));
    }
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_file(
    project_path: String,
    domain: String,
    file_type: String,
    content: String,
) -> Result<(), String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let slots = read_slots(&project_path)?;
    let slot = slots
        .iter()
        .find(|s| s.id == file_type)
        .ok_or_else(|| format!("Unknown file type '{}'", file_type))?;
    fs::write(domain_dir.join(&slot.filename), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_domain(project_path: String, domain: String) -> Result<(), String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    fs::remove_dir_all(&domain_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_domain_slots(project_path: String) -> Result<String, String> {
    let slots = read_slots(&project_path)?;
    let slots_file = SlotsFile { slots };
    serde_json::to_string_pretty(&slots_file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_slots(project_path: String, content: String) -> Result<(), String> {
    let slots_file: SlotsFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid slots JSON: {}", e))?;

    // Validate uniqueness of ids
    let mut seen_ids = std::collections::HashSet::new();
    let mut seen_filenames = std::collections::HashSet::new();
    for slot in &slots_file.slots {
        if !seen_ids.insert(&slot.id) {
            return Err(format!("Duplicate slot id: '{}'", slot.id));
        }
        if !seen_filenames.insert(&slot.filename) {
            return Err(format!("Duplicate slot filename: '{}'", slot.filename));
        }
    }

    let dir = domains_dir(&project_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let canonical = serde_json::to_string_pretty(&slots_file).map_err(|e| e.to_string())?;
    fs::write(dir.join("slots.json"), canonical).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register new commands in lib.rs**

Replace line 31 (`commands::harness::list_domains,`) with:

```rust
            // Domains
            commands::harness::list_domains,
            commands::harness::read_domain_meta,
            commands::harness::write_domain_meta,
            commands::harness::read_domain_file,
            commands::harness::write_domain_file,
            commands::harness::delete_domain,
            commands::harness::read_domain_slots,
            commands::harness::write_domain_slots,
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/harness.rs src-tauri/src/lib.rs
git commit -m "feat: add domain backend commands (list, read/write meta, read/write file, delete, slots)"
```

---

### Task 3: Create Frontend Domain Service

**Files:**
- Create: `src/services/domain-service.ts`
- Modify: `src/services/run-service.ts` (remove `listDomains` at lines 86-88)

- [ ] **Step 1: Create domain-service.ts**

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { DomainInfo, DomainMeta, DomainSlot } from '../types/harness';

interface SlotsFile {
  slots: DomainSlot[];
}

export async function listDomains(projectPath: string): Promise<DomainInfo[]> {
  return invoke<DomainInfo[]>('list_domains', { projectPath });
}

/** Helper: get the directory slug for a domain (used for all backend calls) */
export function getDomainSlug(domains: DomainInfo[], name: string): string {
  return domains.find((d) => d.name === name)?.slug ?? name;
}

export async function readDomainMeta(
  projectPath: string,
  domain: string
): Promise<DomainMeta> {
  const content = await invoke<string>('read_domain_meta', { projectPath, domain });
  return JSON.parse(content) as DomainMeta;
}

export async function writeDomainMeta(
  projectPath: string,
  domain: string,
  meta: DomainMeta
): Promise<void> {
  return invoke('write_domain_meta', {
    projectPath,
    domain,
    content: JSON.stringify(meta, null, 2),
  });
}

export async function readDomainFile(
  projectPath: string,
  domain: string,
  fileType: string
): Promise<string> {
  return invoke<string>('read_domain_file', { projectPath, domain, fileType });
}

export async function writeDomainFile(
  projectPath: string,
  domain: string,
  fileType: string,
  content: string
): Promise<void> {
  return invoke('write_domain_file', { projectPath, domain, fileType, content });
}

export async function deleteDomain(
  projectPath: string,
  domain: string
): Promise<void> {
  return invoke('delete_domain', { projectPath, domain });
}

export async function getSlots(projectPath: string): Promise<DomainSlot[]> {
  const content = await invoke<string>('read_domain_slots', { projectPath });
  const parsed = JSON.parse(content) as SlotsFile;
  return parsed.slots;
}

export async function saveSlots(
  projectPath: string,
  slots: DomainSlot[]
): Promise<void> {
  const content = JSON.stringify({ slots }, null, 2);
  return invoke('write_domain_slots', { projectPath, content });
}
```

- [ ] **Step 2: Remove `listDomains` from run-service.ts**

Delete lines 86-88 from `src/services/run-service.ts`:

```typescript
// DELETE:
export async function listDomains(projectPath: string): Promise<string[]> {
  return invoke<string[]>('list_domains', { projectPath });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (DomainPanel.tsx may error because it still imports from run-service — that's expected and fixed in Task 4)

- [ ] **Step 4: Commit**

```bash
git add src/services/domain-service.ts src/services/run-service.ts
git commit -m "feat: add domain-service.ts, remove listDomains from run-service"
```

---

### Task 4: Rewrite DomainPanel UI

**Files:**
- Rewrite: `src/pages/Workspace/DomainPanel.tsx`

- [ ] **Step 1: Rewrite DomainPanel with full domain management**

Replace the entire content of `DomainPanel.tsx` with:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Empty } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import {
  FileText, Plus, Trash2, Save, Pencil, X, Settings2, Tag,
} from 'lucide-react';
import type { DomainInfo, DomainMeta, DomainSlot } from '../../types/harness';
import * as domainService from '../../services/domain-service';

const DOMAIN_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

function validateDomainName(name: string): string | null {
  if (!name) return 'Name is required';
  if (name.length > 64) return 'Max 64 characters';
  if (!DOMAIN_NAME_RE.test(name))
    return 'Lowercase letters, numbers, hyphens only. Must start with a letter, not end with hyphen.';
  return null;
}

interface Props {
  projectPath: string;
}

export default function DomainPanel({ projectPath }: Props) {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [slots, setSlots] = useState<DomainSlot[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<DomainMeta | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [slotContent, setSlotContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Slots management dialog
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [editSlots, setEditSlots] = useState<DomainSlot[]>([]);

  // Tag editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');

  const loadDomains = useCallback(async () => {
    try {
      const [list, slotList] = await Promise.all([
        domainService.listDomains(projectPath),
        domainService.getSlots(projectPath),
      ]);
      setDomains(list);
      setSlots(slotList);
    } catch {
      setDomains([]);
    }
  }, [projectPath]);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const handleSelectDomain = async (slug: string) => {
    setSelectedDomain(slug);
    setActiveSlot(null);
    setSlotContent('');
    setEditing(false);
    try {
      const meta = await domainService.readDomainMeta(projectPath, slug);
      setSelectedMeta(meta);
    } catch {
      setSelectedMeta({ name: slug, description: '', tags: [] });
    }
  };

  const handleSelectSlot = async (slotId: string) => {
    if (!selectedDomain) return;
    setActiveSlot(slotId);
    setEditing(false);
    try {
      const content = await domainService.readDomainFile(projectPath, selectedDomain, slotId);
      setSlotContent(content);
    } catch {
      setSlotContent('');
    }
  };

  const handleSaveSlotContent = async () => {
    if (!selectedDomain || !activeSlot) return;
    try {
      await domainService.writeDomainFile(projectPath, selectedDomain, activeSlot, editContent);
      setSlotContent(editContent);
      setEditing(false);
      toast.success('Saved');
      await loadDomains();
    } catch (e) {
      toast.error(`Save failed: ${e}`);
    }
  };

  const handleCreate = async () => {
    const err = validateDomainName(newName);
    if (err) {
      setNameError(err);
      return;
    }
    try {
      const meta: DomainMeta = {
        name: newName,
        description: newDesc,
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      await domainService.writeDomainMeta(projectPath, newName, meta);
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewTags('');
      setNameError(null);
      await loadDomains();
      toast.success(`Domain "${newName}" created`);
    } catch (e) {
      toast.error(`Create failed: ${e}`);
    }
  };

  const handleDelete = async (domain: string) => {
    try {
      await domainService.deleteDomain(projectPath, domain);
      if (selectedDomain === domain) {
        setSelectedDomain(null);
        setSelectedMeta(null);
      }
      await loadDomains();
      toast.success('Deleted');
    } catch (e) {
      toast.error(`Delete failed: ${e}`);
    }
  };

  const handleSaveMeta = async () => {
    if (!selectedDomain || !selectedMeta) return;
    try {
      const meta: DomainMeta = {
        name: selectedMeta.name,
        description: editDesc,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      await domainService.writeDomainMeta(projectPath, selectedDomain, meta);
      setSelectedMeta(meta);
      setEditingMeta(false);
      await loadDomains();
      toast.success('Updated');
    } catch (e) {
      toast.error(`Update failed: ${e}`);
    }
  };

  const handleSaveSlots = async () => {
    try {
      await domainService.saveSlots(projectPath, editSlots);
      setSlots(editSlots);
      setSlotsOpen(false);
      await loadDomains();
      toast.success('Slots updated');
    } catch (e) {
      toast.error(`Save failed: ${e}`);
    }
  };

  const selectedFiles = domains.find((d) => d.slug === selectedDomain)?.files ?? [];

  return (
    <>
      {/* Domain List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
            Domains
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setSlotsOpen(true);
                setEditSlots([...slots]);
              }}
            >
              <Settings2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {domains.length === 0 ? (
          <Empty description="No domains" className="py-6" />
        ) : (
          <div className="space-y-1">
            {domains.map((domain) => (
              <div
                key={domain.slug}
                className={cn(
                  'group flex items-center gap-2 w-full rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer',
                  selectedDomain === domain.slug
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => handleSelectDomain(domain.slug)}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{domain.name}</p>
                  {domain.description && (
                    <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                      {domain.description}
                    </p>
                  )}
                  {domain.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {domain.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[8px] h-3.5 px-1"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground/40" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete "{domain.name}"?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the entire domain directory and all its
                        files. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(domain.slug)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Domain Detail */}
      {selectedDomain && selectedMeta && (
        <div className="mt-3 pt-3 border-t border-border/20">
          {/* Meta header */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold">{selectedMeta.name}</p>
              <button
                className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                onClick={() => {
                  setEditingMeta(!editingMeta);
                  setEditDesc(selectedMeta.description);
                  setEditTags(selectedMeta.tags.join(', '));
                }}
              >
                <Pencil className="w-3 h-3 text-muted-foreground/40" />
              </button>
            </div>
            {editingMeta ? (
              <div className="space-y-2">
                <Input
                  placeholder="Description"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-7 text-xs bg-white/40 border-border/30"
                />
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  <Input
                    placeholder="Tags (comma separated)"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="h-7 text-xs bg-white/40 border-border/30"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    className="h-6 text-[10px] gap-1"
                    onClick={handleSaveMeta}
                  >
                    <Save className="w-2.5 h-2.5" /> Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-[10px]"
                    onClick={() => setEditingMeta(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {selectedMeta.description && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {selectedMeta.description}
                  </p>
                )}
                {selectedMeta.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedMeta.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[8px] h-3.5 px-1"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <Separator className="!my-2" />

          {/* Slot Tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {slots.map((slot) => {
              const hasContent = selectedFiles.includes(slot.id);
              const isActive = activeSlot === slot.id;
              return (
                <button
                  key={slot.id}
                  onClick={() => handleSelectSlot(slot.id)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[10px] font-medium border transition-all cursor-pointer',
                    isActive
                      ? 'bg-foreground text-background border-foreground'
                      : hasContent
                        ? 'bg-white/50 border-border/40 text-foreground hover:border-border/60'
                        : 'bg-transparent border-border/20 text-muted-foreground/30 hover:text-muted-foreground/60 hover:border-border/40'
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>

          {/* Slot Content */}
          {activeSlot && (
            <div className="rounded-xl border border-border/20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-white/30 border-b border-border/15">
                <span className="text-[10px] text-muted-foreground/50">
                  {slots.find((s) => s.id === activeSlot)?.filename}
                </span>
                {editing ? (
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      className="h-5 text-[9px] gap-0.5"
                      onClick={handleSaveSlotContent}
                    >
                      <Save className="w-2.5 h-2.5" /> Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 text-[9px]"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => {
                      setEditing(true);
                      setEditContent(slotContent);
                    }}
                  >
                    <Pencil className="w-2.5 h-2.5 text-muted-foreground/40" />
                  </button>
                )}
              </div>
              {editing ? (
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[200px] font-mono text-xs border-0 rounded-none focus-visible:ring-0"
                />
              ) : slotContent ? (
                <ScrollArea className="max-h-[400px]">
                  <div className="p-3">
                    <MarkdownRenderer content={slotContent} />
                  </div>
                </ScrollArea>
              ) : (
                <div className="px-3 py-8 text-center">
                  <p className="text-[10px] text-muted-foreground/30">
                    No content yet
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="mt-2 h-6 text-[10px]"
                    onClick={() => {
                      setEditing(true);
                      setEditContent('');
                    }}
                  >
                    Create
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Domain Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">New Domain</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. payments, user-management"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNameError(null);
                }}
                className="bg-white/40 border-border/40"
              />
              {nameError && (
                <p className="text-[10px] text-destructive">{nameError}</p>
              )}
              <p className="text-[10px] text-muted-foreground/50">
                Lowercase letters, numbers, hyphens. Used as directory name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="Brief description of this domain"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="bg-white/40 border-border/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags</Label>
              <Input
                placeholder="Comma-separated, e.g. billing, refund"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="bg-white/40 border-border/40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slots Management Dialog */}
      <Dialog open={slotsOpen} onOpenChange={setSlotsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Manage Slots</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-2 py-2">
            {editSlots.map((slot, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-border/20 bg-white/40 px-3 py-2 group"
              >
                <div className="flex-1 space-y-1">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="ID"
                      value={slot.id}
                      onChange={(e) => {
                        const next = [...editSlots];
                        next[idx] = { ...slot, id: e.target.value };
                        setEditSlots(next);
                      }}
                      className="h-6 text-[10px] bg-transparent border-0 shadow-none px-1 font-mono"
                    />
                    <Input
                      placeholder="Label"
                      value={slot.label}
                      onChange={(e) => {
                        const next = [...editSlots];
                        next[idx] = { ...slot, label: e.target.value };
                        setEditSlots(next);
                      }}
                      className="h-6 text-[10px] bg-transparent border-0 shadow-none px-1"
                    />
                    <Input
                      placeholder="filename.md"
                      value={slot.filename}
                      onChange={(e) => {
                        const next = [...editSlots];
                        next[idx] = { ...slot, filename: e.target.value };
                        setEditSlots(next);
                      }}
                      className="h-6 text-[10px] bg-transparent border-0 shadow-none px-1 font-mono"
                    />
                  </div>
                  <Input
                    placeholder="Description"
                    value={slot.description}
                    onChange={(e) => {
                      const next = [...editSlots];
                      next[idx] = { ...slot, description: e.target.value };
                      setEditSlots(next);
                    }}
                    className="h-6 text-[10px] bg-transparent border-0 shadow-none px-1 text-muted-foreground"
                  />
                </div>
                <button
                  onClick={() => setEditSlots(editSlots.filter((_, i) => i !== idx))}
                  className="p-0.5 rounded text-muted-foreground/20 hover:text-destructive transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setEditSlots([
                  ...editSlots,
                  { id: '', label: '', filename: '', description: '' },
                ])
              }
              className="flex items-center gap-1 w-full px-3 py-2 rounded-lg border border-dashed border-border/30 text-[10px] text-muted-foreground/40 hover:text-foreground/60 hover:border-border/50 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add slot
            </button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSlotsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSlots}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify the app builds**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/Workspace/DomainPanel.tsx
git commit -m "feat: rewrite DomainPanel with multi-slot tabs, tag management, and slots config"
```

---

### Task 5: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Full Vite build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Cargo check**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 4: Manual smoke test checklist**

Run the app with `cargo tauri dev` and verify:
1. Domains panel opens from sidebar (Globe icon)
2. "Create" dialog works with name validation
3. Domain appears in list with description and tags
4. Clicking domain shows slot tabs
5. Clicking a slot tab and creating content works
6. Editing and saving slot content works
7. Slots management dialog opens, allows add/remove
8. Delete domain works with confirmation
9. Meta editing (description/tags) works inline

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for domain redesign"
```
