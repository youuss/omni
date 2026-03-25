import { create } from 'zustand';
import type { RunState } from '../types/run';

interface RunStoreState {
  currentRunId: string | null;
  currentRunState: RunState;
  isRunning: boolean;

  startRun: (runId: string) => void;
  setState: (state: RunState) => void;
  setRunning: (running: boolean) => void;
  reset: () => void;
}

export const useRunStore = create<RunStoreState>((set) => ({
  currentRunId: null,
  currentRunState: 'draft',
  isRunning: false,

  startRun: (runId: string) =>
    set({
      currentRunId: runId,
      currentRunState: 'draft',
      isRunning: false,
    }),

  setState: (state: RunState) => set({ currentRunState: state }),

  setRunning: (running: boolean) => set({ isRunning: running }),

  reset: () =>
    set({
      currentRunId: null,
      currentRunState: 'draft',
      isRunning: false,
    }),
}));
