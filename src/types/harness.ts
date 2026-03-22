// === Agent Definition ===
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

// === Harness Definition (the graph) ===
export interface HarnessNode {
  id: string;
  agentId: string;
  position: { x: number; y: number };
  constraints?: NodeConstraints;
}

export interface NodeConstraints {
  maxTurns?: number;
  allowedTools?: string[];
  promptExtra?: string;
}

export interface HarnessConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface HarnessDefinition {
  id: string;
  name: string;
  description: string;
  nodes: HarnessNode[];
  connections: HarnessConnection[];
  builtin?: boolean;
}

export interface HarnessTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
}

// === Node Execution ===
export type NodeStatus = 'idle' | 'waiting' | 'running' | 'success' | 'failure' | 'skipped';

export interface NodeRuntimeState {
  status: NodeStatus;
  outputs: Record<string, string>;
  error?: string;
}

// === File Tab (convention-based) ===
export interface FileTab {
  id: string;
  label: string;
  filePath: string;
  editable: boolean;
  nodeId: string;
  agentCategory: AgentCategory;
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
