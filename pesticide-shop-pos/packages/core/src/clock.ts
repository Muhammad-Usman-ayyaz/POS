/**
 * The one place core touches the real time. Everything else gets "now" or "today" passed in,
 * so tests can set it. Services take a Clock; pure functions take the plain `today` string.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock stuck at one moment, for tests. Accepts any ISO date-time, e.g. '2026-10-01T12:00:00Z'. */
export function fixedClock(isoDateTime: string): Clock {
  const t = new Date(isoDateTime).getTime();
  if (Number.isNaN(t)) throw new Error(`fixedClock: not a valid date-time: ${isoDateTime}`);
  return { now: () => new Date(t) };
}

/**
 * Today as `YYYY-MM-DD` in UTC. This is deliberately UTC, not the shop's local date: the database
 * decides "expired" with SQLite date('now'), which is UTC, and the app must agree with it.
 * (In Pakistan, UTC+5, the two dates differ between midnight and 05:00 local time.)
 */
export function todayUtc(clock: Clock): string {
  return clock.now().toISOString().slice(0, 10);
}

/** Current moment as UTC ISO text, the format the database stores. */
export function nowIso(clock: Clock): string {
  return clock.now().toISOString();
}

/** `YYYY-MM-DD` plus or minus whole days. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`addDays: not a valid date: ${isoDate}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
