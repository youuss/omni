"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

type GateNodeData = {
  label?: string;
};

type GateNodeType = Node<GateNodeData, "gate">;

export function GateNode({ data, selected }: NodeProps<GateNodeType>) {
  return (
    <div
      className={`glass-card rounded-xl p-3 min-w-[140px] border-l-4 border-l-purple-400 ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-400" />
        <span className="text-xs font-medium">Gate</span>
      </div>
      {data.label && (
        <p className="text-[10px] text-muted-foreground mt-1">{data.label}</p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
