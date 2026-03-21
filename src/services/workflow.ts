import type { WorkflowStage } from '../types';

const STAGE_ORDER: WorkflowStage[] = [
  'idle',
  'planning',
  'readiness',
  'implementing',
  'verifying',
  'archiving',
  'done',
];

export function getNextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

export function getStageLabel(stage: WorkflowStage): string {
  const labels: Record<WorkflowStage, string> = {
    idle: '就绪',
    planning: '规划中',
    readiness: '就绪检查',
    implementing: '实现中',
    verifying: '验证中',
    archiving: '归档中',
    done: '已完成',
  };
  return labels[stage];
}

export function getStageIndex(stage: WorkflowStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export const PIPELINE_STAGES: WorkflowStage[] = [
  'planning',
  'implementing',
  'verifying',
];
