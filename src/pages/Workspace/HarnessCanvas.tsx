import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useHarnessStore } from '../../stores/harnessStore';
import AgentNode from './AgentNode';

const nodeTypes = { agent: AgentNode };

interface HarnessCanvasProps {
  onNodeClick?: (nodeId: string) => void;
  onPaneClick?: () => void;
}

function HarnessCanvasInner({ onNodeClick, onPaneClick }: HarnessCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const {
    currentHarness,
    agents,
    nodeStates,
    addNode,
    removeNode,
    updateNodePosition,
    addConnection,
    removeConnection,
    selectNode,
  } = useHarnessStore();

  const initialNodes: Node[] = useMemo(() => {
    if (!currentHarness) return [];
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    return currentHarness.nodes.map((node) => {
      const agentId = node.agent?.agentId || node.agent?.agentPreset || node.id;
      const agent = agentMap.get(agentId);
      return {
        id: node.id,
        type: 'agent',
        position: node.position,
        data: {
          agent: agent ?? {
            id: agentId,
            name: agentId,
            description: '',
            promptTemplate: '',
            allowedTools: [],
            maxTurns: 20,
          },
          status: nodeStates[node.id]?.status ?? 'pending',
          error: nodeStates[node.id]?.error,
          hasOverrides: !!node.agent?.constraints,
        },
      };
    });
  }, [currentHarness, agents, nodeStates]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!currentHarness) return [];
    return currentHarness.connections.map((conn) => ({
      id: conn.id,
      source: conn.sourceNodeId,
      sourceHandle: 'out',
      target: conn.targetNodeId,
      targetHandle: 'in',
      animated: true,
    }));
  }, [currentHarness]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => { setNodes(initialNodes); }, [initialNodes]);
  useMemo(() => { setEdges(initialEdges); }, [initialEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(change.id, change.position);
        }
        if (change.type === 'remove') {
          removeNode(change.id);
        }
      }
    },
    [onNodesChange, updateNodePosition, removeNode]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          removeConnection(change.id);
        }
      }
    },
    [onEdgesChange, removeConnection]
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      if (connection.source && connection.target) {
        addConnection({
          id: `e-${connection.source}-${connection.target}`,
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
        });
      }
    },
    [setEdges, addConnection]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      onNodeClick?.(node.id);
    },
    [selectNode, onNodeClick]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    onPaneClick?.();
  }, [selectNode, onPaneClick]);

  // Drag-and-drop from AgentPalette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const agentId = e.dataTransfer.getData('application/omni-agent-id');
      if (!agentId) return;

      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      addNode(agentId, position);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Backspace"
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-white/50 !border-border/30 rounded-lg" />
      </ReactFlow>
    </div>
  );
}

export default function HarnessCanvas(props: HarnessCanvasProps) {
  return (
    <ReactFlowProvider>
      <HarnessCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
