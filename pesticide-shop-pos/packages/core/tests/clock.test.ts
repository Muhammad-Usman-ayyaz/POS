import { describe, expect, it } from 'vitest';
import { addDays, fixedClock, nowIso, systemClock, todayUtc } from '../src/index.js';

describe('clock', () => {
  it('a fixed clock always says the same thing', () => {
    const clock = fixedClock('2026-10-01T12:00:00Z');
    expect(todayUtc(clock)).toBe('2026-10-01');
    expect(nowIso(clock)).toBe('2026-10-01T12:00:00.000Z');
    expect(nowIso(clock)).toBe(nowIso(clock));
  });

  it('today is the UTC date, to agree with SQLite date("now")', () => {
    // 03:00 on 2 October in Pakistan (UTC+5) is still 1 October in UTC, which is what the database uses.
    expect(todayUtc(fixedClock('2026-10-02T03:00:00+05:00'))).toBe('2026-10-01');
    expect(todayUtc(fixedClock('2026-10-01T23:59:59.999Z'))).toBe('2026-10-01');
    expect(todayUtc(fixedClock('2026-10-02T00:00:00Z'))).toBe('2026-10-02');
  });

  it('rejects a bad date-time', () => {
    expect(() => fixedClock('not a date')).toThrow(/not a valid date-time/);
  });

  it('the system clock gives a plausible real date', () => {
    expect(todayUtc(systemClock)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    ['2026-10-01', 1, '2026-10-02'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'], // leap year
    ['2026-10-01', -1, '2026-09-30'],
    ['2026-10-01', 30, '2026-10-31'],
    ['2026-10-01', 0, '2026-10-01'],
  ])('addDays(%s, %i) = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
