interface SessionRecord {
  changeName: string;
  stage: string;
  sessionId: string;
  createdAt: string;
}

const sessions = new Map<string, SessionRecord>();

function makeKey(changeName: string, stage: string): string {
  return `${changeName}::${stage}`;
}

export function saveSession(
  changeName: string,
  stage: string,
  sessionId: string
): void {
  sessions.set(makeKey(changeName, stage), {
    changeName,
    stage,
    sessionId,
    createdAt: new Date().toISOString(),
  });
}

export function getSession(changeName: string, stage: string): string | null {
  return sessions.get(makeKey(changeName, stage))?.sessionId ?? null;
}

export function clearSession(changeName: string, stage: string): void {
  sessions.delete(makeKey(changeName, stage));
}

export function clearAllSessions(changeName: string): void {
  for (const key of sessions.keys()) {
    if (key.startsWith(`${changeName}::`)) {
      sessions.delete(key);
    }
  }
}
