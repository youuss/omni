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
import type { AgentMeta, NodeExecutionStatus, Port } from '../../types/pipeline';

export interface AgentNodeData {
  agent: AgentMeta;
  status: NodeExecutionStatus;
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
  NodeExecutionStatus,
  { icon: React.ElementType; label: string; color: string; bg: string; border: string }
> = {
  idle: { icon: Clock, label: '就绪', color: 'text-muted-foreground/50', bg: '', border: 'border-border/40' },
  waiting: { icon: Clock, label: '等待中', color: 'text-muted-foreground', bg: 'bg-white/10', border: 'border-border/50' },
  running: { icon: Loader2, label: '运行中', color: 'text-blue-600', bg: 'bg-blue-50/40', border: 'border-blue-300/50' },
  success: { icon: Check, label: '完成', color: 'text-emerald-600', bg: 'bg-emerald-50/40', border: 'border-emerald-300/50' },
  failure: { icon: AlertTriangle, label: '失败', color: 'text-destructive', bg: 'bg-red-50/40', border: 'border-red-300/50' },
  skipped: { icon: SkipForward, label: '跳过', color: 'text-muted-foreground/40', bg: 'bg-white/5', border: 'border-border/30' },
};

function PortHandles({ ports, type }: { ports: Port[]; type: 'input' | 'output' }) {
  const position = type === 'input' ? Position.Left : Position.Right;

  if (ports.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-3 py-1', type === 'output' && 'items-end')}>
      {ports.map((port, index) => {
        const offset = ports.length === 1 ? 50 : 30 + (index * 40) / Math.max(ports.length - 1, 1);
        return (
          <div
            key={port.id}
            className={cn(
              'flex items-center gap-1.5',
              type === 'input' ? 'flex-row' : 'flex-row-reverse'
            )}
          >
            <Handle
              type={type === 'input' ? 'target' : 'source'}
              position={position}
              id={port.id}
              className={cn(
                '!w-2.5 !h-2.5 !rounded-full !border-2 !border-white',
                port.type === 'file' ? '!bg-blue-400' : '!bg-amber-400'
              )}
              style={{
                top: `${offset}%`,
                [type === 'input' ? 'left' : 'right']: -5,
              }}
            />
            <span className="text-[10px] text-muted-foreground/60 leading-none select-none">
              {port.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AgentNode({ data, selected }: AgentNodeProps) {
  const { agent, status, error, hasOverrides } = data;
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;
  const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-white shadow-[0_1px_6px_oklch(0.22_0_0/0.08)] transition-all duration-200 min-w-[180px] max-w-[220px]',
        statusConfig.border,
        statusConfig.bg,
        selected && 'ring-2 ring-primary/30 border-primary/40',
        status === 'running' && 'shadow-[0_0_20px_oklch(0.6_0.15_250/0.15)]'
      )}
    >
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

      {/* Ports */}
      <div className="flex justify-between px-3 py-1.5 min-h-[28px]">
        <PortHandles ports={agent.inputPorts} type="input" />
        <PortHandles ports={agent.outputPorts} type="output" />
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
