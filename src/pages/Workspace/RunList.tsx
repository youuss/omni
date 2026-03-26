import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import * as runService from '../../services/run-service';
import type { RunInfo } from '../../types/run';

interface RunListProps {
  runs: RunInfo[];
  currentRunId: string | null;
  projectPath: string;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}

export default function RunList({
  runs,
  currentRunId,
  projectPath,
  onSelect,
  onDeleted,
}: RunListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Active Runs
        </p>
        <span className="text-[10px] text-muted-foreground">
          {runs.length}
        </span>
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No active runs
        </p>
      ) : (
        <div className="space-y-1">
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => onSelect(run.id)}
              className={cn(
                'group/run flex items-center justify-between gap-1 w-full rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/30',
                currentRunId === run.id
                  ? 'bg-accent border border-primary/20'
                  : 'hover:bg-accent/50'
              )}
            >
              <div className="min-w-0">
                <span
                  className={cn(
                    'text-xs truncate',
                    currentRunId === run.id && 'font-semibold'
                  )}
                >
                  {run.id}
                </span>
                {(run.logFiles.length > 0 || run.outputFiles.length > 0) && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {run.logFiles.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                        {run.logFiles.length} logs
                      </Badge>
                    )}
                    {run.outputFiles.length > 0 && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-green-600 border-green-300">
                        {run.outputFiles.length} outputs
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger
                  onClick={(e) => e.stopPropagation()}
                  render={
                    <button className="p-1 rounded opacity-0 group-hover/run:opacity-100 group-focus-within/run:opacity-100 hover:bg-destructive/10 transition-all shrink-0 cursor-pointer" />
                  }
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete run "{run.id}"?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all files (inputs, outputs, metadata). This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={async () => {
                        try {
                          await runService.deleteRun(projectPath, run.id);
                          toast.success(`Run "${run.id}" deleted`);
                          onDeleted(run.id);
                        } catch (e) {
                          toast.error(`Delete failed: ${e}`);
                        }
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
