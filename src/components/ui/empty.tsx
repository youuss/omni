import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

interface EmptyProps {
  description?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Empty({
  description = '暂无数据',
  icon,
  className,
  children,
}: EmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-8 text-muted-foreground',
        className
      )}
    >
      {icon ?? <Inbox className="w-10 h-10 mb-2 opacity-40" />}
      <p className="text-sm">{description}</p>
      {children}
    </div>
  );
}
