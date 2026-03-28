import { invoke } from '@tauri-apps/api/core';
import type { HarnessDefinition, HarnessTemplateInfo } from '../types/harness';

// ── Built-in templates ──

const SDD_TEMPLATE: HarnessDefinition = {
  id: 'sdd-standard',
  name: 'Plan-Implement-Verify',
  description: 'Planner → Implementer → Verifier relay pattern',
  builtin: true,
  nodes: [
    { id: 'n-planner', type: 'agent', position: { x: 100, y: 200 }, agent: { agentId: 'Planner' } },
    { id: 'n-impl', type: 'agent', position: { x: 400, y: 200 }, agent: { agentId: 'Implementer' } },
    { id: 'n-verifier', type: 'agent', position: { x: 700, y: 200 }, agent: { agentId: 'Verifier' } },
  ],
  connections: [
    { id: 'e-plan-impl', sourceNodeId: 'n-planner', targetNodeId: 'n-impl' },
    { id: 'e-impl-verify', sourceNodeId: 'n-impl', targetNodeId: 'n-verifier' },
  ],
  failureRoutes: [],
  inputs: [
    { name: 'task', description: 'What to work on', required: true },
  ],
};

const BUGFIX_TEMPLATE: HarnessDefinition = {
  id: 'bugfix',
  name: 'Analyze-Fix-Verify',
  description: 'Analyzer → Implementer → Verifier',
  builtin: true,
  nodes: [
    { id: 'n-analyzer', type: 'agent', position: { x: 100, y: 200 }, agent: { agentId: 'Analyzer' } },
    { id: 'n-impl', type: 'agent', position: { x: 400, y: 200 }, agent: { agentId: 'Implementer' } },
    { id: 'n-verifier', type: 'agent', position: { x: 700, y: 200 }, agent: { agentId: 'Verifier' } },
  ],
  connections: [
    { id: 'e-analyze-impl', sourceNodeId: 'n-analyzer', targetNodeId: 'n-impl' },
    { id: 'e-impl-verify', sourceNodeId: 'n-impl', targetNodeId: 'n-verifier' },
  ],
  failureRoutes: [],
  inputs: [
    { name: 'bug', description: 'Bug description', required: true },
  ],
};

const BUILTIN_TEMPLATES: HarnessDefinition[] = [SDD_TEMPLATE, BUGFIX_TEMPLATE];

// ── Public API ──

export function getBuiltinTemplates(): HarnessTemplateInfo[] {
  return BUILTIN_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    builtin: true,
  }));
}

export function getBuiltinTemplateById(id: string): HarnessDefinition | null {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;
}

export async function listAllTemplates(
  projectPath: string
): Promise<HarnessTemplateInfo[]> {
  const builtins = getBuiltinTemplates();
  const userTemplates = await invoke<HarnessTemplateInfo[]>(
    'list_harness_templates',
    { projectPath }
  );
  return [...builtins, ...userTemplates];
}

export async function loadTemplate(
  projectPath: string,
  templateId: string
): Promise<HarnessDefinition> {
  const builtin = getBuiltinTemplateById(templateId);
  if (builtin) return structuredClone(builtin);

  const content = await invoke<string>('read_harness_template', {
    projectPath,
    templateId,
  });
  return JSON.parse(content) as HarnessDefinition;
}

export async function saveAsTemplate(
  projectPath: string,
  harness: HarnessDefinition,
  templateId: string,
  name: string
): Promise<void> {
  const template: HarnessDefinition = {
    ...harness,
    id: templateId,
    name,
    builtin: false,
  };
  await invoke('write_harness_template', {
    projectPath,
    templateId,
    content: JSON.stringify(template, null, 2),
  });
}

export async function deleteTemplate(
  projectPath: string,
  templateId: string
): Promise<void> {
  await invoke('delete_harness_template', { projectPath, templateId });
}

export const DEFAULT_TEMPLATE_ID = 'sdd-standard';
