export type WorkflowStage =
  | 'idle'
  | 'planning'
  | 'readiness'
  | 'implementing'
  | 'verifying'
  | 'archiving'
  | 'done';

export interface StageResult {
  stage: WorkflowStage;
  status: 'success' | 'failure' | 'partial';
  outputFile?: string;
  summary?: string;
}

export interface ChangeInfo {
  name: string;
  files: string[];
  has_requirements: boolean;
  has_dev_plan: boolean;
  has_verification: boolean;
  created_at?: string;
  pipeline_id?: string;
}

export interface ChangeMeta {
  pipelineId: string;
}

export interface ArchiveInfo {
  name: string;
  original_name: string;
  date: string;
  files: string[];
}
