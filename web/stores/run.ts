import { create } from "zustand";
import { api } from "@/lib/api";
import { connectRunWS } from "@/lib/ws";

export interface Run {
  id: string;
  harness_id: string;
  project_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NodeState {
  status: string;
  attempt: number;
  error?: string;
}

export interface StreamEvent {
  type: string;
  content: string;
  toolName?: string;
  timestamp: number;
}

interface RunState {
  runs: Run[];
  current: Run | null;
  nodeStates: Record<string, NodeState>;
  streamEvents: Record<string, StreamEvent[]>;
  ws: WebSocket | null;

  fetchRuns: (harnessId: string) => Promise<void>;
  fetchRun: (runId: string) => Promise<void>;
  startRun: (harnessId: string) => Promise<Run>;
  connectWS: (runId: string) => void;
  disconnectWS: () => void;
  abortRun: (runId: string) => Promise<void>;
  approveGate: (runId: string, nodeId: string) => Promise<void>;
  rejectGate: (runId: string, nodeId: string) => Promise<void>;
  reset: () => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  runs: [],
  current: null,
  nodeStates: {},
  streamEvents: {},
  ws: null,

  fetchRuns: async (harnessId) => {
    const runs = await api<Run[]>(`/harnesses/${harnessId}/runs`);
    set({ runs: runs || [] });
  },

  fetchRun: async (runId) => {
    const run = await api<Run>(`/runs/${runId}`);
    set({ current: run });
  },

  startRun: async (harnessId) => {
    const run = await api<Run>(`/harnesses/${harnessId}/runs`, {
      method: "POST",
    });
    set((s) => ({ runs: [run, ...s.runs], current: run }));
    return run;
  },

  connectWS: (runId) => {
    const { ws: existing } = get();
    if (existing) {
      existing.close();
    }

    const ws = connectRunWS(runId, (msg: unknown) => {
      const data = msg as Record<string, unknown>;

      if (data.type === "node_status") {
        const nodeId = data.nodeId as string;
        set((s) => ({
          nodeStates: {
            ...s.nodeStates,
            [nodeId]: {
              status: data.status as string,
              attempt: (data.attempt as number) || 0,
              error: data.error as string | undefined,
            },
          },
        }));
      } else if (data.type === "stream_event") {
        const nodeId = data.nodeId as string;
        const event = data.event as Record<string, unknown>;
        set((s) => ({
          streamEvents: {
            ...s.streamEvents,
            [nodeId]: [
              ...(s.streamEvents[nodeId] || []),
              {
                type: event.type as string,
                content: event.content as string,
                toolName: event.toolName as string | undefined,
                timestamp: Date.now(),
              },
            ],
          },
        }));
      } else if (data.type === "status") {
        set((s) => ({
          current: s.current
            ? { ...s.current, status: data.status as string }
            : null,
        }));
      }
    });

    ws.onclose = () => {
      set({ ws: null });
    };

    set({ ws });
  },

  disconnectWS: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  abortRun: async (runId) => {
    await api(`/runs/${runId}/abort`, { method: "POST" });
  },

  approveGate: async (runId, nodeId) => {
    await api(`/runs/${runId}/gate/${nodeId}/approve`, { method: "POST" });
  },

  rejectGate: async (runId, nodeId) => {
    await api(`/runs/${runId}/gate/${nodeId}/reject`, { method: "POST" });
  },

  reset: () => {
    const { ws } = get();
    if (ws) ws.close();
    set({
      runs: [],
      current: null,
      nodeStates: {},
      streamEvents: {},
      ws: null,
    });
  },
}));
