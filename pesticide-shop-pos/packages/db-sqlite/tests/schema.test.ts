// Port of schema_test.py. Loads the migrations into an in-memory database and checks the business rules.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, systemClock, todayUtc } from '@pos/core';
import { migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

// The triggers use the database's own date('now'), so these fixtures must follow the real clock.
const day = (offset: number): string => addDays(todayUtc(systemClock), offset);
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

  id.gBottle = ins('product_groups', { name_en: 'Insecticide 1L', name_ur: 'کیڑے مار' });
  id.bottle = ins('products', {
    group_id: id.gBottle, name_en: 'Insecticide 1L', name_ur: 'کیڑے مار', sku: 'INS1L', base_unit: 'ml',
    pack_size: 1000, allow_loose: 0, retail_price: 50_000, wholesale_price: 45_000, min_stock: 5000,
  });
  id.b1 = ins('batches', { product_id: id.bottle, supplier_id: id.sup, batch_no: 'B-001', expiry_date: future, cost_price: 40_000 });
  id.bOld = ins('batches', { product_id: id.bottle, supplier_id: id.sup, batch_no: 'B-OLD', expiry_date: past, cost_price: 40_000 });

  id.gLoose = ins('product_groups', { name_en: 'Fertilizer 1kg', name_ur: 'کھاد' });
  id.loose = ins('products', {
    group_id: id.gLoose, name_en: 'Fertilizer 1kg', name_ur: 'کھاد', base_unit: 'g', pack_size: 1000,
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

describe('product groups and sizes (migration 004)', () => {
  const g: Record<string, string> = {};

  beforeAll(() => {
    // Insecticide X: a 250 ml size that is low on stock and a 1 L size that is not, each with its own batch.
    g.group = ins('product_groups', { name_en: 'Insecticide X', name_ur: 'کیڑے مار دوا ایکس' });
    g.s250 = ins('products', {
      group_id: g.group, pack_label: '250 ml', name_en: 'Insecticide X 250 ml', name_ur: 'کیڑے مار دوا ایکس 250 ml',
      barcode: '8961000250250', base_unit: 'ml', pack_size: 250, retail_price: 14_500, wholesale_price: 13_000, min_stock: 1000,
    });
    g.s1l = ins('products', {
      group_id: g.group, pack_label: '1 L', name_en: 'Insecticide X 1 L', name_ur: 'کیڑے مار دوا ایکس 1 L',
      barcode: '8961000251000', base_unit: 'ml', pack_size: 1000, retail_price: 50_000, wholesale_price: 45_000, min_stock: 2000,
    });
    g.b250 = ins('batches', { product_id: g.s250, batch_no: 'X-250', expiry_date: future, cost_price: 11_500 });
    g.b1l = ins('batches', { product_id: g.s1l, batch_no: 'X-1L', expiry_date: future, cost_price: 40_000 });
    g.b1lOld = ins('batches', { product_id: g.s1l, batch_no: 'X-1L-OLD', expiry_date: past, cost_price: 40_000 });
    ins('stock_movements', { batch_id: g.b250, qty_delta: 600, movement_type: 'purchase', created_by: id.owner });
    ins('stock_movements', { batch_id: g.b1l, qty_delta: 5000, movement_type: 'purchase', created_by: id.owner });
    ins('stock_movements', { batch_id: g.b1lOld, qty_delta: 300, movement_type: 'purchase', created_by: id.owner });
    g.dormant = ins('product_groups', { name_en: 'Dormant product', is_active: 0 });
    g.dormantSize = ins('products', { group_id: g.dormant, name_en: 'Dormant product', base_unit: 'ml', pack_size: 100, retail_price: 1, wholesale_price: 1, is_active: 0 });
  });

  it('every size keeps its own stock: the views show one row per size, with its group and label', () => {
    const rows = db.prepare('SELECT product_id, pack_label, group_name_en, stock_total, stock_sellable FROM v_product_stock WHERE group_id = ? ORDER BY pack_size').all(g.group) as Row[];
    expect(rows).toEqual([
      { product_id: g.s250, pack_label: '250 ml', group_name_en: 'Insecticide X', stock_total: 600, stock_sellable: 600 },
      { product_id: g.s1l, pack_label: '1 L', group_name_en: 'Insecticide X', stock_total: 5300, stock_sellable: 5000 }, // the expired 300 is not sellable
    ]);
  });

  it('low stock is judged per size: the 250 ml is low (600 <= 1000), the 1 L is not (5000 > 2000)', () => {
    expect(count('SELECT COUNT(*) c FROM v_low_stock WHERE product_id = ?', g.s250)).toBe(1);
    expect(count('SELECT COUNT(*) c FROM v_low_stock WHERE product_id = ?', g.s1l)).toBe(0);
  });

  it('v_group_stock adds the sizes up: 2 sizes, 5900 ml, 5600 sellable, 1 size low', () => {
    expect(one('SELECT size_count, base_unit, stock_total, stock_sellable, low_size_count FROM v_group_stock WHERE group_id = ?', g.group)).toEqual({
      size_count: 2, base_unit: 'ml', stock_total: 5900, stock_sellable: 5600, low_size_count: 1,
    });
  });

  it('a product with no sizes still shows in v_group_stock, with zero stock', () => {
    const empty = ins('product_groups', { name_en: 'Empty product' });
    expect(one('SELECT size_count, stock_total FROM v_group_stock WHERE group_id = ?', empty)).toEqual({ size_count: 0, stock_total: 0 });
  });

  it('v_product_group_mismatch is empty while the copied names match, and lists the sizes when the group is renamed without them', () => {
    expect(db.prepare('SELECT * FROM v_product_group_mismatch').all()).toEqual([]);
    db.prepare("UPDATE product_groups SET name_en = 'Insecticide Y' WHERE id = ?").run(g.group);
    expect((db.prepare('SELECT product_id FROM v_product_group_mismatch').all() as Row[]).map((r) => r.product_id).sort()).toEqual([g.s250, g.s1l].sort());
    db.prepare("UPDATE product_groups SET name_en = 'Insecticide X' WHERE id = ?").run(g.group);
    expect(db.prepare('SELECT * FROM v_product_group_mismatch').all()).toEqual([]);
  });

  it('v_product_group_mismatch also catches a drifted category, brand or Urdu name', () => {
    const cat = ins('categories', { name_en: 'Insecticide' });
    db.prepare('UPDATE product_groups SET category_id = ? WHERE id = ?').run(cat, g.group);
    expect(count('SELECT COUNT(*) c FROM v_product_group_mismatch')).toBe(2);
    db.prepare('UPDATE products SET category_id = ? WHERE group_id = ?').run(cat, g.group);
    expect(count('SELECT COUNT(*) c FROM v_product_group_mismatch')).toBe(0);
    db.prepare("UPDATE product_groups SET name_ur = NULL WHERE id = ?").run(g.group);
    expect(count('SELECT COUNT(*) c FROM v_product_group_mismatch')).toBe(2);
    db.prepare("UPDATE product_groups SET name_ur = 'کیڑے مار دوا ایکس', category_id = NULL WHERE id = ?").run(g.group);
    db.prepare('UPDATE products SET category_id = NULL WHERE group_id = ?').run(g.group);
    expect(count('SELECT COUNT(*) c FROM v_product_group_mismatch')).toBe(0);
  });

  describe('rules that must refuse', () => {
    // Ids are made in beforeAll, after the cases are listed, so every case builds its statement lazily.
    const tryInsert = (make: () => Row) => () => ins('products', { name_en: 'X', base_unit: 'ml', pack_size: 100, retail_price: 1, wholesale_price: 1, ...make() });
    const run = (sql: string, ...keys: string[]) => () => db.prepare(sql).run(...keys.map((k) => g[k] ?? id[k]));
    const cases: [string, () => unknown, string][] = [
      ['a size with no group', tryInsert(() => ({ group_id: null })), 'group_id is required'],
      ['a size left out of any group (no group_id at all)', tryInsert(() => ({})), 'group_id is required'],
      ['taking a size out of its group (group_id set to NULL)', run('UPDATE products SET group_id = NULL WHERE id = ?', 's250'), 'group_id is required'],
      ['a size with a different unit in the same group', tryInsert(() => ({ group_id: g.group, pack_label: '500 g', base_unit: 'g' })), 'same base unit'],
      ['changing a size to a different unit than its group-mates', run("UPDATE products SET base_unit = 'g' WHERE id = ?", 's250'), 'same base unit'],
      ['two sizes with the same label', tryInsert(() => ({ group_id: g.group, pack_label: '250 ml' })), 'UNIQUE'],
      ['a second size with no label in a group that has sizes', tryInsert(() => ({ group_id: g.group, pack_label: '' })), 'pack label'],
      ['a labelled size added beside an unlabelled one', tryInsert(() => ({ group_id: id.gBottle, pack_label: '500 ml' })), 'pack label'],
      ['removing the label of a size that has company', run("UPDATE products SET pack_label = '' WHERE id = ?", 's250'), 'pack label'],
      ['an active size inside an inactive product', tryInsert(() => ({ group_id: g.dormant, pack_label: '', is_active: 1 })), 'inactive'],
      ['switching a size on inside an inactive product', run('UPDATE products SET is_active = 1 WHERE id = ?', 'dormantSize'), 'inactive'],
      ['a live size inside a deleted product', () => {
        const deleted = ins('product_groups', { name_en: 'Gone', deleted_at: '2026-01-01T00:00:00.000Z' });
        return ins('products', { group_id: deleted, name_en: 'X', base_unit: 'ml', pack_size: 100, retail_price: 1, wholesale_price: 1 });
      }, 'deleted or inactive'],
      ['deactivating a product that still has active sizes', run('UPDATE product_groups SET is_active = 0 WHERE id = ?', 'group'), 'deactivate its sizes first'],
      ['deleting a product that still has sizes', run("UPDATE product_groups SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", 'group'), 'still has sizes'],
      ['hard-deleting a product group', run('DELETE FROM product_groups WHERE id = ?', 'group'), 'hard delete'],
      ['a group with no name at all', () => ins('product_groups', { name_en: null, name_ur: null }), 'check constraint'],
    ];
    it.each(cases)('blocks %s', (_label, fn, message) => {
      expect(fn).toThrow(new RegExp(message, 'i'));
    });
  });

  it('an unlabelled size is fine on its own, and a second size is fine once both have labels', () => {
    expect(id.gBottle).toBeDefined();
    const solo = ins('product_groups', { name_en: 'Solo' });
    expect(() => ins('products', { group_id: solo, pack_label: '', name_en: 'Solo', base_unit: 'ml', pack_size: 100, retail_price: 1, wholesale_price: 1 })).not.toThrow();
    db.prepare("UPDATE products SET pack_label = '100 ml' WHERE group_id = ?").run(solo);
    expect(() => ins('products', { group_id: solo, pack_label: '200 ml', name_en: 'Solo 200 ml', base_unit: 'ml', pack_size: 200, retail_price: 1, wholesale_price: 1 })).not.toThrow();
  });

  it('a size can move to another product, and a second size may then be unlabelled only if its label is unique', () => {
    const home = ins('product_groups', { name_en: 'Home' });
    const mover = ins('products', { group_id: home, pack_label: '', name_en: 'Home', base_unit: 'ml', pack_size: 100, retail_price: 1, wholesale_price: 1 });
    db.prepare("UPDATE products SET group_id = ?, pack_label = '100 ml' WHERE id = ?").run(g.group, mover);
    expect(one('SELECT group_id FROM products WHERE id = ?', mover).group_id).toBe(g.group);
    db.prepare("UPDATE product_groups SET is_active = 0 WHERE id = ?").run(home); // now empty: switching it off is allowed
  });

  it('groups are logged for sync and versioned like every other editable table', () => {
    expect(count("SELECT COUNT(*) c FROM change_log WHERE table_name = 'product_groups' AND operation = 'insert' AND row_id = ?", g.group)).toBe(1);
    const before = one('SELECT version FROM product_groups WHERE id = ?', g.group).version as number;
    db.prepare("UPDATE product_groups SET notes = 'x' WHERE id = ?").run(g.group);
    expect(one('SELECT version FROM product_groups WHERE id = ?', g.group).version).toBe(before + 1);
    expect(count("SELECT COUNT(*) c FROM change_log WHERE table_name = 'product_groups' AND operation = 'update' AND row_id = ?", g.group)).toBeGreaterThanOrEqual(1);
  });
});
