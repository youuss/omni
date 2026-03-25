import { invoke } from '@tauri-apps/api/core';
import type { ToolExtensionInfo, ExtensionsConfig } from '../types/extension';

const EXTENSIONS_CONFIG_FILE = '.harness/extensions.json';

function extensionsConfigPath(projectPath: string): string {
  return `${projectPath}/${EXTENSIONS_CONFIG_FILE}`;
}

export async function scanExtensions(projectPath: string): Promise<ToolExtensionInfo[]> {
  return invoke<ToolExtensionInfo[]>('scan_extensions', { projectPath });
}

export async function loadExtensionsConfig(
  projectPath: string
): Promise<ExtensionsConfig> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: extensionsConfigPath(projectPath),
    });
    return JSON.parse(content) as ExtensionsConfig;
  } catch {
    const extensions = await scanExtensions(projectPath);
    return { enabled: extensions.map((e) => e.id) };
  }
}

export async function saveExtensionsConfig(
  projectPath: string,
  config: ExtensionsConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: extensionsConfigPath(projectPath),
    content: JSON.stringify(config, null, 2),
  });
}

export async function toggleExtension(
  projectPath: string,
  extensionId: string,
  enabled: boolean
): Promise<void> {
  const config = await loadExtensionsConfig(projectPath);
  const next = new Set(config.enabled);
  if (enabled) {
    next.add(extensionId);
  } else {
    next.delete(extensionId);
  }
  await saveExtensionsConfig(projectPath, { enabled: Array.from(next) });
}

export async function createExtension(
  projectPath: string,
  id: string,
  name: string,
  description: string,
  body: string
): Promise<void> {
  const frontMatter = `---\nname: ${name}\ndescription: ${description}\n---\n\n`;
  await invoke('write_extension_file', {
    projectPath,
    extensionId: id,
    content: frontMatter + body,
  });
  await toggleExtension(projectPath, id, true);
}

export async function getEnabledExtensionPaths(
  projectPath: string
): Promise<string[]> {
  const [extensions, config] = await Promise.all([
    scanExtensions(projectPath),
    loadExtensionsConfig(projectPath),
  ]);
  const enabledSet = new Set(config.enabled);
  return extensions.filter((e) => enabledSet.has(e.id)).map((e) => e.path);
}

export async function readExtensionContent(extPath: string): Promise<string> {
  return invoke<string>('read_text_file', { path: extPath });
}

export async function saveExtensionContent(
  projectPath: string,
  extensionId: string,
  content: string
): Promise<void> {
  await invoke('write_extension_file', { projectPath, extensionId, content });
}

export async function deleteExtension(
  projectPath: string,
  extensionId: string
): Promise<void> {
  await invoke('delete_extension', { projectPath, extensionId });
  await toggleExtension(projectPath, extensionId, false);
}
