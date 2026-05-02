import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Shield,
  Trash2, X, Check, Loader2, AlertTriangle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHarnessStore } from '../../stores/harnessStore';
import type { AgentDefinition, NodeStatus } from '../../types/harness';

const STATUS_CONFIG: Record<NodeStatus, { icon: React.ElementType; label: string; cls: string }> = {
  pending: { icon: Clock, label: 'Pending', cls: 'text-muted-foreground/50 bg-muted/30' },
  ready: { icon: Clock, label: 'Ready', cls: 'text-muted-foreground bg-muted/40' },
  waiting: { icon: Clock, label: 'Waiting', cls: 'text-muted-foreground bg-muted/40' },
  running: { icon: Loader2, label: 'Running', cls: 'text-blue-600 bg-blue-50/60' },
  checking: { icon: Loader2, label: 'Checking', cls: 'text-amber-600 bg-amber-50/60' },
  completed: { icon: Check, label: 'Completed', cls: 'text-emerald-600 bg-emerald-50/60' },
  failed: { icon: AlertTriangle, label: 'Failed', cls: 'text-destructive bg-red-50/60' },
  skipped: { icon: X, label: 'Skipped', cls: 'text-muted-foreground/40 bg-muted/20' },
};

interface NodeDetailPanelProps {
  nodeId: string;
  agent: AgentDefinition | undefined;
  isRunning: boolean;
}

export default function NodeDetailPanel({
  nodeId,
  agent,
  isRunning,
}: NodeDetailPanelProps) {
  const { currentHarness, nodeStates, removeNode } = useHarnessStore();
  const node = currentHarness?.nodes.find((n) => n.id === nodeId);
  const state = nodeStates[nodeId];
  const status = state?.status ?? 'pending';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  if (!node || !agent) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-xs text-muted-foreground/50">Node not found</p>
      </div>
    );
  }

  const Icon = agent.builtin ? Shield : Bot;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {/* Agent Header */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
              agent.builtin ? 'bg-primary/8 text-primary' : 'bg-blue-500/10 text-blue-600'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight">{agent.name}</p>
            {agent.builtin && (
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  built-in
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{agent.description}</p>
        )}

        {/* Status */}
        <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', statusCfg.cls)}>
          <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', status === 'running' && 'animate-spin')} />
          <span className="text-[11px] font-medium">{statusCfg.label}</span>
          {state?.error && (
            <span className="text-[10px] opacity-80 truncate ml-auto">{state.error}</span>
          )}
        </div>

        {/* Remove */}
        <div className="pt-1">
          <button
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer disabled:opacity-30"
            onClick={() => removeNode(nodeId)}
            disabled={isRunning}
          >
            <Trash2 className="w-3 h-3" />
            Remove node
          </button>
        </div>
      </div>
    </ScrollArea>
  );
}
