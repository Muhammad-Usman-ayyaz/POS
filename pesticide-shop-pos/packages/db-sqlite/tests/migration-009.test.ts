// Migration 009 (returns and voids): applied on a shop at version 8 that already has returns, and the rules it adds.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentSchemaVersion, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig009-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo8 = () => loadMigrations().slice(0, 8);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};
const S = ['s1', 'b1', 'd1'] as const;

/** A shop at version 8 with a taxed sale, one old Khata return and one old cash return, and a second sale with no return. */
async function shopAtVersion8(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo8() });
  expect(currentSchemaVersion(db)).toBe(8);
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');
           INSERT INTO product_groups (id, name_en, shop_id, branch_id, device_id) VALUES ('g1', 'Insecticide', 's1', 'b1', 'd1');
           INSERT INTO products (id, group_id, pack_label, name_en, base_unit, pack_size, allow_loose, retail_price, wholesale_price, shop_id, branch_id, device_id)
             VALUES ('p1', 'g1', '', 'Insecticide', 'ml', 1000, 0, 50000, 45000, 's1', 'b1', 'd1');
           INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES ('b-1', 'p1', 'B1', '2099-01-01', 40000, 's1', 'b1', 'd1');
           INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id) VALUES ('m1', 'b-1', 100000, 'purchase', 'u1', 's1', 'b1', 'd1');`);
  const invoice = db.prepare("INSERT INTO invoices (id, invoice_no, created_by, invoice_date, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, ?, 'u1', '2026-01-05T09:00:00.000Z', 100, 100, 100, 's1', 'b1', 'd1')");
  invoice.run('i1', 'INV-A-000001');
  invoice.run('i2', 'INV-A-000002');
  const line = db.prepare(
    `INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, name_en, shop_id, branch_id, device_id)
     VALUES (?, ?, 'p1', 'b-1', 10000, 50000, 40000, 100, 'Insecticide', ?, ?, ?)`,
  );
  line.run('ii1', 'i1', ...S);
  line.run('ii2', 'i2', ...S);
  const ret = db.prepare(
    `INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, return_date, refund_method, total, shop_id, branch_id, device_id)
     VALUES (?, ?, 'i1', 'u1', '2026-01-06', ?, ?, ?, ?, ?)`,
  );
  ret.run('r1', 'R-1', 'khata_credit', 70, ...S);
  ret.run('r2', 'R-2', 'cash', 30, ...S);
  const item = db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, condition, shop_id, branch_id, device_id) VALUES (?, ?, 'ii1', ?, ?, 'damaged', ?, ?, ?)");
  item.run('ri1', 'r1', 700, 70, ...S);
  item.run('ri2', 'r2', 300, 30, ...S);
  return db;
}

describe('migration 009 on a shop that already has returns', () => {
  it('backs up, applies once, and backfills the cash / Khata split from refund_method without losing a row', async () => {
    const db = await shopAtVersion8(join(dir, 'shop.db'));
    const items = all(db, 'SELECT * FROM sales_return_items ORDER BY rowid');
    const result = await migrate(db);
    expect(result.applied).toEqual([9]);
    expect(result.backupPath).not.toBeNull();
    expect(currentSchemaVersion(db)).toBe(9);
    expect((await migrate(db)).applied).toEqual([]);

    expect(all(db, 'SELECT id, total, cash_amount, khata_amount, requested_by FROM sales_returns ORDER BY id')).toEqual([
      { id: 'r1', total: 70, cash_amount: 0, khata_amount: 70, requested_by: null },
      { id: 'r2', total: 30, cash_amount: 30, khata_amount: 0, requested_by: null },
    ]);
    // the return lines are untouched (append-only): same rows, plus the new reason column, empty
    const after = all(db, 'SELECT * FROM sales_return_items ORDER BY rowid');
    expect(after.map(({ reason, ...rest }) => { expect(reason).toBeNull(); return rest; })).toEqual(items);
    expect(one(db, 'SELECT COUNT(*) AS n FROM invoices').n).toBe(2);
  });
});

describe('what migration 009 adds', () => {
  let db: Db;
  beforeEach(async () => {
    db = await shopAtVersion8(join(dir, 'shop.db'));
    await migrate(db);
  });

  it('a return must say how it was paid: cash plus Khata equals the total', () => {
    const ins = (cash: number, khata: number) =>
      db.prepare("INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, refund_method, total, cash_amount, khata_amount, shop_id, branch_id, device_id) VALUES ('rx', 'R-X', 'i2', 'u1', 'cash', 100, ?, ?, 's1', 'b1', 'd1')").run(cash, khata);
    expect(failure(() => ins(0, 0))).toMatch(/must equal total/);
    expect(failure(() => ins(60, 30))).toMatch(/must equal total/);
    expect(failure(() => ins(60, 40))).toBe('no error');
    expect(failure(() => db.prepare("UPDATE sales_returns SET khata_amount = 1 WHERE id = 'rx'").run())).toMatch(/must equal total/);
  });

  it('goods that are not resellable need a reason; resellable goods do not', () => {
    db.prepare("INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, refund_method, total, cash_amount, shop_id, branch_id, device_id) VALUES ('rx', 'R-X', 'i2', 'u1', 'cash', 10, 10, 's1', 'b1', 'd1')").run();
    const line = (condition: string, reason: string | null) =>
      db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, condition, reason, shop_id, branch_id, device_id) VALUES (lower(hex(randomblob(8))), 'rx', 'ii2', 100, 5, ?, ?, 's1', 'b1', 'd1')").run(condition, reason);
    expect(failure(() => line('damaged', null))).toMatch(/need a reason/);
    expect(failure(() => line('expired', '  '))).toMatch(/need a reason/);
    expect(failure(() => line('damaged', 'leaked'))).toBe('no error');
    expect(failure(() => line('resellable', null))).toBe('no error');
  });

  it('a voided invoice stays voided, keeps its reason, and an invoice with returns cannot be voided', () => {
    expect(failure(() => db.prepare("UPDATE invoices SET status = 'voided', void_reason = 'x', voided_by = 'u1' WHERE id = 'i1'").run())).toMatch(/has returns/);
    db.prepare("UPDATE invoices SET status = 'voided', void_reason = 'mistake', voided_by = 'u1' WHERE id = 'i2'").run();
    expect(failure(() => db.prepare("UPDATE invoices SET status = 'active' WHERE id = 'i2'").run())).toMatch(/cannot be made active again/);
    expect(failure(() => db.prepare("UPDATE invoices SET void_reason = 'other' WHERE id = 'i2'").run())).toMatch(/cannot be changed/);
    expect(failure(() => db.prepare("UPDATE invoices SET paid_amount = 0 WHERE id = 'i2'").run())).toMatch(/cannot be changed/);
    expect(one(db, "SELECT status, void_reason FROM invoices WHERE id = 'i2'")).toEqual({ status: 'voided', void_reason: 'mistake' });
  });

  it('v_profit_by_day: partial returns of a taxed line add up to exactly the sale, to the paisa', () => {
    // 10 bottles, Rs 4900 total with Rs 747.46 tax inside (74746 paisa), cost Rs 400 a bottle; returned in three parts, all resellable
    db.prepare("INSERT INTO invoices (id, invoice_no, created_by, invoice_date, subtotal, tax_total, total, paid_amount, shop_id, branch_id, device_id) VALUES ('i3', 'INV-A-000003', 'u1', '2026-02-01T09:00:00.000Z', 415254, 74746, 490000, 490000, 's1', 'b1', 'd1')").run();
    db.prepare("INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, tax_rate_bp, tax_amount, name_en, shop_id, branch_id, device_id) VALUES ('ii3', 'i3', 'p1', 'b-1', 7000, 50000, 33333, 490000, 1800, 74746, 'Insecticide', 's1', 'b1', 'd1')").run();
    const sold = one(db, "SELECT revenue, cost FROM v_profit_by_day WHERE day = '2026-02-01'");
    expect(sold.revenue).toBe(415_254);
    let n = 0;
    const back = (qty: number, refund: number, tax: number) => {
      n += 1;
      db.prepare("INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, return_date, refund_method, total, cash_amount, shop_id, branch_id, device_id) VALUES (?, ?, 'i3', 'u1', '2026-02-02', 'cash', ?, ?, 's1', 'b1', 'd1')").run(`rr${n}`, `RR-${n}`, refund, refund);
      db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, tax_refund, condition, shop_id, branch_id, device_id) VALUES (?, ?, 'ii3', ?, ?, ?, 'resellable', 's1', 'b1', 'd1')").run(`rri${n}`, `rr${n}`, qty, refund, tax);
    };
    // 1500, 2500 and 3000 of the 7000 ml: running-difference shares of the refund, the tax and the cost (each cumulative figure rounded once)
    back(1500, 105_000, 16_017);
    back(2500, 175_000, 26_695);
    back(3000, 210_000, 32_034);
    const day = one(db, "SELECT revenue, cost, profit FROM v_profit_by_day WHERE day = '2026-02-02'");
    expect(day.revenue).toBe(-(490_000 - 74_746)); // everything came back: exactly the sale's revenue taken off
    expect(day.cost).toBe(-233_331); // and exactly its cost (rounding each part alone would give 233332: one paisa of drift)
  });

  it('v_profit_by_day: a write-off keeps its cost (the loss stays) and a voided invoice drops out entirely', () => {
    db.prepare("INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, return_date, refund_method, total, cash_amount, shop_id, branch_id, device_id) VALUES ('rw', 'R-W', 'i2', 'u1', '2026-01-05', 'cash', 50, 50, 's1', 'b1', 'd1')").run();
    db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, tax_refund, condition, reason, shop_id, branch_id, device_id) VALUES ('rwi', 'rw', 'ii2', 5000, 50, 0, 'damaged', 'leaked', 's1', 'b1', 'd1')").run();
    // two sales of 10 bottles at cost Rs 400 (40000 paisa a pack): the damaged half of one of them takes back its 50 paisa revenue but NOT its cost
    expect(one(db, "SELECT revenue, cost FROM v_profit_by_day WHERE day = '2026-01-05'")).toEqual({ revenue: 200 - 50, cost: 800_000 });
    db.prepare("INSERT INTO invoices (id, invoice_no, created_by, invoice_date, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES ('i4', 'INV-A-000004', 'u1', '2026-01-05T10:00:00.000Z', 100, 100, 100, 's1', 'b1', 'd1')").run();
    db.prepare("INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, name_en, shop_id, branch_id, device_id) VALUES ('ii4', 'i4', 'p1', 'b-1', 10000, 50000, 40000, 100, 'Insecticide', 's1', 'b1', 'd1')").run();
    expect(one(db, "SELECT cost FROM v_profit_by_day WHERE day = '2026-01-05'").cost).toBe(1_200_000);
    db.prepare("UPDATE invoices SET status = 'voided', void_reason = 'mistake', voided_by = 'u1' WHERE id = 'i4'").run();
    expect(one(db, "SELECT revenue, cost FROM v_profit_by_day WHERE day = '2026-01-05'")).toEqual({ revenue: 200 - 50, cost: 800_000 });
  });
});
