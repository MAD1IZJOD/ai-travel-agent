/**
 * Structured, privacy-safe logging: one JSON line per event, tagged with a
 * request ID. Never pass user text, model output or secrets in `fields`.
 */
type Level = "info" | "warn" | "error";

export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function logEvent(level: Level, event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
