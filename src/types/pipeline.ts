export interface Port {
  id: string;
  name: string;
  type: 'file' | 'text';
  required: boolean;
  description?: string;
  defaultValue?: string;
  editable?: boolean;
}

export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  category: 'planner' | 'implementer' | 'verifier' | 'reviewer' | 'custom';
  inputPorts: Port[];
  outputPorts: Port[];
  promptTemplate: string;
  allowedTools: string[];
  maxTurns: number;
  builtin?: boolean;
}

export interface PipelineNode {
  id: string;
  agentId: string;
  position: { x: number; y: number };
  configOverrides?: {
    maxTurns?: number;
    allowedTools?: string[];
    promptExtra?: string;
  };
}

export interface PipelineEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  builtin?: boolean;
}

export interface PipelineTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
}

export interface TabDescriptor {
  id: string;
  label: string;
  filePath: string;
  editable: boolean;
  nodeId: string;
  portId: string;
  portType: 'input' | 'output';
  category: AgentMeta['category'];
}

export type NodeExecutionStatus =
  | 'idle'
  | 'waiting'
  | 'running'
  | 'success'
  | 'failure'
  | 'skipped';

export interface NodeExecutionState {
  nodeId: string;
  status: NodeExecutionStatus;
  resolvedInputs: Record<string, string>;
  outputs: Record<string, string>;
  error?: string;
}
