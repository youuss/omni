import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  RefreshCw,
  Plus,
  Bot,
  Search,
  Pencil,
  Trash2,
  Settings2,
  Shield,
  FileText,
  Code2,
  ClipboardCheck,
} from 'lucide-react';
import {
  scanAgents,
  loadAgentsConfig,
  toggleAgent,
  createAgent,
  readAgentPrompt,
  saveAgentPrompt,
  loadAgentToolConfig,
  saveAgentToolConfig,
  deleteAgent,
  type AgentInfo,
} from '../../services/agent-service';
import { scanSkills, loadSkillPoolConfig } from '../../services/skill-service';
import type { SkillMeta } from '../../types/skill';
const ALL_TOOLS = [
  'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
  'Agent', 'Notebook', 'WebSearch', 'WebFetch',
];

const CATEGORIES = [
  { id: 'planner', label: 'Planner', icon: FileText },
  { id: 'implementer', label: 'Implementer', icon: Code2 },
  { id: 'verifier', label: 'Verifier', icon: ClipboardCheck },
  { id: 'reviewer', label: 'Reviewer', icon: Search },
  { id: 'custom', label: 'Custom', icon: Bot },
] as const;

interface AgentPanelProps {
  projectPath: string | undefined;
}

export default function AgentPanel({ projectPath }: AgentPanelProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('custom');
  const [newTools, setNewTools] = useState<string[]>(['Read', 'Glob', 'Grep']);
  const [newMaxTurns, setNewMaxTurns] = useState(20);
  const [newPromptTemplate, setNewPromptTemplate] = useState('');
  const [newSaving, setNewSaving] = useState(false);

  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [configAgent, setConfigAgent] = useState<AgentInfo | null>(null);
  const [configTools, setConfigTools] = useState<string[]>([]);
  const [configMaxTurns, setConfigMaxTurns] = useState(20);
  const [configPromptTemplate, setConfigPromptTemplate] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configSkills, setConfigSkills] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillMeta[]>([]);

  const loadAgents = async (pp: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanAgents(pp), loadAgentsConfig(pp),
      ]);
      setAgents(list);
      setEnabledAgents(new Set(config.enabled));
    } catch (e) {
      toast.error(`Agent load failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectPath) loadAgents(projectPath);
    else { setAgents([]); setEnabledAgents(new Set()); }
  }, [projectPath]);

  const handleToggle = async (agentId: string, checked: boolean) => {
    if (!projectPath) return;
    try {
      await toggleAgent(projectPath, agentId, checked);
      setEnabledAgents((prev) => {
        const next = new Set(prev);
        checked ? next.add(agentId) : next.delete(agentId);
        return next;
      });
    } catch (e) { toast.error(`Update failed: ${e}`); }
  };

  const handleOpenEdit = async (agent: AgentInfo) => {
    try { setEditContent(await readAgentPrompt(agent.prompt_path)); }
    catch { setEditContent(''); }
    setEditingAgent(agent);
  };

  const handleSaveEdit = async () => {
    if (!editingAgent || !projectPath) return;
    setEditSaving(true);
    try {
      await saveAgentPrompt(projectPath, editingAgent.id, editContent);
      toast.success('Saved');
      setEditingAgent(null);
      await loadAgents(projectPath);
    } catch (e) { toast.error(`Save failed: ${e}`); }
    finally { setEditSaving(false); }
  };

  const handleOpenConfig = async (agent: AgentInfo) => {
    const config = await loadAgentToolConfig(agent.config_path);
    if (config) {
      setConfigTools(config.allowedTools);
      setConfigMaxTurns(config.maxTurns);
      setConfigPromptTemplate(config.promptTemplate ?? '');
      setConfigSkills(config.skills ?? []);
    } else {
      setConfigTools(['Read', 'Glob', 'Grep']);
      setConfigMaxTurns(20);
      setConfigPromptTemplate('');
      setConfigSkills([]);
    }
    if (projectPath) {
      const [allSkills, poolConfig] = await Promise.all([
        scanSkills(projectPath), loadSkillPoolConfig(projectPath),
      ]);
      const enabledSet = new Set(poolConfig.enabled);
      setAvailableSkills(allSkills.filter((s) => enabledSet.has(s.id)));
    }
    setConfigAgent(agent);
  };

  const handleSaveConfig = async () => {
    if (!configAgent || !projectPath) return;
    setConfigSaving(true);
    try {
      await saveAgentToolConfig(projectPath, configAgent.id, {
        allowedTools: configTools,
        maxTurns: configMaxTurns,
        promptTemplate: configPromptTemplate,
        skills: configSkills,
      });
      toast.success('Config saved');
      setConfigAgent(null);
    } catch (e) { toast.error(`Save failed: ${e}`); }
    finally { setConfigSaving(false); }
  };

  const toggleTool = (tool: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(tool) ? list.filter((t) => t !== tool) : [...list, tool]);
  };

  const handleDelete = async (agentId: string) => {
    if (!projectPath) return;
    try {
      await deleteAgent(projectPath, agentId);
      toast.success('Deleted');
      await loadAgents(projectPath);
    } catch (e) { toast.error(`Delete failed: ${e}`); }
  };

  const handleCreate = async () => {
    if (!projectPath || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createAgent(projectPath, newId.trim(), newName.trim() || newId.trim(), newDesc.trim(), newBody.trim(), {
        allowedTools: newTools,
        maxTurns: newMaxTurns,
        category: newCategory,
        promptTemplate: newPromptTemplate,
      });
      toast.success(`Agent "${newId}" created`);
      setNewOpen(false);
      setNewId(''); setNewName(''); setNewDesc(''); setNewBody('');
      setNewCategory('custom'); setNewTools(['Read', 'Glob', 'Grep']); setNewMaxTurns(20);
      setNewPromptTemplate('');
      await loadAgents(projectPath);
    } catch (e) { toast.error(`Create failed: ${e}`); }
    finally { setNewSaving(false); }
  };

  const filtered = agents.filter(
    (a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!projectPath) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Open a project first</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input placeholder="Search agents..." className="pl-8 h-7 text-xs bg-white/40 border-border/40" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Button variant="ghost" size="icon-xs" disabled={loading} onClick={() => loadAgents(projectPath)}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setNewOpen(true)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-1.5">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground">No agents</p>
          </div>
        ) : (
          filtered.map((agent) => (
            <div key={agent.id} className="group glass-card rounded-xl p-3 transition-all duration-200">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  {agent.builtin ? <Shield className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold truncate block">{agent.name}</span>
                  {agent.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{agent.description}</p>}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {agent.builtin && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">Built-in</Badge>}
                    {agent.category && agent.category !== 'custom' && (
                      <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                        {CATEGORIES.find((c) => c.id === agent.category)?.label ?? agent.category}
                      </Badge>
                    )}
                    {enabledAgents.has(agent.id) && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-green-100 text-green-700">Enabled</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                  <button role="switch" aria-checked={enabledAgents.has(agent.id)} onClick={() => handleToggle(agent.id, !enabledAgents.has(agent.id))}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabledAgents.has(agent.id) ? 'bg-primary' : 'bg-input'}`}>
                    <span className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg transition-transform ${enabledAgents.has(agent.id) ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                  <button className="p-1 rounded hover:bg-accent" onClick={() => handleOpenEdit(agent)}><Pencil className="w-3 h-3 text-muted-foreground/50" /></button>
                  <button className="p-1 rounded hover:bg-accent" onClick={() => handleOpenConfig(agent)}><Settings2 className="w-3 h-3 text-muted-foreground/50" /></button>
                  {!agent.builtin && (
                    <AlertDialog>
                      <AlertDialogTrigger render={<button className="p-1 rounded hover:bg-accent" />}><Trash2 className="w-3 h-3 text-muted-foreground/50" /></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Agent "{agent.name}"?</AlertDialogTitle><AlertDialogDescription>This will delete <code className="text-xs">.claude/agents/{agent.id}.md</code> and its config. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(agent.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Agent Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Agent</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Agent ID <span className="text-destructive">*</span></Label><Input placeholder="e.g. CodeReviewer" value={newId} onChange={(e) => setNewId(e.target.value)} /><p className="text-[11px] text-muted-foreground">Filename (no .md), use PascalCase</p></div>
              <div className="space-y-1.5"><Label className="text-xs">Display Name</Label><Input placeholder="Leave blank to use ID" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input placeholder="One-line agent description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => {
                  const CatIcon = cat.icon;
                  return (
                    <button key={cat.id} onClick={() => setNewCategory(cat.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${newCategory === cat.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>
                      <CatIcon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Tools</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, newTools, setNewTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${newTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Max Turns</Label><Input type="number" min={1} max={200} value={newMaxTurns} onChange={(e) => setNewMaxTurns(Number(e.target.value))} className="w-32" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Prompt Template</Label><Textarea placeholder="Use {{runId}} to reference the current run, e.g. Read .harness/runs/{{runId}}/outputs/dev-plan.md ..." className="font-mono text-xs min-h-[60px]" value={newPromptTemplate} onChange={(e) => setNewPromptTemplate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">System Prompt (Markdown)</Label><Textarea placeholder="Describe the agent's role, guidelines, and output format..." className="font-mono text-xs min-h-[180px]" value={newBody} onChange={(e) => setNewBody(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button><Button disabled={!newId.trim() || newSaving} onClick={handleCreate}>{newSaving ? 'Saving...' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Prompt Dialog */}
      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><DialogTitle className="text-sm">{editingAgent?.name}</DialogTitle><p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">.claude/agents/{editingAgent?.id}.md</p></div>
              <div className="flex items-center gap-2 shrink-0"><Button variant="outline" size="sm" className="h-7 text-xs" disabled={editSaving} onClick={handleSaveEdit}>{editSaving ? 'Saving...' : 'Save'}</Button><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingAgent(null)}>Close</Button></div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-white/30 backdrop-blur-sm overflow-hidden">
            <textarea className="w-full h-full min-h-[300px] px-4 py-3 font-mono text-xs leading-relaxed bg-transparent outline-none resize-none" value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={!!configAgent} onOpenChange={(open) => !open && setConfigAgent(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle className="text-sm">{configAgent?.name} - Config</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 flex-1 overflow-auto">
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Tools</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, configTools, setConfigTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${configTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Max Turns</Label><Input type="number" min={1} max={200} value={configMaxTurns} onChange={(e) => setConfigMaxTurns(Number(e.target.value))} className="w-32" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Prompt Template</Label><Textarea placeholder="Use {{runId}} to reference the current run..." className="font-mono text-xs min-h-[60px]" value={configPromptTemplate} onChange={(e) => setConfigPromptTemplate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bound Skills</Label>
              {availableSkills.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No enabled skills in pool</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {availableSkills.map((skill) => (
                    <button key={skill.id} onClick={() => {
                      setConfigSkills((prev) =>
                        prev.includes(skill.id) ? prev.filter((s) => s !== skill.id) : [...prev, skill.id]
                      );
                    }}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${configSkills.includes(skill.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>
                      {skill.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setConfigAgent(null)}>Cancel</Button><Button disabled={configSaving} onClick={handleSaveConfig}>{configSaving ? 'Saving...' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
