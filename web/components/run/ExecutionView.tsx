"use client";

import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "@/components/harness/AgentNode";
import { ConditionNode } from "@/components/harness/ConditionNode";
import { GateNode } from "@/components/harness/GateNode";
import { useRunStore, type NodeState } from "@/stores/run";

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  gate: GateNode,
};

function mergeNodeStatuses(
  nodes: Node[],
  nodeStates: Record<string, NodeState>,
): Node[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      status: nodeStates[node.id]?.status || node.data.status || "pending",
    },
  }));
}

export function ExecutionView({
  definitionNodes,
  definitionEdges,
}: {
  definitionNodes: Node[];
  definitionEdges: Edge[];
}) {
  const { nodeStates } = useRunStore();

  const mergedNodes = useMemo(
    () => mergeNodeStatuses(definitionNodes, nodeStates),
    [definitionNodes, nodeStates],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(mergedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(definitionEdges);

  useEffect(() => {
    setNodes(mergedNodes);
  }, [mergedNodes, setNodes]);

  useEffect(() => {
    setEdges(definitionEdges);
  }, [definitionEdges, setEdges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
