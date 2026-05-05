"use client";

import { useHarnessStore } from "@/stores/harness";

interface Agent {
  id: string;
  name: string;
}

export function AgentPalette({ agents }: { agents: Agent[] }) {
  const addNode = useHarnessStore((s) => s.addNode);

  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">
        Agents
      </h3>
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => addNode("agent", agent.id)}
          className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 transition-colors cursor-pointer"
        >
          {agent.name}
        </button>
      ))}
      {agents.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No agents yet</p>
      )}
      <hr className="border-border/20 my-2" />
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">
        Flow
      </h3>
      <button
        onClick={() => addNode("condition")}
        className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 cursor-pointer"
      >
        Condition
      </button>
      <button
        onClick={() => addNode("gate")}
        className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 cursor-pointer"
      >
        Gate
      </button>
    </div>
  );
}
