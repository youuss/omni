import { create } from 'zustand';
import type { StreamMessage } from '../types';

interface OutputLine {
  id: number;
  type: 'text' | 'tool' | 'error' | 'system';
  content: string;
  timestamp: number;
  nodeId?: string;
}

interface OutputState {
  lines: OutputLine[];
  rawEvents: StreamMessage[];
  partialText: string;
  isStreaming: boolean;

  appendLine: (type: OutputLine['type'], content: string, nodeId?: string) => void;
  appendEvent: (event: StreamMessage, nodeId?: string) => void;
  clear: () => void;
}

let lineCounter = 0;

function makeLine(type: OutputLine['type'], content: string, nodeId?: string): OutputLine {
  return { id: ++lineCounter, type, content, timestamp: Date.now(), nodeId };
}

function extractLinesFromMessage(msg: StreamMessage): OutputLine[] {
  switch (msg.type) {
    case 'assistant': {
      const content = (msg as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> } })
        .message?.content ?? [];

      const lines: OutputLine[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          lines.push(makeLine('text', block.text));
        } else if (block.type === 'tool_use') {
          lines.push(
            makeLine('tool', `[${block.name}] ${JSON.stringify(block.input ?? '').slice(0, 200)}`)
          );
        }
      }
      return lines;
    }

    case 'user': {
      const content = (msg as { message?: { content?: Array<{ type: string; content?: unknown }> } })
        .message?.content ?? [];

      const lines: OutputLine[] = [];
      for (const block of content) {
        if (block.type === 'tool_result' && block.content) {
          const text = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
          lines.push(makeLine('tool', `→ ${text.slice(0, 500)}`));
        }
      }
      return lines;
    }

    case 'result': {
      const result = msg as { subtype?: string; result?: string; errors?: string[]; total_cost_usd?: number };
      if (result.subtype === 'success' && result.result) {
        return [makeLine('text', String(result.result))];
      }
      if (result.subtype === 'error_max_budget_usd') {
        return [makeLine('error', `Budget limit exceeded (cost: $${result.total_cost_usd?.toFixed(2) ?? '?'})`)];
      }
      if (result.errors?.length) {
        return result.errors.map((e) => makeLine('error', e));
      }
      return [];
    }

    case 'system': {
      const sys = msg as { subtype?: string; model?: string; tools?: string[] };
      if (sys.subtype === 'init') {
        return [makeLine('system', `Model: ${sys.model ?? 'unknown'}, Tools: ${sys.tools?.length ?? 0}`)];
      }
      return [];
    }

    default: {
      const text = (msg as { text?: string }).text;
      if (text) return [makeLine('system', text)];
      return [];
    }
  }
}

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],
  rawEvents: [],
  partialText: '',
  isStreaming: false,

  appendLine: (type, content, nodeId) =>
    set((state) => ({
      lines: [...state.lines, makeLine(type, content, nodeId)],
    })),

  appendEvent: (event, _nodeId) =>
    set((state) => {
      // Handle stream_event for partial message streaming
      if (event.type === 'stream_event') {
        const streamEvent = event as { event?: { type?: string; delta?: { type?: string; text?: string } } };
        const delta = streamEvent.event?.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          return {
            ...state,
            partialText: state.partialText + delta.text,
            isStreaming: true,
            rawEvents: [...state.rawEvents, event],
          };
        }
        return { ...state, rawEvents: [...state.rawEvents, event] };
      }

      // When a complete assistant message arrives, clear partial state
      const clearPartial = event.type === 'assistant' || event.type === 'result';

      return {
        lines: [...state.lines, ...extractLinesFromMessage(event)],
        rawEvents: [...state.rawEvents, event],
        ...(clearPartial ? { partialText: '', isStreaming: false } : {}),
      };
    }),

  clear: () => {
    lineCounter = 0;
    set({ lines: [], rawEvents: [], partialText: '', isStreaming: false });
  },
}));
