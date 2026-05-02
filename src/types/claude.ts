export type AgentName = string;

export interface AgentConfig {
  name: AgentName;
  systemPromptFile: string;
  allowedTools: string[];
  maxTurns: number;
}

// --- Stream message types (from claude --output-format stream-json) ---

/** Assistant message */
export interface AssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    role: 'assistant';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    >;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
}

/** User message */
export interface UserMessage {
  type: 'user';
  uuid?: string;
  session_id: string;
  message: {
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_result'; tool_use_id: string; content: unknown }
    >;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
}

/** Result message (success) */
export interface ResultSuccess {
  type: 'result';
  subtype: 'success';
  uuid: string;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
}

/** Result message (error) */
export interface ResultError {
  type: 'result';
  subtype: 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
  uuid: string;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
  errors: string[];
}

/** System init message */
export interface SystemMessage {
  type: 'system';
  subtype: 'init';
  uuid: string;
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
  permissionMode: string;
}

/** Partial assistant stream event */
export interface StreamEvent {
  type: 'stream_event';
  event: unknown;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

/** Union of all stream message types */
export type StreamMessage =
  | AssistantMessage
  | UserMessage
  | ResultSuccess
  | ResultError
  | SystemMessage
  | StreamEvent
  | { type: string; [key: string]: unknown }; // catch-all for compact_boundary, etc.

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface AgentRunHandle {
  abort: () => void;
  pid: number;
}
