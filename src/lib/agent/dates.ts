/** Date helpers that work on plain YYYY-MM-DD strings (UTC) to stay timezone-safe. */

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime()) / 86_400_000);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromIsoDate(value);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

export function formatDisplayDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function monthIndex(iso: string): number {
  return fromIsoDate(iso).getUTCMonth();
}
