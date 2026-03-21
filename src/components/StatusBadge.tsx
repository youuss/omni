import { Badge } from '@/components/ui/badge';
import type { WorkflowStage } from '../types';

const stageConfig: Record<
  WorkflowStage,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    dot?: string;
  }
> = {
  idle: { label: '就绪', variant: 'secondary', dot: 'bg-muted-foreground' },
  planning: {
    label: '规划中',
    variant: 'default',
    dot: 'bg-blue-400 animate-pulse shadow-[0_0_6px_rgba(96,165,250,0.5)]',
  },
  readiness: {
    label: '检查中',
    variant: 'outline',
    dot: 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  },
  implementing: {
    label: '实现中',
    variant: 'default',
    dot: 'bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(129,140,248,0.5)]',
  },
  verifying: {
    label: '验证中',
    variant: 'outline',
    dot: 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  },
  archiving: {
    label: '归档中',
    variant: 'secondary',
    dot: 'bg-muted-foreground',
  },
  done: {
    label: '已完成',
    variant: 'secondary',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
  },
};

interface Props {
  stage: WorkflowStage;
}

export default function StatusBadge({ stage }: Props) {
  const { label, variant, dot } = stageConfig[stage];
  return (
    <Badge
      variant={variant}
      className="gap-1.5 text-[10px] h-5 px-2 backdrop-blur-sm"
    >
      {dot && <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </Badge>
  );
}
