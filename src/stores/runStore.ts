import { create } from 'zustand';
import type { RunState } from '../types/run';

export type ExecutionMode = 'all' | 'fromNode' | 'step';

interface RunStoreState {
  currentRunId: string | null;
  currentRunState: RunState;
  isRunning: boolean;
  executionMode: ExecutionMode;
  startFromNodeId: string | null;

  startRun: (runId: string) => void;
  setState: (state: RunState) => void;
  setRunning: (running: boolean) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setStartFromNode: (nodeId: string | null) => void;
  reset: () => void;
}

export const useRunStore = create<RunStoreState>((set) => ({
  currentRunId: null,
  currentRunState: 'draft',
  isRunning: false,
  executionMode: 'all',
  startFromNodeId: null,

  startRun: (runId: string) =>
    set({
      currentRunId: runId,
      currentRunState: 'draft',
      isRunning: false,
    }),

  setState: (state: RunState) => set({ currentRunState: state }),

  setRunning: (running: boolean) => set({ isRunning: running }),

  setExecutionMode: (mode: ExecutionMode) => set({ executionMode: mode }),

  setStartFromNode: (nodeId: string | null) => set({ startFromNodeId: nodeId }),

  reset: () =>
    set({
      currentRunId: null,
      currentRunState: 'draft',
      isRunning: false,
      executionMode: 'all',
      startFromNodeId: null,
    }),
}));
