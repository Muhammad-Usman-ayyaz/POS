import { describe, expect, it } from 'vitest';
import { outstandingDebts, type LedgerLike } from '../src/index.js';

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
