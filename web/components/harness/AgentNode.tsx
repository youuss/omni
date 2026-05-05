"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

type AgentNodeData = {
  agentId?: string;
  label?: string;
  status?: string;
};

type AgentNodeType = Node<AgentNodeData, "agent">;

const statusColor: Record<string, string> = {
  pending: "bg-muted-foreground/30",
  ready: "bg-blue-400",
  running: "bg-blue-400 animate-pulse",
  checking: "bg-amber-400 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  skipped: "bg-muted-foreground/50",
  waiting: "bg-amber-400 animate-pulse",
};

export function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  return (
    <div
      className={`glass-card rounded-xl p-3 min-w-[160px] ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${statusColor[data.status || "pending"] || "bg-muted-foreground/30"}`}
        />
        <span className="text-xs font-medium">
          {data.agentId || "Agent"}
        </span>
      </div>
      {data.label && (
        <p className="text-[10px] text-muted-foreground mt-1">{data.label}</p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
