import type { LogEvent, ExecutionLogEvent } from '../../types/engine';
import { readRunFile, writeRunFile } from '../run-service';

// === Event Factories ===

export function createLogEvent<T extends LogEvent['type']>(
  type: T,
  data: Omit<Extract<LogEvent, { type: T }>, 'type' | 'ts'>
): Extract<LogEvent, { type: T }> {
  return { type, ts: Date.now(), ...data } as Extract<LogEvent, { type: T }>;
}

export function createExecutionEvent<T extends ExecutionLogEvent['type']>(
  type: T,
  data: Omit<Extract<ExecutionLogEvent, { type: T }>, 'type' | 'ts'>
): Extract<ExecutionLogEvent, { type: T }> {
  return { type, ts: Date.now(), ...data } as Extract<ExecutionLogEvent, { type: T }>;
}

// === Append Helpers ===

async function appendJsonlLine(
  projectPath: string,
  runId: string,
  subpath: string,
  record: unknown
): Promise<void> {
  let existing = '';
  try {
    existing = await readRunFile(projectPath, runId, subpath);
  } catch {
    // File does not exist yet — start fresh
  }
  const updated = existing + JSON.stringify(record) + '\n';
  await writeRunFile(projectPath, runId, subpath, updated);
}

function parseJsonlContent<T>(content: string): T[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

// === Public API ===

/**
 * Appends a LogEvent as a JSONL line to `logs/{nodeId}.{attempt}.jsonl`.
 */
export async function appendNodeLog(
  projectPath: string,
  runId: string,
  nodeId: string,
  attempt: number,
  event: LogEvent
): Promise<void> {
  const subpath = `logs/${nodeId}.${attempt}.jsonl`;
  await appendJsonlLine(projectPath, runId, subpath, event);
}

/**
 * Appends an ExecutionLogEvent as a JSONL line to `execution.jsonl`.
 */
export async function appendExecutionLog(
  projectPath: string,
  runId: string,
  event: ExecutionLogEvent
): Promise<void> {
  await appendJsonlLine(projectPath, runId, 'execution.jsonl', event);
}

/**
 * Reads and parses a per-node log file (`logs/{nodeId}.{attempt}.jsonl`).
 */
export async function readNodeLog(
  projectPath: string,
  runId: string,
  nodeId: string,
  attempt: number
): Promise<LogEvent[]> {
  const subpath = `logs/${nodeId}.${attempt}.jsonl`;
  const content = await readRunFile(projectPath, runId, subpath);
  return parseJsonlContent<LogEvent>(content);
}

/**
 * Reads and parses the harness-level execution log (`execution.jsonl`).
 */
export async function readExecutionLog(
  projectPath: string,
  runId: string
): Promise<ExecutionLogEvent[]> {
  const content = await readRunFile(projectPath, runId, 'execution.jsonl');
  return parseJsonlContent<ExecutionLogEvent>(content);
}
