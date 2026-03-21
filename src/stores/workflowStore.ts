import { create } from 'zustand';
import type { WorkflowStage, StageResult } from '../types';

interface WorkflowState {
  changeName: string | null;
  currentStage: WorkflowStage;
  stageResults: Partial<Record<WorkflowStage, StageResult>>;
  isRunning: boolean;

  startChange: (name: string) => void;
  setStage: (stage: WorkflowStage) => void;
  setRunning: (running: boolean) => void;
  setStageResult: (stage: WorkflowStage, result: StageResult) => void;
  restoreStageFromFiles: (
    hasReq: boolean,
    hasPlan: boolean,
    hasVerification: boolean
  ) => void;
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  changeName: null,
  currentStage: 'idle',
  stageResults: {},
  isRunning: false,

  startChange: (name: string) =>
    set({
      changeName: name,
      currentStage: 'idle',
      stageResults: {},
      isRunning: false,
    }),

  setStage: (stage: WorkflowStage) => set({ currentStage: stage }),

  setRunning: (running: boolean) => set({ isRunning: running }),

  setStageResult: (stage, result) =>
    set((state) => ({
      stageResults: { ...state.stageResults, [stage]: result },
    })),

  restoreStageFromFiles: (_hasReq, hasPlan, hasVerification) => {
    const results: Partial<Record<WorkflowStage, StageResult>> = {};
    let stage: WorkflowStage = 'idle';

    if (hasPlan) {
      results.planning = {
        stage: 'planning',
        status: 'success',
        summary: '已有规划',
      };
      stage = 'implementing';
    }
    if (hasVerification) {
      results.verifying = {
        stage: 'verifying',
        status: 'success',
        summary: '已有验证报告',
      };
      stage = 'done';
    }

    set({ stageResults: results, currentStage: stage });
  },

  reset: () =>
    set({
      changeName: null,
      currentStage: 'idle',
      stageResults: {},
      isRunning: false,
    }),
}));
