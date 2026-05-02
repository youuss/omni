import type { StreamMessage } from '../../types';

export function parseStreamLine(line: string): StreamMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as StreamMessage;
  } catch {
    return null;
  }
}

/**
 * Extract displayable text from a stream message.
 */
export function extractTextFromMessage(message: StreamMessage): string | null {
  if (message.type === 'assistant' && 'message' in message) {
    const content = (message as { message?: { content?: Array<{ type: string; text?: string }> } })
      .message?.content;
    if (content) {
      return content
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!)
        .join('');
    }
  }

  if (message.type === 'result' && 'result' in message) {
    return (message as { result?: string }).result ?? null;
  }

  return null;
}

/**
 * Extract session_id from any stream message.
 */
export function extractSessionId(message: StreamMessage): string | null {
  if ('session_id' in message && typeof message.session_id === 'string') {
    return message.session_id;
  }
  return null;
}
