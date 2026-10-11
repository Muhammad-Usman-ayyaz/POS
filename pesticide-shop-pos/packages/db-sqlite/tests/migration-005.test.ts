// Migration 005 (the tax in each return, the name of a size at sale time, the low-stock views) applied on top of a shop that already has
// sales and returns at version 4: data kept, backfill right, versions and change_log as agreed, the append-only triggers back, all or nothing.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taxRefundFor } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, currentSchemaVersion, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

const S = ['s1', 'b1', 'd1'] as const;
const ID = {
  owner: 'u1',
  bottle: 'a0000000-0000-4000-8000-000000000001', urdu: 'a0000000-0000-4000-8000-000000000002', piece: 'a0000000-0000-4000-8000-000000000003', plain: 'a0000000-0000-4000-8000-000000000004',
  bBottle: 'b0000000-0000-4000-8000-000000000001', bUrdu: 'b0000000-0000-4000-8000-000000000002', bPiece: 'b0000000-0000-4000-8000-000000000003', bPlain: 'b0000000-0000-4000-8000-000000000004',
  inv1: 'e0000000-0000-4000-8000-000000000001', inv2: 'e0000000-0000-4000-8000-000000000002',
  ii1: 'f0000000-0000-4000-8000-000000000001', ii2: 'f0000000-0000-4000-8000-000000000002', ii3: 'f0000000-0000-4000-8000-000000000003', ii4: 'f0000000-0000-4000-8000-000000000004',
  // return headers and their lines
  r1: 'c1000000-0000-4000-8000-000000000001', r2: 'c1000000-0000-4000-8000-000000000002', r3: 'c1000000-0000-4000-8000-000000000003', r4: 'c1000000-0000-4000-8000-000000000004', r5: 'c1000000-0000-4000-8000-000000000005', r6: 'c1000000-0000-4000-8000-000000000006',
  l1: 'c2000000-0000-4000-8000-000000000001', l2: 'c2000000-0000-4000-8000-000000000002', l3: 'c2000000-0000-4000-8000-000000000003', l4: 'c2000000-0000-4000-8000-000000000004', l5: 'c2000000-0000-4000-8000-000000000005', l6: 'c2000000-0000-4000-8000-000000000006',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig005-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo4 = () => loadMigrations().slice(0, 4);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;
const tables = (db: Db) => all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name as string);
const sqlOf = (db: Db, name: string) => (one(db, 'SELECT sql FROM sqlite_master WHERE name = ?', name) as { sql: string } | undefined)?.sql;
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};

/** The exact definitions 001 gave the four append-only triggers. The migration drops and recreates two of them: they must come back identical. */
const APPEND_ONLY = {
  trg_invoice_items_no_update: "CREATE TRIGGER trg_invoice_items_no_update BEFORE UPDATE ON invoice_items\nBEGIN SELECT RAISE(ABORT, 'invoice_items is append-only: add a reversing row instead'); END",
  trg_invoice_items_no_delete: "CREATE TRIGGER trg_invoice_items_no_delete BEFORE DELETE ON invoice_items\nBEGIN SELECT RAISE(ABORT, 'invoice_items is append-only: add a reversing row instead'); END",
  trg_sales_return_items_no_update: "CREATE TRIGGER trg_sales_return_items_no_update BEFORE UPDATE ON sales_return_items\nBEGIN SELECT RAISE(ABORT, 'sales_return_items is append-only: add a reversing row instead'); END",
  trg_sales_return_items_no_delete: "CREATE TRIGGER trg_sales_return_items_no_delete BEFORE DELETE ON sales_return_items\nBEGIN SELECT RAISE(ABORT, 'sales_return_items is append-only: add a reversing row instead'); END",
};

