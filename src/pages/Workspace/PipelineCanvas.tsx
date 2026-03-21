import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/lib/utils';
import {
  Save,
  Play,
  Square,
  RotateCcw,
  ArrowLeft,
  BookmarkPlus,
  Bot,
  Shield,
  FileText,
  Code2,
  ClipboardCheck,
  Search,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePipelineStore } from '../../stores/pipelineStore';
import AgentNode, { type AgentNodeData } from './AgentNode';
import type { AgentMeta, PipelineDefinition } from '../../types/pipeline';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

const SIDEBAR_CATEGORY_ICONS: Record<string, React.ElementType> = {
  planner: FileText,
  implementer: Code2,
  verifier: ClipboardCheck,
  reviewer: Search,
  custom: Bot,
};

interface PipelineCanvasProps {
  projectPath: string;
  isRunning: boolean;
  onRunPipeline: () => void;
  onAbort: () => void;
  onBack?: () => void;
}

function pipelineToRFNodes(
  pipeline: PipelineDefinition,
  agents: AgentMeta[],
  nodeStates: Record<string, { status: string; error?: string }>
): Node[] {
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return pipeline.nodes.map((node) => {
    const agent = agentMap.get(node.agentId);
    const state = nodeStates[node.id];

    const fallbackAgent: AgentMeta = {
      id: node.agentId,
      name: node.agentId,
      description: '',
      category: 'custom',
      inputPorts: [],
      outputPorts: [],
      promptTemplate: '',
      allowedTools: [],
      maxTurns: 20,
    };

    const overrides = node.configOverrides;
    const hasOverrides = !!overrides && (
      overrides.maxTurns != null || overrides.promptExtra != null ||
      (overrides.allowedTools != null && overrides.allowedTools.length > 0)
    );

    return {
      id: node.id,
      type: 'agent',
      position: node.position,
      data: {
        agent: agent ?? fallbackAgent,
        status: (state?.status as AgentNodeData['status']) ?? 'idle',
        error: state?.error,
        hasOverrides,
      },
    } as Node;
  });
}

function pipelineToRFEdges(pipeline: PipelineDefinition): Edge[] {
  return pipeline.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
    animated: false,
    style: { stroke: 'oklch(0.5 0 0 / 0.3)', strokeWidth: 2 },
  }));
}

