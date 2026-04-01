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
import { RefreshCw, Plus, Sparkles, Search, Pencil, Trash2, Globe, FolderOpen } from 'lucide-react';
import {
  scanSkills,
  loadSkillPoolConfig,
  toggleSkill,
  createSkill,
  readSkillContent,
  saveSkillContent,
  deleteSkill,
} from '../../services/skill-service';
import type { SkillMeta } from '../../types/skill';

interface SkillPanelProps {
  projectPath: string | undefined;
}

type SourceFilter = 'all' | 'global' | 'project';

export default function SkillPanel({ projectPath }: SkillPanelProps) {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newSaving, setNewSaving] = useState(false);

  const [editingSkill, setEditingSkill] = useState<SkillMeta | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadAll = async (pp: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanSkills(pp), loadSkillPoolConfig(pp),
      ]);
      setSkills(list);
      setEnabledSkills(new Set(config.enabled));
    } catch (e) { toast.error(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (projectPath) loadAll(projectPath);
    else { setSkills([]); setEnabledSkills(new Set()); }
  }, [projectPath]);

  const handleToggle = async (skillId: string, checked: boolean) => {
    if (!projectPath) return;
    try {
      await toggleSkill(projectPath, skillId, checked);
      setEnabledSkills((prev) => {
        const next = new Set(prev);
        checked ? next.add(skillId) : next.delete(skillId);
        return next;
      });
    } catch (e) { toast.error(`Update failed: ${e}`); }
  };

  const handleOpenEdit = async (skill: SkillMeta) => {
    try { setEditContent(await readSkillContent(skill.path)); }
    catch { setEditContent(''); }
    setEditingSkill(skill);
  };

  const handleSaveEdit = async () => {
    if (!editingSkill || !projectPath) return;
    setEditSaving(true);
    try {
      await saveSkillContent(projectPath, editingSkill.id, editContent);
      toast.success('Saved');
      setEditingSkill(null);
      await loadAll(projectPath);
    } catch (e) { toast.error(`Save failed: ${e}`); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async (skillId: string) => {
    if (!projectPath) return;
    try {
      await deleteSkill(projectPath, skillId);
      toast.success('Deleted');
      await loadAll(projectPath);
    } catch (e) { toast.error(`Delete failed: ${e}`); }
  };

  const handleCreate = async () => {
    if (!projectPath || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createSkill(projectPath, newId.trim(), newName.trim() || newId.trim(), newDesc.trim(), newBody.trim());
      toast.success(`Skill "${newId}" created`);
      setNewOpen(false);
      setNewId(''); setNewName(''); setNewDesc(''); setNewBody('');
      await loadAll(projectPath);
    } catch (e) { toast.error(`Create failed: ${e}`); }
    finally { setNewSaving(false); }
  };

  const filtered = skills.filter((s) => {
    if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    }
    return true;
  });

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
        <Button variant="ghost" size="icon-xs" disabled={loading} onClick={() => loadAll(projectPath)}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setNewOpen(true)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Source filter tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/20 shrink-0">
        {(['all', 'global', 'project'] as const).map((f) => (
          <button key={f} onClick={() => setSourceFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${sourceFilter === f ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {f === 'all' ? 'All' : f === 'global' ? 'Global' : 'Project'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-1.5">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground">No skills</p>
            <p className="text-[10px] text-muted-foreground/50">Create SKILL.md in .harness/skills/ or ~/.claude/skills/</p>
          </div>
        ) : (
          filtered.map((skill) => (
            <div key={`${skill.source}-${skill.id}`} className="group glass-card rounded-xl p-3 transition-all duration-200">
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{skill.name}</span>
                    {enabledSkills.has(skill.id) && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-green-100 text-green-700">Enabled</Badge>}
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 gap-0.5">
                      {skill.source === 'global' ? <Globe className="w-2 h-2" /> : <FolderOpen className="w-2 h-2" />}
                      {skill.source}
                    </Badge>
                  </div>
                  {skill.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{skill.description}</p>}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                  <button role="switch" aria-checked={enabledSkills.has(skill.id)} onClick={() => handleToggle(skill.id, !enabledSkills.has(skill.id))}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabledSkills.has(skill.id) ? 'bg-primary' : 'bg-input'}`}>
                    <span className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg transition-transform ${enabledSkills.has(skill.id) ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                  {skill.source === 'project' && (
                    <>
                      <button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={() => handleOpenEdit(skill)}><Pencil className="w-3 h-3 text-muted-foreground/50" /></button>
                      <AlertDialog>
                        <AlertDialogTrigger render={<button className="p-1 rounded hover:bg-accent cursor-pointer" />}><Trash2 className="w-3 h-3 text-muted-foreground/50" /></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete skill "{skill.name}"?</AlertDialogTitle><AlertDialogDescription>This will delete <code className="text-xs">.harness/skills/{skill.id}/</code> and cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(skill.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Skill</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Skill ID <span className="text-destructive">*</span></Label><Input placeholder="e.g. code-review" value={newId} onChange={(e) => setNewId(e.target.value)} /><p className="text-[11px] text-muted-foreground">Lowercase, hyphens only</p></div>
              <div className="space-y-1.5"><Label className="text-xs">Display Name</Label><Input placeholder="Leave blank to use ID" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input placeholder="When should Claude use this skill?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Instructions (Markdown)</Label><Textarea placeholder="Step-by-step guidance for Claude..." className="font-mono text-xs min-h-[180px]" value={newBody} onChange={(e) => setNewBody(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button><Button disabled={!newId.trim() || newSaving} onClick={handleCreate}>{newSaving ? 'Saving...' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingSkill} onOpenChange={(open) => !open && setEditingSkill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><DialogTitle className="text-sm">{editingSkill?.name}</DialogTitle><p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">.harness/skills/{editingSkill?.id}/SKILL.md</p></div>
              <div className="flex items-center gap-2 shrink-0"><Button variant="outline" size="sm" className="h-7 text-xs" disabled={editSaving} onClick={handleSaveEdit}>{editSaving ? 'Saving...' : 'Save'}</Button><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSkill(null)}>Close</Button></div>
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
