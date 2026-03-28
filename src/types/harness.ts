// ── Slot & Constraint primitives ──

export interface SlotDef {
  name: string;
  description?: string;
  filePattern?: string;
}

export type ConstraintCheck =
  | { type: 'shell'; command: string }
  | { type: 'file_contains'; path: string; pattern: string }
  | { type: 'expression'; expr: string };

export type OnFailAction =
  | { type: 'retry' }
  | { type: 'route'; targetNodeId: string }
  | { type: 'abort' };

export interface NodeConstraint {
  name: string;
  check: ConstraintCheck;
  onFail: OnFailAction;
  maxRetries?: number; // default 3
}

// ── Node configs per type ──

import type { PermissionMode } from './claude';

export interface AgentNodeConfig {
  agentId?: string;
  inputSlots?: SlotDef[];
  outputSlots?: SlotDef[];
  constraints?: NodeConstraint[];
  contextFilter?: string[];
  overrides?: {
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    promptExtra?: string;
    permissionMode?: PermissionMode;
  };
  routing?: {
    outputKey: string;
    branches: Record<string, string>; // value → nodeId
    defaultBranch?: string;
  };
}

export interface ConditionNodeConfig {
  expression: string;
  branches: Record<string, string>; // value → nodeId
}

export interface GateNodeConfig {
  gateMessage?: string;
}

// ── Node ──

export type HarnessNodeType = 'agent' | 'condition' | 'gate';

export interface HarnessNode {
  id: string;
  type: HarnessNodeType;
  position: { x: number; y: number };
  agent?: AgentNodeConfig;
  condition?: ConditionNodeConfig;
  gate?: GateNodeConfig;
}

// ── Connections & Failure Routes ──

export interface HarnessConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  slotBinding?: {
    fromSlot: string;
    toSlot: string;
  };
}

export interface FailureRoute {
  fromNodeId: string;
  constraintName: string;
  toNodeId: string;
}

// ── Harness-level input ──

export interface HarnessInput {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

// ── Harness Definition ──

export interface HarnessDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: HarnessNode[];
  connections: HarnessConnection[];
  failureRoutes: FailureRoute[];
  inputs?: HarnessInput[];
  defaults?: {
    model?: string;
    maxBudgetUsd?: number;
    permissionMode?: PermissionMode;
  };
  builtin?: boolean;
}

// ── Templates ──

export interface HarnessTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
}

// ── Runtime state ──

export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'checking'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting'; // gate waiting for user

export interface NodeRuntimeState {
  status: NodeStatus;
  attempt: number;
  outputs: Record<string, string>;
  error?: string;
}

// ── Agent Definition (kept for agent CRUD) ──

export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  promptTemplate?: string;
  allowedTools?: string[];
  maxTurns?: number;
  builtin?: boolean;
}

// ── Domain types (unchanged) ──

export interface DomainSlot {
  id: string;
  label: string;
  filename: string;
  description: string;
}

export interface DomainMeta {
  name: string;
  description: string;
  tags: string[];
}

export interface DomainInfo {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  files: string[];
}
