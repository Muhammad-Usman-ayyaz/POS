// Port of schema_test.py. Loads the migrations into an in-memory database and checks the business rules.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

const day = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const future = day(365);
const soon = day(10);
const past = '2020-01-01';

let db: Db;
const ctx: Record<string, string> = {};
const id: Record<string, string> = {};

function ins(table: string, vals: Row): string {
  const cols = (db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name);
  const row: Row = { ...vals };
  if (cols.includes('id') && row.id === undefined) row.id = randomUUID();
  for (const c of ['shop_id', 'branch_id', 'device_id']) {
    if (cols.includes(c) && row[c] === undefined && ctx[c]) row[c] = ctx[c];
  }
  const names = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(
    ...Object.values(row),
  );
  return row.id as string;
}

const one = (sql: string, ...args: unknown[]): Row => db.prepare(sql).get(...args) as Row;
const stock = (batch: string): number => one('SELECT stock FROM v_batch_stock WHERE batch_id=?', batch).stock as number;
const balance = (customer: string): number =>
  one('SELECT balance FROM v_customer_balance WHERE customer_id=?', customer).balance as number;
const count = (sql: string, ...args: unknown[]): number => one(sql, ...args).c as number;
const exec = (sql: string, ...args: unknown[]) => () => db.prepare(sql).run(...args);

beforeAll(async () => {
  db = openDatabase(':memory:');
  await migrate(db);

  ctx.shop_id = ins('shops', { name: 'Pesticide Club Shop' });
  ctx.branch_id = ins('branches', { shop_id: ctx.shop_id, name: 'Main', code: 'A' });
  ctx.device_id = ins('devices', { branch_id: ctx.branch_id, name: 'Counter PC', device_code: 'A1' });
  id.owner = ins('users', { name: 'Owner', username: 'owner', password_hash: 'x', role: 'owner' });
  id.staff = ins('users', { name: 'Salesman', username: 'staff', password_hash: 'x', role: 'staff' });
  id.sup = ins('suppliers', { name_en: 'Agri Dealer', name_ur: 'ایگری ڈیلر' });
  id.cust = ins('customers', { name_en: 'Rashid', name_ur: 'راشد', village: 'Kot', credit_limit: 1_000_000 });

  id.bottle = ins('products', {
    name_en: 'Insecticide 1L', name_ur: 'کیڑے مار', sku: 'INS1L', base_unit: 'ml',
    pack_size: 1000, allow_loose: 0, retail_price: 50_000, wholesale_price: 45_000, min_stock: 5000,
  });
  id.b1 = ins('batches', { product_id: id.bottle, supplier_id: id.sup, batch_no: 'B-001', expiry_date: future, cost_price: 40_000 });
  id.bOld = ins('batches', { product_id: id.bottle, supplier_id: id.sup, batch_no: 'B-OLD', expiry_date: past, cost_price: 40_000 });

  id.loose = ins('products', {
    name_en: 'Fertilizer 1kg', name_ur: 'کھاد', base_unit: 'g', pack_size: 1000,
    allow_loose: 1, retail_price: 20_000, wholesale_price: 18_000,
  });
  id.b2 = ins('batches', { product_id: id.loose, batch_no: 'F-001', expiry_date: future, cost_price: 15_000 });
  id.b3 = ins('batches', { product_id: id.loose, batch_no: 'F-NEAR', expiry_date: soon, cost_price: 15_000 });

  // purchase of 20 bottles
  const pur = ins('purchases', { supplier_id: id.sup, total: 800_000, paid_amount: 800_000 });
  ins('purchase_items', { purchase_id: pur, batch_id: id.b1, qty: 20_000, cost_price: 40_000 });
  ins('stock_movements', { batch_id: id.b1, qty_delta: 20_000, movement_type: 'purchase', ref_type: 'purchase', ref_id: pur, created_by: id.owner });
  ins('stock_movements', { batch_id: id.bOld, qty_delta: 1_000, movement_type: 'purchase', created_by: id.owner });
  ins('stock_movements', { batch_id: id.b2, qty_delta: 10_000, movement_type: 'purchase', created_by: id.owner });
  ins('stock_movements', { batch_id: id.b3, qty_delta: 100, movement_type: 'purchase', created_by: id.owner });
});

describe('stock', () => {
  it('stock after purchase is 20000 ml', () => {
    expect(stock(id.b1!)).toBe(20_000);
  });
});

