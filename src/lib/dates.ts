// Date helpers. The user is in Brazil; Pluggy sends dates as ISO strings, often
// at UTC midnight ("2026-10-05T00:00:00.000Z" means Oct 5), so calendar buckets
// use the ISO date part instead of converting to local time (which would shift
// those dates to the previous day).

export const TIME_ZONE = "America/Sao_Paulo";

/** Today's date (YYYY-MM-DD) in São Paulo. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** "2026-10-05T00:00:00.000Z" → "2026-10-05". */
export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Any timestamp Pluggy sends → the canonical UTC form ("2026-10-05T03:00:00.000Z"),
 * so stored timestamps sort and compare as plain strings. Unparseable values are kept.
 */
export function isoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

/** "2026-10-05..." → "2026-10". */
export function monthKey(value: string): string {
  return value.slice(0, 7);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

/** The `count` months ending at `lastMonth`, oldest first. */
export function monthRange(lastMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(lastMonth, i - count + 1));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000,
  );
}

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
