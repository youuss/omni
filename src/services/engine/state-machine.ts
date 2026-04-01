import { runAgent } from '../claude/claude-runner';
import { checkAllConstraints } from './constraint-checker';
import { assemblePrompt } from './prompt-assembler';
import { appendNodeLog, appendExecutionLog, createLogEvent, createExecutionEvent } from './logger';
import type {
  HarnessDefinition,
  HarnessNode,
  AgentDefinition,
  NodeStatus,
} from '../../types/harness';
import type {
  NodeContext,
  ConstraintFailure,
  ExecutionState,
  StateMachineCallbacks,
} from '../../types/engine';
import type { AgentRunHandle, SDKMessage } from '../../types/claude';
import type { SkillMeta } from '../../types/skill';
import { resolveAgentSkills, buildSkillBindings } from '../skill-service';
import { writeRunFile } from '../run-service';

const DEFAULT_MAX_RETRIES = 3;

export interface StateMachineOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: StateMachineCallbacks;
  extensions?: string[];
  skills?: SkillMeta[];
  startFromNodeId?: string;
  stepMode?: boolean;
}

interface NodeRuntime {
  status: NodeStatus;
  attempt: number;
  error?: string;
  constraintFailure?: ConstraintFailure;
}

export class StateMachine {
  private nodeStates: Map<string, NodeRuntime> = new Map();
  private contexts: Map<string, NodeContext> = new Map();
  private activeHandles: Map<string, AgentRunHandle> = new Map();
  private aborted = false;
  private startedAt = Date.now();

  constructor(private opts: StateMachineOptions) {}

