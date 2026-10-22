// "Balance on a receipt" is ordered by the stable ledger sequence, never by rowid (migration 008).
// Each test stores ledger rows so that STORAGE order (rowid) and SEQUENCE order differ: a query that still used rowid gives a different number.
import { ID, services, uuid } from '@pos/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balanceAsOfSale, paymentReceiptData } from '../src/index.js';
import { createSqliteWorld, type SqliteWorld } from './support/sqlite-world.js';

let w: SqliteWorld;
let s: ReturnType<typeof services>;
beforeEach(async () => {
  w = await createSqliteWorld();
  s = services(w);
});
afterEach(() => w.close());

const raw = (n: number, delta: number, seq: number | null) =>
  w.addLedgerRaw({ id: uuid(6000 + n), party_type: 'customer', party_id: ID.customer, entry_type: 'adjustment', amount_delta: delta }, seq);

describe('balanceAsOfSale', () => {
  it('counts the rows sequenced before the sale even when they were stored after it', () => {
    raw(1, 100_000, 2); // rowid 1, seq 2
    const sale = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 1000 }] }); // rowid 2, seq 3 (total 50 000)
    raw(2, 30_000, 1); // rowid 3, but seq 1: it came BEFORE the sale
    // by rowid the answer would be 100 000 + 50 000
    expect(balanceAsOfSale(w.db, sale.invoice.id)).toBe(30_000 + 100_000 + 50_000 - 0);
  });

  it('does not count a row sequenced after the sale even when it was stored before it', () => {
    raw(1, 70_000, 10); // rowid 1, seq 10
    const sale = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 1000 }] }); // seq 11
    raw(2, 5_000, 12);
    // all three are in sequence order 10, 11 (sale), 12 -> before the sale: the 70 000 only
    expect(balanceAsOfSale(w.db, sale.invoice.id)).toBe(70_000 + 50_000);
  });

  it('rows from before migration 008 (no seq) come first, so they are always before a sequenced sale', () => {
    raw(1, 40_000, null);
    raw(2, 2_000, null);
    const sale = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 10_000, lines: [{ product_id: ID.bottle, qty: 1000 }] });
    expect(balanceAsOfSale(w.db, sale.invoice.id)).toBe(42_000 + 50_000 - 10_000);
  });
});

describe('payment receipt balance after', () => {
  it('counts the rows sequenced up to and including the payment, whatever their storage order', () => {
    s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 2000 }] }); // seq 1: owes 100 000
    const paid = s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 30_000, method: 'cash', created_by: ID.staff }); // seq 2
    raw(1, -8_000, 99); // stored last and sequenced last: after the payment, must not count
    raw(2, 1_000, 0); // stored last but sequenced FIRST (seq 0): must count (rowid order would not count it)
    const receipt = paymentReceiptData(w.db, paid.payment.id)!;
    expect(receipt.balance_after).toBe(1_000 + 100_000 - 30_000);
  });
});
