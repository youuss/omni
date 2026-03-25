export type AgentName = string;

export interface AgentConfig {
  name: AgentName;
  systemPromptFile: string;
  allowedTools: string[];
  maxTurns: number;
}

// --- SDK-aligned message types ---

/** Matches SDK SDKAssistantMessage */
export interface SDKAssistantMessage {
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

/** Matches SDK SDKUserMessage */
export interface SDKUserMessage {
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

/** Matches SDK SDKResultMessage (success) */
export interface SDKResultSuccess {
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

/** Matches SDK SDKResultMessage (error) */
export interface SDKResultError {
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

/** Matches SDK SDKSystemMessage */
export interface SDKSystemMessage {
  type: 'system';
  subtype: 'init';
  uuid: string;
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
  permissionMode: string;
}

/** Matches SDK SDKPartialAssistantMessage (stream_event) */
export interface SDKStreamEvent {
  type: 'stream_event';
  event: unknown;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

/** Union of all SDK message types we handle */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultSuccess
  | SDKResultError
  | SDKSystemMessage
  | SDKStreamEvent
  | { type: string; [key: string]: unknown }; // catch-all for compact_boundary, etc.

export interface AgentRunHandle {
  abort: () => void;
  pid: number;
}

// --- RunRequest: Frontend → Sidecar ---

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
export type SettingSource = 'user' | 'project' | 'local';

export interface AgentOverride {
  maxTurns?: number;
  allowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  promptExtra?: string;
}

export interface McpServerConfig {
  type?: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop';

export interface HookEntry {
  matcher?: string;
  command: string;
}

export type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>;

export interface RunRequest {
  projectPath: string;
  prompt: string;
  agents: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  permissionMode?: PermissionMode;
  settingSources?: SettingSource[];
  resume?: string;
  overrides?: Record<string, AgentOverride>;
  includePartialMessages?: boolean;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: HooksConfig;
}
