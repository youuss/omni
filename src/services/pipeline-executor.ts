import { runAgent } from './claude/claude-runner';
import type { AgentMeta, PipelineDefinition, PipelineEdge, NodeExecutionStatus } from '../types/pipeline';
import type { ClaudeStreamEvent, AgentRunHandle } from '../types/claude';

export interface NodeState {
  nodeId: string;
  agentId: string;
  status: NodeExecutionStatus;
  resolvedInputs: Record<string, string>;
  outputs: Record<string, string>;
  error?: string;
}

export interface ExecutorCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeExecutionStatus, error?: string) => void;
  onNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  onEvent: (nodeId: string, event: ClaudeStreamEvent) => void;
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onPipelineDone: (success: boolean) => void;
}

interface ExecutorContext {
  projectPath: string;
  changeName: string;
}

function topoSort(
  nodeIds: string[],
  edges: PipelineEdge[]
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
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

  if (sorted.length !== nodeIds.length) {
    throw new Error('Pipeline 存在循环依赖');
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

export class PipelineExecutor {
  private pipeline: PipelineDefinition;
  private agents: Map<string, AgentMeta>;
  private context: ExecutorContext;
  private callbacks: ExecutorCallbacks;
  private nodeStates: Map<string, NodeState>;
  private aborted = false;
  private currentHandle: AgentRunHandle | null = null;

  constructor(
    pipeline: PipelineDefinition,
    agents: Map<string, AgentMeta>,
    context: ExecutorContext,
    callbacks: ExecutorCallbacks
  ) {
    this.pipeline = pipeline;
    this.agents = agents;
    this.context = context;
    this.callbacks = callbacks;
    this.nodeStates = new Map();

    for (const node of pipeline.nodes) {
      this.nodeStates.set(node.id, {
        nodeId: node.id,
        agentId: node.agentId,
        status: 'idle',
        resolvedInputs: {},
        outputs: {},
      });
    }
  }

  async execute(): Promise<void> {
    const nodeIds = this.pipeline.nodes.map((n) => n.id);
    let order: string[];

    try {
      order = topoSort(nodeIds, this.pipeline.edges);
    } catch (e) {
      this.callbacks.onPipelineDone(false);
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

      const predecessorFailed = this.pipeline.edges
        .filter((e) => e.target === nodeId)
        .some((e) => this.nodeStates.get(e.source)?.status === 'failure');

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

    this.callbacks.onPipelineDone(allSuccess);
  }

  async executeNode(nodeId: string): Promise<void> {
    const pipelineNode = this.pipeline.nodes.find((n) => n.id === nodeId);
    if (!pipelineNode) throw new Error(`节点 ${nodeId} 不存在`);

    const agentMeta = this.agents.get(pipelineNode.agentId);
    if (!agentMeta) throw new Error(`Agent ${pipelineNode.agentId} 未找到`);

    this.callbacks.onNodeStatusChange(nodeId, 'running');

    const resolvedInputs = this.resolveInputs(nodeId, agentMeta);
    const state = this.nodeStates.get(nodeId)!;
    state.resolvedInputs = resolvedInputs;

    const allVars: Record<string, string> = {
      ...resolvedInputs,
      changeName: this.context.changeName,
    };

    for (const port of agentMeta.outputPorts) {
      if (port.defaultValue) {
        const resolved = interpolateTemplate(port.defaultValue, { changeName: this.context.changeName });
        allVars[port.id] = resolved;
        state.outputs[port.id] = resolved;
      }
    }

    let prompt = agentMeta.promptTemplate
      ? interpolateTemplate(agentMeta.promptTemplate, allVars)
      : `执行 ${agentMeta.name} 任务`;

    if (pipelineNode.configOverrides?.promptExtra) {
      prompt += `\n\n---\n附加指令：\n${pipelineNode.configOverrides.promptExtra}`;
    }

    const maxTurns = pipelineNode.configOverrides?.maxTurns ?? agentMeta.maxTurns;
    const allowedTools = pipelineNode.configOverrides?.allowedTools ?? agentMeta.allowedTools;

    return new Promise<void>((resolve, reject) => {
      runAgent({
        agentName: pipelineNode.agentId,
        prompt,
        cwd: this.context.projectPath,
        changeName: this.context.changeName,
        maxTurnsOverride: maxTurns,
        allowedToolsOverride: allowedTools,
        onEvent: (event) => this.callbacks.onEvent(nodeId, event),
        onStatus: (text) => this.callbacks.onStatus(nodeId, text),
        onError: (text) => this.callbacks.onError(nodeId, text),
        onDone: (code) => {
          this.currentHandle = null;
          const success = code === 0;
          state.status = success ? 'success' : 'failure';

          if (!success) {
            state.error = `退出码 ${code}`;
          }

          this.callbacks.onNodeStatusChange(
            nodeId,
            success ? 'success' : 'failure',
            state.error
          );

          if (success) {
            this.callbacks.onNodeOutputs(nodeId, state.outputs);
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

  private resolveInputs(
    nodeId: string,
    agentMeta: AgentMeta
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const port of agentMeta.inputPorts) {
      const incomingEdge = this.pipeline.edges.find(
        (e) => e.target === nodeId && e.targetPort === port.id
      );

      if (incomingEdge) {
        const sourceState = this.nodeStates.get(incomingEdge.source);
        const sourceValue = sourceState?.outputs[incomingEdge.sourcePort];
        if (sourceValue) {
          resolved[port.id] = sourceValue;
          continue;
        }
      }

      if (port.defaultValue) {
        resolved[port.id] = interpolateTemplate(port.defaultValue, {
          changeName: this.context.changeName,
        });
        continue;
      }

      if (port.required) {
        throw new Error(
          `节点 ${nodeId} 的必需输入端口 "${port.name}" 未连接且无默认值`
        );
      }
    }

    return resolved;
  }
}