function insertProduct(db: Db, id: string, o: { en: string | null; ur: string | null; pack: number; unit: string; tax: number; min?: number }): void {
  const group = `g${id.slice(1)}`;
  db.prepare('INSERT INTO product_groups (id, name_en, name_ur, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(group, o.en, o.ur, ...S);
  db.prepare(
    `INSERT INTO products (id, group_id, pack_label, name_en, name_ur, base_unit, pack_size, allow_loose, retail_price, wholesale_price, tax_rate_bp, min_stock, shop_id, branch_id, device_id)
     VALUES (?, ?, '', ?, ?, ?, ?, 0, 50000, 45000, ?, ?, ?, ?, ?)`,
  ).run(id, group, o.en, o.ur, o.unit, o.pack, o.tax, o.min ?? 0, ...S);
}

function insertLine(db: Db, id: string, invoice: string, product: string, batch: string, v: { qty: number; total: number; tax: number; rate?: number }): void {
  db.prepare(
    `INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, tax_rate_bp, tax_amount, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, ?, ?, 50000, 40000, ?, ?, ?, ?, ?, ?)`,
  ).run(id, invoice, product, batch, v.qty, v.total, v.rate ?? 0, v.tax, ...S);
}

function insertReturn(db: Db, header: string, line: string, invoice: string, item: string, v: { at: string; qty: number; refund: number; condition?: string }): void {
  db.prepare(
    `INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, return_date, refund_method, total, created_at, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, 'u1', ?, 'khata_credit', ?, ?, ?, ?, ?)`,
  ).run(header, `R-${header}`, invoice, v.at.slice(0, 10), v.refund, v.at, ...S);
  db.prepare(
    `INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, condition, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(line, header, item, v.qty, v.refund, v.condition ?? 'resellable', ...S);
}

/** The shop at version 4: four products (one Urdu-only, one counted in pieces), two sales, six returns on three of the four lines. */
async function shopAtVersion4(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo4() });
  expect(currentSchemaVersion(db)).toBe(4);
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');`);
  insertProduct(db, ID.bottle, { en: 'Insecticide 1L', ur: 'کیڑے مار دوا 1 لیٹر', pack: 1000, unit: 'ml', tax: 1800, min: 5000 });
  insertProduct(db, ID.urdu, { en: null, ur: 'کھاد', pack: 1000, unit: 'g', tax: 0, min: 0 });
  insertProduct(db, ID.piece, { en: 'Sprayer', ur: null, pack: 1, unit: 'piece', tax: 1800 });
  insertProduct(db, ID.plain, { en: 'Seed 1kg', ur: null, pack: 1000, unit: 'g', tax: 0 });
  const batch = db.prepare('INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 40000, ?, ?, ?)');
  const move = db.prepare("INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id) VALUES (?, ?, 100000, 'purchase', 'u1', 's1', 'b1', 'd1')");
  [[ID.bBottle, ID.bottle], [ID.bUrdu, ID.urdu], [ID.bPiece, ID.piece], [ID.bPlain, ID.plain]].forEach(([b, p], i) => {
    batch.run(b, p, `B${i}`, '2099-01-01', ...S);
    move.run(`m000000${i}-0000-4000-8000-000000000001`, b);
  });
  const invoice = db.prepare("INSERT INTO invoices (id, invoice_no, created_by, invoice_date, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, ?, 'u1', '2026-01-05T09:00:00.000Z', 100, 100, 100, 's1', 'b1', 'd1')");
  invoice.run(ID.inv1, 'INV-A-000001');
  invoice.run(ID.inv2, 'INV-A-000002');
  insertLine(db, ID.ii1, ID.inv1, ID.bottle, ID.bBottle, { qty: 10_000, total: 490_000, tax: 74_746, rate: 1800 }); // 10 bottles, Rs 100 off, 18 percent inside
  insertLine(db, ID.ii4, ID.inv1, ID.urdu, ID.bUrdu, { qty: 1000, total: 20_000, tax: 0 }); // never returned; the product has only an Urdu name
  insertLine(db, ID.ii2, ID.inv2, ID.piece, ID.bPiece, { qty: 3, total: 2, tax: 1, rate: 1800 }); // the rounding edge: refunds 1, 0, 1 but tax 0, 1, 0
  insertLine(db, ID.ii3, ID.inv2, ID.plain, ID.bPlain, { qty: 4000, total: 80_000, tax: 0 });
  // Returns. The rows are inserted in an order that is NOT the order they were made in (created_at says which came first).
  insertReturn(db, ID.r2, ID.l2, ID.inv1, ID.ii1, { at: '2026-01-15T10:00:00.000Z', qty: 3000, refund: 147_000 });
  insertReturn(db, ID.r1, ID.l1, ID.inv1, ID.ii1, { at: '2026-01-10T10:00:00.000Z', qty: 2000, refund: 98_000 });
  insertReturn(db, ID.r5, ID.l5, ID.inv2, ID.ii2, { at: '2026-01-22T10:00:00.000Z', qty: 1, refund: 1 });
  insertReturn(db, ID.r3, ID.l3, ID.inv2, ID.ii2, { at: '2026-01-20T10:00:00.000Z', qty: 1, refund: 1 });
  insertReturn(db, ID.r4, ID.l4, ID.inv2, ID.ii2, { at: '2026-01-21T10:00:00.000Z', qty: 1, refund: 0 });
  insertReturn(db, ID.r6, ID.l6, ID.inv2, ID.ii3, { at: '2026-01-25T10:00:00.000Z', qty: 1000, refund: 20_000, condition: 'damaged' });
  // some rows were already synced, some not
  db.prepare("UPDATE change_log SET synced_at = '2026-02-01T00:00:00.000Z' WHERE (table_name = 'invoice_items' AND row_id IN (?, ?)) OR (table_name = 'sales_return_items' AND row_id IN (?, ?, ?))").run(ID.ii1, ID.ii4, ID.l1, ID.l3, ID.l4);
  return db;
}

/** Every table except the ones the migration changes on purpose. */
const untouched = (db: Db) => tables(db).filter((t) => !['invoice_items', 'sales_return_items', 'change_log', 'schema_version'].includes(t));
const dump = (db: Db, table: string, omit: string[] = []): Row[] =>
  all(db, `SELECT * FROM ${table} ORDER BY rowid`).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k))));

