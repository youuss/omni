import { runAgent } from './claude/claude-runner';
import type { AgentDefinition, HarnessDefinition, HarnessConnection, NodeStatus } from '../types/harness';
import type { SDKMessage, AgentRunHandle } from '../types/claude';

export interface NodeState {
  nodeId: string;
  agentId: string;
  status: NodeStatus;
  error?: string;
}

export interface ExecutorCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, error?: string) => void;
  onNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  onEvent: (nodeId: string, event: SDKMessage) => void;
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onHarnessDone: (success: boolean) => void;
}

interface ExecutorContext {
  projectPath: string;
  runId: string;
}

function topoSort(
  nodeIds: string[],
  connections: HarnessConnection[]
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
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

  if (sorted.length !== nodeIds.length) {
    throw new Error('Harness contains circular dependencies');
  }

  return sorted;
}

function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

export class HarnessExecutor {
  private harness: HarnessDefinition;
  private agents: Map<string, AgentDefinition>;
  private context: ExecutorContext;
  private callbacks: ExecutorCallbacks;
  private nodeStates: Map<string, NodeState>;
  private aborted = false;
  private currentHandle: AgentRunHandle | null = null;

  constructor(
    harness: HarnessDefinition,
    agents: Map<string, AgentDefinition>,
    context: ExecutorContext,
    callbacks: ExecutorCallbacks
  ) {
    this.harness = harness;
    this.agents = agents;
    this.context = context;
    this.callbacks = callbacks;
    this.nodeStates = new Map();

    for (const node of harness.nodes) {
      this.nodeStates.set(node.id, {
        nodeId: node.id,
        agentId: node.agentId,
        status: 'idle',
      });
    }
  }

  async execute(): Promise<void> {
    const nodeIds = this.harness.nodes.map((n) => n.id);
    let order: string[];

    try {
      order = topoSort(nodeIds, this.harness.connections);
    } catch (e) {
      this.callbacks.onHarnessDone(false);
      throw e;
    }

    for (const id of order) {
      this.callbacks.onNodeStatusChange(id, 'waiting');
    }

    let allSuccess = true;

    for (const nodeId of order) {
      if (this.aborted) {
        this.callbacks.onNodeStatusChange(nodeId, 'skipped');
        allSuccess = false;
        continue;
      }

      const predecessorFailed = this.harness.connections
        .filter((c) => c.targetNodeId === nodeId)
        .some((c) => this.nodeStates.get(c.sourceNodeId)?.status === 'failure');

      if (predecessorFailed) {
        this.callbacks.onNodeStatusChange(nodeId, 'skipped');
        allSuccess = false;
        continue;
      }

      try {
        await this.executeNode(nodeId);
      } catch {
        allSuccess = false;
      }
    }

    this.callbacks.onHarnessDone(allSuccess);
  }

  async executeNode(nodeId: string): Promise<void> {
    const harnessNode = this.harness.nodes.find((n) => n.id === nodeId);
    if (!harnessNode) throw new Error(`Node ${nodeId} not found`);

    const agentDef = this.agents.get(harnessNode.agentId);
    if (!agentDef) throw new Error(`Agent ${harnessNode.agentId} not found`);

    this.callbacks.onNodeStatusChange(nodeId, 'running');

    const vars: Record<string, string> = {
      runId: this.context.runId,
    };

    const prompt = agentDef.promptTemplate
      ? interpolateTemplate(agentDef.promptTemplate, vars)
      : `Execute ${agentDef.name} task`;

    // Build overrides from node constraints
    const nodeOverrides: Record<string, { maxTurns?: number; allowedTools?: string[]; promptExtra?: string }> = {};
    const maxTurns = harnessNode.constraints?.maxTurns ?? agentDef.maxTurns;
    const allowedTools = harnessNode.constraints?.allowedTools ?? agentDef.allowedTools;

    nodeOverrides[harnessNode.agentId] = {
      ...(maxTurns && { maxTurns }),
      ...(allowedTools?.length && { allowedTools }),
      ...(harnessNode.constraints?.promptExtra && { promptExtra: harnessNode.constraints.promptExtra }),
    };

    const state = this.nodeStates.get(nodeId)!;

    return new Promise<void>((resolve, reject) => {
      runAgent({
        projectPath: this.context.projectPath,
        agentNames: [harnessNode.agentId],
        prompt,
        runId: this.context.runId,
        overrides: nodeOverrides,
        onEvent: (event) => this.callbacks.onEvent(nodeId, event),
        onStatus: (text) => this.callbacks.onStatus(nodeId, text),
        onError: (text) => this.callbacks.onError(nodeId, text),
        onDone: (code) => {
          this.currentHandle = null;
          const success = code === 0;
          state.status = success ? 'success' : 'failure';

          if (!success) {
            state.error = `Exit code ${code}`;
          }

          this.callbacks.onNodeStatusChange(
            nodeId,
            success ? 'success' : 'failure',
            state.error
          );

          if (success) {
            this.callbacks.onNodeOutputs(nodeId, {});
          }

          success ? resolve() : reject(new Error(state.error));
        },
      }).then((handle) => {
        this.currentHandle = handle;
      }).catch((e) => {
        state.status = 'failure';
        state.error = String(e);
        this.callbacks.onNodeStatusChange(nodeId, 'failure', state.error);
        reject(e);
      });
    });
  }

  abort(): void {
    this.aborted = true;
    this.currentHandle?.abort();
  }
}
