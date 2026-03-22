import React, { useEffect, useState, useCallback } from 'react';
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
                  <AlertDialogTrigger
                    render={<button className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all cursor-pointer shrink-0" />}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Trash2 className="w-3 h-3 text-muted-foreground/40" />
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