  async execute(): Promise<void> {
    const { harness, callbacks, runId, projectPath } = this.opts;

    // Initialize node states
    for (const node of harness.nodes) {
      this.nodeStates.set(node.id, { status: 'pending', attempt: 0 });
    }

    // Mark entry nodes (no incoming connections) as ready
    const hasIncoming = new Set(harness.connections.map((c) => c.targetNodeId));
    for (const node of harness.nodes) {
      if (!hasIncoming.has(node.id)) {
        this.setNodeStatus(node.id, 'ready');
      }
    }

    // Log harness start
    await appendExecutionLog(projectPath, runId, createExecutionEvent('harness_start', {
      harnessId: harness.id,
      nodes: harness.nodes.map((n) => n.id),
    }));

    // Event loop
    while (!this.aborted) {
      const readyNodes = this.getNodesByStatus('ready');
      if (readyNodes.length === 0) {
        const running = this.getNodesByStatus('running');
        const checking = this.getNodesByStatus('checking');
        const waiting = this.getNodesByStatus('waiting');
        if (running.length === 0 && checking.length === 0 && waiting.length === 0) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      // Dispatch all ready nodes in parallel
      const dispatches = readyNodes.map((nodeId) => this.dispatchNode(nodeId));
      await Promise.all(dispatches);

      // In step mode, pause after each batch
      if (this.opts.stepMode) {
        const nextReady = this.getNodesByStatus('ready');
        if (nextReady.length > 0) {
          const shouldContinue = await callbacks.onGateWait('__step_mode__', 'Step mode: continue to next nodes?');
          if (!shouldContinue) {
            this.aborted = true;
            break;
          }
        }
      }
    }

    // Determine success
    const allCompleted = harness.nodes.every((n) => {
      const state = this.nodeStates.get(n.id);
      return state?.status === 'completed' || state?.status === 'skipped';
    });

    await appendExecutionLog(projectPath, runId, createExecutionEvent('harness_end', {
      success: allCompleted,
      durationMs: Date.now() - this.startedAt,
    }));

    await this.persistState();
    callbacks.onDone(allCompleted);
  }

  private async dispatchNode(nodeId: string): Promise<void> {
    const { harness, projectPath, runId } = this.opts;
    const node = harness.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const runtime = this.nodeStates.get(nodeId)!;
    this.setNodeStatus(nodeId, 'running');

    await appendExecutionLog(projectPath, runId, createExecutionEvent('node_dispatch', {
      nodeId,
      attempt: runtime.attempt,
    }));

    try {
      switch (node.type) {
        case 'agent':
          await this.executeAgentNode(node, runtime);
          break;
        case 'condition':
          await this.executeConditionNode(node);
          break;
        case 'gate':
          await this.executeGateNode(node);
          break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setNodeStatus(nodeId, 'failed', msg);
      await appendNodeLog(projectPath, runId, nodeId, runtime.attempt,
        createLogEvent('error', { nodeId, message: msg }));
      await appendExecutionLog(projectPath, runId, createExecutionEvent('node_failed', {
        nodeId, error: msg,
      }));
    }
  }

  private executeAgentNode(node: HarnessNode, runtime: NodeRuntime): Promise<void> {
    const { harness, agents, callbacks, projectPath, runId, extensions, skills } = this.opts;
    const agentId = node.agent?.agentId || '';
    const agent = agents.find((a) => a.id === agentId || a.name === agentId);
    if (!agent) {
      this.setNodeStatus(node.id, 'failed', `Agent not found: ${agentId}`);
      return Promise.resolve();
    }

    // Resolve bound skills for this node
    const skillIds = resolveAgentSkills(agent, node.agent?.overrides);
    const boundSkills = skills ? buildSkillBindings(skillIds, skills) : [];
    const nodeSkills = skills?.filter((s) => skillIds.includes(s.id));

    // Assemble prompt (with skill metadata for Level 1)
    const prompt = assemblePrompt({
      node,
      agent,
      allNodes: harness.nodes,
      connections: harness.connections,
      allContexts: Object.fromEntries(this.contexts),
      extensions,
      skills: nodeSkills,
      constraintFailure: runtime.constraintFailure,
    });

    const startTime = Date.now();

    // Wrap in a promise that resolves when the agent run completes
    return new Promise<void>((resolve, reject) => {
      appendNodeLog(projectPath, runId, node.id, runtime.attempt,
        createLogEvent('node_start', { nodeId: node.id, attempt: runtime.attempt }))
        .then(() => runAgent({
          projectPath,
          agentNames: [agent.name],
          prompt,
          runId,
          skills: boundSkills,
          onEvent: (event: SDKMessage) => {
            callbacks.onSdkEvent(node.id, event);
            appendNodeLog(projectPath, runId, node.id, runtime.attempt,
              createLogEvent('sdk_message', { data: event })).catch(() => {});
          },
          onError: (text: string) => callbacks.onError(node.id, text),
          onStatus: (text: string) => callbacks.onStatus(node.id, text),
          onDone: (code: number | null) => {
            this.handleAgentDone(node, runtime, code, startTime)
              .then(resolve)
              .catch(reject);
          },
          model: node.agent?.overrides?.model || harness.defaults?.model,
          maxBudgetUsd: node.agent?.overrides?.maxBudgetUsd || harness.defaults?.maxBudgetUsd,
          permissionMode: node.agent?.overrides?.permissionMode || harness.defaults?.permissionMode || 'bypassPermissions',
        }))
        .then((handle) => {
          this.activeHandles.set(node.id, handle);
        })
        .catch(reject);
    });
  }

  private async handleAgentDone(
    node: HarnessNode,
    runtime: NodeRuntime,
    code: number | null,
    startTime: number
  ): Promise<void> {
    const { projectPath, runId, callbacks } = this.opts;

    await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
      createLogEvent('node_end', { nodeId: node.id, exitCode: code, durationMs: Date.now() - startTime }));

    // Build node context
    const context: NodeContext = {
      nodeId: node.id,
      outputs: {}, // TODO: collect from agent outputs
      exitCode: code ?? undefined,
      metadata: {},
    };
    this.contexts.set(node.id, context);
    callbacks.onNodeContext(node.id, context);

    // Check constraints
    const constraints = node.agent?.constraints || [];
    if (constraints.length > 0) {
      this.setNodeStatus(node.id, 'checking');
      await this.checkNodeConstraints(node, runtime, context);
    } else {
      this.setNodeStatus(node.id, 'completed');
      await appendExecutionLog(projectPath, runId, createExecutionEvent('node_complete', {
        nodeId: node.id,
        exitCode: context.exitCode,
        logFile: `logs/${node.id}.${runtime.attempt}.jsonl`,
      }));
      if (node.agent?.routing) {
        this.applyDynamicRouting(node, context);
      } else {
        this.advanceDownstream(node.id);
      }
    }

    this.activeHandles.delete(node.id);
  }

  private async checkNodeConstraints(node: HarnessNode, runtime: NodeRuntime, context: NodeContext): Promise<void> {
    const { projectPath, runId } = this.opts;
    const constraints = node.agent?.constraints || [];
    const allContexts = Object.fromEntries(this.contexts);

    const { allPassed, results, failedConstraint, failedResult } = await checkAllConstraints(
      constraints, context, allContexts, projectPath
    );

    // Log each constraint check
    for (const r of results) {
      await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
        createLogEvent('constraint_check', {
          name: r.name,
          passed: r.passed,
          exitCode: r.exitCode,
          stdout: r.stdout,
          stderr: r.stderr,
        }));
    }

    if (allPassed) {
      this.setNodeStatus(node.id, 'completed');
      await appendExecutionLog(projectPath, runId, createExecutionEvent('node_complete', {
        nodeId: node.id,
        exitCode: context.exitCode,
        logFile: `logs/${node.id}.${runtime.attempt}.jsonl`,
      }));
      if (node.agent?.routing) {
        this.applyDynamicRouting(node, context);
      } else {
        this.advanceDownstream(node.id);
      }
      return;
    }

    // Constraint failed
    const maxRetries = failedConstraint!.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (runtime.attempt >= maxRetries) {
      this.setNodeStatus(node.id, 'failed', `Constraint "${failedConstraint!.name}" failed after ${maxRetries} retries`);
      return;
    }

    const failure: ConstraintFailure = {
      constraintName: failedConstraint!.name,
      checkType: failedConstraint!.check.type,
      command: failedConstraint!.check.type === 'shell' ? (failedConstraint!.check as { type: 'shell'; command: string }).command : undefined,
      exitCode: failedResult!.exitCode,
      stdout: failedResult!.stdout,
      stderr: failedResult!.stderr,
      attempt: runtime.attempt,
      sourceNodeId: node.id,
      sourceNodeContext: context,
    };

    const action = failedConstraint!.onFail;

    switch (action.type) {
      case 'retry':
        runtime.attempt++;
        runtime.constraintFailure = failure;
        this.setNodeStatus(node.id, 'ready');
        await appendNodeLog(projectPath, runId, node.id, runtime.attempt,
          createLogEvent('constraint_retry', {
            attempt: runtime.attempt,
            reason: `${failedConstraint!.name} failed`,
          }));
        break;

      case 'route': {
        const targetNodeId = action.targetNodeId;
        const targetRuntime = this.nodeStates.get(targetNodeId);
        if (targetRuntime) {
          targetRuntime.constraintFailure = failure;
          this.setNodeStatus(targetNodeId, 'ready');
        }
        await appendExecutionLog(projectPath, runId, createExecutionEvent('constraint_route', {
          fromNode: node.id,
          constraint: failedConstraint!.name,
          toNode: targetNodeId,
        }));
        this.setNodeStatus(node.id, 'failed', `Routed to ${targetNodeId}`);
        break;
      }

      case 'abort':
        this.setNodeStatus(node.id, 'failed', `Constraint "${failedConstraint!.name}" failed, aborting`);
        this.aborted = true;
        break;
    }
  }

