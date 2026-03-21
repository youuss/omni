import { useEffect, useRef } from 'react';
import { useOutputStore } from '../../stores/outputStore';
import { Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

const typeColors: Record<string, string> = {
  text: 'text-foreground/80',
  tool: 'text-indigo-600',
  error: 'text-destructive',
  system: 'text-muted-foreground',
};

export default function OutputStream() {
  const { lines, clear } = useOutputStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="flex flex-col h-full glass-subtle">
      <div className="px-4 py-1.5 border-b border-border/20 flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          输出日志
        </span>
        <button
          onClick={clear}
          className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/50 transition-colors cursor-pointer"
        >
          <Eraser className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-2 font-mono text-[11px] leading-[18px]">
        {lines.length === 0 ? (
          <span className="text-muted-foreground/40">等待输出...</span>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="mb-px flex gap-2">
              <span className="text-[9px] text-muted-foreground/40 shrink-0 tabular-nums leading-[18px]">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={cn(
                  'break-all whitespace-pre-wrap',
                  typeColors[line.type] ?? 'text-foreground/70'
                )}
              >
                {line.content}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