describe('migration 005 on a shop that already has sales and returns', () => {
  it('takes a backup of the version-4 file first, applies, and leaves a database that passes its integrity check', async () => {
    const file = join(dir, 'shop.db');
    const db = await shopAtVersion4(file);
    const result = await migrate(db);
    expect(result.applied).toEqual([5]);
    expect(currentSchemaVersion(db)).toBe(5);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
    expect(checkIntegrity(db)).toEqual({ ok: true, problems: [] });
    const backup = openDatabase(result.backupPath!);
    expect(currentSchemaVersion(backup)).toBe(4); // the copy is the database as it was
    expect(all(backup, 'PRAGMA table_info(sales_return_items)').map((c) => c.name)).not.toContain('tax_refund');
    expect(one(backup, 'SELECT COUNT(*) AS c FROM sales_return_items').c).toBe(6);
    backup.close();
    db.close();
  });

  it('keeps every old row: nothing but the new columns, the version of changed lines, and the new change_log rows is different', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    const before = Object.fromEntries(untouched(db).map((t) => [t, dump(db, t)]));
    const items = dump(db, 'invoice_items', ['version']);
    const returnLines = dump(db, 'sales_return_items', ['version']);
    const log = dump(db, 'change_log');
    await migrate(db);
    for (const t of untouched(db)) expect(dump(db, t), t).toEqual(before[t]);
    expect(dump(db, 'invoice_items', ['version', 'name_en', 'name_ur'])).toEqual(items);
    expect(dump(db, 'sales_return_items', ['version', 'tax_refund'])).toEqual(returnLines);
    expect(dump(db, 'change_log').slice(0, log.length)).toEqual(log); // the old log rows are as they were, and only new ones follow
    expect(one(db, 'SELECT COUNT(*) AS c FROM invoice_items').c).toBe(4);
    expect(one(db, 'SELECT COUNT(*) AS c FROM sales_return_items').c).toBe(6);
    db.close();
  });

  it('gives each return line its share of the line\'s tax, in the order the returns were MADE (created_at), not the order the rows were written', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const share = (line: string) => one(db, 'SELECT tax_refund FROM sales_return_items WHERE id = ?', line).tax_refund;
    // 74746 of tax over 10000 ml: after 2000 ml 14949 (14949.2), after 5000 ml 37373, so the second return gets 22424
    expect(share(ID.l1)).toBe(14_949);
    expect(share(ID.l2)).toBe(22_424);
    // 3 units with 1 of tax: the three returns get 0, 1, 0 (in the order made: r3, r4, r5), although the refunds are 1, 0, 1
    expect([share(ID.l3), share(ID.l4), share(ID.l5)]).toEqual([0, 1, 0]);
    expect(share(ID.l6)).toBe(0); // an untaxed line
    db.close();
  });

  it('is exactly what the return service would have stored: a property over 200 random lines and returns, compared with the core\'s own taxRefundFor', async () => {
    const file = join(dir, 'random.db');
    const db = openDatabase(file);
    await migrate(db, { migrations: upTo4() });
    db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Shop'); INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
             INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
             INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');`);
    insertProduct(db, ID.piece, { en: 'Piece', ur: null, pack: 1, unit: 'piece', tax: 1800 });
    db.prepare('INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(ID.bPiece, ID.piece, 'B', '2099-01-01', ...S);
    db.prepare("INSERT INTO invoices (id, invoice_no, created_by, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, 'INV-1', 'u1', 1, 1, 1, 's1', 'b1', 'd1')").run(ID.inv1);
    const seed = Number(process.env['POS_SEED'] ?? 5);
    let state = seed;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let x = Math.imul(state ^ (state >>> 15), 1 | state);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
    };
    const int = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
    const expected = new Map<string, number>();
    const lines: { id: string; qty: number; total: number; tax: number }[] = [];
    for (let i = 0; i < 200; i++) {
      const qty = int(1, 40);
      const total = int(1, 9_999_999);
      const tax = int(0, total);
      const id = `f${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`;
      insertLine(db, id, ID.inv1, ID.piece, ID.bPiece, { qty, total, tax, rate: 1800 });
      lines.push({ id, qty, total, tax });
    }
    // returns: each line is returned in 1 to 4 parts; all parts are written, in a shuffled order, with distinct created_at times
    const writes: { line: (typeof lines)[number]; qty: number; at: number; before: number }[] = [];
    for (const line of lines) {
      let left = line.qty;
      let returned = 0;
      for (let part = 0, parts = int(1, 4); part < parts && left > 0; part++) {
        const qty = part === parts - 1 ? left : int(1, left);
        writes.push({ line, qty, at: writes.length, before: returned });
        returned += qty;
        left -= qty;
      }
    }
    const order = writes.map((_, i) => i).sort(() => random() - 0.5);
    let n = 0;
    for (const w of order) {
      const write = writes[w]!;
      const refund = Math.max(0, Math.min(write.line.total, int(0, write.line.total)));
      const header = `c9${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
      const lineId = `c8${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
      n += 1;
      const at = `2026-02-01T00:${String(Math.floor(write.at / 60) % 60).padStart(2, '0')}:${String(write.at % 60).padStart(2, '0')}.${String(Math.floor(write.at / 3600)).padStart(3, '0')}Z`;
      insertReturn(db, header, lineId, ID.inv1, write.line.id, { at, qty: write.qty, refund });
      expected.set(lineId, taxRefundFor({ invoice_item_id: write.line.id, qty: write.line.qty, line_total: write.line.total, tax_amount: write.line.tax, qty_returned: write.before }, write.qty));
    }
    await migrate(db);
    const stored = all(db, 'SELECT id, tax_refund FROM sales_return_items');
    expect(stored).toHaveLength(expected.size);
    for (const row of stored) expect(row.tax_refund, `seed ${seed}, line ${String(row.id)}`).toBe(expected.get(row.id as string));
    // and no line gets back more tax than it was charged
    expect(all(db, 'SELECT ii.id FROM invoice_items ii WHERE (SELECT COALESCE(SUM(tax_refund), 0) FROM sales_return_items WHERE invoice_item_id = ii.id) > ii.tax_amount')).toEqual([]);
    db.close();
  });

  it('bumps the version of exactly the rows it changed: lines that got a name, and return lines that got tax (the others stay at 1)', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const versions = (table: string) => Object.fromEntries(all(db, `SELECT id, version FROM ${table}`).map((r) => [r.id, r.version]));
    expect(versions('invoice_items')).toEqual({ [ID.ii1]: 2, [ID.ii2]: 2, [ID.ii3]: 2, [ID.ii4]: 2 });
    expect(versions('sales_return_items')).toEqual({ [ID.l1]: 2, [ID.l2]: 2, [ID.l3]: 1, [ID.l4]: 2, [ID.l5]: 1, [ID.l6]: 1 }); // l3, l5, l6 got no tax: unchanged
    expect(one(db, 'SELECT COUNT(*) AS c FROM products WHERE version <> 1').c).toBe(0); // nothing else was touched
    db.close();
  });

  it('gives every existing line the product\'s CURRENT name (both languages, or just the one it has)', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const name = (id: string) => one(db, 'SELECT name_en, name_ur FROM invoice_items WHERE id = ?', id);
    expect(name(ID.ii1)).toEqual({ name_en: 'Insecticide 1L', name_ur: 'کیڑے مار دوا 1 لیٹر' });
    expect(name(ID.ii4)).toEqual({ name_en: null, name_ur: 'کھاد' }); // an Urdu-only product
    expect(name(ID.ii2)).toEqual({ name_en: 'Sprayer', name_ur: null });
    expect(all(db, 'SELECT ii.id FROM invoice_items ii JOIN products p ON p.id = ii.product_id WHERE ii.name_en IS NOT p.name_en OR ii.name_ur IS NOT p.name_ur')).toEqual([]);
    db.close();
  });

  it('writes a change_log update row only for changed rows whose insert was ALREADY synced (an unsynced insert will carry the final row)', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    const before = one(db, 'SELECT COUNT(*) AS c FROM change_log').c as number;
    await migrate(db);
    const added = all(db, 'SELECT table_name, row_id, operation, synced_at FROM change_log ORDER BY rowid').slice(before);
    // synced lines: ii1 and ii4 (both got names). Synced return lines: l1 (got tax), l3 (got none), l4 (got tax).
    expect(added.map((r) => `${r.table_name}:${r.row_id}:${r.operation}`).sort()).toEqual(
      [`invoice_items:${ID.ii1}:update`, `invoice_items:${ID.ii4}:update`, `sales_return_items:${ID.l1}:update`, `sales_return_items:${ID.l4}:update`].sort(),
    );
    expect(added.every((r) => r.synced_at === null)).toBe(true); // they are waiting to be synced
    db.close();
  });
});

