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
import type { Port } from '../../types/pipeline';

const ALL_TOOLS = [
  'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
  'Agent', 'Notebook', 'WebSearch', 'WebFetch',
];

const CATEGORIES = [
  { id: 'planner', label: '规划', icon: FileText },
  { id: 'implementer', label: '实现', icon: Code2 },
  { id: 'verifier', label: '验证', icon: ClipboardCheck },
  { id: 'reviewer', label: '审查', icon: Search },
  { id: 'custom', label: '自定义', icon: Bot },
] as const;

function makePortId(name: string): string {
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '').toLowerCase() || 'port';
}

function PortListEditor({
  ports,
  onChange,
  label,
}: {
  ports: Port[];
  onChange: (ports: Port[]) => void;
  label: string;
}) {
  const addPort = () => {
    onChange([
      ...ports,
      { id: `port-${Date.now()}`, name: '', type: 'file', required: false, defaultValue: '' },
    ]);
  };
  const removePort = (idx: number) => onChange(ports.filter((_, i) => i !== idx));
  const updatePort = (idx: number, patch: Partial<Port>) => {
    const next = ports.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, ...patch };
      if ('name' in patch) updated.id = makePortId(patch.name!);
      return updated;
    });
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {ports.map((port, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            placeholder="名称"
            value={port.name}
            onChange={(e) => updatePort(idx, { name: e.target.value })}
            className="h-7 text-xs flex-1"
          />
          <button
            onClick={() => updatePort(idx, { type: port.type === 'file' ? 'text' : 'file' })}
            className={`px-2 py-1 rounded text-[10px] border transition-colors shrink-0 ${
              port.type === 'file'
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}
          >
            {port.type === 'file' ? '文件' : '文本'}
          </button>
          <Input
            placeholder="默认路径 (可用 {{changeName}})"
            value={port.defaultValue ?? ''}
            onChange={(e) => updatePort(idx, { defaultValue: e.target.value })}
            className="h-7 text-xs flex-[2]"
          />
          <button onClick={() => removePort(idx)} className="p-1 rounded hover:bg-accent shrink-0">
            <Trash2 className="w-3 h-3 text-muted-foreground/50" />
          </button>
        </div>
      ))}
      <button onClick={addPort} className="text-[11px] text-primary hover:text-primary/80 transition-colors cursor-pointer">
        + 添加端口
      </button>
    </div>
  );
}

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
  const [newInputPorts, setNewInputPorts] = useState<Port[]>([]);
  const [newOutputPorts, setNewOutputPorts] = useState<Port[]>([]);
  const [newPromptTemplate, setNewPromptTemplate] = useState('');
  const [newSaving, setNewSaving] = useState(false);

  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [configAgent, setConfigAgent] = useState<AgentInfo | null>(null);
  const [configTools, setConfigTools] = useState<string[]>([]);
  const [configMaxTurns, setConfigMaxTurns] = useState(20);
  const [configInputPorts, setConfigInputPorts] = useState<Port[]>([]);
  const [configOutputPorts, setConfigOutputPorts] = useState<Port[]>([]);
  const [configPromptTemplate, setConfigPromptTemplate] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  const loadAgents = async (pp: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanAgents(pp), loadAgentsConfig(pp),
      ]);
      setAgents(list);
      setEnabledAgents(new Set(config.enabled));
    } catch (e) {
      toast.error(`Agent 加载失败: ${e}`);
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
    } catch (e) { toast.error(`更新失败: ${e}`); }
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
      toast.success('已保存');
      setEditingAgent(null);
      await loadAgents(projectPath);
    } catch (e) { toast.error(`保存失败: ${e}`); }
    finally { setEditSaving(false); }
  };

  const handleOpenConfig = async (agent: AgentInfo) => {
    const config = await loadAgentToolConfig(agent.config_path);
    if (config) {
      setConfigTools(config.allowedTools);
      setConfigMaxTurns(config.maxTurns);
      setConfigInputPorts(config.inputPorts ?? []);
      setConfigOutputPorts(config.outputPorts ?? []);
      setConfigPromptTemplate(config.promptTemplate ?? '');
    } else {
      setConfigTools(['Read', 'Glob', 'Grep']);
      setConfigMaxTurns(20);
      setConfigInputPorts([]);
      setConfigOutputPorts([]);
      setConfigPromptTemplate('');
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
        inputPorts: configInputPorts,
        outputPorts: configOutputPorts,
        promptTemplate: configPromptTemplate,
      });
      toast.success('配置已保存');
      setConfigAgent(null);
    } catch (e) { toast.error(`保存失败: ${e}`); }
    finally { setConfigSaving(false); }
  };

  const toggleTool = (tool: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(tool) ? list.filter((t) => t !== tool) : [...list, tool]);
  };

  const handleDelete = async (agentId: string) => {
    if (!projectPath) return;
    try {
      await deleteAgent(projectPath, agentId);
      toast.success('已删除');
      await loadAgents(projectPath);
    } catch (e) { toast.error(`删除失败: ${e}`); }
  };

  const handleCreate = async () => {
    if (!projectPath || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createAgent(projectPath, newId.trim(), newName.trim() || newId.trim(), newDesc.trim(), newBody.trim(), {
        allowedTools: newTools,
        maxTurns: newMaxTurns,
        category: newCategory,
        inputPorts: newInputPorts,
        outputPorts: newOutputPorts,
        promptTemplate: newPromptTemplate,
      });
      toast.success(`Agent "${newId}" 已创建`);
      setNewOpen(false);
      setNewId(''); setNewName(''); setNewDesc(''); setNewBody('');
      setNewCategory('custom'); setNewTools(['Read', 'Glob', 'Grep']); setNewMaxTurns(20);
      setNewInputPorts([]); setNewOutputPorts([]); setNewPromptTemplate('');
      await loadAgents(projectPath);
    } catch (e) { toast.error(`创建失败: ${e}`); }
    finally { setNewSaving(false); }
  };

  const filtered = agents.filter(
    (a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!projectPath) {
    return <div className="p-4 text-center text-sm text-muted-foreground">请先打开一个项目</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            className="pl-8 h-7 text-xs bg-white/40 border-border/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="icon-xs" disabled={loading} onClick={() => loadAgents(projectPath)}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setNewOpen(true)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-1.5">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground">暂无 Agent</p>
          </div>
        ) : (
          filtered.map((agent) => (
            <div key={agent.id} className="group glass-card rounded-xl p-3 transition-all duration-200">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  {agent.builtin ? <Shield className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{agent.name}</span>
                    {agent.builtin && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">内置</Badge>}
                    {agent.category && agent.category !== 'custom' && (
                      <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                        {CATEGORIES.find((c) => c.id === agent.category)?.label ?? agent.category}
                      </Badge>
                    )}
                    {enabledAgents.has(agent.id) && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-green-100 text-green-700">启用</Badge>}
                  </div>
                  {agent.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{agent.description}</p>}
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
                        <AlertDialogHeader><AlertDialogTitle>删除 Agent "{agent.name}"？</AlertDialogTitle><AlertDialogDescription>将删除 <code className="text-xs">.claude/agents/{agent.id}.md</code> 及对应配置，操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(agent.id)} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialogs (new / edit / config) */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>新建 Agent</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Agent ID <span className="text-destructive">*</span></Label><Input placeholder="如: CodeReviewer" value={newId} onChange={(e) => setNewId(e.target.value)} /><p className="text-[11px] text-muted-foreground">文件名（不含 .md），建议 PascalCase</p></div>
              <div className="space-y-1.5"><Label className="text-xs">显示名称</Label><Input placeholder="留空则同 ID" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">描述</Label><Input placeholder="一句话说明 Agent 的职责" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">类别</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => {
                  const CatIcon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setNewCategory(cat.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${newCategory === cat.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}
                    >
                      <CatIcon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">允许的工具</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, newTools, setNewTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${newTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">最大轮次</Label><Input type="number" min={1} max={200} value={newMaxTurns} onChange={(e) => setNewMaxTurns(Number(e.target.value))} className="w-32" /></div>
            <PortListEditor ports={newInputPorts} onChange={setNewInputPorts} label="输入端口" />
            <PortListEditor ports={newOutputPorts} onChange={setNewOutputPorts} label="输出端口" />
            <div className="space-y-1.5"><Label className="text-xs">Prompt 模板</Label><Textarea placeholder="可用 {{端口id}} 引用端口路径，如: 请阅读 {{requirements}} ..." className="font-mono text-xs min-h-[60px]" value={newPromptTemplate} onChange={(e) => setNewPromptTemplate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">System Prompt（Markdown）</Label><Textarea placeholder="描述此 Agent 的角色、行为准则与输出格式..." className="font-mono text-xs min-h-[180px]" value={newBody} onChange={(e) => setNewBody(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setNewOpen(false)}>取消</Button><Button disabled={!newId.trim() || newSaving} onClick={handleCreate}>{newSaving ? '保存中...' : '创建'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><DialogTitle className="text-sm">{editingAgent?.name}</DialogTitle><p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">.claude/agents/{editingAgent?.id}.md</p></div>
              <div className="flex items-center gap-2 shrink-0"><Button variant="outline" size="sm" className="h-7 text-xs" disabled={editSaving} onClick={handleSaveEdit}>{editSaving ? '保存中...' : '保存'}</Button><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingAgent(null)}>关闭</Button></div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-white/30 backdrop-blur-sm overflow-hidden">
            <textarea className="w-full h-full min-h-[300px] px-4 py-3 font-mono text-xs leading-relaxed bg-transparent outline-none resize-none" value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!configAgent} onOpenChange={(open) => !open && setConfigAgent(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle className="text-sm">{configAgent?.name} - 配置</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 flex-1 overflow-auto">
            <div className="space-y-1.5">
              <Label className="text-xs">允许的工具</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (<button key={tool} onClick={() => toggleTool(tool, configTools, setConfigTools)} className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${configTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'}`}>{tool}</button>))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">最大轮次</Label><Input type="number" min={1} max={200} value={configMaxTurns} onChange={(e) => setConfigMaxTurns(Number(e.target.value))} className="w-32" /></div>
            <PortListEditor ports={configInputPorts} onChange={setConfigInputPorts} label="输入端口" />
            <PortListEditor ports={configOutputPorts} onChange={setConfigOutputPorts} label="输出端口" />
            <div className="space-y-1.5"><Label className="text-xs">Prompt 模板</Label><Textarea placeholder="可用 {{端口id}} 引用端口路径..." className="font-mono text-xs min-h-[60px]" value={configPromptTemplate} onChange={(e) => setConfigPromptTemplate(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setConfigAgent(null)}>取消</Button><Button disabled={configSaving} onClick={handleSaveConfig}>{configSaving ? '保存中...' : '保存'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
