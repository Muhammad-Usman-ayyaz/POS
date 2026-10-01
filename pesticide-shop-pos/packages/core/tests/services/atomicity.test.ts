// A failure part-way through must leave NOTHING written: no half sale, no lost stock, no used-up number.
import { beforeEach, describe, expect, it } from 'vitest';
import { addStock, createFakeRepositories, FakeStore, ID, makeWorld, services, type FakeData, type World } from '../support/fakes.js';

let w: World;
let s: ReturnType<typeof services>;
beforeEach(() => {
  w = makeWorld();
  s = services(w);
});

type Table = Exclude<keyof FakeData, 'sequences'>;

/** Runs `action` with a failure on insert #nth into `table`, and checks that nothing at all changed. */
function expectNothingWritten(table: Table, nth: number, action: () => unknown): void {
  const before = w.store.snapshot();
  w.store.failOnInsert(table, nth);
  expect(action).toThrow(`injected failure on insert #${nth} into ${table}`);
  w.store.failure = null;
  expect(w.store.data).toEqual(before); // every table, and the document counters
  expect(w.store.inTx).toBe(false);
}

describe('sale', () => {
  const sell = (packs = 4) => () =>
    s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, lines: [{ product_id: ID.bottle, qty: packs * 1000 }] });

  it.each<[Table, number, string]>([
    ['invoices', 1, 'the invoice'],
    ['invoice_items', 1, 'the first line'],
    ['stock_movements', 1, 'the first stock movement'],
    ['ledger_entries', 1, 'the invoice ledger row'],
    ['payments', 1, 'the payment'],
    ['ledger_entries', 2, 'the payment ledger row (last write)'],
  ])('a failure on insert #%#: %s %i (%s) leaves nothing behind', (table, nth) => {
    expectNothingWritten(table, nth, sell());
  });

  it('a failure on the SECOND line of a split sale undoes the first line and its stock movement too', () => {
    // 12 packs: line 1 from batch A (8), line 2 from batch B (4)
    expectNothingWritten('invoice_items', 2, sell(12));
    expectNothingWritten('stock_movements', 2, sell(12));
    expect(w.store.stockOf(ID.bA)).toBe(8000);
    expect(w.store.stockOf(ID.bB)).toBe(10_000);
  });

  it('a failed sale does not use up an invoice number', () => {
    w.store.failOnInsert('ledger_entries', 1);
    expect(sell()).toThrow();
    w.store.failure = null;
    expect(sell()().invoice.invoice_no).toBe('INV-A-000001');
  });

  it('a walk-in sale that fails after its stock movement is undone as well', () => {
    expectNothingWritten('stock_movements', 1, () => s.sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [{ product_id: ID.bottle, qty: 1000 }] }));
  });
});

describe('purchase', () => {
  const buy = () =>
    s.purchase.record({
      supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 100_000,
      items: [
        { product_id: ID.bottle, batch_no: 'N1', expiry_date: '2027-12-31', qty: 5000, cost_price: 42_000 },
        { product_id: ID.fert, batch_no: 'N2', expiry_date: '2027-12-31', qty: 2000, cost_price: 15_000 },
      ],
    });

  it.each<[Table, number]>([
    ['purchases', 1],
    ['batches', 1],
    ['batches', 2],
    ['purchase_items', 1],
    ['purchase_items', 2],
    ['stock_movements', 1],
    ['stock_movements', 2],
    ['ledger_entries', 1],
    ['payments', 1],
    ['ledger_entries', 2],
  ])('a failure on insert into %s #%i leaves nothing behind (not even a new batch)', (table, nth) => {
    expectNothingWritten(table, nth, buy);
  });
});

