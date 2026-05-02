import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { readNodeLog } from '@/services/engine/logger';
import type { LogEvent } from '@/types/engine';

interface LogViewerProps {
  projectPath: string;
  runId: string;
  nodeId: string;
  maxAttempt: number;
}

export function LogViewer({ projectPath, runId, nodeId, maxAttempt }: LogViewerProps) {
  const [attempt, setAttempt] = useState(maxAttempt);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    readNodeLog(projectPath, runId, nodeId, attempt)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [projectPath, runId, nodeId, attempt]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [events]);

  const formatEvent = (event: LogEvent): { color: string; text: string } => {
    switch (event.type) {
      case 'node_start':
        return { color: 'text-blue-400', text: `▶ Node started (attempt ${event.attempt})` };
      case 'node_end':
        return {
          color: event.exitCode === 0 ? 'text-emerald-400' : 'text-red-400',
          text: `■ Node ended (exit: ${event.exitCode}, ${event.durationMs}ms)`,
        };
      case 'stream_message':
        return { color: 'text-foreground/80', text: JSON.stringify(event.data).slice(0, 200) };
      case 'constraint_check':
        return {
          color: event.passed ? 'text-emerald-400' : 'text-amber-400',
          text: `⚡ Constraint "${event.name}": ${event.passed ? 'PASS' : 'FAIL'}${event.stderr ? ' — ' + event.stderr.slice(0, 100) : ''}`,
        };
      case 'constraint_retry':
        return { color: 'text-amber-400', text: `↻ Retry #${event.attempt}: ${event.reason}` };
      case 'condition_eval':
        return { color: 'text-indigo-400', text: `? ${event.expression} → "${event.result}" → branch: ${event.branch}` };
      case 'gate_wait':
        return { color: 'text-amber-400', text: `⏸ Waiting for approval${event.message ? ': ' + event.message : ''}` };
      case 'gate_resume':
        return { color: 'text-emerald-400', text: '▶ Gate approved, continuing' };
      case 'error':
        return { color: 'text-red-500', text: `✗ ${event.message}` };
      default:
        return { color: 'text-muted', text: JSON.stringify(event) };
    }
  };

  const formatTs = (ts: number): string => {
    return new Date(ts).toISOString().split('T')[1]?.slice(0, 8) ?? '';
  };

  return (
    <div className="flex flex-col h-full">
      {maxAttempt > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
          <Terminal className="w-3 h-3 text-muted" />
          <span className="text-[10px] text-muted">Attempt:</span>
          {Array.from({ length: maxAttempt + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => setAttempt(i)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                attempt === i ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
              }`}
            >
              #{i}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
        {events.map((event, i) => {
          const { color, text } = formatEvent(event);
          return (
            <div key={i} className={`${color} leading-relaxed`}>
              <span className="text-muted/50 mr-2">{formatTs(event.ts)}</span>
              {text}
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-muted text-center py-4">No log entries</div>
        )}
      </div>
    </div>
  );
}
