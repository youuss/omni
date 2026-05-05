"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useHarnessStore } from "@/stores/harness";
import { AgentNode } from "./AgentNode";
import { ConditionNode } from "./ConditionNode";
import { GateNode } from "./GateNode";

export function HarnessCanvas() {
  const { nodes, edges, setNodes, setEdges, setSelectedNode } =
    useHarnessStore();

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      agent: AgentNode,
      condition: ConditionNode,
      gate: GateNode,
    }),
    [],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges(addEdge(params, edges)),
    [edges, setEdges],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
