import { create } from 'zustand';
import type {
  PipelineDefinition,
  PipelineNode,
  PipelineEdge,
  NodeExecutionStatus,
  TabDescriptor,
  PipelineTemplateInfo,
} from '../types/pipeline';
import type { AgentMeta } from '../types/pipeline';
import {
  saveProjectPipeline,
  loadPipelineForTemplate,
  ensureDefaultPipeline,
  deriveTabs,
} from '../services/pipeline-service';
import {
  listAllTemplates,
  saveAsTemplate as saveAsTemplateSvc,
} from '../services/pipeline-template-service';
import { listAgentMetas } from '../services/agent-service';

interface NodeRuntimeState {
  status: NodeExecutionStatus;
  outputs: Record<string, string>;
  error?: string;
}

interface PipelineState {
  currentPipeline: PipelineDefinition | null;
  currentTemplateId: string | null;
  agents: AgentMeta[];
  templates: PipelineTemplateInfo[];
  nodeStates: Record<string, NodeRuntimeState>;
  pipelineRunning: boolean;
  dirty: boolean;
  tabs: TabDescriptor[];

  loadTemplates: (projectPath: string) => Promise<void>;
  loadPipeline: (projectPath: string, templateId?: string) => Promise<void>;
  saveCurrent: (projectPath: string) => Promise<void>;
  saveAsTemplate: (projectPath: string, templateId: string, name: string) => Promise<void>;
  recomputeTabs: (changeName: string) => void;

  addNode: (agentId: string, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, overrides: PipelineNode['configOverrides']) => void;
  addEdge: (edge: PipelineEdge) => void;
  removeEdge: (edgeId: string) => void;

  setNodeStatus: (nodeId: string, status: NodeExecutionStatus, error?: string) => void;
  setNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  setPipelineRunning: (running: boolean) => void;
  resetExecution: () => void;
}

let nodeCounter = 0;

function initNodeStates(nodes: PipelineNode[]): Record<string, NodeRuntimeState> {
  const states: Record<string, NodeRuntimeState> = {};
  for (const node of nodes) {
    states[node.id] = { status: 'idle', outputs: {} };
  }
  return states;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  currentPipeline: null,
  currentTemplateId: null,
  agents: [],
  templates: [],
  nodeStates: {},
  pipelineRunning: false,
  dirty: false,
  tabs: [],

  loadTemplates: async (projectPath: string) => {
    const templates = await listAllTemplates(projectPath);
    set({ templates });
  },

  loadPipeline: async (projectPath: string, templateId?: string) => {
    let pipeline: PipelineDefinition;
    if (templateId) {
      pipeline = await loadPipelineForTemplate(projectPath, templateId);
    } else {
      pipeline = await ensureDefaultPipeline(projectPath);
    }
    const agents = await listAgentMetas(projectPath);
    set({
      currentPipeline: pipeline,
      currentTemplateId: templateId ?? pipeline.id,
      agents,
      nodeStates: initNodeStates(pipeline.nodes),
      dirty: false,
    });
  },

  saveCurrent: async (projectPath: string) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    await saveProjectPipeline(projectPath, pipeline);
    set({ dirty: false });
  },

  saveAsTemplate: async (projectPath: string, templateId: string, name: string) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    await saveAsTemplateSvc(projectPath, pipeline, templateId, name);
    // Refresh templates list
    const templates = await listAllTemplates(projectPath);
    set({ templates });
  },

  recomputeTabs: (changeName: string) => {
    const { currentPipeline, agents } = get();
    if (!currentPipeline || !changeName) {
      set({ tabs: [] });
      return;
    }
    const tabs = deriveTabs(currentPipeline, agents, changeName);
    set({ tabs });
  },

  addNode: (agentId: string, position: { x: number; y: number }) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    const id = `n-${agentId.toLowerCase()}-${++nodeCounter}`;
    const node: PipelineNode = { id, agentId, position };
    set({
      currentPipeline: {
        ...pipeline,
        nodes: [...pipeline.nodes, node],
      },
      nodeStates: {
        ...get().nodeStates,
        [id]: { status: 'idle', outputs: {} },
      },
      dirty: true,
    });
  },

  removeNode: (nodeId: string) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    const { [nodeId]: _, ...restStates } = get().nodeStates;
    set({
      currentPipeline: {
        ...pipeline,
        nodes: pipeline.nodes.filter((n) => n.id !== nodeId),
        edges: pipeline.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        ),
      },
      nodeStates: restStates,
      dirty: true,
    });
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    set({
      currentPipeline: {
        ...pipeline,
        nodes: pipeline.nodes.map((n) =>
          n.id === nodeId ? { ...n, position } : n
        ),
      },
    });
  },

  updateNodeConfig: (nodeId, overrides) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    set({
      currentPipeline: {
        ...pipeline,
        nodes: pipeline.nodes.map((n) =>
          n.id === nodeId ? { ...n, configOverrides: overrides } : n
        ),
      },
      dirty: true,
    });
  },

  addEdge: (edge: PipelineEdge) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    const exists = pipeline.edges.some(
      (e) =>
        e.source === edge.source &&
        e.sourcePort === edge.sourcePort &&
        e.target === edge.target &&
        e.targetPort === edge.targetPort
    );
    if (exists) return;
    set({
      currentPipeline: {
        ...pipeline,
        edges: [...pipeline.edges, edge],
      },
      dirty: true,
    });
  },

  removeEdge: (edgeId: string) => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    set({
      currentPipeline: {
        ...pipeline,
        edges: pipeline.edges.filter((e) => e.id !== edgeId),
      },
      dirty: true,
    });
  },

  setNodeStatus: (nodeId: string, status: NodeExecutionStatus, error?: string) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: {
          ...state.nodeStates[nodeId],
          status,
          error,
        },
      },
    }));
  },

  setNodeOutputs: (nodeId: string, outputs: Record<string, string>) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: {
          ...state.nodeStates[nodeId],
          outputs,
        },
      },
    }));
  },

  setPipelineRunning: (running: boolean) => {
    set({ pipelineRunning: running });
  },

  resetExecution: () => {
    const pipeline = get().currentPipeline;
    if (!pipeline) return;
    set({ nodeStates: initNodeStates(pipeline.nodes), pipelineRunning: false });
  },
}));
