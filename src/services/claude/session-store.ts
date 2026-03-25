interface SessionRecord {
  runId: string;
  stage: string;
  sessionId: string;
  createdAt: string;
}

const sessions = new Map<string, SessionRecord>();

function makeKey(runId: string, stage: string): string {
  return `${runId}::${stage}`;
}

export function saveSession(
  runId: string,
  stage: string,
  sessionId: string
): void {
  sessions.set(makeKey(runId, stage), {
    runId,
    stage,
    sessionId,
    createdAt: new Date().toISOString(),
  });
}

export function getSession(runId: string, stage: string): string | null {
  return sessions.get(makeKey(runId, stage))?.sessionId ?? null;
}

export function clearSession(runId: string, stage: string): void {
  sessions.delete(makeKey(runId, stage));
}

export function clearAllSessions(runId: string): void {
  for (const key of sessions.keys()) {
    if (key.startsWith(`${runId}::`)) {
      sessions.delete(key);
    }
  }
}
