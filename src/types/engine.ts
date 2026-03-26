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
  | { type: 'node_end'; nodeId: string; exitCode: number | null; durationMs: number; ts: number }
  | { type: 'sdk_message'; data: SDKMessage; ts: number }
  | { type: 'constraint_check'; name: string; passed: boolean; exitCode?: number; stdout?: string; stderr?: string; ts: number }
  | { type: 'constraint_retry'; attempt: number; reason: string; ts: number }
  | { type: 'condition_eval'; nodeId: string; expression: string; result: string; branch: string; ts: number }
  | { type: 'gate_wait'; nodeId: string; message?: string; ts: number }
  | { type: 'gate_resume'; nodeId: string; ts: number }
  | { type: 'error'; nodeId?: string; message: string; ts: number };

// === Execution Log Events ===

export type ExecutionLogEvent =
  | { type: 'harness_start'; harnessId: string; nodes: string[]; ts: number }
  | { type: 'node_dispatch'; nodeId: string; attempt: number; ts: number }
  | { type: 'node_complete'; nodeId: string; exitCode?: number; logFile: string; ts: number }
  | { type: 'node_failed'; nodeId: string; error: string; ts: number }
  | { type: 'node_skipped'; nodeId: string; reason: string; ts: number }
  | { type: 'constraint_route'; fromNode: string; constraint: string; toNode: string; ts: number }
  | { type: 'condition_branch'; nodeId: string; branch: string; ts: number }
  | { type: 'harness_end'; success: boolean; durationMs: number; ts: number };

// === Execution State ===

export interface ExecutionState {
  harnessId: string;
  runId: string;
  nodeStates: Record<string, { status: NodeStatus; attempt: number; error?: string }>;
  contexts: Record<string, NodeContext>;
  startedAt: string;
  updatedAt: string;
}

// === State Machine Callbacks ===

export interface StateMachineCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, attempt: number, error?: string) => void;
  onNodeContext: (nodeId: string, context: NodeContext) => void;
  onSdkEvent: (nodeId: string, event: SDKMessage) => void;
  onLogEvent: (event: LogEvent) => void;
  onExecutionEvent: (event: ExecutionLogEvent) => void;
  onGateWait: (nodeId: string, message?: string) => Promise<boolean>;
  onStatus: (nodeId: string, text: string) => void;
  onError: (nodeId: string, text: string) => void;
  onDone: (success: boolean) => void;
}
