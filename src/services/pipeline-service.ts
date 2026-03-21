import { invoke } from '@tauri-apps/api/core';
import type {
  PipelineDefinition,
  PipelineEdge,
  AgentMeta,
  TabDescriptor,
} from '../types/pipeline';
import { loadTemplate, DEFAULT_TEMPLATE_ID } from './pipeline-template-service';

export async function loadProjectPipeline(
  projectPath: string
): Promise<PipelineDefinition | null> {
  const content = await invoke<string>('read_project_pipeline', { projectPath });
  if (!content) return null;
  try {
    return JSON.parse(content) as PipelineDefinition;
  } catch {
    return null;
  }
}

export async function saveProjectPipeline(
  projectPath: string,
  pipeline: PipelineDefinition
): Promise<void> {
  await invoke('write_project_pipeline', {
    projectPath,
    content: JSON.stringify(pipeline, null, 2),
  });
}

/** Load pipeline for a specific template id, fallback to SDD */
export async function loadPipelineForTemplate(
  projectPath: string,
  templateId?: string
): Promise<PipelineDefinition> {
  return loadTemplate(projectPath, templateId ?? DEFAULT_TEMPLATE_ID);
}

/** Legacy: ensure a default pipeline.json exists (backward compat) */
export async function ensureDefaultPipeline(
  projectPath: string
): Promise<PipelineDefinition> {
  const existing = await loadProjectPipeline(projectPath);
  if (existing) return existing;
  const def = await loadTemplate(projectPath, DEFAULT_TEMPLATE_ID);
  await saveProjectPipeline(projectPath, def);
  return def;
}

export function getDefaultPipeline(): PipelineDefinition {
  // Synchronous fallback for cases that can't await
  return {
    id: DEFAULT_TEMPLATE_ID,
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
}

function topoSort(
  nodes: { id: string }[],
  edges: PipelineEdge[]
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }

  for (const edge of edges) {
    const prev = inDegree.get(edge.target) ?? 0;
    inDegree.set(edge.target, prev + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

function interpolate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

export function deriveTabs(
  pipeline: PipelineDefinition,
  agents: AgentMeta[],
  changeName: string
): TabDescriptor[] {
  const order = topoSort(pipeline.nodes, pipeline.edges);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const tabs: TabDescriptor[] = [];
  const seenFiles = new Set<string>();

  for (const nodeId of order) {
    const node = pipeline.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const agent = agentMap.get(node.agentId);
    if (!agent) continue;

    for (const port of agent.inputPorts) {
      if (port.type !== 'file' || !port.defaultValue) continue;
      const hasIncoming = pipeline.edges.some(
        (e) => e.target === nodeId && e.targetPort === port.id
      );
      if (hasIncoming) continue;

      const filePath = interpolate(port.defaultValue, { changeName });
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      tabs.push({
        id: `${nodeId}-${port.id}`,
        label: port.name,
        filePath,
        editable: true,
        nodeId,
        portId: port.id,
        portType: 'input',
        category: agent.category,
      });
    }

    for (const port of agent.outputPorts) {
      if (port.type !== 'file' || !port.defaultValue) continue;

      const filePath = interpolate(port.defaultValue, { changeName });
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      tabs.push({
        id: `${nodeId}-${port.id}`,
        label: port.name,
        filePath,
        editable: port.editable ?? false,
        nodeId,
        portId: port.id,
        portType: 'output',
        category: agent.category,
      });
    }
  }

  return tabs;
}
