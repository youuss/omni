import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface StepItem {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

interface StepsProps {
  items: StepItem[];
  current: number;
  className?: string;
}

export function Steps({ items, current, className }: StepsProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {items.map((item, index) => {
        const status =
          index < current ? 'done' : index === current ? 'active' : 'pending';
        return (
          <div key={index} className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shrink-0 transition-all duration-300',
                  status === 'done' &&
                    'bg-primary text-primary-foreground shadow-[0_2px_8px_oklch(0.35_0.02_230/0.25)]',
                  status === 'active' &&
                    'bg-primary text-primary-foreground ring-[3px] ring-primary/15 shadow-[0_2px_12px_oklch(0.35_0.02_230/0.3)]',
                  status === 'pending' &&
                    'bg-white/50 backdrop-blur-sm border border-border/40 text-muted-foreground'
                )}
              >
                {status === 'done' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  item.icon ?? <span>{index + 1}</span>
                )}
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    'text-xs font-medium truncate transition-colors',
                    status === 'done' && 'text-foreground',
                    status === 'active' && 'text-foreground',
                    status === 'pending' && 'text-muted-foreground/70'
                  )}
                >
                  {item.title}
                </div>
                {item.description && (
                  <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                    {item.description}
                  </div>
                )}
              </div>
            </div>
            {index < items.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-px min-w-6 transition-colors duration-300',
                  index < current ? 'bg-primary/60' : 'bg-border/50'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