describe('the append-only triggers after the backfill', () => {
  it('all four exist again, with exactly the text 001 gave them', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    for (const [name, sql] of Object.entries(APPEND_ONLY)) expect(sqlOf(db, name), `${name} before`).toBe(sql);
    await migrate(db);
    for (const [name, sql] of Object.entries(APPEND_ONLY)) expect(sqlOf(db, name), `${name} after`).toBe(sql);
    db.close();
  });

  it('and they refuse UPDATE and DELETE on every old row, new columns included', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const refused = (sql: string, ...p: unknown[]) => failure(() => db.prepare(sql).run(...p));
    expect(refused('UPDATE sales_return_items SET tax_refund = 999 WHERE id = ?', ID.l1)).toMatch(/append-only/);
    expect(refused('UPDATE sales_return_items SET qty = 1 WHERE id = ?', ID.l1)).toMatch(/append-only/);
    expect(refused('DELETE FROM sales_return_items WHERE id = ?', ID.l1)).toMatch(/append-only/);
    expect(refused("UPDATE invoice_items SET name_en = 'Renamed' WHERE id = ?", ID.ii1)).toMatch(/append-only/);
    expect(refused('UPDATE invoice_items SET qty = 1 WHERE id = ?', ID.ii1)).toMatch(/append-only/);
    expect(refused('DELETE FROM invoice_items WHERE id = ?', ID.ii1)).toMatch(/append-only/);
    expect(one(db, 'SELECT tax_refund FROM sales_return_items WHERE id = ?', ID.l1).tax_refund).toBe(14_949); // nothing changed
    db.close();
  });

  it('also on a fresh database where every migration ran from the start', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    for (const [name, sql] of Object.entries(APPEND_ONLY)) expect(sqlOf(db, name), name).toBe(sql);
    db.close();
  });
});

