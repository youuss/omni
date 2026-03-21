export type AgentName = string;

export interface AgentConfig {
  name: AgentName;
  systemPromptFile: string;
  allowedTools: string[];
  maxTurns: number;
}

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  text?: string;
  tool_name?: string;
  tool_input?: unknown;
  result?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface AgentRunHandle {
  abort: () => void;
  pid: number;
}