describe('sale, return and views', () => {
  beforeAll(() => {
    // sale: 10 bottles at Rs 500 on credit, Rs 2000 paid
    id.inv = ins('invoices', {
      invoice_no: 'INV-A-000001', customer_id: id.cust, created_by: id.staff,
      subtotal: 500_000, total: 500_000, paid_amount: 200_000, due_date: future,
    });
    id.ii = ins('invoice_items', {
      invoice_id: id.inv, product_id: id.bottle, batch_id: id.b1, qty: 10_000,
      unit_price: 50_000, cost_price: 40_000, line_total: 500_000,
    });
    ins('stock_movements', { batch_id: id.b1, qty_delta: -10_000, movement_type: 'sale', ref_type: 'invoice', ref_id: id.inv, created_by: id.staff });
    ins('ledger_entries', { party_type: 'customer', party_id: id.cust, entry_type: 'invoice', amount_delta: 500_000, ref_type: 'invoice', ref_id: id.inv });
    ins('payments', { party_type: 'customer', party_id: id.cust, method: 'cash', amount: 200_000, direction: 'in' });
    ins('ledger_entries', { party_type: 'customer', party_id: id.cust, entry_type: 'payment', amount_delta: -200_000 });
  });

  it('sale: stock is 10000 ml, customer owes Rs 3000, invoice matches its lines', () => {
    expect(stock(id.b1!)).toBe(10_000);
    expect(balance(id.cust!)).toBe(300_000);
    expect(count('SELECT COUNT(*) c FROM v_invoice_mismatch')).toBe(0);
  });

  describe('return of 2 bottles, resellable, credited to Khata', () => {
    beforeAll(() => {
      id.ret = ins('sales_returns', {
        return_no: 'RET-A-000001', invoice_id: id.inv, approved_by: id.owner, refund_method: 'khata_credit', total: 100_000,
      });
      ins('sales_return_items', { sales_return_id: id.ret, invoice_item_id: id.ii, qty: 2_000, refund_amount: 100_000, condition: 'resellable' });
      ins('stock_movements', { batch_id: id.b1, qty_delta: 2_000, movement_type: 'sale_return', ref_type: 'return', ref_id: id.ret, created_by: id.owner });
      ins('ledger_entries', { party_type: 'customer', party_id: id.cust, entry_type: 'return', amount_delta: -100_000, ref_type: 'return', ref_id: id.ret });
    });

    it('stock is 12000 ml and the customer owes Rs 2000', () => {
      expect(stock(id.b1!)).toBe(12_000);
      expect(balance(id.cust!)).toBe(200_000);
    });

    it('8000 ml are still returnable', () => {
      const r = one('SELECT qty_returned, qty_returnable FROM v_invoice_item_returnable WHERE invoice_item_id=?', id.ii);
      expect([r.qty_returned, r.qty_returnable]).toEqual([2_000, 8_000]);
    });

    it('net sales 4000, cost 3200, profit 800 (in paisa)', () => {
      const p = one('SELECT revenue, cost, profit FROM v_profit_by_day');
      expect([p.revenue, p.cost, p.profit]).toEqual([400_000, 320_000, 80_000]);
    });

    describe('rules that must refuse', () => {
      const cases: [string, () => unknown, string][] = [
        ['returning more than was sold', () => ins('sales_return_items', { sales_return_id: id.ret, invoice_item_id: id.ii, qty: 9_000, refund_amount: 1, condition: 'resellable' }), 'return exceeds'],
        ['selling more than the stock', () => ins('stock_movements', { batch_id: id.b1, qty_delta: -99_000, movement_type: 'sale' }), 'insufficient stock'],
        ['selling from an expired batch', () => ins('stock_movements', { batch_id: id.bOld, qty_delta: -1_000, movement_type: 'sale' }), 'expired'],
        ['loose quantity of a pack-only product', () => ins('invoice_items', { invoice_id: id.inv, product_id: id.bottle, batch_id: id.b1, qty: 250, unit_price: 50_000, cost_price: 40_000, line_total: 12_500 }), 'whole packs'],
        ['a batch from a different product', () => ins('invoice_items', { invoice_id: id.inv, product_id: id.loose, batch_id: id.b1, qty: 1000, unit_price: 20_000, cost_price: 15_000, line_total: 20_000 }), 'does not belong'],
        ['a walk-in credit sale', () => ins('invoices', { invoice_no: 'INV-A-000099', created_by: id.staff, subtotal: 1000, total: 1000, paid_amount: 0 }), 'check constraint'],
        ['a negative price', () => db.prepare('UPDATE products SET retail_price = -1 WHERE id=?').run(id.bottle), 'check constraint'],
        ['a payment to an unknown party', () => ins('payments', { party_type: 'customer', party_id: randomUUID(), method: 'cash', amount: 1, direction: 'in' }), 'unknown party'],
        ['editing a ledger entry', exec('UPDATE ledger_entries SET amount_delta = 1'), 'append-only'],
        ['deleting a ledger entry', exec('DELETE FROM ledger_entries'), 'append-only'],
        ['deleting a stock movement', exec('DELETE FROM stock_movements'), 'append-only'],
        ['editing an invoice line', exec('UPDATE invoice_items SET qty = 1'), 'append-only'],
        ['hard-deleting a product', () => db.prepare('DELETE FROM products WHERE id=?').run(id.bottle), 'hard delete'],
        ['hard-deleting an invoice', exec('DELETE FROM invoices'), 'hard delete'],
      ];
      it.each(cases)('blocks %s', (_label, fn, message) => {
        expect(fn).toThrow(new RegExp(message, 'i'));
      });
    });

    describe('loose sale and void', () => {
      beforeAll(() => {
        id.inv2 = ins('invoices', { invoice_no: 'INV-A-000002', created_by: id.staff, subtotal: 5_000, total: 5_000, paid_amount: 5_000 });
        ins('invoice_items', { invoice_id: id.inv2, product_id: id.loose, batch_id: id.b2, qty: 250, unit_price: 20_000, cost_price: 15_000, line_total: 5_000 });
        ins('stock_movements', { batch_id: id.b2, qty_delta: -250, movement_type: 'sale', ref_type: 'invoice', ref_id: id.inv2 });
      });

      it('250 g sold loose leaves 9750 g', () => {
        expect(stock(id.b2!)).toBe(9_750);
      });

      it('an invoice can be voided with a reason, and voided invoices refuse further changes', () => {
        db.prepare("UPDATE invoices SET status='voided', void_reason='entered by mistake', voided_by=? WHERE id=?").run(id.owner, id.inv2);
        expect(one('SELECT status FROM invoices WHERE id=?', id.inv2).status).toBe('voided');

        expect(exec("UPDATE invoices SET status='voided', void_reason=NULL WHERE id=?", id.inv)).toThrow(/check constraint/i);
        expect(() =>
          ins('sales_returns', { return_no: 'RET-A-000002', invoice_id: id.inv2, approved_by: id.owner, refund_method: 'cash', total: 1 }),
        ).toThrow(/voided/i);
        expect(() =>
          ins('invoice_items', { invoice_id: id.inv2, product_id: id.loose, batch_id: id.b2, qty: 10, unit_price: 20_000, cost_price: 15_000, line_total: 200 }),
        ).toThrow(/voided/i);
      });
    });

    describe('views', () => {
      it('expired stock shows the old batch', () => {
        const rows = db.prepare('SELECT batch_no FROM v_expired_stock').all() as { batch_no: string }[];
        expect(rows.map((r) => r.batch_no)).toEqual(['B-OLD']);
      });

      it('near-expiry (30 days) shows the 10-day batch', () => {
        const rows = db.prepare('SELECT batch_no FROM v_near_expiry').all() as { batch_no: string }[];
        expect(rows.map((r) => r.batch_no)).toEqual(['F-NEAR']);
      });

      it('expired batch is not counted as sellable', () => {
        const ps = one('SELECT stock_total, stock_sellable FROM v_product_stock WHERE product_id=?', id.bottle);
        expect([ps.stock_total, ps.stock_sellable]).toEqual([13_000, 12_000]);
      });

      it('low stock appears only when the minimum is raised above stock', () => {
        expect(count('SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?', id.bottle)).toBe(0);
        db.prepare('UPDATE products SET min_stock = 20000 WHERE id=?').run(id.bottle);
        expect(count('SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?', id.bottle)).toBe(1);
      });
    });

    describe('sync support', () => {
      it('an update bumps the version and changes are logged', () => {
        expect(one('SELECT version FROM products WHERE id=?', id.bottle).version).toBe(2);
        expect(count('SELECT COUNT(*) c FROM change_log WHERE synced_at IS NULL')).toBeGreaterThan(20);
      });

      it('synced_at can be set, content cannot be edited, unsynced rows cannot be deleted', () => {
        db.prepare("UPDATE change_log SET synced_at = datetime('now') WHERE table_name='products'").run();
        expect(count('SELECT COUNT(*) c FROM change_log WHERE synced_at IS NOT NULL')).toBeGreaterThan(0);
        expect(exec("UPDATE change_log SET row_id = 'x'")).toThrow(/append-only/i);
        expect(exec('DELETE FROM change_log WHERE synced_at IS NULL')).toThrow(/not synced/i);
      });
    });

    describe('integrity', () => {
      it('integrity_check is ok and there are no foreign key violations', () => {
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(db.pragma('foreign_key_check')).toEqual([]);
      });
    });
  });
});
