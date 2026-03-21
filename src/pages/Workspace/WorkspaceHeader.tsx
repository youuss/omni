import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  FolderOpen,
  Plus,
  ChevronDown,
  Square,
  Play,
  Archive,
} from 'lucide-react';
import type { ProjectInfo, ChangeInfo } from '../../types';

interface WorkspaceHeaderProps {
  project: ProjectInfo;
  changeName: string | null;
  claudeAvailable: boolean | null;
  changes: ChangeInfo[];
  isRunning: boolean;
  pipelineReady: boolean;
  onSelectChange: (name: string) => void;
  onCreateChange: () => void;
  onRunPipeline: () => void;
  onAbort: () => void;
  onArchive: () => void;
}

export default function WorkspaceHeader({
  project,
  changeName,
  claudeAvailable,
  changes,
  isRunning,
  pipelineReady,
  onSelectChange,
  onCreateChange,
  onRunPipeline,
  onAbort,
  onArchive,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 h-12 border-b border-border/40 glass shrink-0">
      {/* Project + Change Selector */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary shrink-0">
          <FolderOpen className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold truncate max-w-[120px]">{project.name}</span>

        {changeName && (
          <>
            <span className="text-muted-foreground/30 text-xs">/</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors max-w-[160px] cursor-pointer">
                <span className="truncate">{changeName}</span>
                <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {changes.map((c) => (
                  <DropdownMenuItem key={c.name} onClick={() => onSelectChange(c.name)} className="text-xs">
                    <span className="truncate">{c.name}</span>
                    {c.has_dev_plan && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-auto">规划</Badge>}
                  </DropdownMenuItem>
                ))}
                {changes.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onCreateChange} className="text-xs gap-1.5">
                  <Plus className="w-3 h-3" />
                  新建变更
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {isRunning && (
          <Badge variant="secondary" className="text-[9px] h-5 shrink-0 gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            运行中
          </Badge>
        )}

        {claudeAvailable === false && (
          <Badge variant="destructive" className="text-[9px] h-5 shrink-0">
            Claude CLI 未检测到
          </Badge>
        )}
      </div>

      <div className="flex-1" />

      {/* Action Buttons */}
      {changeName && (
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <Button
              variant="destructive"
              size="xs"
              className="gap-1 h-7 text-[11px]"
              onClick={onAbort}
            >
              <Square className="w-3 h-3" />
              中止
            </Button>
          ) : (
            <Button
              size="xs"
              className="gap-1 h-7 text-[11px]"
              disabled={!pipelineReady}
              onClick={onRunPipeline}
            >
              <Play className="w-3 h-3" />
              运行
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" size="xs" className="gap-1 h-7 text-[11px]" />
              }
            >
              <Archive className="w-3 h-3" />
              归档
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认归档？</AlertDialogTitle>
                <AlertDialogDescription>将把此变更从 active 移动到 archive</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive}>确认</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* New Change (when no change selected) */}
      {!changeName && (
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={onCreateChange}>
          <Plus className="w-3 h-3" />
          新建变更
        </Button>
      )}
    </div>
  );
}