  private async executeConditionNode(node: HarnessNode): Promise<void> {
    const { projectPath, runId } = this.opts;
    const config = node.condition;
    if (!config) return;

    const nodes: Record<string, unknown> = {};
    for (const [id, ctx] of this.contexts) {
      nodes[id] = { exitCode: ctx.exitCode, outputs: ctx.outputs, metadata: ctx.metadata };
    }

    try {
      const fn = new Function('nodes', `return String(${config.expression})`);
      const result = fn(nodes);

      await appendNodeLog(projectPath, runId, node.id, 0,
        createLogEvent('condition_eval', {
          nodeId: node.id,
          expression: config.expression,
          result,
          branch: config.branches[result] ? result : 'default',
        }));

      await appendExecutionLog(projectPath, runId, createExecutionEvent('condition_branch', {
        nodeId: node.id,
        branch: result,
      }));

      this.contexts.set(node.id, {
        nodeId: node.id,
        outputs: { result },
        exitCode: 0,
        metadata: { branch: result },
      });

      this.setNodeStatus(node.id, 'completed');

      // Activate selected branch, skip others
      const selectedTargetId = config.branches[result];
      for (const [, targetId] of Object.entries(config.branches)) {
        if (targetId === selectedTargetId) {
          this.setNodeStatus(targetId, 'ready');
        } else {
          this.setNodeStatus(targetId, 'skipped');
          await appendExecutionLog(projectPath, runId, createExecutionEvent('node_skipped', {
            nodeId: targetId,
            reason: `Condition branch not selected`,
          }));
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setNodeStatus(node.id, 'failed', `Condition eval error: ${msg}`);
    }
  }

  private async executeGateNode(node: HarnessNode): Promise<void> {
    const { projectPath, runId, callbacks } = this.opts;

    this.setNodeStatus(node.id, 'waiting');
    await appendNodeLog(projectPath, runId, node.id, 0,
      createLogEvent('gate_wait', { nodeId: node.id, message: node.gate?.gateMessage }));

    const shouldContinue = await callbacks.onGateWait(node.id, node.gate?.gateMessage);

    await appendNodeLog(projectPath, runId, node.id, 0,
      createLogEvent('gate_resume', { nodeId: node.id }));

    if (shouldContinue) {
      this.contexts.set(node.id, {
        nodeId: node.id,
        outputs: {},
        exitCode: 0,
        metadata: { approved: true },
      });
      this.setNodeStatus(node.id, 'completed');
      this.advanceDownstream(node.id);
    } else {
      this.setNodeStatus(node.id, 'failed', 'Gate rejected by user');
    }
  }

  private advanceDownstream(completedNodeId: string): void {
    const { harness } = this.opts;

    const downstream = harness.connections
      .filter((c) => c.sourceNodeId === completedNodeId)
      .map((c) => c.targetNodeId);

    for (const targetId of downstream) {
      const upstreamIds = harness.connections
        .filter((c) => c.targetNodeId === targetId)
        .map((c) => c.sourceNodeId);

      const allUpstreamDone = upstreamIds.every((id) => {
        const state = this.nodeStates.get(id);
        return state?.status === 'completed';
      });

      if (allUpstreamDone) {
        const targetState = this.nodeStates.get(targetId);
        if (targetState && targetState.status === 'pending') {
          this.setNodeStatus(targetId, 'ready');
        }
      }
    }
  }

  private applyDynamicRouting(node: HarnessNode, context: NodeContext): void {
    const routing = node.agent?.routing;
    if (!routing) return;

    const decision = context.outputs[routing.outputKey] || '';
    const selectedNodeId = routing.branches[decision] || routing.defaultBranch;

    const { harness } = this.opts;
    const downstream = harness.connections
      .filter((c) => c.sourceNodeId === node.id)
      .map((c) => c.targetNodeId);

    for (const targetId of downstream) {
      if (targetId === selectedNodeId) {
        this.setNodeStatus(targetId, 'ready');
      } else {
        this.setNodeStatus(targetId, 'skipped');
      }
    }
  }

  private setNodeStatus(nodeId: string, status: NodeStatus, error?: string): void {
    const runtime = this.nodeStates.get(nodeId);
    if (runtime) {
      runtime.status = status;
      if (error) runtime.error = error;
    }
    this.opts.callbacks.onNodeStatusChange(nodeId, status, runtime?.attempt ?? 0, error);
  }

  private getNodesByStatus(status: NodeStatus): string[] {
    const result: string[] = [];
    for (const [id, state] of this.nodeStates) {
      if (state.status === status) result.push(id);
    }
    return result;
  }

  private async persistState(): Promise<void> {
    const { projectPath, runId, harness } = this.opts;
    const state: ExecutionState = {
      harnessId: harness.id,
      runId,
      nodeStates: Object.fromEntries(
        Array.from(this.nodeStates.entries()).map(([id, s]) => [id, {
          status: s.status,
          attempt: s.attempt,
          error: s.error,
        }])
      ),
      contexts: Object.fromEntries(this.contexts),
      startedAt: new Date(this.startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeRunFile(projectPath, runId, 'state.json', JSON.stringify(state, null, 2));
  }

  abort(): void {
    this.aborted = true;
    for (const handle of this.activeHandles.values()) {
      handle.abort();
    }
  }
}
