import { cn } from '@/lib/utils';
import { usePipelineStore } from '../../stores/pipelineStore';
import { Check, Loader2, AlertTriangle, SkipForward, Workflow } from 'lucide-react';
import type { NodeExecutionStatus } from '../../types/pipeline';

interface PipelineBoardProps {
  onOpenPipeline?: () => void;
}

export default function PipelineBoard({ onOpenPipeline }: PipelineBoardProps) {
  const { currentPipeline, nodeStates, agents } = usePipelineStore();

  if (!currentPipeline || currentPipeline.nodes.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground/50">
        <span>暂无流程步骤</span>
        {onOpenPipeline && (
          <button onClick={onOpenPipeline} className="text-primary hover:text-primary/80 transition-colors cursor-pointer">
            配置编排
          </button>
        )}
      </div>
    );
  }

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="flex items-center gap-1">
      {currentPipeline.nodes.map((node, index) => {
        const state = nodeStates[node.id];
        const agent = agentMap.get(node.agentId);
        const name = agent?.name ?? node.agentId;
        const status: NodeExecutionStatus = state?.status ?? 'idle';

        return (
          <div key={node.id} className="flex items-center gap-1 flex-1 min-w-0">
            <div
              className={cn(
                'flex items-center gap-2 flex-1 min-w-0 rounded-lg px-3 py-1.5 transition-all duration-200',
                status === 'success' && 'bg-emerald-500/6',
                status === 'running' && 'bg-blue-500/8 ring-1 ring-blue-300/20',
                status === 'failure' && 'bg-destructive/6',
                status === 'skipped' && 'opacity-40',
                (status === 'idle' || status === 'waiting') && 'opacity-60',
              )}
            >
              <StepIcon status={status} index={index} />
              <div className="min-w-0">
                <div className={cn(
                  'text-[11px] font-medium truncate',
                  status === 'success' && 'text-emerald-700',
                  status === 'running' && 'text-blue-700',
                  status === 'failure' && 'text-destructive',
                  (status === 'idle' || status === 'waiting' || status === 'skipped') && 'text-muted-foreground/70',
                )}>
                  {name}
                </div>
                {state?.error && (
                  <div className="text-[9px] text-destructive/60 truncate">{state.error}</div>
                )}
              </div>
            </div>

            {index < currentPipeline.nodes.length - 1 && (
              <div className={cn(
                'w-4 h-px shrink-0 transition-colors duration-300',
                status === 'success' ? 'bg-emerald-400/40' : 'bg-border/40',
              )} />
            )}
          </div>
        );
      })}

      {onOpenPipeline && (
        <button
          onClick={onOpenPipeline}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/6 text-primary/70 border border-primary/12 hover:bg-primary/12 hover:text-primary hover:border-primary/25 transition-all cursor-pointer shrink-0 ml-2"
        >
          <Workflow className="w-3 h-3" />
          <span className="text-[10px] font-medium">编排</span>
        </button>
      )}
    </div>
  );
}

function StepIcon({ status, index }: { status: NodeExecutionStatus; index: number }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold shrink-0 transition-all duration-300',
        status === 'success' && 'bg-emerald-500 text-white',
        status === 'running' && 'bg-blue-500 text-white',
        status === 'failure' && 'bg-destructive text-white',
        (status === 'idle' || status === 'waiting' || status === 'skipped') && 'bg-border/60 text-muted-foreground',
      )}
    >
      {status === 'success' ? <Check className="w-3 h-3" /> :
       status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> :
       status === 'failure' ? <AlertTriangle className="w-2.5 h-2.5" /> :
       status === 'skipped' ? <SkipForward className="w-2.5 h-2.5" /> :
       <span>{index + 1}</span>}
    </div>
  );
}