describe('the new guards', () => {
  it('all the tax refunded on a line can never pass the tax charged on it: up to the last paisa is fine, one more is refused', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    // ii1 has 74746 of tax; 14949 + 22424 = 37373 is back; 37373 is still to come. 5000 ml are still returnable.
    const add = (line: string, header: string, tax: number) =>
      db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, tax_refund, condition, shop_id, branch_id, device_id) VALUES (?, ?, ?, 1000, 98000, ?, 'resellable', 's1', 'b1', 'd1')").run(line, header, ID.ii1, tax);
    expect(failure(() => add('c3000000-0000-4000-8000-000000000001', ID.r1, 37_374))).toMatch(/cannot pass the tax charged/);
    expect(failure(() => add('c3000000-0000-4000-8000-000000000002', ID.r1, 37_373))).toBe('no error');
    expect(failure(() => add('c3000000-0000-4000-8000-000000000003', ID.r1, 1))).toMatch(/cannot pass the tax charged/);
    db.close();
  });

  it('a negative tax_refund is refused, and a return line with no tax_refund stored means 0', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const insert = (id: string, tax: string) => db.prepare(`INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, ${tax ? 'tax_refund, ' : ''}condition, shop_id, branch_id, device_id) VALUES (?, ?, ?, 1000, 10, ${tax ? `${tax}, ` : ''}'resellable', 's1', 'b1', 'd1')`).run(id, ID.r6, ID.ii3);
    expect(failure(() => insert('c3000000-0000-4000-8000-000000000004', '-1'))).toMatch(/constraint|check/i);
    insert('c3000000-0000-4000-8000-000000000005', '');
    expect(one(db, 'SELECT tax_refund FROM sales_return_items WHERE id = ?', 'c3000000-0000-4000-8000-000000000005').tax_refund).toBe(0);
    db.close();
  });

  it('the cap also holds for an UPDATE (should the append-only trigger ever be dropped by hand)', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    db.exec('BEGIN');
    db.exec('DROP TRIGGER trg_sales_return_items_no_update');
    expect(failure(() => db.prepare('UPDATE sales_return_items SET tax_refund = 74747 WHERE id = ?').run(ID.l1))).toMatch(/cannot pass the tax charged/);
    db.exec('ROLLBACK');
    db.close();
  });

  it('the cap on an UPDATE leaves the row itself out of the sum: a legal value up to the last paisa passes, one more is refused', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    db.exec('BEGIN');
    db.exec('DROP TRIGGER trg_sales_return_items_no_update');
    // ii1 has 74746 of tax; the other return line of it holds 22424, so this one may hold 52322 and no more
    expect(failure(() => db.prepare('UPDATE sales_return_items SET tax_refund = 52322 WHERE id = ?').run(ID.l1))).toBe('no error');
    expect(failure(() => db.prepare('UPDATE sales_return_items SET tax_refund = 52323 WHERE id = ?').run(ID.l1))).toMatch(/cannot pass the tax charged/);
    db.exec('ROLLBACK');
    db.close();
  });

  it('a new invoice line needs a name in at least one language; an empty one does not count', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const add = (id: string, en: string | null, ur: string | null) =>
      db.prepare("INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, name_en, name_ur, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 1000, 1, 1, 1, ?, ?, 's1', 'b1', 'd1')").run(id, ID.inv1, ID.bottle, ID.bBottle, en, ur);
    expect(failure(() => add('f9000000-0000-4000-8000-000000000001', null, null))).toMatch(/needs the name of the product as it was at sale time/);
    expect(failure(() => add('f9000000-0000-4000-8000-000000000002', '', ''))).toMatch(/needs the name/);
    expect(failure(() => add('f9000000-0000-4000-8000-000000000003', null, 'کھاد'))).toBe('no error');
    expect(failure(() => add('f9000000-0000-4000-8000-000000000004', 'Name', null))).toBe('no error');
    db.close();
  });
});

