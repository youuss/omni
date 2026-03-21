import { invoke } from '@tauri-apps/api/core';
import type { ChangeInfo, ArchiveInfo, ChangeMeta } from '../types';

export async function listActiveChanges(
  projectPath: string
): Promise<ChangeInfo[]> {
  return invoke<ChangeInfo[]>('list_active_changes', { projectPath });
}

export async function createChange(
  projectPath: string,
  name: string
): Promise<void> {
  return invoke('create_change', { projectPath, name });
}

export async function readChangeFile(
  projectPath: string,
  changeName: string,
  fileName: string
): Promise<string> {
  return invoke<string>('read_change_file', {
    projectPath,
    changeName,
    fileName,
  });
}

export async function writeChangeFile(
  projectPath: string,
  changeName: string,
  fileName: string,
  content: string
): Promise<void> {
  return invoke('write_change_file', {
    projectPath,
    changeName,
    fileName,
    content,
  });
}

export async function deleteChange(
  projectPath: string,
  changeName: string
): Promise<void> {
  return invoke('delete_change', { projectPath, changeName });
}

export async function archiveChange(
  projectPath: string,
  changeName: string
): Promise<void> {
  return invoke('archive_change', { projectPath, changeName });
}

export async function readChangeMeta(
  projectPath: string,
  changeName: string
): Promise<ChangeMeta | null> {
  try {
    const content = await readChangeFile(projectPath, changeName, 'meta.json');
    return JSON.parse(content) as ChangeMeta;
  } catch {
    return null;
  }
}

export async function writeChangeMeta(
  projectPath: string,
  changeName: string,
  meta: ChangeMeta
): Promise<void> {
  await writeChangeFile(projectPath, changeName, 'meta.json', JSON.stringify(meta, null, 2));
}

export async function listDomains(projectPath: string): Promise<string[]> {
  return invoke<string[]>('list_domains', { projectPath });
}

export async function listArchivedChanges(
  projectPath: string
): Promise<ArchiveInfo[]> {
  return invoke<ArchiveInfo[]>('list_archived_changes', { projectPath });
}

export async function readArchiveFile(
  projectPath: string,
  archiveName: string,
  fileName: string
): Promise<string> {
  return invoke<string>('read_archive_file', {
    projectPath,
    archiveName,
    fileName,
  });
}
