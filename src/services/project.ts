import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo, DirEntry } from '../types';

export async function openProject(path: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>('open_project', { path });
}

export async function listProjects(): Promise<ProjectInfo[]> {
  return invoke<ProjectInfo[]>('list_projects');
}

export async function addProject(path: string, name: string): Promise<void> {
  return invoke('add_project', { path, name });
}

export async function removeProject(path: string): Promise<void> {
  return invoke('remove_project', { path });
}

export async function scanDirectory(
  path: string,
  maxDepth: number = 3
): Promise<DirEntry> {
  return invoke<DirEntry>('scan_directory', { path, maxDepth });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

export async function writeTextFile(
  path: string,
  content: string
): Promise<void> {
  return invoke('write_text_file', { path, content });
}