describe('the views after the migration', () => {
  it('v_low_stock and v_group_stock count a size as low only when it has a minimum and its sellable stock is at or below it', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    // before: the Urdu product (min 0, 100000 g in stock: not low by stock) and the piece product (min 0) ...
    db.prepare('UPDATE products SET min_stock = 0 WHERE id IN (?, ?)').run(ID.piece, ID.plain);
    db.prepare("INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id) VALUES ('m9000000-0000-4000-8000-000000000001', ?, -100000, 'sale', 'u1', 's1', 'b1', 'd1')").run(ID.bPlain); // the plain size is now at 0 stock, minimum 0
    expect(all(db, 'SELECT product_id FROM v_low_stock').map((r) => r.product_id)).toContain(ID.plain); // the old view says low (0 <= 0)
    await migrate(db);
    expect(all(db, 'SELECT product_id FROM v_low_stock').map((r) => r.product_id)).not.toContain(ID.plain); // no minimum: not low
    db.prepare('UPDATE products SET min_stock = 1 WHERE id = ?').run(ID.plain);
    expect(all(db, 'SELECT product_id FROM v_low_stock').map((r) => r.product_id)).toContain(ID.plain); // a minimum and 0 stock: low
    expect(one(db, 'SELECT low_size_count FROM v_group_stock WHERE group_id = ?', `g${ID.plain.slice(1)}`).low_size_count).toBe(1);
    db.prepare('UPDATE products SET min_stock = 0 WHERE id = ?').run(ID.plain);
    expect(one(db, 'SELECT low_size_count FROM v_group_stock WHERE group_id = ?', `g${ID.plain.slice(1)}`).low_size_count).toBe(0);
    db.close();
  });

  it('v_profit_by_day takes a return\'s revenue as the refund minus its tax: the total equals the rows to the paisa', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    await migrate(db);
    const expected =
      (one(db, 'SELECT SUM(line_total - tax_amount) AS v FROM invoice_items').v as number) - (one(db, 'SELECT SUM(refund_amount - tax_refund) AS v FROM sales_return_items').v as number);
    const view = one(db, 'SELECT SUM(revenue) AS revenue FROM v_profit_by_day');
    expect(view.revenue).toBe(expected);
    // ii1 sold 490000 - 74746 tax = 415254 of revenue; the two returns gave back 245000 - 37373 = 207627 of it
    expect(one(db, 'SELECT SUM(refund_amount - tax_refund) AS v FROM sales_return_items WHERE invoice_item_id = ?', ID.ii1).v).toBe(207_627);
    db.close();
  });
});

