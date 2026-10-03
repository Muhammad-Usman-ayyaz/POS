// End to end on a real SQLite database: the services, the SQLite adapter, the migrations, the triggers and the views.
import { codeOf, ID, runPurchaseSaleReturnScenario, services } from '@pos/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity } from '../src/index.js';
import { createSqliteWorld, type SqliteWorld } from './support/sqlite-world.js';

let w: SqliteWorld;
beforeEach(async () => {
  w = await createSqliteWorld({ stock: false }); // a shop with no stock: this scenario buys its own
});
afterEach(() => w.close());

const one = (sql: string, ...params: unknown[]) => w.db.prepare(sql).get(...params) as Record<string, number | string>;
const count = (table: string) => (one(`SELECT COUNT(*) AS c FROM ${table}`).c as number);
const ALL_TABLES = ['invoices', 'invoice_items', 'stock_movements', 'ledger_entries', 'payments', 'batches', 'purchases', 'purchase_items', 'sales_returns', 'sales_return_items', 'audit_log', 'change_log'];

describe('purchase 20 bottles, sell 10 on credit with Rs 2000 paid, return 2 resellable', () => {
  it('stock is 12000 ml, the customer owes Rs 2000, profit is Rs 800', () => {
    const r = runPurchaseSaleReturnScenario(w);
    const s = services(w);

    // what the services say
    expect(s.stock.stockOfBatch(r.batchId)).toBe(12_000);
    expect(s.khata.balance(ID.customer)).toBe(200_000);

    // what the database says, from its own views
    expect(one('SELECT stock FROM v_batch_stock WHERE batch_id = ?', r.batchId).stock).toBe(12_000);
    expect(one('SELECT balance FROM v_customer_balance WHERE customer_id = ?', ID.customer).balance).toBe(200_000);
    expect(one('SELECT balance FROM v_supplier_balance WHERE supplier_id = ?', ID.supplier).balance).toBe(0); // paid in full

    // net sales Rs 4000 (10 sold, 2 back), cost Rs 3200 (8 bottles at Rs 400), profit Rs 800
    const profit = w.db.prepare('SELECT revenue, cost, profit FROM v_profit_by_day').all() as { revenue: number; cost: number; profit: number }[];
    expect(profit).toEqual([{ revenue: 400_000, cost: 320_000, profit: 80_000 }]);
  });

  it('leaves the database consistent: no invoice mismatch, 2 bottles returned and 8 returnable, integrity and foreign keys ok', () => {
    const r = runPurchaseSaleReturnScenario(w);

    expect(w.db.prepare('SELECT * FROM v_invoice_mismatch').all()).toEqual([]);
    expect(one('SELECT qty_sold, qty_returned, qty_returnable FROM v_invoice_item_returnable WHERE invoice_item_id = ?', r.itemId)).toEqual({ qty_sold: 10_000, qty_returned: 2000, qty_returnable: 8000 });
    expect(checkIntegrity(w.db)).toEqual({ ok: true, problems: [] });
    expect(w.db.pragma('foreign_key_check')).toEqual([]);

    // the triggers logged every write for sync, and nothing is marked as synced yet
    expect(count('change_log')).toBeGreaterThan(10);
    expect(one('SELECT COUNT(*) AS c FROM change_log WHERE synced_at IS NOT NULL').c).toBe(0);
  });

  it('records the rows the rules say it should: invoice, payment, ledger, movements, return', () => {
    runPurchaseSaleReturnScenario(w);
    expect(w.rows('stock_movements').map((m) => [m.movement_type, m.qty_delta])).toEqual([
      ['purchase', 20_000],
      ['sale', -10_000],
      ['sale_return', 2000],
    ]);
    expect(w.rows('ledger_entries').map((e) => [e.party_type, e.entry_type, e.amount_delta])).toEqual([
      ['supplier', 'purchase', 800_000],
      ['supplier', 'payment', -800_000],
      ['customer', 'invoice', 500_000],
      ['customer', 'payment', -200_000],
      ['customer', 'return', -100_000],
    ]);
    expect(w.rows('payments').map((p) => [p.party_type, p.direction, p.amount])).toEqual([
      ['supplier', 'out', 800_000],
      ['customer', 'in', 200_000],
    ]);
    expect(w.rows('invoices')[0]).toMatchObject({ invoice_no: 'INV-A-000001', total: 500_000, paid_amount: 200_000, payment_method: 'cash', status: 'active' });
    expect(w.rows('sales_returns')[0]).toMatchObject({ return_no: 'RET-A-000001', total: 100_000, refund_method: 'khata_credit' });
  });
});

describe('refusals', () => {
  it('returning more than was sold is refused by the service, and the database refuses it too if the service is bypassed', () => {
    const r = runPurchaseSaleReturnScenario(w);
    const s = services(w);
    const before = w.snapshot();

    expect(codeOf(() => s.salesReturn.create({ invoice_id: r.invoiceId, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: r.itemId, qty: 9000, condition: 'resellable' }] }))).toBe('RETURN_EXCEEDS_SOLD');
    expect(w.snapshot()).toEqual(before);

    // straight into the table, around the services: the trigger still says no
    expect(() =>
      w.db.prepare(
        `INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, condition, shop_id, branch_id, device_id)
         VALUES ('x', ?, ?, 9000, 1, 'resellable', ?, ?, ?)`,
      ).run(r.returnId, r.itemId, w.deps.scope.shop_id, w.deps.scope.branch_id, w.deps.scope.device_id),
    ).toThrow(/return exceeds quantity sold/);
  });

  it('overselling is refused by the service, and the database refuses it too if the service is bypassed', () => {
    const r = runPurchaseSaleReturnScenario(w);
    const s = services(w);
    const before = w.snapshot();

    expect(codeOf(() => s.sale.create({ created_by: ID.staff, paid_amount: 650_000, lines: [{ product_id: ID.bottle, qty: 13_000 }] }))).toBe('INSUFFICIENT_STOCK'); // 12 in stock
    expect(w.snapshot()).toEqual(before);

    expect(() =>
      w.db.prepare(
        `INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id)
         VALUES ('y', ?, -12001, 'sale', ?, ?, ?, ?)`,
      ).run(r.batchId, ID.owner, w.deps.scope.shop_id, w.deps.scope.branch_id, w.deps.scope.device_id),
    ).toThrow(/insufficient stock/);
  });
});

