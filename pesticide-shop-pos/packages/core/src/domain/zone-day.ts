// Shop-day boundaries. A "day" on a statement is a day on the SHOP's clock (Asia/Karachi, UTC+5), not a UTC day: a sale rung up at 01:00 on the 5th in
// Karachi is stored as 20:00 UTC on the 4th, and the owner expects it on the 5th. Pure: it only uses the platform's Intl time zone data.

/** The shop's time zone unless the setting `shop.time_zone` says otherwise. The one default the shell and the core share. */
export const DEFAULT_SHOP_TIME_ZONE = 'Asia/Karachi';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Is this a time zone the platform knows? */
export function isTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock parts of an instant in a zone. */
function parts(ms: number, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { y: out.year!, mo: out.month!, d: out.day!, h: out.hour!, mi: out.minute!, s: out.second! };
}

/** The zone's offset from UTC at an instant, in milliseconds (plus: ahead of UTC). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The calendar day (YYYY-MM-DD) on the shop's clock for a stored UTC moment. */
export function shopDayOf(instantIso: string, timeZone: string = DEFAULT_SHOP_TIME_ZONE): string {
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) throw new Error(`shopDayOf: not a valid date-time: ${instantIso}`);
  const p = parts(ms, timeZone);
  return `${String(p.y).padStart(4, '0')}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * The UTC instant (ms) at which the shop's calendar `day` (YYYY-MM-DD) begins: 00:00 local time. For Asia/Karachi, '2026-10-05' begins at 2026-10-04T19:00:00Z.
 * Rows with `entry_date >= start(day)` and `< start(day + 1)` belong to that shop day.
 */
export function shopDayStartMs(day: string, timeZone: string = DEFAULT_SHOP_TIME_ZONE): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`shopDayStartMs: not a YYYY-MM-DD day: ${day}`);
  const localMidnightAsUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // the offset can differ between the guess and the answer (a zone that changes its clock that night): look again once
  let guess = localMidnightAsUtc - zoneOffsetMs(localMidnightAsUtc, timeZone);
  guess = localMidnightAsUtc - zoneOffsetMs(guess, timeZone);
  return guess;
}

/** The UTC instant (ISO text) the shop's `day` begins. */
export const shopDayStartIso = (day: string, timeZone: string = DEFAULT_SHOP_TIME_ZONE): string => new Date(shopDayStartMs(day, timeZone)).toISOString();
