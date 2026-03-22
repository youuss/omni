import { invoke } from '@tauri-apps/api/core';
import type { DomainInfo, DomainMeta, DomainSlot } from '../types/harness';

interface SlotsFile {
  slots: DomainSlot[];
}

export async function listDomains(projectPath: string): Promise<DomainInfo[]> {
  return invoke<DomainInfo[]>('list_domains', { projectPath });
}

export async function readDomainMeta(
  projectPath: string,
  domain: string
): Promise<DomainMeta> {
  const content = await invoke<string>('read_domain_meta', { projectPath, domain });
  return JSON.parse(content) as DomainMeta;
}

export async function writeDomainMeta(
  projectPath: string,
  domain: string,
  meta: DomainMeta
): Promise<void> {
  return invoke('write_domain_meta', {
    projectPath,
    domain,
    content: JSON.stringify(meta, null, 2),
  });
}

export async function readDomainFile(
  projectPath: string,
  domain: string,
  fileType: string
): Promise<string> {
  return invoke<string>('read_domain_file', { projectPath, domain, fileType });
}

export async function writeDomainFile(
  projectPath: string,
  domain: string,
  fileType: string,
  content: string
): Promise<void> {
  return invoke('write_domain_file', { projectPath, domain, fileType, content });
}

export async function deleteDomain(
  projectPath: string,
  domain: string
): Promise<void> {
  return invoke('delete_domain', { projectPath, domain });
}

export async function getSlots(projectPath: string): Promise<DomainSlot[]> {
  const content = await invoke<string>('read_domain_slots', { projectPath });
  const parsed = JSON.parse(content) as SlotsFile;
  return parsed.slots;
}

export async function saveSlots(
  projectPath: string,
  slots: DomainSlot[]
): Promise<void> {
  const content = JSON.stringify({ slots }, null, 2);
  return invoke('write_domain_slots', { projectPath, content });
}
