import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Node, Edge } from '@xyflow/react';

export interface Harness {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  definition: { nodes: Node[]; edges: Edge[] };
  is_template: boolean;
  tags: string[];
}

interface HarnessState {
  harnesses: Harness[];
  current: Harness | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  fetchHarnesses: (projectId: string) => Promise<void>;
  fetchHarness: (id: string) => Promise<void>;
  createHarness: (projectId: string, name: string) => Promise<Harness>;
  saveDefinition: (id: string) => Promise<void>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (id: string | null) => void;
  addNode: (type: string, agentId?: string, position?: { x: number; y: number }) => void;
}

export const useHarnessStore = create<HarnessState>((set, get) => ({
  harnesses: [],
  current: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,

  fetchHarnesses: async (projectId) => {
    const harnesses = await api<Harness[]>(`/projects/${projectId}/harnesses`);
    set({ harnesses: harnesses || [] });
  },

  fetchHarness: async (id) => {
    const harness = await api<Harness>(`/harnesses/${id}`);
    set({
      current: harness,
      nodes: harness.definition?.nodes || [],
      edges: harness.definition?.edges || [],
    });
  },

  createHarness: async (projectId, name) => {
    const harness = await api<Harness>(`/projects/${projectId}/harnesses`, {
      method: 'POST',
      body: JSON.stringify({ name, definition: { nodes: [], edges: [] } }),
    });
    set((s) => ({ harnesses: [harness, ...s.harnesses] }));
    return harness;
  },

  saveDefinition: async (id) => {
    const { nodes, edges } = get();
    await api(`/harnesses/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ definition: { nodes, edges } }),
    });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  addNode: (type, agentId, position) => {
    const { nodes } = get();
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: position || { x: 250, y: 150 + nodes.length * 100 },
      data: { agentId, label: type },
    };
    set({ nodes: [...nodes, newNode] });
  },
}));
