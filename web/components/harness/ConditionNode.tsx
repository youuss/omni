"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

type ConditionNodeData = {
  label?: string;
};

type ConditionNodeType = Node<ConditionNodeData, "condition">;

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeType>) {
  return (
    <div
      className={`glass-card rounded-xl p-3 min-w-[140px] border-l-4 border-l-amber-400 ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-xs font-medium">Condition</span>
      </div>
      {data.label && (
        <p className="text-[10px] text-muted-foreground mt-1">{data.label}</p>
      )}
      <Handle type="source" position={Position.Bottom} id="true" />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        className="!top-1/2"
      />
    </div>
  );
}