describe('a failure part-way through a sale leaves nothing written in the real database', () => {
  const rowCounts = () => Object.fromEntries(ALL_TABLES.map((t) => [t, count(t)]));
  const lastInvoiceNumber = () => one("SELECT last_number FROM number_sequences WHERE sequence_name = 'invoice'").last_number;
  // 12 packs: with stock in two batches the sale needs two invoice lines and two stock movements
  const bigSale = () => services(w).sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, lines: [{ product_id: ID.bottle, qty: 12_000 }] });

  beforeEach(() => {
    const s = services(w);
    s.stock.openingStock({ product_id: ID.bottle, batch_no: 'X1', expiry_date: w.day(100), cost_price: 40_000, qty: 8000, created_by: ID.owner });
    s.stock.openingStock({ product_id: ID.bottle, batch_no: 'X2', expiry_date: w.day(200), cost_price: 41_000, qty: 10_000, created_by: ID.owner });
  });

  it('a failure raised by the application after the first line was written', () => {
    const before = { rows: rowCounts(), number: lastInvoiceNumber(), snapshot: w.snapshot() };
    w.failOnInsert('stock_movements', 2); // after the invoice, both lines and the first stock movement are already in the database
    expect(bigSale).toThrow('injected failure on insert #2 into stock_movements');
    w.clearFailure();

    expect(rowCounts()).toEqual(before.rows);
    expect(lastInvoiceNumber()).toBe(before.number);
    expect(w.snapshot()).toEqual(before.snapshot);
    expect(w.db.inTransaction).toBe(false);
  });

  it('a failure raised by the DATABASE itself, from a trigger, on the second stock movement', () => {
    w.db.exec(`
      CREATE TEMP TRIGGER fail_second_sale_movement BEFORE INSERT ON stock_movements
      WHEN NEW.movement_type = 'sale' AND (SELECT COUNT(*) FROM stock_movements WHERE movement_type = 'sale') >= 1
      BEGIN SELECT RAISE(ABORT, 'simulated database failure'); END;`);
    const before = { rows: rowCounts(), number: lastInvoiceNumber(), snapshot: w.snapshot() };

    expect(bigSale).toThrow(/simulated database failure/);

    expect(rowCounts()).toEqual(before.rows);
    expect(lastInvoiceNumber()).toBe(before.number);
    expect(w.snapshot()).toEqual(before.snapshot);
    expect(w.db.inTransaction).toBe(false);
  });

  it('the database is usable afterwards: the next sale works and gets the number the failed one did not use', () => {
    w.failOnInsert('ledger_entries', 2);
    expect(bigSale).toThrow();
    w.clearFailure();

    const ok = bigSale();
    expect(ok.invoice.invoice_no).toBe('INV-A-000001');
    expect(ok.items).toHaveLength(2);
    expect(count('invoices')).toBe(1);
    expect(w.db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('prices include tax (open question 6)', () => {
  it('a taxed sale and a partial return: the database constraints, v_invoice_mismatch and v_profit_by_day all agree', async () => {
    const t = await createSqliteWorld(); // the usual shop, with stock of a product that has 18 percent tax
    try {
      const s = services(t);
      // 10 packs at Rs 500 (tax included), Rs 100 discount: the customer pays 490000, of which 74746 is tax
      const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.taxed, qty: 10_000, line_discount: 10_000 }] });
      expect(t.rows('invoices')[0]).toMatchObject({ subtotal: 415_254, tax_total: 74_746, total: 490_000 }); // total = subtotal + tax_total = the line
      expect(t.rows('invoice_items')[0]).toMatchObject({ line_total: 490_000, tax_amount: 74_746, tax_rate_bp: 1800 });
      expect(t.db.prepare('SELECT * FROM v_invoice_mismatch').all()).toEqual([]);
      expect(t.rows('ledger_entries').at(-1)).toMatchObject({ entry_type: 'invoice', amount_delta: 490_000 }); // the customer owes the price, not price + tax

      // revenue is the sale without its tax; cost is 10 packs at Rs 400
      expect(t.db.prepare('SELECT revenue, cost, profit FROM v_profit_by_day').all()).toEqual([{ revenue: 415_254, cost: 400_000, profit: 15_254 }]);

      // 2 packs back: Rs 980 refunded, and the revenue that comes off is the net part of it (98000 * 415254 / 490000 = 83050.8)
      const back = s.salesReturn.create({ invoice_id: sold.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: sold.items[0]!.id, qty: 2000, condition: 'resellable' }] });
      expect(back.sales_return.total).toBe(98_000);
      expect(t.rows('ledger_entries').at(-1)).toMatchObject({ entry_type: 'return', amount_delta: -98_000 });
      expect(t.db.prepare('SELECT revenue, cost, profit FROM v_profit_by_day').all()).toEqual([{ revenue: 332_203, cost: 320_000, profit: 12_203 }]);
      expect(t.db.prepare('SELECT * FROM v_invoice_mismatch').all()).toEqual([]);
    } finally {
      t.close();
    }
  });
});
