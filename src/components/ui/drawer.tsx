import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
  className?: string;
}

function Drawer({ open, onClose, title, width = 360, children, className }: DrawerProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        'shrink-0 border-l border-border/40 glass-strong flex flex-col overflow-hidden transition-[width,opacity] duration-250 ease-in-out',
        open ? 'opacity-100' : 'w-0 opacity-0 border-l-0 pointer-events-none',
        className
      )}
      style={{ width: open ? width : 0 }}
    >
      {title && (
        <div className="flex items-center justify-between h-11 px-4 shrink-0 border-b border-border/30">
          <span className="text-xs font-semibold text-foreground/90 truncate">{title}</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export { Drawer };
export type { DrawerProps };
