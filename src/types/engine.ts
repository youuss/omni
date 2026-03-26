import type { NodeStatus } from './harness';
import type { SDKMessage } from './claude';

// === Node Context ===

export interface NodeContext {
  nodeId: string;
  outputs: Record<string, string>;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

// === Constraint Failure ===

export interface ConstraintFailure {
  constraintName: string;
  checkType: string;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  attempt: number;
  sourceNodeId: string;
  sourceNodeContext: NodeContext;
}

// === Log Events ===

export type LogEvent =
  | { type: 'node_start'; nodeId: string; attempt: number; ts: number }
  | { type: 'node_end'; nodeId: string; status: NodeStatus; ts: number }
  | { type: 'sdk_message'; nodeId: string; message: SDKMessage; ts: number }
  | { type: 'context_inject'; nodeId: string; slotKey: string; value: string; ts: number }
  | { type: 'context_output'; nodeId: string; slotKey: string; value: string; ts: number }
  | { type: 'constraint_check'; nodeId: string; constraintName: string; passed: boolean; ts: number }
  | { type: 'constraint_retry'; nodeId: string; constraintName: string; attempt: number; ts: number }
  | { type: 'constraint_route'; nodeId: string; constraintName: string; targetNodeId: string; ts: number }
  | { type: 'condition_eval'; nodeId: string; expression: string; result: boolean; ts: number }
  | { type: 'gate_wait'; nodeId: string; waitingFor: string[]; ts: number }
  | { type: 'gate_resume'; nodeId: string; ts: number }
  | { type: 'error'; nodeId?: string; message: string; ts: number };

// === Execution Log Events ===

export type ExecutionLogEvent =
  | { type: 'harness_start'; harnessId: string; runId: string; ts: number }
  | { type: 'node_dispatch'; nodeId: string; attempt: number; ts: number }
  | { type: 'node_complete'; nodeId: string; context: NodeContext; ts: number }
  | { type: 'node_failed'; nodeId: string; error: string; ts: number }
  | { type: 'node_skipped'; nodeId: string; reason: string; ts: number }
  | { type: 'constraint_route'; fromNodeId: string; toNodeId: string; constraintName: string; ts: number }
  | { type: 'condition_branch'; nodeId: string; branch: 'true' | 'false'; targetNodeId?: string; ts: number }
  | { type: 'harness_end'; harnessId: string; runId: string; status: 'completed' | 'failed' | 'aborted'; ts: number };

// === Execution State ===

export interface ExecutionState {
  harnessId: string;
  runId: string;
  nodeStates: Record<string, NodeStatus>;
  contexts: Record<string, NodeContext>;
  startedAt: number;
  updatedAt: number;
}

// === State Machine Callbacks ===

export interface StateMachineCallbacks {
  onNodeStatusChange?: (nodeId: string, status: NodeStatus) => void;
  onNodeContext?: (nodeId: string, context: NodeContext) => void;
  onSdkEvent?: (nodeId: string, message: SDKMessage) => void;
  onLogEvent?: (event: LogEvent) => void;
  onExecutionEvent?: (event: ExecutionLogEvent) => void;
  onGateWait?: (nodeId: string, waitingFor: string[]) => void;
  onStatus?: (status: ExecutionState) => void;
  onError?: (error: Error, nodeId?: string) => void;
  onDone?: (state: ExecutionState) => void;
}
