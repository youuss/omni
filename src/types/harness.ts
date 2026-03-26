// === Slot & Constraint Primitives ===

export interface SlotDef {
  key: string;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface ConstraintCheck {
  type: 'command' | 'exitCode' | 'outputContains' | 'outputMatches';
  command?: string;
  exitCode?: number;
  pattern?: string;
}

export type OnFailAction = 'retry' | 'route' | 'fail' | 'skip';

export interface NodeConstraint {
  name: string;
  check: ConstraintCheck;
  onFail: OnFailAction;
  maxRetries?: number;
  routeTarget?: string;
}

// === Node Configs ===

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface AgentNodeConfig {
  agentId?: string;
  agentPreset?: 'planner' | 'coder' | 'verifier' | 'reviewer';
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
    branches: Record<string, string>;
    defaultBranch?: string;
  };
}

export interface ConditionNodeConfig {
  expression: string;
  trueBranch?: string;
  falseBranch?: string;
}

export interface GateNodeConfig {
  waitFor: string[];
  mode: 'all' | 'any';
}

// === Node ===

export type HarnessNodeType = 'agent' | 'condition' | 'gate';

export interface HarnessNode {
  id: string;
  type: HarnessNodeType;
  label?: string;
  position: { x: number; y: number };
  config: AgentNodeConfig | ConditionNodeConfig | GateNodeConfig;
}

// === Connections & Failure Routes ===

export interface HarnessConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  slotBinding?: {
    sourceSlot: string;
    targetSlot: string;
  };
}

export interface FailureRoute {
  fromNodeId: string;
  toNodeId: string;
  constraintName?: string;
}

// === Harness Input ===

export interface HarnessInput {
  key: string;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

// === Harness Definition ===

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

// === Templates ===

export interface HarnessTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
}

// === Runtime State ===

export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'checking'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting';

export interface NodeRuntimeState {
  status: NodeStatus;
  outputs: Record<string, string>;
  error?: string;
  attempt?: number;
}

// === Agent Definition (kept for agent CRUD) ===

export type AgentCategory = 'planner' | 'implementer' | 'verifier' | 'reviewer' | 'custom';

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  promptTemplate: string;
  allowedTools: string[];
  maxTurns: number;
  builtin?: boolean;
}

// === Domain Knowledge Modules ===

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
  slug: string;       // Directory name (filesystem identifier)
  name: string;       // Display name from domain.json
  description: string;
  tags: string[];
  files: string[];
}
