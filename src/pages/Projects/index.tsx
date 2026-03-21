import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { useProjectStore } from '../../stores/projectStore';
import {
  FolderOpen,
  Trash2,
  Plus,
  GitBranch,
  FileText,
  Search,
  FolderPlus,
  CheckCircle2,
  Wrench,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PRESETS = [
  {
    id: 'standard',
    name: '标准开发',
    desc: '适用于常规项目的标准 SDD 工作流配置。',
    icon: Wrench,
  },
] as const;

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, loading, loadProjects, openProject, removeProject } =
    useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('quickstart');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const folderName = selectedFolder?.split('/').pop() ?? '';

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) setSelectedFolder(selected);
  };

  const handleOpenCreateDialog = () => {
    setSelectedFolder(null);
    setSelectedPreset('quickstart');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedFolder) return;
    setCreating(true);
    try {
      await openProject(selectedFolder);
      toast.success('工作区已创建');
      setCreateOpen(false);
      navigate(`/workspace/${encodeURIComponent(selectedFolder)}`);
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectProject = async (path: string) => {
    try {
      await openProject(path);
      navigate(`/workspace/${encodeURIComponent(path)}`);
    } catch (e) {
      toast.error(`打开失败: ${e}`);
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-[960px] mx-auto overflow-auto h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">项目管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理本地代码项目，选择项目进入工作区。
        </p>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
              工作区概览
            </p>
            <p className="text-lg font-semibold">Omni</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              基于 Claude 的 Spec-Driven Development 工作流平台
            </p>
          </div>
          <Button
            onClick={handleOpenCreateDialog}
            className="gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            创建工作区
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { label: '已打开', value: projects.length },
            { label: 'Git 项目', value: projects.filter((p) => p.is_git).length },
            { label: '有规格', value: projects.filter((p) => p.has_specs).length },
            { label: '活跃变更', value: projects.reduce((sum, p) => sum + p.active_changes.length, 0) },
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

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            placeholder="搜索项目..."
            className="pl-9 h-8 text-xs bg-white/40 backdrop-blur-sm border-border/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 bg-white/40 backdrop-blur-sm border-border/40 cursor-pointer"
          onClick={handleOpenCreateDialog}
        >
          <Plus className="w-3.5 h-3.5" />
          创建工作区
        </Button>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">
        已打开项目
      </p>

      {filteredProjects.length === 0 && !loading ? (
        <Empty description="暂无项目，点击「创建工作区」选择本地代码仓库">
          <Button className="mt-4 cursor-pointer" onClick={handleOpenCreateDialog}>
            创建工作区
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredProjects.map((project) => (
            <button
              key={project.path}
              className="group glass-card rounded-2xl p-4 cursor-pointer transition-all duration-300 text-left w-full focus-visible:ring-2 focus-visible:ring-ring/30"
              onClick={() => handleSelectProject(project.path)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{project.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate font-mono">
                    {project.path}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {project.is_git && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <GitBranch className="w-3 h-3" /> Git
                      </span>
                    )}
                    {project.has_specs && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <FileText className="w-3 h-3" /> .specs
                      </span>
                    )}
                    {project.active_changes.length > 0 && (
                      <span className="text-[11px] text-muted-foreground/60">
                        {project.active_changes.length} 活跃变更
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                  <AlertDialog>
                    <AlertDialogTrigger
                      onClick={(e) => e.stopPropagation()}
                      render={
                        <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer" />
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认移除？</AlertDialogTitle>
                        <AlertDialogDescription>
                          仅从列表移除，不会删除本地文件
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeProject(project.path)}>
                          确认
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg">创建工作区</DialogTitle>
            <DialogDescription>初始化新的基于文件夹的工作区。</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">1</div>
                <span className="text-sm font-medium">选择文件夹</span>
              </div>
              <button
                onClick={handlePickFolder}
                className={cn(
                  'w-full rounded-xl border-2 border-dashed px-5 py-4 cursor-pointer transition-all duration-200 text-left',
                  selectedFolder
                    ? 'border-primary/30 bg-primary/[0.03]'
                    : 'border-foreground/10 hover:border-primary/25 hover:bg-white/30'
                )}
              >
                {selectedFolder ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderPlus className="w-5 h-5 text-primary/60 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{folderName}</p>
                        <p className="text-[11px] text-muted-foreground/60 font-mono truncate mt-0.5">{selectedFolder}</p>
                      </div>
                    </div>
                    <span className="text-xs text-primary/70 shrink-0 ml-3">更改</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground/60">
                    <FolderPlus className="w-5 h-5 shrink-0" />
                    <span className="text-sm">点击选择项目文件夹</span>
                  </div>
                )}
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">2</div>
                <span className="text-sm font-medium">选择预设</span>
              </div>
              <div className="space-y-2">
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 cursor-pointer transition-all duration-200 flex items-center gap-3 text-left',
                        isSelected
                          ? 'border-primary/30 bg-primary/[0.04] shadow-[0_0_0_1px_oklch(0.35_0.02_230/0.1)]'
                          : 'border-foreground/10 hover:border-primary/20 hover:bg-white/30'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground/50')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', isSelected && 'text-primary')}>{preset.name}</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{preset.desc}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4.5 h-4.5 text-primary/60 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="cursor-pointer">取消</Button>
            <Button onClick={handleCreate} disabled={!selectedFolder || creating} className="gap-1.5 cursor-pointer">
              {creating ? '创建中...' : '创建工作区'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
