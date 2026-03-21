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
import * as specService from '../../services/spec';
import type { ChangeInfo } from '../../types';

interface ChangeListProps {
  changes: ChangeInfo[];
  currentChangeName: string | null;
  projectPath: string;
  onSelect: (name: string) => void;
  onDeleted: (name: string) => void;
}

export default function ChangeList({
  changes,
  currentChangeName,
  projectPath,
  onSelect,
  onDeleted,
}: ChangeListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          活跃变更
        </p>
        <span className="text-[10px] text-muted-foreground">
          {changes.length}
        </span>
      </div>
      {changes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          暂无活跃变更
        </p>
      ) : (
        <div className="space-y-1">
          {changes.map((change) => (
            <div
              key={change.name}
              onClick={() => onSelect(change.name)}
              className={cn(
                'group/change flex items-center justify-between gap-1 w-full rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/30',
                currentChangeName === change.name
                  ? 'bg-accent border border-primary/20'
                  : 'hover:bg-accent/50'
              )}
            >
              <div className="min-w-0">
                <span
                  className={cn(
                    'text-xs truncate',
                    currentChangeName === change.name && 'font-semibold'
                  )}
                >
                  {change.name}
                </span>
                {(change.has_requirements || change.has_dev_plan || change.has_verification) && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {change.has_requirements && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">需求</Badge>
                    )}
                    {change.has_dev_plan && (
                      <Badge variant="default" className="text-[9px] h-4 px-1.5">规划</Badge>
                    )}
                    {change.has_verification && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-green-600 border-green-300">验证</Badge>
                    )}
                  </div>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger
                  onClick={(e) => e.stopPropagation()}
                  render={
                    <button className="p-1 rounded opacity-0 group-hover/change:opacity-100 group-focus-within/change:opacity-100 hover:bg-destructive/10 transition-all shrink-0 cursor-pointer" />
                  }
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      删除变更 "{change.name}"？
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      将永久删除该变更的所有文件（需求、规划、验证报告等），此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={async () => {
                        try {
                          await specService.deleteChange(
                            projectPath,
                            change.name
                          );
                          toast.success(`变更 "${change.name}" 已删除`);
                          onDeleted(change.name);
                        } catch (e) {
                          toast.error(`删除失败: ${e}`);
                        }
                      }}
                    >
                      删除
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