describe('sales return', () => {
  function sold() {
    addStock(w, ID.bA, 2000);
    const r = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 200_000, lines: [{ product_id: ID.bottle, qty: 10_000 }] });
    return r;
  }
  const back = (r: ReturnType<typeof sold>) => () =>
    s.salesReturn.create({ invoice_id: r.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: r.items[0]!.id, qty: 2000, condition: 'resellable' }] });

  it.each<[Table, number]>([
    ['sales_returns', 1],
    ['sales_return_items', 1],
    ['stock_movements', 1],
    ['ledger_entries', 1],
  ])('a failure on insert into %s #%i leaves nothing behind', (table, nth) => {
    const r = sold();
    expectNothingWritten(table, nth, back(r));
  });

  it('a failed return does not use up a return number or change what can still be returned', () => {
    const r = sold();
    w.store.failOnInsert('ledger_entries', 1);
    expect(back(r)).toThrow();
    w.store.failure = null;
    expect(back(r)().sales_return.return_no).toBe('RET-A-000001');
    expect(() => s.salesReturn.create({ invoice_id: r.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: r.items[0]!.id, qty: 8000, condition: 'resellable' }] })).not.toThrow();
  });
});

describe('payment, khata and stock', () => {
  it('a customer payment whose ledger row fails leaves no payment either', () => {
    expectNothingWritten('ledger_entries', 1, () => s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 1000, method: 'cash', created_by: ID.staff }));
  });

  it('a supplier payment whose ledger row fails leaves no payment either', () => {
    expectNothingWritten('ledger_entries', 1, () => s.payment.payToSupplier({ party_id: ID.supplier, amount: 1000, method: 'cash', created_by: ID.owner }));
  });

  it('new opening stock whose movement fails leaves no new batch', () => {
    expectNothingWritten('stock_movements', 1, () =>
      s.stock.openingStock({ product_id: ID.fert, batch_no: 'NEW', expiry_date: '2027-09-30', cost_price: 1, qty: 1000, created_by: ID.owner }),
    );
  });
});

describe('the fakes are honest', () => {
  it('a repository cannot be used outside a unit of work', () => {
    const store = new FakeStore();
    const tx = createFakeRepositories(store);
    expect(() => tx.stock.insert({ id: ID.bA, batch_id: ID.bA, qty_delta: 1, movement_type: 'opening', ref_type: null, ref_id: null, created_by: null, ...ID.scope })).toThrow(/outside a unit of work/);
    expect(() => tx.products.getById(ID.bottle)).toThrow(/outside a unit of work/);
  });

  it('refuses a row that sets version, updated_at, created_at or deleted_at', () => {
    for (const column of ['version', 'updated_at', 'created_at', 'deleted_at']) {
      expect(() =>
        w.uow.run((tx) => {
          const row = { id: ID.bA, batch_id: ID.bA, qty_delta: 1, movement_type: 'opening', ref_type: null, ref_id: null, created_by: null, ...ID.scope, [column]: 'x' };
          tx.stock.insert(row as never);
        }),
      ).toThrow(`service set ${column}`);
    }
  });

  it('rolls back a transaction that throws, and refuses nesting', () => {
    const before = w.store.snapshot();
    expect(() =>
      w.uow.run((tx) => {
        tx.numbers.next('invoice');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(w.store.data).toEqual(before);
    expect(() => w.uow.run(() => w.uow.run(() => 1))).toThrow(/inside run/);
  });
});

describe('services stay inside the rules', () => {
  it('a full day of work never sets version or updated_at (the fake would have thrown)', () => {
    s.stock.openingStock({ product_id: ID.fert, batch_no: 'D1', expiry_date: '2027-09-30', cost_price: 1, qty: 5000, created_by: ID.owner });
    s.purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 1000, items: [{ product_id: ID.bottle, batch_no: 'D2', expiry_date: '2027-12-31', qty: 1000, cost_price: 42_000 }] });
    const sale = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 10_000, lines: [{ product_id: ID.bottle, qty: 2000 }] });
    s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 1000, method: 'cash', created_by: ID.staff });
    s.payment.payToSupplier({ party_id: ID.supplier, amount: 1000, method: 'bank', created_by: ID.owner });
    s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 5000, created_by: ID.owner });
    s.salesReturn.create({ invoice_id: sale.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: sale.items[0]!.id, qty: 1000, condition: 'resellable' }] });
    s.stock.adjust({ batch_id: ID.bA, qty_delta: -100, created_by: ID.owner });
    s.stock.writeOff({ batch_id: ID.bA, qty: 100, kind: 'damage', created_by: ID.owner });
    expect(w.store.runs).toBe(9); // one unit of work per operation
  });
});
