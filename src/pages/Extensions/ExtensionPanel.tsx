import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Plus, Sparkles, Search, Pencil, Trash2 } from 'lucide-react';
import {
  scanExtensions,
  loadExtensionsConfig,
  toggleExtension,
  createExtension,
  readExtensionContent,
  saveExtensionContent,
  deleteExtension,
} from '../../services/extension-service';
import type { ToolExtensionInfo } from '../../types/extension';

interface ExtensionPanelProps {
  projectPath: string | undefined;
}

export default function ExtensionPanel({ projectPath }: ExtensionPanelProps) {
  const [extensions, setExtensions] = useState<ToolExtensionInfo[]>([]);
  const [enabledExts, setEnabledExts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newSaving, setNewSaving] = useState(false);

  const [editingExt, setEditingExt] = useState<ToolExtensionInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadExts = async (pp: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanExtensions(pp), loadExtensionsConfig(pp),
      ]);
      setExtensions(list);
      setEnabledExts(new Set(config.enabled));
    } catch (e) { toast.error(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (projectPath) loadExts(projectPath);
    else { setExtensions([]); setEnabledExts(new Set()); }
  }, [projectPath]);

  const handleToggle = async (extId: string, checked: boolean) => {
    if (!projectPath) return;
    try {
      await toggleExtension(projectPath, extId, checked);
      setEnabledExts((prev) => {
        const next = new Set(prev);
        checked ? next.add(extId) : next.delete(extId);
        return next;
      });
    } catch (e) { toast.error(`Update failed: ${e}`); }
  };

  const handleOpenEdit = async (ext: ToolExtensionInfo) => {
    try { setEditContent(await readExtensionContent(ext.path)); }
    catch { setEditContent(''); }
    setEditingExt(ext);
  };

  const handleSaveEdit = async () => {
    if (!editingExt || !projectPath) return;
    setEditSaving(true);
    try {
      await saveExtensionContent(projectPath, editingExt.id, editContent);
      toast.success('Saved');
      setEditingExt(null);
      await loadExts(projectPath);
    } catch (e) { toast.error(`Save failed: ${e}`); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async (extId: string) => {
    if (!projectPath) return;
    try {
      await deleteExtension(projectPath, extId);
      toast.success('Deleted');
      await loadExts(projectPath);
    } catch (e) { toast.error(`Delete failed: ${e}`); }
  };

  const handleCreate = async () => {
    if (!projectPath || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createExtension(projectPath, newId.trim(), newName.trim() || newId.trim(), newDesc.trim(), newBody.trim());
      toast.success(`Skill "${newId}" created`);
      setNewOpen(false);
      setNewId(''); setNewName(''); setNewDesc(''); setNewBody('');
      await loadExts(projectPath);
    } catch (e) { toast.error(`Create failed: ${e}`); }
    finally { setNewSaving(false); }
  };

  const filtered = extensions.filter(
    (e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!projectPath) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Open a project first</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input placeholder="Search skills..." className="pl-8 h-7 text-xs bg-white/40 border-border/40" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Button variant="ghost" size="icon-xs" disabled={loading} onClick={() => loadExts(projectPath)}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setNewOpen(true)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-1.5">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground">No skills</p>
            <p className="text-[10px] text-muted-foreground/50">Create SKILL.md files in .claude/skills/</p>
          </div>
        ) : (
          filtered.map((ext) => (
            <div key={ext.id} className="group glass-card rounded-xl p-3 transition-all duration-200">
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{ext.name}</span>
                    {enabledExts.has(ext.id) && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-green-100 text-green-700">Enabled</Badge>}
                  </div>
                  {ext.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{ext.description}</p>}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                  <button role="switch" aria-checked={enabledExts.has(ext.id)} onClick={() => handleToggle(ext.id, !enabledExts.has(ext.id))}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabledExts.has(ext.id) ? 'bg-primary' : 'bg-input'}`}>
                    <span className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg transition-transform ${enabledExts.has(ext.id) ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                  <button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={() => handleOpenEdit(ext)}><Pencil className="w-3 h-3 text-muted-foreground/50" /></button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<button className="p-1 rounded hover:bg-accent cursor-pointer" />}><Trash2 className="w-3 h-3 text-muted-foreground/50" /></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete skill "{ext.name}"?</AlertDialogTitle><AlertDialogDescription>This will delete <code className="text-xs">.claude/skills/{ext.id}/</code> and cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(ext.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Skill</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Skill ID <span className="text-destructive">*</span></Label><Input placeholder="e.g. my-tool" value={newId} onChange={(e) => setNewId(e.target.value)} /><p className="text-[11px] text-muted-foreground">Directory name, use hyphens</p></div>
              <div className="space-y-1.5"><Label className="text-xs">Display Name</Label><Input placeholder="Leave blank to use ID" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input placeholder="One-line description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Content (Markdown)</Label><Textarea placeholder="Describe rules and conventions for Claude..." className="font-mono text-xs min-h-[180px]" value={newBody} onChange={(e) => setNewBody(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button><Button disabled={!newId.trim() || newSaving} onClick={handleCreate}>{newSaving ? 'Saving...' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingExt} onOpenChange={(open) => !open && setEditingExt(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><DialogTitle className="text-sm">{editingExt?.name}</DialogTitle><p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">.claude/skills/{editingExt?.id}/SKILL.md</p></div>
              <div className="flex items-center gap-2 shrink-0"><Button variant="outline" size="sm" className="h-7 text-xs" disabled={editSaving} onClick={handleSaveEdit}>{editSaving ? 'Saving...' : 'Save'}</Button><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingExt(null)}>Close</Button></div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-white/30 backdrop-blur-sm overflow-hidden">
            <textarea className="w-full h-full min-h-[300px] px-4 py-3 font-mono text-xs leading-relaxed bg-transparent outline-none resize-none" value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
