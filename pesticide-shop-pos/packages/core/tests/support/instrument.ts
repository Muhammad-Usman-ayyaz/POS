// Wraps ANY unit of work to count runs and to make the Nth insert into a table throw.
// It works the same on the fakes and on SQLite, so a rollback test exercises each backend's own rollback:
// the failure is thrown from inside the real transaction, after earlier real inserts have happened.
import type { Repositories, UnitOfWork } from '../../src/index.js';
import type { InsertTable } from './world.js';

export class Instrument {
  runs = 0;
  private target: { table: InsertTable; nth: number } | null = null;
  private counts: Partial<Record<InsertTable, number>> = {};

  failOnInsert(table: InsertTable, nth = 1): void {
    this.target = { table, nth };
  }
  clearFailure(): void {
    this.target = null;
  }
  startRun(): void {
    this.runs += 1;
    this.counts = {};
  }
  onInsert(table: InsertTable): void {
    const n = (this.counts[table] = (this.counts[table] ?? 0) + 1);
    if (this.target && this.target.table === table && this.target.nth === n) {
      throw new Error(`injected failure on insert #${n} into ${table}`);
    }
  }
}

export function instrument(uow: UnitOfWork, probe: Instrument): UnitOfWork {
  return {
    run<T>(work: (tx: Repositories) => T): T {
      return uow.run((tx) => {
        probe.startRun();
        return work(hooked(tx, probe));
      });
    },
  };
}

/** The same repositories, with a hook in front of every insert. */
function hooked(tx: Repositories, p: Instrument): Repositories {
  const before = <R>(table: InsertTable, insert: (row: R) => void) => (row: R) => {
    p.onInsert(table);
    insert(row);
  };
  return {
    ...tx,
    batches: { ...tx.batches, insert: before('batches', tx.batches.insert) },
    stock: { ...tx.stock, insert: before('stock_movements', tx.stock.insert) },
    invoices: { ...tx.invoices, insert: before('invoices', tx.invoices.insert), insertItem: before('invoice_items', tx.invoices.insertItem) },
    salesReturns: { ...tx.salesReturns, insert: before('sales_returns', tx.salesReturns.insert), insertItem: before('sales_return_items', tx.salesReturns.insertItem) },
    purchases: { ...tx.purchases, insert: before('purchases', tx.purchases.insert), insertItem: before('purchase_items', tx.purchases.insertItem) },
    payments: { ...tx.payments, insert: before('payments', tx.payments.insert) },
    ledger: { ...tx.ledger, insert: before('ledger_entries', tx.ledger.insert) },
    audit: { ...tx.audit, insert: before('audit_log', tx.audit.insert) },
  };
}
