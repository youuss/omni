export type RunState = 'draft' | 'running' | 'paused' | 'completed' | 'failed' | 'archived';

export interface RunInfo {
  id: string;
  harnessId: string;
  state: RunState;
  createdAt?: string;
  updatedAt?: string;
  logFiles: string[];
  outputFiles: string[];
}

export interface ArchiveInfo {
  id: string;
  originalRunId: string;
  date: string;
  files: string[];
}