/* Inner component that lives inside ReactFlowProvider */
function PipelineCanvasInner({
  projectPath,
  isRunning,
  onRunPipeline,
  onAbort,
  onBack,
}: PipelineCanvasProps) {
  const {
    currentPipeline,
    agents,
    nodeStates,
    dirty,
    saveCurrent,
    saveAsTemplate,
    addNode,
    removeNode,
    updateNodePosition,
    addEdge: storeAddEdge,
    removeEdge: storeRemoveEdge,
    resetExecution,
    updateNodeConfig,
  } = usePipelineStore();

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Node config override dialog
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [cfgMaxTurns, setCfgMaxTurns] = useState<string>('');
  const [cfgPromptExtra, setCfgPromptExtra] = useState('');

  const openNodeConfig = useCallback((nodeId: string) => {
    const node = currentPipeline?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setCfgMaxTurns(node.configOverrides?.maxTurns?.toString() ?? '');
    setCfgPromptExtra(node.configOverrides?.promptExtra ?? '');
    setConfigNodeId(nodeId);
  }, [currentPipeline]);

  const handleSaveNodeConfig = useCallback(() => {
    if (!configNodeId) return;
    const maxTurns = cfgMaxTurns.trim() ? Number(cfgMaxTurns) : undefined;
    const promptExtra = cfgPromptExtra.trim() || undefined;
    const overrides = (maxTurns != null || promptExtra != null)
      ? { maxTurns, promptExtra }
      : undefined;
    updateNodeConfig(configNodeId, overrides);
    setConfigNodeId(null);
  }, [configNodeId, cfgMaxTurns, cfgPromptExtra, updateNodeConfig]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (!templateName.trim()) return;
    const id = templateName.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      await saveAsTemplate(projectPath, id, templateName.trim());
      toast.success(`模板「${templateName.trim()}」已保存`);
      setSaveTemplateOpen(false);
      setTemplateName('');
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    }
  }, [projectPath, templateName, saveAsTemplate]);

  const { fitView, screenToFlowPosition } = useReactFlow();
  const prevNodeCountRef = useRef(currentPipeline?.nodes.length ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only fitView once on mount — never re-trigger on re-renders
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (hasFittedRef.current) return;
    hasFittedRef.current = true;
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      fitView({ padding: 0.3 });
    }, 80);
    return () => clearTimeout(timer);
  }, [fitView]);

  const rfNodesInit = useMemo(
    () =>
      currentPipeline
        ? pipelineToRFNodes(currentPipeline, agents, nodeStates)
        : [],
    [currentPipeline, agents, nodeStates]
  );

  const rfEdgesInit = useMemo(
    () => (currentPipeline ? pipelineToRFEdges(currentPipeline) : []),
    [currentPipeline]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodesInit);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdgesInit);

  useEffect(() => {
    setNodes(rfNodesInit);
  }, [rfNodesInit, setNodes]);

  useEffect(() => {
    setEdges(rfEdgesInit);
  }, [rfEdgesInit, setEdges]);

  // fitView after node count changes (add/remove)
  useEffect(() => {
    const count = currentPipeline?.nodes.length ?? 0;
    if (count !== prevNodeCountRef.current) {
      prevNodeCountRef.current = count;
      // Wait for ReactFlow to process the new nodes
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, duration: 200 });
      });
    }
  }, [currentPipeline?.nodes.length, fitView]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && 'position' in change && change.position && !('dragging' in change && change.dragging)) {
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
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          storeRemoveEdge(change.id);
        }
      }
    },
    [onEdgesChange, storeRemoveEdge]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));

      if (connection.source && connection.target) {
        const edgeId = `e-${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}-${connection.targetHandle ?? 'in'}`;
        storeAddEdge({
          id: edgeId,
          source: connection.source,
          sourcePort: connection.sourceHandle ?? '',
          target: connection.target,
          targetPort: connection.targetHandle ?? '',
        });
      }
    },
    [setEdges, storeAddEdge]
  );

  // Mouse-based drag-to-canvas (works in Tauri webview where native drag-drop may be blocked)
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!draggingAgentId) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragGhost({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Check if dropped over the canvas container
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        ) {
          const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addNode(draggingAgentId, position);
        }
      }
      setDraggingAgentId(null);
      setDragGhost(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingAgentId, addNode, screenToFlowPosition]);

  const [agentPanelCollapsed, setAgentPanelCollapsed] = useState(false);

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/40 transition-colors cursor-pointer"
            title="返回"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="text-xs font-medium text-foreground/70 truncate max-w-[140px]">
          {currentPipeline?.name ?? '未配置'}
        </span>
        {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}

        <div className="w-px h-4 bg-border/30" />

        {/* Save */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="cursor-pointer"
          disabled={!dirty || isRunning}
          onClick={() => saveCurrent(projectPath)}
        >
          <Save className={cn('w-3 h-3', dirty && 'text-amber-500')} />
        </Button>

        {/* Save as Template */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="cursor-pointer"
          disabled={!currentPipeline || currentPipeline.nodes.length === 0}
          onClick={() => setSaveTemplateOpen(true)}
          title="保存为模板"
        >
          <BookmarkPlus className="w-3 h-3" />
        </Button>

        <div className="flex-1" />

        {/* Run Controls */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="cursor-pointer"
          disabled={isRunning}
          onClick={resetExecution}
        >
          <RotateCcw className="w-3 h-3" />
        </Button>

        {isRunning ? (
          <Button
            variant="destructive"
            size="xs"
            className="gap-1 h-6 text-[10px] cursor-pointer"
            onClick={onAbort}
          >
            <Square className="w-2.5 h-2.5" />
            中止
          </Button>
        ) : (
          <Button
            size="xs"
            className="gap-1 h-6 text-[10px] cursor-pointer"
            disabled={!currentPipeline || currentPipeline.nodes.length === 0}
            onClick={onRunPipeline}
          >
            <Play className="w-2.5 h-2.5" />
            运行
          </Button>
        )}
      </div>

      {/* Canvas + Agent Sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas — force own GPU compositing layer to prevent blur from overlays */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 relative"
          style={{ isolation: 'isolate', transform: 'translateZ(0)' }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDoubleClick={(_e, node) => openNodeConfig(node.id)}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-transparent"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="oklch(0.7 0 0 / 0.2)"
            />
            <Controls
              showInteractive={false}
              className="!rounded-xl !border-border/30 !bg-white/90 !shadow-sm [&>button]:!border-border/20 [&>button]:!bg-transparent [&>button]:hover:!bg-black/5"
            />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
              className="!rounded-xl !border-border/30 !bg-white/80"
            />
          </ReactFlow>
        </div>

        {/* Agent Sidebar */}
        <div
          className={cn(
            'shrink-0 border-l border-border/30 bg-white/60 backdrop-blur-sm flex flex-col transition-all duration-200',
            agentPanelCollapsed ? 'w-9' : 'w-52'
          )}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border/20">
            <button
              onClick={() => setAgentPanelCollapsed(!agentPanelCollapsed)}
              className="p-0.5 rounded hover:bg-black/5 transition-colors cursor-pointer text-muted-foreground/50 hover:text-foreground"
            >
              <GripVertical className="w-3 h-3" />
            </button>
            {!agentPanelCollapsed && (
              <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">Agent 池</span>
            )}
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {agents.map((agent) => {
              const CatIcon = SIDEBAR_CATEGORY_ICONS[agent.category] ?? Bot;
              return (
                <div
                  key={agent.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraggingAgentId(agent.id);
                    setDragGhost({ x: e.clientX, y: e.clientY });
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors hover:bg-black/5 select-none',
                    agentPanelCollapsed ? 'justify-center p-1.5' : 'px-2.5 py-2',
                    draggingAgentId === agent.id && 'opacity-40'
                  )}
                  title={agentPanelCollapsed ? agent.name : undefined}
                >
                  <div className={cn(
                    'flex items-center justify-center shrink-0 rounded-md',
                    agent.builtin ? 'bg-primary/8 text-primary' : 'bg-blue-500/10 text-blue-600',
                    agentPanelCollapsed ? 'w-5 h-5' : 'w-6 h-6'
                  )}>
                    {agent.builtin ? <Shield className="w-3 h-3" /> : <CatIcon className="w-3 h-3" />}
                  </div>
                  {!agentPanelCollapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate">{agent.name}</div>
                      {agent.description && (
                        <div className="text-[9px] text-muted-foreground/50 truncate">{agent.description}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">保存为模板</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium mb-1.5 block">模板名称</label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如: 前端开发流程"
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveTemplateOpen(false)}>取消</Button>
            <Button size="sm" disabled={!templateName.trim()} onClick={handleSaveAsTemplate}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Config Override Dialog */}
      <Dialog open={!!configNodeId} onOpenChange={(open) => !open && setConfigNodeId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              节点配置
              {configNodeId && (
                <span className="text-muted-foreground font-normal ml-1.5">
                  {(() => {
                    const n = currentPipeline?.nodes.find((nd) => nd.id === configNodeId);
                    return n ? agents.find((a) => a.id === n.agentId)?.name ?? n.agentId : '';
                  })()}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">最大轮次覆盖</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={cfgMaxTurns}
                onChange={(e) => setCfgMaxTurns(e.target.value)}
                placeholder="留空则使用 Agent 默认值"
                className="w-40 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">附加指令</Label>
              <Textarea
                value={cfgPromptExtra}
                onChange={(e) => setCfgPromptExtra(e.target.value)}
                placeholder="在此节点执行时追加的额外上下文或指令..."
                className="font-mono text-xs min-h-[80px]"
              />
              <p className="text-[10px] text-muted-foreground">会追加到 Agent prompt 末尾，仅对此节点生效</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfigNodeId(null)}>取消</Button>
            <Button size="sm" onClick={handleSaveNodeConfig}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drag ghost */}
      {draggingAgentId && dragGhost && (
        <div
          className="fixed z-[9999] pointer-events-none flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 border border-primary/30 shadow-lg backdrop-blur-sm"
          style={{ left: dragGhost.x + 12, top: dragGhost.y - 14 }}
        >
          <Bot className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">
            {agents.find((a) => a.id === draggingAgentId)?.name ?? draggingAgentId}
          </span>
        </div>
      )}
    </>
  );
}

/* Outer wrapper with ReactFlowProvider */
export default function PipelineCanvas(props: PipelineCanvasProps) {
  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-full">
        <PipelineCanvasInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}
