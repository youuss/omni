import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  Bot,
  Shield,
  FileText,
  Code2,
  ClipboardCheck,
  Search,
  Check,
  Loader2,
  AlertTriangle,
  SkipForward,
  Clock,
  Settings2,
} from 'lucide-react';
import type { AgentDefinition, NodeStatus } from '../../types/harness';

export interface AgentNodeData {
  agent: AgentDefinition;
  status: NodeStatus;
  error?: string;
  hasOverrides?: boolean;
  [key: string]: unknown;
}

type AgentNodeProps = NodeProps & { data: AgentNodeData };

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  planner: FileText,
  implementer: Code2,
  verifier: ClipboardCheck,
  reviewer: Search,
  custom: Bot,
};

const STATUS_CONFIG: Record<
  NodeStatus,
  { icon: React.ElementType; label: string; color: string; bg: string; border: string }
> = {
  pending: { icon: Clock, label: 'Pending', color: 'text-muted-foreground/50', bg: '', border: 'border-border/40' },
  ready: { icon: Clock, label: 'Ready', color: 'text-muted-foreground', bg: 'bg-white/10', border: 'border-border/50' },
  waiting: { icon: Clock, label: 'Waiting', color: 'text-muted-foreground', bg: 'bg-white/10', border: 'border-border/50' },
  running: { icon: Loader2, label: 'Running', color: 'text-blue-600', bg: 'bg-blue-50/40', border: 'border-blue-300/50' },
  checking: { icon: Loader2, label: 'Checking', color: 'text-amber-600', bg: 'bg-amber-50/40', border: 'border-amber-300/50' },
  completed: { icon: Check, label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-50/40', border: 'border-emerald-300/50' },
  failed: { icon: AlertTriangle, label: 'Failed', color: 'text-destructive', bg: 'bg-red-50/40', border: 'border-red-300/50' },
  skipped: { icon: SkipForward, label: 'Skipped', color: 'text-muted-foreground/40', bg: 'bg-white/5', border: 'border-border/30' },
};

function AgentNode({ data, selected }: AgentNodeProps) {
  const { agent, status = 'pending', error, hasOverrides } = data;
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const CategoryIcon = CATEGORY_ICONS[agent.builtin ? 'custom' : 'custom'] ?? Bot;

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-white shadow-[0_2px_10px_oklch(0.22_0_0/0.12)] transition-all duration-200 min-w-[180px] max-w-[220px]',
        statusConfig.border,
        statusConfig.bg,
        selected && 'ring-2 ring-primary/30 border-primary/40',
        status === 'running' && 'shadow-[0_0_20px_oklch(0.6_0.15_250/0.15)]'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-white !bg-foreground/40"
        style={{ top: '50%', left: -5 }}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-white !bg-foreground/40"
        style={{ top: '50%', right: -5 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <div
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-lg shrink-0',
            agent.builtin ? 'bg-primary/8 text-primary' : 'bg-blue-500/10 text-blue-600'
          )}
        >
          {agent.builtin ? (
            <Shield className="w-3 h-3" />
          ) : (
            <CategoryIcon className="w-3 h-3" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
            <span className="truncate">{agent.name}</span>
            {hasOverrides && <Settings2 className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
          </div>
          {agent.description && (
            <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
              {agent.description}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 border-t border-border/20 rounded-b-2xl',
          status === 'running' && 'bg-blue-50/30'
        )}
      >
        <StatusIcon
          className={cn(
            'w-3 h-3 shrink-0',
            statusConfig.color,
            status === 'running' && 'animate-spin'
          )}
        />
        <span className={cn('text-[10px]', statusConfig.color)}>
          {error ? error : statusConfig.label}
        </span>
      </div>
    </div>
  );
}

export default memo(AgentNode);
