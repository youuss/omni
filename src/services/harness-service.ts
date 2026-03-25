import { invoke } from '@tauri-apps/api/core';
import type {
  HarnessDefinition,
  HarnessConnection,
  AgentDefinition,
  AgentCategory,
  FileTab,
} from '../types/harness';
import { loadTemplate, DEFAULT_TEMPLATE_ID } from './harness-template-service';

export async function loadProjectHarness(
  projectPath: string
): Promise<HarnessDefinition | null> {
  const content = await invoke<string>('read_project_harness', { projectPath });
  if (!content) return null;
  try {
    return JSON.parse(content) as HarnessDefinition;
  } catch {
    return null;
  }
}

export async function saveProjectHarness(
  projectPath: string,
  harness: HarnessDefinition
): Promise<void> {
  await invoke('write_project_harness', {
    projectPath,
    content: JSON.stringify(harness, null, 2),
  });
}

export async function loadHarnessForTemplate(
  projectPath: string,
  templateId?: string
): Promise<HarnessDefinition> {
  return loadTemplate(projectPath, templateId ?? DEFAULT_TEMPLATE_ID);
}

export async function ensureDefaultHarness(
  projectPath: string
): Promise<HarnessDefinition> {
  const existing = await loadProjectHarness(projectPath);
  if (existing) return existing;
  const def = await loadTemplate(projectPath, DEFAULT_TEMPLATE_ID);
  await saveProjectHarness(projectPath, def);
  return def;
}

export function getDefaultHarness(): HarnessDefinition {
  return {
    id: DEFAULT_TEMPLATE_ID,
    name: 'Plan-Implement-Verify',
    description: 'Planner → Implementer → Verifier',
    builtin: true,
    nodes: [
      { id: 'n-planner', agentId: 'Planner', position: { x: 100, y: 200 } },
      { id: 'n-impl', agentId: 'Implementer', position: { x: 400, y: 200 } },
      { id: 'n-verifier', agentId: 'Verifier', position: { x: 700, y: 200 } },
    ],
    connections: [
      { id: 'e-plan-impl', sourceNodeId: 'n-planner', targetNodeId: 'n-impl' },
      { id: 'e-impl-verify', sourceNodeId: 'n-impl', targetNodeId: 'n-verifier' },
    ],
  };
}

export function topoSort(
  nodes: { id: string }[],
  connections: HarnessConnection[]
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }

  for (const conn of connections) {
    const prev = inDegree.get(conn.targetNodeId) ?? 0;
    inDegree.set(conn.targetNodeId, prev + 1);
    adjacency.get(conn.sourceNodeId)?.push(conn.targetNodeId);
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

// Convention-based file tabs: derive from agent category, no manual port config needed
const CATEGORY_FILES: Record<AgentCategory, { inputs: { id: string; label: string; path: string }[]; outputs: { id: string; label: string; path: string }[] }> = {
  planner: {
    inputs: [
      { id: 'requirements', label: 'Requirements', path: '.harness/runs/{{runId}}/inputs/requirements.md' },
    ],
    outputs: [
      { id: 'dev-plan', label: 'Dev Plan', path: '.harness/runs/{{runId}}/outputs/dev-plan.md' },
    ],
  },
  implementer: {
    inputs: [],
    outputs: [],
  },
  verifier: {
    inputs: [],
    outputs: [
      { id: 'verification-report', label: 'Verification Report', path: '.harness/runs/{{runId}}/outputs/verification-report.md' },
    ],
  },
  reviewer: {
    inputs: [],
    outputs: [
      { id: 'review-report', label: 'Review Report', path: '.harness/runs/{{runId}}/outputs/review-report.md' },
    ],
  },
  custom: {
    inputs: [],
    outputs: [],
  },
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

export function deriveFileTabs(
  harness: HarnessDefinition,
  agents: AgentDefinition[],
  runId: string
): FileTab[] {
  const order = topoSort(harness.nodes, harness.connections);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const tabs: FileTab[] = [];
  const seenFiles = new Set<string>();

  // Always add requirements as the first editable input
  const reqPath = interpolate('.harness/runs/{{runId}}/inputs/requirements.md', { runId });
  tabs.push({
    id: 'global-requirements',
    label: 'Requirements',
    filePath: reqPath,
    editable: true,
    nodeId: order[0] ?? '',
    agentCategory: 'planner',
  });
  seenFiles.add(reqPath);

  for (const nodeId of order) {
    const node = harness.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const agent = agentMap.get(node.agentId);
    if (!agent) continue;

    const categoryFiles = CATEGORY_FILES[agent.category] ?? CATEGORY_FILES.custom;

    for (const file of categoryFiles.outputs) {
      const filePath = interpolate(file.path, { runId });
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      tabs.push({
        id: `${nodeId}-${file.id}`,
        label: file.label,
        filePath,
        editable: false,
        nodeId,
        agentCategory: agent.category,
      });
    }
  }

  return tabs;
}