describe('failing, repeating, and starting fresh', () => {
  it('is all or nothing: a failure at the very end leaves the version-4 database exactly as it was (rows, versions, triggers, views)', async () => {
    const db = await shopAtVersion4(join(dir, 'shop.db'));
    const snapshot = () => Object.fromEntries(tables(db).map((t) => [t, dump(db, t)]));
    const before = snapshot();
    const lowBefore = sqlOf(db, 'v_low_stock');
    const profitBefore = sqlOf(db, 'v_profit_by_day');
    const broken = loadMigrations().map((m) => (m.version === 5 ? { ...m, sql: `${m.sql}\nSELECT * FROM a_table_that_does_not_exist;` } : m));
    await expect(migrate(db, { migrations: broken })).rejects.toThrow(/Migration 5_return_tax_and_name_snapshot failed/);

    expect(currentSchemaVersion(db)).toBe(4);
    expect(db.inTransaction).toBe(false);
    expect(snapshot()).toEqual(before); // no tax_refund, no names, no bumped versions, no change_log rows
    expect(all(db, 'PRAGMA table_info(sales_return_items)').map((c) => c.name)).not.toContain('tax_refund');
    expect(all(db, 'PRAGMA table_info(invoice_items)').map((c) => c.name)).not.toContain('name_en');
    for (const [name, sql] of Object.entries(APPEND_ONLY)) expect(sqlOf(db, name), name).toBe(sql); // the dropped triggers are back
    expect(sqlOf(db, 'v_low_stock')).toBe(lowBefore);
    expect(sqlOf(db, 'v_profit_by_day')).toBe(profitBefore);
    expect(sqlOf(db, 'trg_ii_has_name')).toBeUndefined();
    expect(sqlOf(db, 'trg_sri_tax_refund_cap')).toBeUndefined();
    db.close();
  });

  it('a second run changes nothing, and a shop with no sales at all just gets the new columns', async () => {
    const db = openDatabase(join(dir, 'empty.db'));
    await migrate(db, { migrations: upTo4() });
    const result = await migrate(db);
    expect(result.applied).toEqual([5]);
    expect(await migrate(db)).toMatchObject({ applied: [], currentVersion: 5 });
    expect(all(db, 'PRAGMA table_info(invoice_items)').map((c) => c.name)).toEqual(expect.arrayContaining(['name_en', 'name_ur']));
    expect(all(db, 'PRAGMA table_info(sales_return_items)').map((c) => c.name)).toContain('tax_refund');
    db.close();
  });

  it('the migration file says what it does in its header (the file is the documentation of the backfill)', () => {
    const file = readFileSync(join(__dirname, '..', 'migrations', '005_return_tax_and_name_snapshot.sql'), 'utf8');
    expect(file).toContain('AS IT WAS AT');
    expect(file).toMatch(/version = version \+ 1/);
    expect(file).toMatch(/only when that row's insert was already synced/);
  });
});
