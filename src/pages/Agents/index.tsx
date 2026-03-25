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
import { useProjectStore } from '../../stores/projectStore';
import {
  RefreshCw, Plus, Bot, Search, Pencil, Trash2, Settings2, Shield,
} from 'lucide-react';
import {
  scanAgents, loadAgentsConfig, toggleAgent, createAgent,
  readAgentPrompt, saveAgentPrompt, loadAgentToolConfig,
  saveAgentToolConfig, deleteAgent, type AgentInfo,
} from '../../services/agent-service';

const ALL_TOOLS = [
  'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
  'Agent', 'Notebook', 'WebSearch', 'WebFetch',
];

export default function AgentsPage() {
  const { currentProject } = useProjectStore();

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTools, setNewTools] = useState<string[]>(['Read', 'Glob', 'Grep']);
  const [newMaxTurns, setNewMaxTurns] = useState(20);
  const [newSaving, setNewSaving] = useState(false);

  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [configAgent, setConfigAgent] = useState<AgentInfo | null>(null);
  const [configTools, setConfigTools] = useState<string[]>([]);
  const [configMaxTurns, setConfigMaxTurns] = useState(20);
  const [configSaving, setConfigSaving] = useState(false);

  const loadAgents = async (projectPath: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanAgents(projectPath), loadAgentsConfig(projectPath),
      ]);
      setAgents(list);
      setEnabledAgents(new Set(config.enabled));
    } catch (e) { toast.error(`Agent load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (currentProject?.path) loadAgents(currentProject.path);
    else { setAgents([]); setEnabledAgents(new Set()); }
  }, [currentProject?.path]);

  const handleToggle = async (agentId: string, checked: boolean) => {
    if (!currentProject?.path) return;
    try {
      await toggleAgent(currentProject.path, agentId, checked);
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
    if (!editingAgent || !currentProject?.path) return;
    setEditSaving(true);
    try {
      await saveAgentPrompt(currentProject.path, editingAgent.id, editContent);
      toast.success('Saved');
      setEditingAgent(null);
      await loadAgents(currentProject.path);
    } catch (e) { toast.error(`Save failed: ${e}`); }
    finally { setEditSaving(false); }
  };

  const handleOpenConfig = async (agent: AgentInfo) => {
    const config = await loadAgentToolConfig(agent.config_path);
    if (config) {
      setConfigTools(config.allowedTools);
      setConfigMaxTurns(config.maxTurns);
    } else {
      setConfigTools(['Read', 'Glob', 'Grep']);
      setConfigMaxTurns(20);
    }
    setConfigAgent(agent);
  };

  const handleSaveConfig = async () => {
    if (!configAgent || !currentProject?.path) return;
    setConfigSaving(true);
    try {
      await saveAgentToolConfig(currentProject.path, configAgent.id, {
        allowedTools: configTools,
        maxTurns: configMaxTurns,
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
    if (!currentProject?.path) return;
    try {
      await deleteAgent(currentProject.path, agentId);
      toast.success('Deleted');
      await loadAgents(currentProject.path);
    } catch (e) { toast.error(`Delete failed: ${e}`); }
  };

  const handleCreate = async () => {
    if (!currentProject?.path || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createAgent(currentProject.path, newId.trim(), newName.trim() || newId.trim(), newDesc.trim(), newBody.trim(), {
        allowedTools: newTools, maxTurns: newMaxTurns,
      });
      toast.success(`Agent "${newId}" created`);
      setNewOpen(false);
      setNewId(''); setNewName(''); setNewDesc(''); setNewBody('');
      setNewTools(['Read', 'Glob', 'Grep']); setNewMaxTurns(20);
      await loadAgents(currentProject.path);
    } catch (e) { toast.error(`Create failed: ${e}`); }
    finally { setNewSaving(false); }
  };

  const filtered = agents.filter(
    (a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const builtinCount = agents.filter((a) => a.builtin).length;
  const customCount = agents.length - builtinCount;

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground mt-1">Manage agent configurations and prompts for this workspace.</p>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Agent Management</p>
            <p className="text-lg font-semibold">{currentProject?.name ?? 'Omni'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agent definitions in .claude/agents/, configs in .harness/agents/</p>
          </div>
          <Button className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Bot className="w-4 h-4" />
            New Agent
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total', value: agents.length },
            { label: 'Enabled', value: enabledAgents.size },
            { label: 'Built-in', value: builtinCount },
            { label: 'Custom', value: customCount },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white/40 backdrop-blur-sm border border-border/30 px-4 py-3">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{stat.label}</p>
              <p className="text-xl font-semibold mt-0.5">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" disabled={loading} onClick={() => currentProject?.path && loadAgents(currentProject.path)}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search agents..." className="pl-9 h-8 text-xs bg-white/40 backdrop-blur-sm border-border/40" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setNewOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New Agent
        </Button>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Installed Agents</p>

      {!currentProject ? (
        <div className="text-center py-8"><p className="text-sm text-muted-foreground">Open a project first</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Bot className="w-10 h-10 mx-auto text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No agents</p>
          <p className="text-xs text-muted-foreground/70">Create .md files in .claude/agents/ or click "New Agent"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((agent) => (
            <div key={agent.id} className="group glass-card rounded-2xl p-4 transition-all duration-300">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary mt-0.5">
                  {agent.builtin ? <Shield className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{agent.name}</span>
                    {agent.builtin && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Built-in</Badge>}
                    {enabledAgents.has(agent.id) && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700">Enabled</Badge>}
                  </div>
                  {agent.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>}
                  <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">.claude/agents/{agent.id}.md</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button role="switch" aria-checked={enabledAgents.has(agent.id)} onClick={() => handleToggle(agent.id, !enabledAgents.has(agent.id))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabledAgents.has(agent.id) ? 'bg-primary' : 'bg-input'}`}>
                    <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${enabledAgents.has(agent.id) ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <button className="p-1 rounded hover:bg-accent transition-colors" onClick={() => handleOpenEdit(agent)}><Pencil className="w-3.5 h-3.5 text-muted-foreground/50" /></button>
                  <button className="p-1 rounded hover:bg-accent transition-colors" onClick={() => handleOpenConfig(agent)}><Settings2 className="w-3.5 h-3.5 text-muted-foreground/50" /></button>
                  {!agent.builtin && (
                    <AlertDialog>
                      <AlertDialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-destructive transition-colors" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Agent "{agent.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This will delete <code className="text-xs">.claude/agents/{agent.id}.md</code> and its config. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(agent.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
              <Label className="text-xs">Allowed Tools</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, newTools, setNewTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${newTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Max Turns</Label><Input type="number" min={1} max={200} value={newMaxTurns} onChange={(e) => setNewMaxTurns(Number(e.target.value))} className="w-32" /></div>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm">{configAgent?.name} - Config</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Tools</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, configTools, setConfigTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${configTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Max Turns</Label><Input type="number" min={1} max={200} value={configMaxTurns} onChange={(e) => setConfigMaxTurns(Number(e.target.value))} className="w-32" /><p className="text-[11px] text-muted-foreground">Maximum conversation turns per agent run</p></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setConfigAgent(null)}>Cancel</Button><Button disabled={configSaving} onClick={handleSaveConfig}>{configSaving ? 'Saving...' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
