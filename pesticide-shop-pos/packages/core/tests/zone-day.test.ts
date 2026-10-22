import { describe, expect, it } from 'vitest';
import { buildStatement, DEFAULT_SHOP_TIME_ZONE, isTimeZone, shopDayOf, shopDayStartIso, type LedgerDisplayRow } from '../src/index.js';

describe('shop day boundaries (Asia/Karachi, UTC+5)', () => {
  it('the default is Asia/Karachi', () => expect(DEFAULT_SHOP_TIME_ZONE).toBe('Asia/Karachi'));

  it('a Karachi day begins at 19:00 UTC the evening before', () => {
    expect(shopDayStartIso('2026-10-05')).toBe('2026-10-04T19:00:00.000Z');
    expect(shopDayStartIso('2026-01-01')).toBe('2025-12-31T19:00:00.000Z');
    expect(shopDayStartIso('2026-03-01')).toBe('2026-02-28T19:00:00.000Z'); // across a month end
    expect(shopDayStartIso('2026-10-05', 'UTC')).toBe('2026-10-05T00:00:00.000Z');
  });

  it.each([
    ['2026-10-04T18:59:59.999Z', '2026-10-04'],
    ['2026-10-04T19:00:00.000Z', '2026-10-05'],
    ['2026-10-04T23:59:59.000Z', '2026-10-05'],
    ['2026-10-05T18:59:59.999Z', '2026-10-05'],
    ['2026-12-31T20:00:00.000Z', '2027-01-01'],
  ])('%s is shop day %s', (instant, day) => expect(shopDayOf(instant)).toBe(day));

  it('the start of a day and the day of that instant agree, and one millisecond earlier is the day before', () => {
    for (const day of ['2026-01-01', '2026-02-28', '2026-03-29', '2026-10-25', '2026-12-31']) {
      const start = shopDayStartIso(day);
      expect(shopDayOf(start)).toBe(day);
      expect(shopDayOf(new Date(Date.parse(start) - 1).toISOString())).not.toBe(day);
    }
  });

  it('a zone with daylight saving (America/New_York) still round-trips on the change days', () => {
    for (const day of ['2026-03-08', '2026-11-01', '2026-06-15']) expect(shopDayOf(shopDayStartIso(day, 'America/New_York'), 'America/New_York')).toBe(day);
  });

  it('knows a real zone and refuses a made-up one', () => {
    expect(isTimeZone('Asia/Karachi')).toBe(true);
    expect(isTimeZone('Mars/Base')).toBe(false);
  });

  it('buildStatement cuts the range at the Karachi day, and at the UTC day only when the zone is UTC', () => {
    const row = (id: string, delta: number, at: string): LedgerDisplayRow =>
      ({ entry: { id, party_type: 'customer', party_id: 'c', entry_type: 'adjustment', amount_delta: delta, ref_type: null, ref_id: null, entry_date: at, created_by: null, seq: null } as never, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null });
    const rows = [row('a', 100, '2026-10-04T18:59:59.999Z'), row('b', 10, '2026-10-04T19:00:00.000Z')];
    expect(buildStatement(rows, { to: '2026-10-04' }).closing_balance).toBe(100);
    expect(buildStatement(rows, { to: '2026-10-04', timeZone: 'UTC' }).closing_balance).toBe(110);
    expect(buildStatement(rows, { to: '2026-10-05' }).closing_balance).toBe(110);
    expect(buildStatement(rows, { from: '2026-10-05' }).brought_forward).toBe(100);
  });
});
