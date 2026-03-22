import { invoke } from '@tauri-apps/api/core';
import type { RunInfo, ArchiveInfo } from '../types/run';

export async function listActiveRuns(
  projectPath: string
): Promise<RunInfo[]> {
  const raw = await invoke<Array<{
    id: string;
    harness_id: string;
    state: string;
    created_at?: string;
    input_files: string[];
    output_files: string[];
  }>>('list_active_runs', { projectPath });

  return raw.map((r) => ({
    id: r.id,
    harnessId: r.harness_id,
    state: r.state as RunInfo['state'],
    createdAt: r.created_at,
    inputFiles: r.input_files,
    outputFiles: r.output_files,
  }));
}

export async function createRun(
  projectPath: string,
  runId: string
): Promise<void> {
  return invoke('create_run', { projectPath, runId });
}

export async function readRunFile(
  projectPath: string,
  runId: string,
  subpath: string
): Promise<string> {
  return invoke<string>('read_run_file', { projectPath, runId, subpath });
}

export async function writeRunFile(
  projectPath: string,
  runId: string,
  subpath: string,
  content: string
): Promise<void> {
  return invoke('write_run_file', { projectPath, runId, subpath, content });
}

export async function deleteRun(
  projectPath: string,
  runId: string
): Promise<void> {
  return invoke('delete_run', { projectPath, runId });
}

export async function archiveRun(
  projectPath: string,
  runId: string
): Promise<void> {
  return invoke('archive_run', { projectPath, runId });
}

export async function readRunMeta(
  projectPath: string,
  runId: string
): Promise<{ harnessId: string; state: string } | null> {
  try {
    const content = await readRunFile(projectPath, runId, 'run.json');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeRunMeta(
  projectPath: string,
  runId: string,
  meta: { harnessId?: string; state?: string }
): Promise<void> {
  const existing = await readRunMeta(projectPath, runId);
  const merged = { ...existing, ...meta, updatedAt: new Date().toISOString() };
  await writeRunFile(projectPath, runId, 'run.json', JSON.stringify(merged, null, 2));
}

export async function listArchivedRuns(
  projectPath: string
): Promise<ArchiveInfo[]> {
  const raw = await invoke<Array<{
    id: string;
    original_run_id: string;
    date: string;
    files: string[];
  }>>('list_archived_runs', { projectPath });

  return raw.map((r) => ({
    id: r.id,
    originalRunId: r.original_run_id,
    date: r.date,
    files: r.files,
  }));
}

export async function readArchiveFile(
  projectPath: string,
  archiveId: string,
  subpath: string
): Promise<string> {
  return invoke<string>('read_archive_file', { projectPath, archiveId, subpath });
}
