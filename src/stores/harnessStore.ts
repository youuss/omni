import { create } from 'zustand';
import type {
  HarnessDefinition,
  HarnessNode,
  HarnessConnection,
  NodeStatus,
  NodeRuntimeState,
  FileTab,
  HarnessTemplateInfo,
  AgentDefinition,
} from '../types/harness';
import {
  saveProjectHarness,
  loadHarnessForTemplate,
  ensureDefaultHarness,
  deriveFileTabs,
} from '../services/harness-service';
import {
  listAllTemplates,
  saveAsTemplate as saveAsTemplateSvc,
} from '../services/harness-template-service';
import { listAgentMetas } from '../services/agent-service';

interface HarnessState {
  currentHarness: HarnessDefinition | null;
  currentTemplateId: string | null;
  agents: AgentDefinition[];
  templates: HarnessTemplateInfo[];
  nodeStates: Record<string, NodeRuntimeState>;
  harnessRunning: boolean;
  dirty: boolean;
  tabs: FileTab[];
  selectedNodeId: string | null;

  selectNode: (nodeId: string | null) => void;
  loadTemplates: (projectPath: string) => Promise<void>;
  loadHarness: (projectPath: string, templateId?: string) => Promise<void>;
  saveCurrent: (projectPath: string) => Promise<void>;
  saveAsTemplate: (projectPath: string, templateId: string, name: string) => Promise<void>;
  recomputeTabs: (runId: string) => void;

  addNode: (agentId: string, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeConstraints: (nodeId: string, constraints: HarnessNode['constraints']) => void;
  addConnection: (conn: HarnessConnection) => void;
  removeConnection: (connId: string) => void;

  setNodeStatus: (nodeId: string, status: NodeStatus, error?: string) => void;
  setNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  setHarnessRunning: (running: boolean) => void;
  resetExecution: () => void;
}

let nodeCounter = 0;

function initNodeStates(nodes: HarnessNode[]): Record<string, NodeRuntimeState> {
  const states: Record<string, NodeRuntimeState> = {};
  for (const node of nodes) {
    states[node.id] = { status: 'idle', outputs: {} };
  }
  return states;
}

export const useHarnessStore = create<HarnessState>((set, get) => ({
  currentHarness: null,
  currentTemplateId: null,
  agents: [],
  templates: [],
  nodeStates: {},
  harnessRunning: false,
  dirty: false,
  tabs: [],
  selectedNodeId: null,

  selectNode: (nodeId: string | null) => set({ selectedNodeId: nodeId }),

  loadTemplates: async (projectPath: string) => {
    const templates = await listAllTemplates(projectPath);
    set({ templates });
  },

  loadHarness: async (projectPath: string, templateId?: string) => {
    let harness: HarnessDefinition;
    if (templateId) {
      harness = await loadHarnessForTemplate(projectPath, templateId);
    } else {
      harness = await ensureDefaultHarness(projectPath);
    }
    const agents = await listAgentMetas(projectPath);
    set({
      currentHarness: harness,
      currentTemplateId: templateId ?? harness.id,
      agents,
      nodeStates: initNodeStates(harness.nodes),
      dirty: false,
    });
  },

  saveCurrent: async (projectPath: string) => {
    const harness = get().currentHarness;
    if (!harness) return;
    await saveProjectHarness(projectPath, harness);
    set({ dirty: false });
  },

  saveAsTemplate: async (projectPath: string, templateId: string, name: string) => {
    const harness = get().currentHarness;
    if (!harness) return;
    await saveAsTemplateSvc(projectPath, harness, templateId, name);
    const templates = await listAllTemplates(projectPath);
    set({ templates });
  },

  recomputeTabs: (runId: string) => {
    const { currentHarness, agents } = get();
    if (!currentHarness || !runId) {
      set({ tabs: [] });
      return;
    }
    const tabs = deriveFileTabs(currentHarness, agents, runId);
    set({ tabs });
  },

  addNode: (agentId: string, position: { x: number; y: number }) => {
    const harness = get().currentHarness;
    if (!harness) return;
    const id = `n-${agentId.toLowerCase()}-${++nodeCounter}`;
    const node: HarnessNode = { id, agentId, position };
    set({
      currentHarness: {
        ...harness,
        nodes: [...harness.nodes, node],
      },
      nodeStates: {
        ...get().nodeStates,
        [id]: { status: 'idle', outputs: {} },
      },
      dirty: true,
    });
  },

  removeNode: (nodeId: string) => {
    const harness = get().currentHarness;
    if (!harness) return;
    const { [nodeId]: _, ...restStates } = get().nodeStates;
    set({
      currentHarness: {
        ...harness,
        nodes: harness.nodes.filter((n) => n.id !== nodeId),
        connections: harness.connections.filter(
          (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
        ),
      },
      nodeStates: restStates,
      dirty: true,
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    const harness = get().currentHarness;
    if (!harness) return;
    set({
      currentHarness: {
        ...harness,
        nodes: harness.nodes.map((n) =>
          n.id === nodeId ? { ...n, position } : n
        ),
      },
    });
  },

  updateNodeConstraints: (nodeId, constraints) => {
    const harness = get().currentHarness;
    if (!harness) return;
    set({
      currentHarness: {
        ...harness,
        nodes: harness.nodes.map((n) =>
          n.id === nodeId ? { ...n, constraints } : n
        ),
      },
      dirty: true,
    });
  },

  addConnection: (conn: HarnessConnection) => {
    const harness = get().currentHarness;
    if (!harness) return;
    const exists = harness.connections.some(
      (c) =>
        c.sourceNodeId === conn.sourceNodeId &&
        c.targetNodeId === conn.targetNodeId
    );
    if (exists) return;
    set({
      currentHarness: {
        ...harness,
        connections: [...harness.connections, conn],
      },
      dirty: true,
    });
  },

  removeConnection: (connId: string) => {
    const harness = get().currentHarness;
    if (!harness) return;
    set({
      currentHarness: {
        ...harness,
        connections: harness.connections.filter((c) => c.id !== connId),
      },
      dirty: true,
    });
  },

  setNodeStatus: (nodeId: string, status: NodeStatus, error?: string) => {
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

  setHarnessRunning: (running: boolean) => {
    set({ harnessRunning: running });
  },

  resetExecution: () => {
    const harness = get().currentHarness;
    if (!harness) return;
    set({ nodeStates: initNodeStates(harness.nodes), harnessRunning: false });
  },
}));
