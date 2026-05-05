"use client";

import { useMemo } from "react";
import { useRunStore, type StreamEvent } from "@/stores/run";

const eventColor: Record<string, string> = {
  text: "text-foreground",
  tool_use: "text-indigo-500",
  error: "text-destructive",
};

function formatEvent(event: StreamEvent): string {
  if (event.type === "tool_use") {
    return `[tool:${event.toolName || "unknown"}] ${event.content}`;
  }
  if (event.type === "error") {
    return `[error] ${event.content}`;
  }
  return event.content;
}

export function OutputPanel() {
  const { streamEvents } = useRunStore();

  const allEvents = useMemo(() => {
    const entries: { nodeId: string; event: StreamEvent }[] = [];
    for (const [nodeId, events] of Object.entries(streamEvents)) {
      for (const event of events) {
        entries.push({ nodeId, event });
      }
    }
    return entries.sort((a, b) => a.event.timestamp - b.event.timestamp);
  }, [streamEvents]);

  if (allEvents.length === 0) {
    return (
      <div className="glass-subtle rounded-xl p-5 h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Waiting for output...</p>
      </div>
    );
  }

  return (
    <div className="glass-subtle rounded-xl p-3 h-full overflow-auto">
      <div className="space-y-1">
        {allEvents.map(({ nodeId, event }, i) => (
          <div
            key={`${nodeId}-${i}`}
            className="flex gap-2 text-[11px] font-mono"
          >
            <span className="text-muted-foreground shrink-0 w-24 truncate">
              {nodeId}
            </span>
            <span className={eventColor[event.type] || "text-foreground"}>
              {formatEvent(event)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
