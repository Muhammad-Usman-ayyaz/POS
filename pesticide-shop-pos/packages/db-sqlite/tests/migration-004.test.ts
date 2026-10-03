// Migration 004 (product groups) applied on top of a database that already has real-looking data at version 3.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentSchemaVersion, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = {
  shop: 's1', branch: 'b1', device: 'd1', owner: 'u1',
  category: 'c0000000-0000-4000-8000-000000000001', brand: 'c0000000-0000-4000-8000-000000000002',
  insecticide: 'a0000000-0000-4000-8000-000000000001', fertilizer: 'a0000000-0000-4000-8000-000000000002', retired: 'a0000000-0000-4000-8000-000000000003',
  batch: 'b0000000-0000-4000-8000-000000000001', fertBatch: 'b0000000-0000-4000-8000-000000000002',
  invoice: 'e0000000-0000-4000-8000-000000000001',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig004-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo3 = () => loadMigrations().slice(0, 3);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;

/** A shop at version 3: three products (one inactive Urdu-only, one deleted), stock, and a sale. */
async function shopAtVersion3(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo3() });
  expect(currentSchemaVersion(db)).toBe(3);
  const s = [ID.shop, ID.branch, ID.device];
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');`);
  db.prepare('INSERT INTO categories (id, name_en, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?)').run(ID.category, 'Insecticide', ...s);
  db.prepare('INSERT INTO brands (id, name_en, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?)').run(ID.brand, 'Brand X', ...s);
  const product = db.prepare(
    `INSERT INTO products (id, category_id, brand_id, name_en, name_ur, sku, barcode, base_unit, pack_size, allow_loose, retail_price, wholesale_price, tax_rate_bp, min_stock, is_active, deleted_at, shop_id, branch_id, device_id)
     VALUES (@id, @category, @brand, @en, @ur, @sku, @barcode, @unit, @pack, @loose, 50000, 45000, @tax, @min, @active, @deleted, 's1', 'b1', 'd1')`,
  );
  product.run({ id: ID.insecticide, category: ID.category, brand: ID.brand, en: 'Insecticide 1L', ur: 'کیڑے مار دوا', sku: 'INS1L', barcode: '8961', unit: 'ml', pack: 1000, loose: 0, tax: 1800, min: 5000, active: 1, deleted: null });
  product.run({ id: ID.fertilizer, category: null, brand: null, en: null, ur: 'کھاد', sku: null, barcode: null, unit: 'g', pack: 1000, loose: 1, tax: 0, min: 2000, active: 0, deleted: null });
  product.run({ id: ID.retired, category: null, brand: null, en: 'Old product', ur: null, sku: null, barcode: null, unit: 'piece', pack: 1, loose: 0, tax: 0, min: 0, active: 1, deleted: '2026-01-01T00:00:00.000Z' });

  db.prepare('INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(ID.batch, ID.insecticide, 'B1', '2099-01-01', 40_000, ...s);
  db.prepare('INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(ID.fertBatch, ID.fertilizer, 'F1', '2099-01-01', 15_000, ...s);
  const move = db.prepare("INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 'u1', 's1', 'b1', 'd1')");
  move.run('m0000000-0000-4000-8000-000000000001', ID.batch, 20_000, 'purchase');
  move.run('m0000000-0000-4000-8000-000000000002', ID.fertBatch, 3000, 'purchase');
  db.prepare("INSERT INTO invoices (id, invoice_no, created_by, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, 'INV-A-000001', 'u1', 100000, 100000, 100000, 's1', 'b1', 'd1')").run(ID.invoice);
  db.prepare("INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, shop_id, branch_id, device_id) VALUES ('i0000000-0000-4000-8000-000000000001', ?, ?, ?, 2000, 50000, 40000, 100000, 's1', 'b1', 'd1')").run(ID.invoice, ID.insecticide, ID.batch);
  move.run('m0000000-0000-4000-8000-000000000003', ID.batch, -2000, 'sale');
  return db;
}

describe('migration 004 on a shop that already has data', () => {
  it('gives every existing product its own group, with its names, category, brand, active flag and deleted_at', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    const result = await migrate(db);
    expect(result.applied).toEqual([4]);
    expect(result.backupPath).not.toBeNull(); // the version-3 file was copied first
    expect(currentSchemaVersion(db)).toBe(4);

    const groups = all(db, 'SELECT * FROM product_groups ORDER BY name_en');
    expect(groups).toHaveLength(3);
    const byProduct = (productId: string) => one(db, 'SELECT g.* FROM product_groups g JOIN products p ON p.group_id = g.id WHERE p.id = ?', productId);

    expect(byProduct(ID.insecticide)).toMatchObject({ name_en: 'Insecticide 1L', name_ur: 'کیڑے مار دوا', category_id: ID.category, brand_id: ID.brand, is_active: 1, deleted_at: null });
    expect(byProduct(ID.fertilizer)).toMatchObject({ name_en: null, name_ur: 'کھاد', category_id: null, is_active: 0, deleted_at: null });
    expect(byProduct(ID.retired)).toMatchObject({ name_en: 'Old product', is_active: 1 });
    expect(byProduct(ID.retired)!.deleted_at).toBe('2026-01-01T00:00:00.000Z'); // a deleted product's group is deleted too
    expect(groups.every((g) => g.shop_id === ID.shop && g.branch_id === ID.branch && g.device_id === ID.device)).toBe(true);
    db.close();
  });

  it('uses fresh ids for the groups: no group id equals any product id, all are valid v4 UUIDs, and no two are alike', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    await migrate(db);
    const groupIds = all(db, 'SELECT id FROM product_groups').map((g) => g.id as string);
    const productIds = new Set(all(db, 'SELECT id FROM products').map((p) => p.id as string));
    expect(groupIds.every((id) => UUID_V4.test(id))).toBe(true);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(groupIds.some((id) => productIds.has(id))).toBe(false);
    // every product points at exactly one group, and no two products share one
    expect(all(db, 'SELECT group_id, COUNT(*) c FROM products GROUP BY group_id').every((r) => r.c === 1)).toBe(true);
    expect(one(db, 'SELECT COUNT(*) c FROM products WHERE group_id IS NULL').c).toBe(0);
    db.close();
  });

  it('changes nothing else: the old columns of every product, and every batch, movement and invoice, are identical', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    const before = {
      products: all(db, 'SELECT * FROM products ORDER BY id'),
      batches: all(db, 'SELECT * FROM batches ORDER BY id'),
      movements: all(db, 'SELECT * FROM stock_movements ORDER BY id'),
      invoices: all(db, 'SELECT * FROM invoices ORDER BY id'),
      items: all(db, 'SELECT * FROM invoice_items ORDER BY id'),
      stock: all(db, 'SELECT * FROM v_product_stock ORDER BY product_id'),
      low: all(db, 'SELECT product_id FROM v_low_stock ORDER BY product_id'),
    };
    await migrate(db);

    // products: every old column is the same, except version and updated_at, which the backfill update bumps (that is right: the row changed)
    const after = all(db, 'SELECT * FROM products ORDER BY id');
    expect(after).toHaveLength(before.products.length);
    before.products.forEach((old, i) => {
      for (const [column, value] of Object.entries(old)) {
        if (column === 'version' || column === 'updated_at') continue;
        expect(after[i]![column], `products.${column}`).toEqual(value);
      }
      expect(after[i]!.version).toBe((old.version as number) + 1);
      expect(after[i]!.pack_label).toBe(''); // names do not change, so the label stays empty
    });
    expect(all(db, 'SELECT * FROM batches ORDER BY id')).toEqual(before.batches);
    expect(all(db, 'SELECT * FROM stock_movements ORDER BY id')).toEqual(before.movements);
    expect(all(db, 'SELECT * FROM invoices ORDER BY id')).toEqual(before.invoices);
    expect(all(db, 'SELECT * FROM invoice_items ORDER BY id')).toEqual(before.items);

    // the stock views give the same numbers (they only gained group columns)
    const stock = all(db, 'SELECT * FROM v_product_stock ORDER BY product_id');
    expect(stock.map((r) => [r.product_id, r.stock_total, r.stock_sellable, r.min_stock, r.is_active])).toEqual(before.stock.map((r) => [r.product_id, r.stock_total, r.stock_sellable, r.min_stock, r.is_active]));
    expect(all(db, 'SELECT product_id FROM v_low_stock ORDER BY product_id')).toEqual(before.low);
    db.close();
  });

  it('is consistent afterwards: foreign keys, integrity, no drifted copies, no leftover temp table', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    await migrate(db);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(all(db, 'SELECT * FROM v_product_group_mismatch')).toEqual([]);
    expect(all(db, "SELECT name FROM sqlite_temp_master WHERE name = '_group_backfill'")).toEqual([]);
    // the product with 18000 ml is still 18000 ml, now also visible per group
    expect(one(db, 'SELECT stock_total, size_count FROM v_group_stock WHERE name_en = ?', 'Insecticide 1L')).toEqual({ stock_total: 18_000, size_count: 1 });
    expect(all(db, 'SELECT name_en FROM v_group_stock ORDER BY name_en').map((r) => r.name_en)).toEqual([null, 'Insecticide 1L']); // the deleted product's group is not listed
    db.close();
  });

  it('writes the changes to change_log so sync sees them: one insert per group, one update per product', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    const logBefore = one(db, "SELECT COUNT(*) c FROM change_log WHERE table_name = 'products' AND operation = 'update'").c as number;
    await migrate(db);
    expect(one(db, "SELECT COUNT(*) c FROM change_log WHERE table_name = 'product_groups' AND operation = 'insert'").c).toBe(3);
    expect(one(db, "SELECT COUNT(*) c FROM change_log WHERE table_name = 'products' AND operation = 'update'").c).toBe(logBefore + 3);
    db.close();
  });

  it('the old products keep working: an old product still sells, and the new rules apply to it', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    await migrate(db);
    const s = [ID.shop, ID.branch, ID.device];
    // a sale line on an old product, with its old batch
    expect(() =>
      db.prepare("INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 1000, 50000, 40000, 50000, ?, ?, ?)")
        .run('i0000000-0000-4000-8000-000000000002', ID.invoice, ID.insecticide, ID.batch, ...s),
    ).not.toThrow();
    // adding a second size to its group needs a label on BOTH sizes, which the service supplies (the migration left the label empty)
    const groupId = one(db, 'SELECT group_id FROM products WHERE id = ?', ID.insecticide).group_id as string;
    const newSize = (label: string) =>
      db.prepare("INSERT INTO products (id, group_id, pack_label, name_en, base_unit, pack_size, retail_price, wholesale_price, shop_id, branch_id, device_id) VALUES ('a0000000-0000-4000-8000-0000000000ff', ?, ?, 'X', 'ml', 500, 1, 1, ?, ?, ?)").run(groupId, label, ...s);
    expect(() => newSize('500 ml')).toThrow(/pack label/);
    db.prepare("UPDATE products SET pack_label = '1 L' WHERE id = ?").run(ID.insecticide);
    expect(() => newSize('500 ml')).not.toThrow();
    db.close();
  });

  it('on a shop with no products at all, it just creates the empty tables', async () => {
    const db = openDatabase(':memory:');
    const result = await migrate(db);
    expect(result.applied).toEqual([1, 2, 3, 4]);
    expect(one(db, 'SELECT COUNT(*) c FROM product_groups').c).toBe(0);
    db.close();
  });

  it('is all or nothing: a failure at the very end leaves a version-3 database exactly as it was', async () => {
    const db = await shopAtVersion3(join(dir, 'shop.db'));
    const before = { products: all(db, 'SELECT * FROM products ORDER BY id'), log: one(db, 'SELECT COUNT(*) c FROM change_log').c };
    db.exec('CREATE TABLE v_group_stock (x INTEGER)'); // 004 creates a view with this name as its last step, after the backfill
    await expect(migrate(db)).rejects.toThrow(/Migration 4_product_groups failed/);

    expect(currentSchemaVersion(db)).toBe(3);
    expect(db.inTransaction).toBe(false);
    expect(all(db, 'SELECT * FROM products ORDER BY id')).toEqual(before.products); // no group_id column, no bumped versions
    expect(one(db, 'SELECT COUNT(*) c FROM change_log').c).toBe(before.log);
    expect(all(db, "SELECT name FROM sqlite_master WHERE name IN ('product_groups', 'trg_products_group_id_required_ins')")).toEqual([]);
    expect(all(db, "SELECT name FROM sqlite_master WHERE name = 'v_product_stock'")).toHaveLength(1); // the old view is back
    db.close();
  });
});

describe('the fresh and the upgraded database end up with the same schema', () => {
  it('every table, trigger, index and view of migration 004 exists in both', async () => {
    const fresh = openDatabase(':memory:');
    await migrate(fresh);
    const upgraded = await shopAtVersion3(join(dir, 'up.db'));
    await migrate(upgraded);
    const objects = (db: Db) => all(db, "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").map((r) => `${r.type}:${r.name}`);
    expect(objects(upgraded)).toEqual(objects(fresh));
    mkdirSync(dir, { recursive: true });
    fresh.close();
    upgraded.close();
  });
});
