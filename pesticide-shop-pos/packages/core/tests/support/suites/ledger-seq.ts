// The stable ledger sequence (migration 008), on every backend: the repository numbers each new ledger row 1, 2, 3 in the order it is written,
// and every ordered read (the ledger list, the statement, overdue) follows that sequence, NOT the order the rows happen to sit in storage.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineLedgerSeqTests(make: WorldFactory): void {
  describe('ledger sequence', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const creditSale = (packs: number) => s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: packs * 1000 }] });
    const raw = (n: number, delta: number, seq: number | null) =>
      w.addLedgerRaw({ id: uuid(5000 + n), party_type: 'customer', party_id: ID.customer, entry_type: 'adjustment', amount_delta: delta }, seq);

    it('numbers every new ledger row 1, 2, 3 in write order', () => {
      s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 10_000, created_by: ID.owner });
      creditSale(1);
      s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 5_000, method: 'cash', created_by: ID.staff });
      expect(w.rows('ledger_entries').map((e) => e.seq)).toEqual([1, 2, 3]);
    });

    it('a rolled-back write gives its number back (no gap)', () => {
      s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 10_000, created_by: ID.owner });
      w.failOnInsert('ledger_entries', 1);
      expect(() => creditSale(1)).toThrow();
      w.clearFailure();
      creditSale(1);
      expect(w.rows('ledger_entries').map((e) => e.seq)).toEqual([1, 2]);
    });

    it('the next number is the highest seq plus one, even when rows were stored out of order', () => {
      raw(1, 100, 7);
      raw(2, 100, 3);
      s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 10_000, created_by: ID.owner });
      expect(w.rows('ledger_entries').at(-1)!.seq).toBe(8);
    });

    it('the statement orders rows by seq, not by where they sit in storage', () => {
      raw(1, 100_000, 2); // stored first, sequenced second
      raw(2, 30_000, 1); // stored second, sequenced first
      const st = s.khata.statement({ customer_id: ID.customer });
      expect(st.lines.map((l) => [l.amount_delta, l.running_balance])).toEqual([[30_000, 30_000], [100_000, 130_000]]);
    });

    it('rows from before migration 008 (no seq) come first, in storage order, then the sequenced rows', () => {
      raw(1, 5, 4);
      raw(2, 10, null);
      raw(3, 20, null);
      raw(4, 40, 2);
      const st = s.khata.statement({ customer_id: ID.customer });
      expect(st.lines.map((l) => l.amount_delta)).toEqual([10, 20, 40, 5]);
    });

    it('running balances follow the sequence (a credit stored first but sequenced second never comes before the debt)', () => {
      raw(1, -50_000, 2);
      raw(2, 80_000, 1);
      const st = s.khata.statement({ customer_id: ID.customer });
      expect(st.closing_balance).toBe(30_000);
      expect(st.lines.map((l) => l.running_balance)).toEqual([80_000, 30_000]);
    });
  });
}
