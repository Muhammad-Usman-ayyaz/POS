/**
 * Reads a date the person TYPED, strictly. The shop is in Pakistan (day first), the browser is American (month first), so
 * "05/10/2026" is 5 October to the owner and 10 May to the PC. We never guess: a numeric day/month form is refused and the
 * person is asked to write the month as a word. Nothing rolls over (31 Feb is refused, not turned into 3 Mar).
 *
 * Accepted: "12 Oct 2026", "12-Oct-2026", "12 October 2026" (any capitals), and the ISO form "2026-10-12" the system itself uses.
 * Refused: "05/10/2026", "5/10/26", "05-10-2026", "12 Oct 26" (two-digit year), "Oct 12 2026", and anything else.
 */

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export type DateParse = { ok: true; iso: string } | { ok: false; reason: 'format' | 'year' | 'impossible' };

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const FULL_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12,
};

const monthNumber = (word: string): number | null => {
  const w = word.toLowerCase();
  const short = MONTH_NAMES.indexOf(w as (typeof MONTH_NAMES)[number]);
  if (short >= 0) return short + 1;
  return FULL_NAMES[w] ?? null;
};

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function parseDateText(text: string): DateParse {
  const t = text.trim().replace(/\s+/g, ' ');
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const named = /^(\d{1,2})([ -])([A-Za-z]{3,9})\2(\d{4})$/.exec(t);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (named) {
    const m = monthNumber(named[3]!);
    if (m === null) return { ok: false, reason: 'format' };
    day = Number(named[1]);
    month = m;
    year = Number(named[4]);
  } else {
    return { ok: false, reason: 'format' };
  }

  if (year < MIN_YEAR || year > MAX_YEAR) return { ok: false, reason: 'year' };
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return { ok: false, reason: 'impossible' };
  return { ok: true, iso: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` };
}
