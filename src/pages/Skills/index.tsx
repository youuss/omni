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
  scanSkills,
  loadSkillsConfig,
  toggleSkill,
  createSkill,
  readSkillContent,
  saveSkillContent,
  deleteSkill,
  type SkillInfo,
} from '../../services/skill-service';
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
  Sparkles,
  Search,
  Pencil,
  Trash2,
} from 'lucide-react';

export default function SkillsPage() {
  const { currentProject } = useProjectStore();

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  const [newSkillOpen, setNewSkillOpen] = useState(false);
  const [newSkillId, setNewSkillId] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillBody, setNewSkillBody] = useState('');
  const [newSkillSaving, setNewSkillSaving] = useState(false);

  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadSkills = async (projectPath: string) => {
    setSkillsLoading(true);
    try {
      const [list, config] = await Promise.all([
        scanSkills(projectPath),
        loadSkillsConfig(projectPath),
      ]);
      setSkills(list);
      setEnabledSkills(new Set(config.enabled));
    } catch (e) {
      toast.error(`技能加载失败: ${e}`);
    } finally {
      setSkillsLoading(false);
    }
  };

  useEffect(() => {
    if (currentProject?.path) {
      loadSkills(currentProject.path);
    } else {
      setSkills([]);
      setEnabledSkills(new Set());
    }
  }, [currentProject?.path]);

  const handleToggleSkill = async (skillId: string, checked: boolean) => {
    if (!currentProject?.path) return;
    try {
      await toggleSkill(currentProject.path, skillId, checked);
      setEnabledSkills((prev) => {
        const next = new Set(prev);
        checked ? next.add(skillId) : next.delete(skillId);
        return next;
      });
    } catch (e) {
      toast.error(`更新失败: ${e}`);
    }
  };

  const handleOpenEdit = async (skill: SkillInfo) => {
    try {
      const content = await readSkillContent(skill.path);
      setEditContent(content);
    } catch {
      setEditContent('');
    }
    setEditingSkill(skill);
  };

  const handleSaveEdit = async () => {
    if (!editingSkill || !currentProject?.path) return;
    setEditSaving(true);
    try {
      await saveSkillContent(currentProject.path, editingSkill.id, editContent);
      toast.success('已保存');
      setEditingSkill(null);
      await loadSkills(currentProject.path);
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!currentProject?.path) return;
    try {
      await deleteSkill(currentProject.path, skillId);
      toast.success('已删除');
      await loadSkills(currentProject.path);
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  const handleCreateSkill = async () => {
    if (!currentProject?.path || !newSkillId.trim()) return;
    setNewSkillSaving(true);
    try {
      await createSkill(
        currentProject.path,
        newSkillId.trim(),
        newSkillName.trim() || newSkillId.trim(),
        newSkillDesc.trim(),
        newSkillBody.trim()
      );
      toast.success(`技能 "${newSkillId}" 已创建`);
      setNewSkillOpen(false);
      setNewSkillId('');
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillBody('');
      await loadSkills(currentProject.path);
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    } finally {
      setNewSkillSaving(false);
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      !skillSearch ||
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      s.id.toLowerCase().includes(skillSearch.toLowerCase())
  );

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
        <p className="text-muted-foreground mt-1">管理此工作区的 skills。</p>
      </div>

      {/* Profile Card */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
              技能管理
            </p>
            <p className="text-lg font-semibold">
              {currentProject?.name ?? 'Omni'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              技能是 Agent 的核心能力，启用的技能会在运行时注入到 system
              prompt。
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => setNewSkillOpen(true)}>
            <Sparkles className="w-4 h-4" />
            新建技能
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { label: '已安装', value: skills.length },
            { label: '已启用', value: enabledSkills.size },
            { label: '技能目录', value: '.claude/skills/', isText: true },
            { label: '模式', value: '本地', isText: true },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/40 backdrop-blur-sm border border-border/30 px-4 py-3"
            >
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                {stat.label}
              </p>
              <p
                className={`${
                  stat.isText ? 'text-sm font-medium' : 'text-xl font-semibold'
                } mt-0.5 truncate`}
              >
                {stat.value}
              </p>
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
          disabled={skillsLoading}
          onClick={() =>
            currentProject?.path && loadSkills(currentProject.path)
          }
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${skillsLoading ? 'animate-spin' : ''}`}
          />
          刷新
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索已安装的技能..."
            className="pl-9 h-8 text-xs bg-white/40 backdrop-blur-sm border-border/40"
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setNewSkillOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          新建技能
        </Button>
      </div>

      {/* Section Header */}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        已安装 SKILLS
      </p>

      {/* Skills Grid */}
      {!currentProject ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">请先打开一个项目</p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">暂无技能</p>
          <p className="text-xs text-muted-foreground/70">
            在 .claude/skills/ 下创建包含 SKILL.md 的目录，或点击「新建技能」
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="group glass-card rounded-2xl p-4 transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{skill.name}</span>
                    {enabledSkills.has(skill.id) && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        启用
                      </Badge>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">
                    {skill.path}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    role="switch"
                    aria-checked={enabledSkills.has(skill.id)}
                    onClick={() =>
                      handleToggleSkill(skill.id, !enabledSkills.has(skill.id))
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                      enabledSkills.has(skill.id) ? 'bg-primary' : 'bg-input'
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                        enabledSkills.has(skill.id)
                          ? 'translate-x-4'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-accent transition-colors"
                    onClick={() => handleOpenEdit(skill)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-foreground transition-colors" />
                  </button>
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
                          删除技能 "{skill.name}"？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          将删除{' '}
                          <code className="text-xs">
                            .claude/skills/{skill.id}/
                          </code>{' '}
                          目录，操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(skill.id)}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Skill Dialog */}
      <Dialog open={newSkillOpen} onOpenChange={setNewSkillOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>新建技能</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  技能 ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="如: my-skill"
                  value={newSkillId}
                  onChange={(e) => setNewSkillId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  目录名，用连字符，不含空格
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">显示名称</Label>
                <Input
                  placeholder="留空则同 ID"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input
                placeholder="一句话说明技能的用途"
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">技能内容（Markdown）</Label>
              <Textarea
                placeholder="描述 Claude 在此技能下应遵循的规则、流程或约定..."
                className="font-mono text-xs min-h-[180px]"
                value={newSkillBody}
                onChange={(e) => setNewSkillBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewSkillOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!newSkillId.trim() || newSkillSaving}
              onClick={handleCreateSkill}
            >
              {newSkillSaving ? '保存中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Skill Dialog */}
      <Dialog
        open={!!editingSkill}
        onOpenChange={(open) => !open && setEditingSkill(null)}
      >
        <DialogContent
          className="max-w-3xl max-h-[85vh] flex flex-col"
        >
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-sm">
                  {editingSkill?.name}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  .claude/skills/{editingSkill?.id}/SKILL.md
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
                  onClick={() => setEditingSkill(null)}
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
    </div>
  );
}
