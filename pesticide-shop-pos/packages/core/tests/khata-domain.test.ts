import { describe, expect, it } from 'vitest';
import { outstandingDebts, phoneDigits, type LedgerLike } from '../src/index.js';

const e = (entry_type: string, amount_delta: number, entry_date: string, ref_id: string | null = null): LedgerLike => ({
  entry_type, amount_delta, ref_id, ref_type: ref_id ? 'invoice' : null, entry_date,
});

describe('outstandingDebts', () => {
  it('no ledger means no debts', () => {
    expect(outstandingDebts([])).toEqual([]);
  });

  it('an unpaid invoice is fully outstanding', () => {
    expect(outstandingDebts([e('invoice', 1000, '2026-10-01', 'i1')])).toEqual([
      { source: 'invoice', ref_id: 'i1', entry_date: '2026-10-01', original: 1000, outstanding: 1000 },
    ]);
  });

  it('money received pays the oldest debts first', () => {
    const debts = outstandingDebts([e('invoice', 1000, '2026-10-01', 'i1'), e('invoice', 500, '2026-10-02', 'i2'), e('payment', -1200, '2026-10-03')]);
    expect(debts.map((d) => [d.ref_id, d.outstanding])).toEqual([['i2', 300]]);
  });

  it('the opening balance is the oldest debt', () => {
    const debts = outstandingDebts([e('opening', 400, '2026-09-01'), e('invoice', 600, '2026-10-01', 'i1'), e('payment', -500, '2026-10-02')]);
    expect(debts.map((d) => [d.source, d.outstanding])).toEqual([['invoice', 500]]);
  });

  it('returns count as money received', () => {
    expect(outstandingDebts([e('invoice', 1000, '2026-10-01', 'i1'), e('return', -1000, '2026-10-02')])).toEqual([]);
  });

  it('ignores order of the input, and a customer in credit owes nothing', () => {
    expect(outstandingDebts([e('payment', -5000, '2026-10-03'), e('invoice', 1000, '2026-10-01', 'i1')])).toEqual([]);
  });

  it('rows with the same date keep their order', () => {
    const debts = outstandingDebts([e('invoice', 100, '2026-10-01', 'first'), e('invoice', 100, '2026-10-01', 'second'), e('payment', -100, '2026-10-02')]);
    expect(debts.map((d) => d.ref_id)).toEqual(['second']);
  });
});

describe('phoneDigits', () => {
  it.each([
    ['0300 1234567', '3001234567'],
    ['0300-123-4567', '3001234567'],
    ['+92 300 1234567', '3001234567'],
    ['(+92) 300-1234567', '3001234567'],
    ['0092 300 1234567', '3001234567'],
    ['3001234567', '3001234567'],
    ['+92 (0)300 1234567', '3001234567'], // country code, then the trunk 0
    ['00300 1234567', '3001234567'], // every leading zero goes, however many were typed
  ])('%s reads as %s', (typed, digits) => {
    expect(phoneDigits(typed)).toBe(digits);
  });

  it('92 is a country code only on a long number (11 digits or more): a short number that starts with 92 keeps it', () => {
    expect(phoneDigits('9212345')).toBe('9212345');
    expect(phoneDigits('92 1234 5678')).toBe('9212345678'); // 10 digits: kept
    expect(phoneDigits('92 12345 67890')).toBe('1234567890'); // 12 digits: the 92 is dropped
    expect(phoneDigits('92123456789')).toBe('123456789'); // exactly 11: dropped
    expect(phoneDigits('0092 12345')).toBe('12345'); // 0092 is always the country code, whatever follows
  });

  it('only a LEADING 0 or 92 goes: zeros and 92 inside the number stay', () => {
    expect(phoneDigits('0300 9200 092')).toBe('300920009' + '2');
    expect(phoneDigits('0345 0092 0092')).toBe('34500920092');
  });

  it('no digits left gives an empty string', () => {
    expect(phoneDigits('')).toBe('');
    expect(phoneDigits('+-() ')).toBe('');
    expect(phoneDigits('0000')).toBe('');
  });
});
