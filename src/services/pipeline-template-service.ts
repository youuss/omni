import { invoke } from '@tauri-apps/api/core';
import type { PipelineDefinition, PipelineTemplateInfo } from '../types/pipeline';

// ── Built-in templates ──

const SDD_TEMPLATE: PipelineDefinition = {
  id: 'sdd-standard',
  name: 'SDD 标准流程',
  description: '规划 → 实现 → 验证',
  builtin: true,
  nodes: [
    { id: 'n-planner', agentId: 'Planner', position: { x: 100, y: 200 } },
    { id: 'n-impl', agentId: 'Implementer', position: { x: 400, y: 200 } },
    { id: 'n-verifier', agentId: 'Verifier', position: { x: 700, y: 200 } },
  ],
  edges: [
    { id: 'e-plan-impl', source: 'n-planner', sourcePort: 'devPlan', target: 'n-impl', targetPort: 'devPlan' },
    { id: 'e-impl-verify', source: 'n-impl', sourcePort: 'code', target: 'n-verifier', targetPort: 'devPlan' },
  ],
};

const BUGFIX_TEMPLATE: PipelineDefinition = {
  id: 'bugfix',
  name: 'BugFix 流程',
  description: '分析 → 实现 → 验证',
  builtin: true,
  nodes: [
    { id: 'n-analyzer', agentId: 'Analyzer', position: { x: 100, y: 200 } },
    { id: 'n-impl', agentId: 'Implementer', position: { x: 400, y: 200 } },
    { id: 'n-verifier', agentId: 'Verifier', position: { x: 700, y: 200 } },
  ],
  edges: [
    { id: 'e-analyze-impl', source: 'n-analyzer', sourcePort: 'fixPlan', target: 'n-impl', targetPort: 'devPlan' },
    { id: 'e-impl-verify', source: 'n-impl', sourcePort: 'code', target: 'n-verifier', targetPort: 'devPlan' },
  ],
};

const BUILTIN_TEMPLATES: PipelineDefinition[] = [SDD_TEMPLATE, BUGFIX_TEMPLATE];

// ── Public API ──

export function getBuiltinTemplates(): PipelineTemplateInfo[] {
  return BUILTIN_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    builtin: true,
  }));
}

export function getBuiltinTemplateById(id: string): PipelineDefinition | null {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** List all templates: built-in + user-saved */
export async function listAllTemplates(
  projectPath: string
): Promise<PipelineTemplateInfo[]> {
  const builtins = getBuiltinTemplates();
  const userTemplates = await invoke<PipelineTemplateInfo[]>(
    'list_pipeline_templates',
    { projectPath }
  );
  return [...builtins, ...userTemplates];
}

/** Load a template definition by id */
export async function loadTemplate(
  projectPath: string,
  templateId: string
): Promise<PipelineDefinition> {
  // Check built-in first
  const builtin = getBuiltinTemplateById(templateId);
  if (builtin) return structuredClone(builtin);

  // Load user template
  const content = await invoke<string>('read_pipeline_template', {
    projectPath,
    templateId,
  });
  return JSON.parse(content) as PipelineDefinition;
}

/** Save current pipeline as a reusable template */
export async function saveAsTemplate(
  projectPath: string,
  pipeline: PipelineDefinition,
  templateId: string,
  name: string
): Promise<void> {
  const template: PipelineDefinition = {
    ...pipeline,
    id: templateId,
    name,
    builtin: false,
  };
  await invoke('write_pipeline_template', {
    projectPath,
    templateId,
    content: JSON.stringify(template, null, 2),
  });
}

/** Delete a user template */
export async function deleteTemplate(
  projectPath: string,
  templateId: string
): Promise<void> {
  await invoke('delete_pipeline_template', { projectPath, templateId });
}

export const DEFAULT_TEMPLATE_ID = 'sdd-standard';
