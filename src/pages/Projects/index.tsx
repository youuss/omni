import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useProjectStore } from '../../stores/projectStore';
import {
  FolderOpen, Trash2, Plus, GitBranch, Search, FolderPlus, CheckCircle2, Wrench,
  ArrowRight, Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PRESETS = [
  {
    id: 'standard',
    name: 'Standard Development',
    desc: 'Standard harness-driven development workflow.',
    icon: Wrench,
  },
] as const;

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, loading, loadProjects, openProject, removeProject } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('standard');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const folderName = selectedFolder?.split('/').pop() ?? '';

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) setSelectedFolder(selected);
  };

  const handleOpenCreateDialog = () => {
    setSelectedFolder(null);
    setSelectedPreset('standard');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedFolder) return;
    setCreating(true);
    try {
      await openProject(selectedFolder);
      toast.success('Workspace created');
      setCreateOpen(false);
      navigate(`/workspace/${encodeURIComponent(selectedFolder)}`);
    } catch (e) { toast.error(`Create failed: ${e}`); }
    finally { setCreating(false); }
  };

  const handleSelectProject = async (path: string) => {
    try {
      await openProject(path);
      navigate(`/workspace/${encodeURIComponent(path)}`);
    } catch (e) { toast.error(`Open failed: ${e}`); }
  };

  const filteredProjects = projects.filter(
    (p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[720px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleOpenCreateDialog}
            className="gap-1.5 h-8 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Workspace
          </Button>
        </div>

        {/* Search */}
        {projects.length > 3 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <Input
              placeholder="Search projects..."
              className="pl-9 h-8 text-xs bg-white/50 backdrop-blur-sm border-border/30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Project List */}
        {filteredProjects.length === 0 && !loading ? (
          <div className="glass-card rounded-2xl flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/60 border border-border/30 flex items-center justify-center mb-4">
              <FolderOpen className="w-5 h-5 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground/70 mb-1">No projects yet</p>
            <p className="text-xs text-muted-foreground/50 mb-5 max-w-[260px]">
              Select a local repository to create your first workspace.
            </p>
            <Button onClick={handleOpenCreateDialog} className="gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> New Workspace
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProjects.map((project) => (
              <div
                key={project.path}
                role="button"
                tabIndex={0}
                className="group glass-card rounded-xl px-4 py-3 cursor-pointer transition-all duration-200 text-left w-full focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={() => handleSelectProject(project.path)}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectProject(project.path)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/6 text-primary/70">
                    <FolderOpen className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold">{project.name}</span>
                    <div className="flex items-center gap-2.5 mt-0.5">
                      <p className="text-[10px] text-muted-foreground/50 truncate font-mono">{project.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Metadata badges */}
                    <div className="flex items-center gap-1.5 mr-1">
                      {project.is_git && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                          <GitBranch className="w-3 h-3" />
                        </span>
                      )}
                      {project.has_harness && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                          <Zap className="w-3 h-3" />
                        </span>
                      )}
                      {project.active_runs.length > 0 && (
                        <span className="flex items-center justify-center min-w-[16px] h-4 rounded-full bg-primary/10 text-primary text-[9px] font-medium px-1">
                          {project.active_runs.length}
                        </span>
                      )}
                    </div>
                    {/* Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger
                        onClick={(e) => e.stopPropagation()}
                        render={
                          <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/25 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/8 transition-all cursor-pointer" />
                        }
                      >
                        <Trash2 className="w-3 h-3" />
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This only removes it from the list. Local files are not deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeProject(project.path)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {/* Arrow */}
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-foreground/40 transition-colors shrink-0" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg">New Workspace</DialogTitle>
            <DialogDescription>Initialize a new folder-based workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">1</div>
                <span className="text-sm font-medium">Select Folder</span>
              </div>
              <button onClick={handlePickFolder} className={cn(
                'w-full rounded-xl border-2 border-dashed px-5 py-4 cursor-pointer transition-all duration-200 text-left',
                selectedFolder ? 'border-primary/30 bg-primary/[0.03]' : 'border-foreground/10 hover:border-primary/25 hover:bg-white/30'
              )}>
                {selectedFolder ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderPlus className="w-5 h-5 text-primary/60 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{folderName}</p>
                        <p className="text-[11px] text-muted-foreground/60 font-mono truncate mt-0.5">{selectedFolder}</p>
                      </div>
                    </div>
                    <span className="text-xs text-primary/70 shrink-0 ml-3">Change</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground/60">
                    <FolderPlus className="w-5 h-5 shrink-0" />
                    <span className="text-sm">Click to select project folder</span>
                  </div>
                )}
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">2</div>
                <span className="text-sm font-medium">Select Preset</span>
              </div>
              <div className="space-y-2">
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button key={preset.id} onClick={() => setSelectedPreset(preset.id)} className={cn(
                      'w-full rounded-xl border px-4 py-3 cursor-pointer transition-all duration-200 flex items-center gap-3 text-left',
                      isSelected ? 'border-primary/30 bg-primary/[0.04] shadow-[0_0_0_1px_oklch(0.35_0.02_230/0.1)]' : 'border-foreground/10 hover:border-primary/20 hover:bg-white/30'
                    )}>
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
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleCreate} disabled={!selectedFolder || creating} className="gap-1.5 cursor-pointer">{creating ? 'Creating...' : 'Create Workspace'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
