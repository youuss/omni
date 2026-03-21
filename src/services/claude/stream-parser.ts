import type { ClaudeStreamEvent } from '../../types';

export function parseStreamLine(line: string): ClaudeStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as ClaudeStreamEvent;
  } catch {
    return null;
  }
}

export function extractTextFromEvent(event: ClaudeStreamEvent): string | null {
  if (event.type === 'assistant' && event.subtype === 'text') {
    return event.text ?? null;
  }

  if (event.type === 'result') {
    return event.result ?? null;
  }

  return null;
}

export function extractSessionId(event: ClaudeStreamEvent): string | null {
  if (event.session_id && typeof event.session_id === 'string') {
    return event.session_id;
  }
  return null;
}
