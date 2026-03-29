import { invoke } from '@tauri-apps/api/core';
import type {
  HarnessDefinition,
  HarnessConnection,
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
    id: 'default',
    name: 'Default Harness',
    description: 'A simple single-agent harness',
    nodes: [
      {
        id: 'node-1',
        type: 'agent',
        position: { x: 250, y: 200 },
        agent: { agentId: 'Implementer' },
      },
    ],
    connections: [],
    failureRoutes: [],
    inputs: [
      { name: 'task', description: 'What to work on', required: true, filename: 'requirements.md' },
    ],
  };
}

// === Built-in Templates ===

export function getBuiltinHarnessTemplates(): HarnessDefinition[] {
  return [developTemplate(), fixTemplate(), reviewTemplate()];
}

function developTemplate(): HarnessDefinition {
  return {
    id: 'builtin-develop',
    name: 'Develop',
    description: 'Plan → Code (with build constraint) → Review',
    builtin: true,
    nodes: [
      { id: 'planner', type: 'agent', position: { x: 100, y: 200 }, agent: { agentId: 'Planner' } },
      {
        id: 'coder', type: 'agent', position: { x: 400, y: 200 },
        agent: {
          agentId: 'Implementer',
          constraints: [{ name: 'build-pass', check: { type: 'shell', command: 'npm run build' }, onFail: { type: 'retry' }, maxRetries: 3 }],
        },
      },
      { id: 'reviewer', type: 'agent', position: { x: 700, y: 200 }, agent: { agentId: 'Verifier' } },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'planner', targetNodeId: 'coder' },
      { id: 'c2', sourceNodeId: 'coder', targetNodeId: 'reviewer' },
    ],
    failureRoutes: [],
    inputs: [{ name: 'task', description: 'Feature or task description', required: true, filename: 'requirements.md' }],
  };
}

function fixTemplate(): HarnessDefinition {
  return {
    id: 'builtin-fix',
    name: 'Fix',
    description: 'Diagnose → Fix (with build+test constraints)',
    builtin: true,
    nodes: [
      { id: 'diagnostor', type: 'agent', position: { x: 100, y: 200 }, agent: { agentId: 'Analyzer' } },
      {
        id: 'fixer', type: 'agent', position: { x: 400, y: 200 },
        agent: {
          agentId: 'Implementer',
          constraints: [
            { name: 'build-pass', check: { type: 'shell', command: 'npm run build' }, onFail: { type: 'retry' }, maxRetries: 3 },
            { name: 'tests-pass', check: { type: 'shell', command: 'npm test' }, onFail: { type: 'retry' }, maxRetries: 2 },
          ],
        },
      },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'diagnostor', targetNodeId: 'fixer' }],
    failureRoutes: [],
    inputs: [{ name: 'bugReport', description: 'Bug description or error log', required: true, filename: 'requirements.md' }],
  };
}

function reviewTemplate(): HarnessDefinition {
  return {
    id: 'builtin-review',
    name: 'Review',
    description: 'Analyze → Review → Gate (human approval)',
    builtin: true,
    nodes: [
      { id: 'analyzer', type: 'agent', position: { x: 100, y: 200 }, agent: { agentId: 'Analyzer' } },
      { id: 'reviewer', type: 'agent', position: { x: 400, y: 200 }, agent: { agentId: 'Verifier' } },
      { id: 'approval', type: 'gate', position: { x: 700, y: 200 }, gate: { gateMessage: 'Review the analysis and review report before approving' } },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'analyzer', targetNodeId: 'reviewer' },
      { id: 'c2', sourceNodeId: 'reviewer', targetNodeId: 'approval' },
    ],
    failureRoutes: [],
    inputs: [{ name: 'codeContext', description: 'Code or PR to review', required: true, filename: 'requirements.md' }],
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
