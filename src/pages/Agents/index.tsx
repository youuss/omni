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
import { useProjectStore } from '../../stores/projectStore';
import {
  RefreshCw,
  Plus,
  Bot,
  Search,
  Pencil,
  Trash2,
  Settings2,
  Shield,
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

const ALL_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'Agent',
  'Notebook',
  'WebSearch',
  'WebFetch',
];

export default function AgentsPage() {
  const { currentProject } = useProjectStore();

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New agent dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTools, setNewTools] = useState<string[]>([
    'Read',
    'Glob',
    'Grep',
  ]);
  const [newMaxTurns, setNewMaxTurns] = useState(20);
  const [newSaving, setNewSaving] = useState(false);

  // Edit prompt dialog
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Config dialog
  const [configAgent, setConfigAgent] = useState<AgentInfo | null>(null);
  const [configTools, setConfigTools] = useState<string[]>([]);
  const [configMaxTurns, setConfigMaxTurns] = useState(20);
  const [configSaving, setConfigSaving] = useState(false);

  const loadAgents = async (projectPath: string) => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanAgents(projectPath),
        loadAgentsConfig(projectPath),
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
    if (currentProject?.path) {
      loadAgents(currentProject.path);
    } else {
      setAgents([]);
      setEnabledAgents(new Set());
    }
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
    } catch (e) {
      toast.error(`更新失败: ${e}`);
    }
  };

  // --- Edit prompt ---
  const handleOpenEdit = async (agent: AgentInfo) => {
    try {
      const content = await readAgentPrompt(agent.prompt_path);
      setEditContent(content);
    } catch {
      setEditContent('');
    }
    setEditingAgent(agent);
  };

  const handleSaveEdit = async () => {
    if (!editingAgent || !currentProject?.path) return;
    setEditSaving(true);
    try {
      await saveAgentPrompt(currentProject.path, editingAgent.id, editContent);
      toast.success('已保存');
      setEditingAgent(null);
      await loadAgents(currentProject.path);
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    } finally {
      setEditSaving(false);
    }
  };

  // --- Config dialog ---
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
      toast.success('配置已保存');
      setConfigAgent(null);
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const toggleTool = (tool: string, list: string[], setList: (v: string[]) => void) => {
    setList(
      list.includes(tool) ? list.filter((t) => t !== tool) : [...list, tool]
    );
  };

  // --- Delete ---
  const handleDelete = async (agentId: string) => {
    if (!currentProject?.path) return;
    try {
      await deleteAgent(currentProject.path, agentId);
      toast.success('已删除');
      await loadAgents(currentProject.path);
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  // --- Create ---
  const handleCreate = async () => {
    if (!currentProject?.path || !newId.trim()) return;
    setNewSaving(true);
    try {
      await createAgent(
        currentProject.path,
        newId.trim(),
        newName.trim() || newId.trim(),
        newDesc.trim(),
        newBody.trim(),
        { allowedTools: newTools, maxTurns: newMaxTurns }
      );
      toast.success(`Agent "${newId}" 已创建`);
      setNewOpen(false);
      setNewId('');
      setNewName('');
      setNewDesc('');
      setNewBody('');
      setNewTools(['Read', 'Glob', 'Grep']);
      setNewMaxTurns(20);
      await loadAgents(currentProject.path);
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    } finally {
      setNewSaving(false);
    }
  };

  const filtered = agents.filter(
    (a) =>
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const builtinCount = agents.filter((a) => a.builtin).length;
  const customCount = agents.length - builtinCount;

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground mt-1">
          管理此工作区的 Agent 配置与 Prompt。
        </p>
      </div>

      {/* Profile Card */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
              Agent 管理
            </p>
            <p className="text-lg font-semibold">
              {currentProject?.name ?? 'Omni'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agent 定义存放在 .claude/agents/ 目录，配置存放在 .omni/agents/
              目录。
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Bot className="w-4 h-4" />
            新建 Agent
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { label: '总计', value: agents.length },
            { label: '已启用', value: enabledAgents.size },
            { label: '内置', value: builtinCount },
            { label: '自定义', value: customCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/40 backdrop-blur-sm border border-border/30 px-4 py-3"
            >
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                {stat.label}
              </p>
              <p className="text-xl font-semibold mt-0.5">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          disabled={loading}
          onClick={() =>
            currentProject?.path && loadAgents(currentProject.path)
          }
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
          />
          刷新
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            className="pl-9 h-8 text-xs bg-white/40 backdrop-blur-sm border-border/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          新建 Agent
        </Button>
      </div>

      {/* Section Header */}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        已安装 AGENTS
      </p>

      {/* Agents Grid */}
      {!currentProject ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">请先打开一个项目</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Bot className="w-10 h-10 mx-auto text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">暂无 Agent</p>
          <p className="text-xs text-muted-foreground/70">
            在 .claude/agents/ 下创建 .md 文件，或点击「新建 Agent」
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((agent) => (
            <div
              key={agent.id}
              className="group glass-card rounded-2xl p-4 transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary mt-0.5">
                  {agent.builtin ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{agent.name}</span>
                    {agent.builtin && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        内置
                      </Badge>
                    )}
                    {enabledAgents.has(agent.id) && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700"
                      >
                        启用
                      </Badge>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {agent.description}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">
                    .claude/agents/{agent.id}.md
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    role="switch"
                    aria-checked={enabledAgents.has(agent.id)}
                    onClick={() =>
                      handleToggle(agent.id, !enabledAgents.has(agent.id))
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                      enabledAgents.has(agent.id) ? 'bg-primary' : 'bg-input'
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                        enabledAgents.has(agent.id)
                          ? 'translate-x-4'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-accent transition-colors"
                    title="编辑 Prompt"
                    onClick={() => handleOpenEdit(agent)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-foreground transition-colors" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-accent transition-colors"
                    title="工具配置"
                    onClick={() => handleOpenConfig(agent)}
                  >
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-foreground transition-colors" />
                  </button>
                  {!agent.builtin && (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <button className="p-1 rounded hover:bg-accent transition-colors" />
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-destructive transition-colors" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            删除 Agent "{agent.name}"？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            将删除{' '}
                            <code className="text-xs">
                              .claude/agents/{agent.id}.md
                            </code>{' '}
                            及对应配置，操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(agent.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            删除
                          </AlertDialogAction>
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
          <DialogHeader>
            <DialogTitle>新建 Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Agent ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="如: CodeReviewer"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  文件名（不含 .md），建议 PascalCase
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">显示名称</Label>
                <Input
                  placeholder="留空则同 ID"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input
                placeholder="一句话说明 Agent 的职责"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">允许的工具</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    onClick={() => toggleTool(tool, newTools, setNewTools)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      newTools.includes(tool)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">最大轮次</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={newMaxTurns}
                onChange={(e) => setNewMaxTurns(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">System Prompt（Markdown）</Label>
              <Textarea
                placeholder="描述此 Agent 的角色、行为准则与输出格式..."
                className="font-mono text-xs min-h-[180px]"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!newId.trim() || newSaving}
              onClick={handleCreate}
            >
              {newSaving ? '保存中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Prompt Dialog */}
      <Dialog
        open={!!editingAgent}
        onOpenChange={(open) => !open && setEditingAgent(null)}
      >
        <DialogContent
          className="max-w-3xl max-h-[85vh] flex flex-col"
        >
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-sm">
                  {editingAgent?.name}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  .claude/agents/{editingAgent?.id}.md
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={editSaving}
                  onClick={handleSaveEdit}
                >
                  {editSaving ? '保存中...' : '保存'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setEditingAgent(null)}
                >
                  关闭
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-white/30 backdrop-blur-sm overflow-hidden">
            <textarea
              className="w-full h-full min-h-[300px] px-4 py-3 font-mono text-xs leading-relaxed bg-transparent outline-none resize-none"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog
        open={!!configAgent}
        onOpenChange={(open) => !open && setConfigAgent(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {configAgent?.name} - 工具配置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">允许的工具</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    onClick={() =>
                      toggleTool(tool, configTools, setConfigTools)
                    }
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      configTools.includes(tool)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">最大轮次</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={configMaxTurns}
                onChange={(e) => setConfigMaxTurns(Number(e.target.value))}
                className="w-32"
              />
              <p className="text-[11px] text-muted-foreground">
                Agent 单次运行的最大对话轮次
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfigAgent(null)}>
              取消
            </Button>
            <Button disabled={configSaving} onClick={handleSaveConfig}>
              {configSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
