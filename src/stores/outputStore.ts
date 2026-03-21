import { create } from 'zustand';
import type { ClaudeStreamEvent } from '../types';

interface OutputLine {
  id: number;
  type: 'text' | 'tool' | 'error' | 'system';
  content: string;
  timestamp: number;
}

interface OutputState {
  lines: OutputLine[];
  rawEvents: ClaudeStreamEvent[];

  appendLine: (type: OutputLine['type'], content: string) => void;
  appendEvent: (event: ClaudeStreamEvent) => void;
  clear: () => void;
}

let lineCounter = 0;

function makeLine(type: OutputLine['type'], content: string): OutputLine {
  return { id: ++lineCounter, type, content, timestamp: Date.now() };
}

function extractLinesFromEvent(event: ClaudeStreamEvent): OutputLine[] {
  switch (event.type) {
    case 'assistant': {
      const contents = (event.message as { content?: Array<{ type: string; text?: string }> })
        ?.content ?? [];
      const lines = contents
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => makeLine('text', b.text!));
      // Fallback for flat text field
      if (lines.length === 0 && event.text) {
        return [makeLine('text', String(event.text))];
      }
      return lines;
    }
    case 'tool_use':
      return [
        makeLine(
          'tool',
          `[${event.tool_name}] ${JSON.stringify(event.tool_input ?? '').slice(0, 200)}`
        ),
      ];
    case 'tool_result':
      return [makeLine('tool', `→ ${String(event.result ?? '').slice(0, 500)}`)];
    case 'result': {
      if (event.error) return [makeLine('error', `result error: ${event.error}`)];
      if (event.result) return [makeLine('text', String(event.result))];
      return [];
    }
    case 'raw':
      return [makeLine('system', String(event.text ?? ''))];
    default:
      return [makeLine('system', `[${event.type}] ${JSON.stringify(event).slice(0, 300)}`)];
  }
}

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],
  rawEvents: [],

  appendLine: (type, content) =>
    set((state) => ({
      lines: [...state.lines, makeLine(type, content)],
    })),

  appendEvent: (event) =>
    set((state) => ({
      lines: [...state.lines, ...extractLinesFromEvent(event)],
      rawEvents: [...state.rawEvents, event],
    })),

  clear: () => {
    lineCounter = 0;
    set({ lines: [], rawEvents: [] });
  },
}));
