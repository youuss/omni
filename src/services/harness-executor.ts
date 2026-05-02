import { StateMachine } from './engine/state-machine';
import type { HarnessDefinition, AgentDefinition, NodeStatus } from '../types/harness';
import type { StateMachineCallbacks } from '../types/engine';
import type { SDKMessage } from '../types/claude';

export interface ExecutorCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, error?: string) => void;
  onNodeOutputs: (nodeId: string, outputs: Record<string, string>) => void;
  onEvent: (nodeId: string, event: SDKMessage) => void;
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onGateWait: (nodeId: string, message?: string) => Promise<boolean>;
  onHarnessDone: (success: boolean) => void;
}

interface ExecutorOptions {
  projectPath: string;
  runId: string;
  harness: HarnessDefinition;
  agents: AgentDefinition[];
  callbacks: ExecutorCallbacks;
  startFromNodeId?: string;
  stepMode?: boolean;
}

export class HarnessExecutor {
  private machine: StateMachine;

  constructor(opts: ExecutorOptions) {
    const smCallbacks: StateMachineCallbacks = {
      onNodeStatusChange: (nodeId, status, _attempt, error) => {
        opts.callbacks.onNodeStatusChange(nodeId, status, error);
      },
      onNodeContext: (nodeId, context) => {
        opts.callbacks.onNodeOutputs(nodeId, context.outputs);
      },
      onSdkEvent: (nodeId, event) => {
        opts.callbacks.onEvent(nodeId, event as SDKMessage);
      },
      onLogEvent: () => {},
      onExecutionEvent: () => {},
      onGateWait: (nodeId, message) => {
        return opts.callbacks.onGateWait(nodeId, message);
      },
      onStatus: opts.callbacks.onStatus,
      onError: opts.callbacks.onError,
      onDone: opts.callbacks.onHarnessDone,
    };

    this.machine = new StateMachine({
      projectPath: opts.projectPath,
      runId: opts.runId,
      harness: opts.harness,
      agents: opts.agents,
      callbacks: smCallbacks,
      startFromNodeId: opts.startFromNodeId,
      stepMode: opts.stepMode,
    });
  }

  async execute(): Promise<void> {
    return this.machine.execute();
  }

  abort(): void {
    this.machine.abort();
  }
}
