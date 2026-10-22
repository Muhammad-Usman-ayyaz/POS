// khata.adjustOpening (Phase 6 wrap-up, option A): a compensating `adjustment` ledger row plus an audit row, never an edit of the opening row.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineAdjustOpeningTests(make: WorldFactory): void {
  describe('adjustOpening', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
      s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 250_000, created_by: ID.owner });
    });
    afterEach(() => w.close());

    const adjust = (over: object = {}) => s.khata.adjustOpening({ customer_id: ID.customer, delta: -50_000, reason: 'Wrote Rs 500 too much', created_by: ID.owner, ...over });
    const audits = () => w.rows('audit_log').filter((r) => r.action === 'opening_balance_adjusted');

    it('writes ONE adjustment row for the delta, leaves the opening row alone, and returns the new balance', () => {
      const before = w.rows('ledger_entries')[0];
      const done = adjust();
      expect(done).toMatchObject({ balance_before: 250_000, balance: 200_000 });
      const rows = w.rows('ledger_entries');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(before); // byte for byte
      expect(rows[1]).toMatchObject({ id: done.entry_id, entry_type: 'adjustment', amount_delta: -50_000, party_id: ID.customer, created_by: ID.owner });
      expect(rows.filter((r) => r.entry_type === 'opening')).toHaveLength(1);
      expect(s.khata.balance(ID.customer)).toBe(200_000);
    });

    it('a positive delta makes the customer owe more', () => {
      expect(adjust({ delta: 10_000 }).balance).toBe(260_000);
    });

    it('writes one audit row with the reason, before, after and delta, in the same unit of work', () => {
      const done = adjust();
      const rows = audits();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: ID.owner, table_name: 'ledger_entries', row_id: done.entry_id });
      const details = typeof rows[0]!.details === 'string' ? JSON.parse(rows[0]!.details as string) : rows[0]!.details;
      expect(details).toMatchObject({ customer_id: ID.customer, reason: 'Wrote Rs 500 too much', before: 250_000, after: 200_000, delta: -50_000 });
    });

    it('a failure on the audit insert leaves no adjustment row (one transaction)', () => {
      w.failOnInsert('audit_log', 1);
      expect(() => adjust()).toThrow();
      w.clearFailure();
      expect(w.rows('ledger_entries')).toHaveLength(1);
      expect(s.khata.balance(ID.customer)).toBe(250_000);
    });

    it('a failure on the ledger insert writes no audit row', () => {
      w.failOnInsert('ledger_entries', 1);
      expect(() => adjust()).toThrow();
      w.clearFailure();
      expect(audits()).toHaveLength(0);
    });

    it('refuses a delta of 0, a fraction, a non-number and an absurd size', () => {
      for (const delta of [0, 10.5, Number.NaN, 1_000_000_000_001, '5' as never]) {
        expect(codeOf(() => adjust({ delta })), String(delta)).toBe('INVALID_INPUT');
      }
      expect(w.rows('ledger_entries')).toHaveLength(1);
    });

    it('needs a reason of 1 to 200 characters (spaces do not count)', () => {
      for (const reason of ['', '   ', 'x'.repeat(201), undefined as never]) expect(codeOf(() => adjust({ reason }))).toBe('INVALID_INPUT');
      expect(codeOf(() => adjust({ reason: 'x'.repeat(200) }))).toBeUndefined();
    });

    it('refuses staff, an inactive user and an unknown customer, and writes nothing', () => {
      expect(codeOf(() => adjust({ created_by: ID.staff }))).toBe('NOT_AUTHORIZED');
      expect(codeOf(() => adjust({ created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
      expect(codeOf(() => adjust({ customer_id: uuid(999) }))).toBe('NOT_FOUND');
      expect(w.rows('ledger_entries')).toHaveLength(1);
      expect(audits()).toHaveLength(0);
    });

    it('a customer with no opening balance gets NO_OPENING_BALANCE and nothing is written', () => {
      const other = w.addCustomer();
      const e = errorOf(() => s.khata.adjustOpening({ customer_id: other, delta: 5, reason: 'x', created_by: ID.owner }));
      expect(e.code).toBe('NO_OPENING_BALANCE');
      expect(w.rows('ledger_entries')).toHaveLength(1);
    });

    it('can be repeated: every correction is its own row, the opening row stays single', () => {
      adjust({ delta: -1_000 });
      adjust({ delta: -2_000 });
      expect(w.rows('ledger_entries').map((r) => r.entry_type)).toEqual(['opening', 'adjustment', 'adjustment']);
      expect(audits()).toHaveLength(2);
      expect(s.khata.balance(ID.customer)).toBe(247_000);
    });

    it('the statement shows the adjustment line with the label adjustment and a running balance', () => {
      adjust();
      const st = s.khata.statement({ customer_id: ID.customer });
      expect(st.lines.map((l) => [l.label, l.amount_delta, l.running_balance])).toEqual([['opening', 250_000, 250_000], ['adjustment', -50_000, 200_000]]);
    });
  });
}
