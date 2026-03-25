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
import type { ProjectInfo } from '../../types';
import type { RunInfo } from '../../types/run';

interface WorkspaceHeaderProps {
  project: ProjectInfo;
  runId: string | null;
  claudeAvailable: boolean | null;
  runs: RunInfo[];
  isRunning: boolean;
  harnessReady: boolean;
  onSelectRun: (id: string) => void;
  onCreateRun: () => void;
  onRunHarness: () => void;
  onAbort: () => void;
  onArchive: () => void;
}

export default function WorkspaceHeader({
  project,
  runId,
  claudeAvailable,
  runs,
  isRunning,
  harnessReady,
  onSelectRun,
  onCreateRun,
  onRunHarness,
  onAbort,
  onArchive,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 h-12 border-b border-border/40 glass shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary shrink-0">
          <FolderOpen className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold truncate max-w-[120px]">{project.name}</span>

        {runId && (
          <>
            <span className="text-muted-foreground/30 text-xs">/</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors max-w-[160px] cursor-pointer">
                <span className="truncate">{runId}</span>
                <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {runs.map((r) => (
                  <DropdownMenuItem key={r.id} onClick={() => onSelectRun(r.id)} className="text-xs">
                    <span className="truncate">{r.id}</span>
                    {r.outputFiles.length > 0 && (
                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-auto">
                        {r.outputFiles.length} outputs
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
                {runs.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onCreateRun} className="text-xs gap-1.5">
                  <Plus className="w-3 h-3" />
                  New Run
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {isRunning && (
          <Badge variant="secondary" className="text-[9px] h-5 shrink-0 gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Running
          </Badge>
        )}

        {claudeAvailable === false && (
          <Badge variant="destructive" className="text-[9px] h-5 shrink-0">
            Claude CLI not detected
          </Badge>
        )}
      </div>

      <div className="flex-1" />

      {runId && (
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <Button
              variant="destructive"
              size="xs"
              className="gap-1 h-7 text-[11px]"
              onClick={onAbort}
            >
              <Square className="w-3 h-3" />
              Abort
            </Button>
          ) : (
            <Button
              size="xs"
              className="gap-1 h-7 text-[11px]"
              disabled={!harnessReady}
              onClick={onRunHarness}
            >
              <Play className="w-3 h-3" />
              Execute
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" size="xs" className="gap-1 h-7 text-[11px]" />
              }
            >
              <Archive className="w-3 h-3" />
              Archive
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm archive?</AlertDialogTitle>
                <AlertDialogDescription>This will move the run from active to archive.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {!runId && (
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={onCreateRun}>
          <Plus className="w-3 h-3" />
          New Run
        </Button>
      )}
    </div>
  );
}
