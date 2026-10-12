// Migration 005 on the largest realistic shop: 5,000 products x 3 sizes (15,000 sizes, each with a batch and stock), 4,000 sales of 3 lines
// (12,000 invoice lines) and 1,000 returns of 1 to 2 lines. It is built at version 4 with the real triggers switched on, then migrated, and the
// time is printed. It checks the result too (every line named, no line over its tax, integrity, a sample against the core's own arithmetic).
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { taxRefundFor } from '@pos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupDatabase, checkIntegrity, currentSchemaVersion, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

const GROUPS = 5000;
const SALES = 4000;
const RETURNS = 1000;
const SIZES = [
  { label: '250 ml', pack: 250 },
  { label: '500 ml', pack: 500 },
  { label: '1 L', pack: 1000 },
] as const;
const S = ['s1', 'b1', 'd1'] as const;

let dir: string;
let db: Db;
const timings: Record<string, number> = {};
const facts = { products: 0, lines: 0, returnLines: 0, backupMb: 0, fileMb: 0 };

/** The same small deterministic generator as the other property tests, so a run can be repeated. */
function generator(seed: number) {
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { random, int: (low: number, high: number) => low + Math.floor(random() * (high - low + 1)) };
}

const roundHalfUp = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig005-large-'));
  db = openDatabase(join(dir, 'big.db'));
  await migrate(db, { migrations: loadMigrations().slice(0, 4) });
  const { int, random } = generator(Number(process.env['POS_SEED'] ?? 2026));
  const started = performance.now();
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Shop'); INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');`);
  const group = db.prepare('INSERT INTO product_groups (id, name_en, name_ur, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)');
  const product = db.prepare(
    `INSERT INTO products (id, group_id, pack_label, name_en, name_ur, base_unit, pack_size, retail_price, wholesale_price, tax_rate_bp, min_stock, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, ?, ?, 'ml', ?, 50000, 45000, ?, ?, ?, ?, ?)`,
  );
  const batch = db.prepare('INSERT INTO batches (id, product_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, 40000, ?, ?, ?)');
  const stock = db.prepare("INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id) VALUES (?, ?, 5000000, 'purchase', 'u1', 's1', 'b1', 'd1')");
  const sizes: { id: string; batch: string; pack: number; rate: number }[] = [];
  db.exec('BEGIN');
  for (let g = 0; g < GROUPS; g++) {
    const rate = g % 3 === 0 ? 1800 : 0;
    group.run(`g${g}`, `Product ${g}`, `پروڈکٹ ${g}`, ...S);
    for (const [k, size] of SIZES.entries()) {
      const id = `p${g}-${k}`;
      product.run(id, `g${g}`, size.label, `Product ${g} ${size.label}`, `پروڈکٹ ${g} ${size.label}`, size.pack, rate, g % 7 === 0 ? 2000 : 0, ...S);
      batch.run(`b${g}-${k}`, id, `B${g}`, '2099-01-01', ...S);
      stock.run(`m${g}-${k}`, `b${g}-${k}`);
      sizes.push({ id, batch: `b${g}-${k}`, pack: size.pack, rate });
    }
  }
  const invoice = db.prepare("INSERT INTO invoices (id, invoice_no, created_by, invoice_date, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, ?, 'u1', ?, 1, 1, 1, 's1', 'b1', 'd1')");
  const line = db.prepare(
    `INSERT INTO invoice_items (id, invoice_id, product_id, batch_id, qty, unit_price, cost_price, line_total, tax_rate_bp, tax_amount, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, ?, ?, 50000, 40000, ?, ?, ?, ?, ?, ?)`,
  );
  const lines: { id: string; invoice: string; qty: number; pack: number; total: number; tax: number }[] = [];
  for (let i = 0; i < SALES; i++) {
    const day = `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00.000Z`;
    invoice.run(`i${i}`, `INV-${i}`, day);
    for (let n = 0; n < 3; n++) {
      const size = sizes[int(0, sizes.length - 1)]!;
      const packs = int(1, 5);
      const total = packs * 50_000 - int(0, 999);
      const tax = size.rate === 0 ? 0 : roundHalfUp(total * size.rate, 10_000 + size.rate);
      const id = `l${i}-${n}`;
      line.run(id, `i${i}`, size.id, size.batch, packs * size.pack, total, size.rate, tax, ...S);
      lines.push({ id, invoice: `i${i}`, qty: packs * size.pack, pack: size.pack, total, tax });
    }
  }
  const header = db.prepare("INSERT INTO sales_returns (id, return_no, invoice_id, approved_by, return_date, refund_method, total, created_at, shop_id, branch_id, device_id) VALUES (?, ?, ?, 'u1', ?, 'khata_credit', 1, ?, 's1', 'b1', 'd1')");
  const returnLine = db.prepare("INSERT INTO sales_return_items (id, sales_return_id, invoice_item_id, qty, refund_amount, condition, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, 'resellable', 's1', 'b1', 'd1')");
  const left = new Map(lines.map((l) => [l.id, l.qty]));
  let r = 0;
  for (let i = 0; i < RETURNS; i++) {
    const source = lines[int(0, lines.length - 1)]!;
    for (let part = 0; part < int(1, 2); part++) {
      const remaining = left.get(source.id)!;
      if (remaining < source.pack) break;
      const packs = int(1, remaining / source.pack);
      const qty = packs * source.pack;
      left.set(source.id, remaining - qty);
      const at = `2026-10-${String(1 + (r % 28)).padStart(2, '0')}T${String(8 + Math.floor(r / 28) % 12).padStart(2, '0')}:00:00.000Z`;
      header.run(`r${r}`, `RET-${r}`, source.invoice, at.slice(0, 10), at);
      returnLine.run(`rl${r}`, `r${r}`, source.id, qty, Math.floor((source.total * qty) / source.qty));
      r += 1;
    }
    if (random() < 0) break; // keeps the generator used the same way in every branch
  }
  db.exec('COMMIT');
  facts.products = sizes.length;
  facts.lines = lines.length;
  facts.returnLines = r;
  timings['seeding (not part of the migration)'] = performance.now() - started;
  facts.fileMb = statSync(join(dir, 'big.db')).size / 1_048_576;
}, 300_000);

afterAll(() => {
  try {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the folder is in the temp directory */
  }
});

describe('migration 005 on 5,000 products x 3 sizes with thousands of sales and returns', () => {
  it('migrates, keeps everything, backfills every line, and the time is reported', async () => {
    expect(currentSchemaVersion(db)).toBe(4);
    const before = {
      products: (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c,
      lines: (db.prepare('SELECT COUNT(*) AS c FROM invoice_items').get() as { c: number }).c,
      returnLines: (db.prepare('SELECT COUNT(*) AS c FROM sales_return_items').get() as { c: number }).c,
      revenueBefore: (db.prepare('SELECT COALESCE(SUM(line_total - tax_amount), 0) AS v FROM invoice_items').get() as { v: number }).v,
    };
    expect(before.products).toBe(GROUPS * 3);

    // what the backup alone costs (the runner takes one before it migrates a database file)
    const backupStarted = performance.now();
    const copy = await backupDatabase(db, join(dir, 'probe-backup.db'));
    timings['one pre-migration backup of the file'] = performance.now() - backupStarted;
    facts.backupMb = copy.bytes / 1_048_576;

    const started = performance.now();
    const result = await migrate(db, { migrations: loadMigrations().slice(0, 5) });
    timings['migrate() in total, backup included'] = performance.now() - started;
    expect(result.applied).toEqual([5]);
    expect(result.backupPath).not.toBeNull();

    // nothing lost
    expect((db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c).toBe(before.products);
    expect((db.prepare('SELECT COUNT(*) AS c FROM invoice_items').get() as { c: number }).c).toBe(before.lines);
    expect((db.prepare('SELECT COUNT(*) AS c FROM sales_return_items').get() as { c: number }).c).toBe(before.returnLines);
    expect((db.prepare('SELECT COALESCE(SUM(line_total - tax_amount), 0) AS v FROM invoice_items').get() as { v: number }).v).toBe(before.revenueBefore);

    // every line is named, and exactly as the product is named today
    expect((db.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE name_en IS NULL AND name_ur IS NULL').get() as { c: number }).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS c FROM invoice_items ii JOIN products p ON p.id = ii.product_id WHERE ii.name_en IS NOT p.name_en OR ii.name_ur IS NOT p.name_ur').get() as { c: number }).c).toBe(0);
    // no line gets back more tax than it was charged
    expect((db.prepare('SELECT COUNT(*) AS c FROM invoice_items ii WHERE (SELECT COALESCE(SUM(tax_refund), 0) FROM sales_return_items WHERE invoice_item_id = ii.id) > ii.tax_amount').get() as { c: number }).c).toBe(0);
    expect(checkIntegrity(db)).toEqual({ ok: true, problems: [] });

    // a sample of 400 return lines against the core's own arithmetic
    const sample = db
      .prepare(
        `SELECT sri.id, sri.qty, ii.id AS item, ii.qty AS sold, ii.line_total, ii.tax_amount, sri.tax_refund,
                COALESCE((SELECT SUM(x.qty) FROM sales_return_items x JOIN sales_returns xr ON xr.id = x.sales_return_id JOIN sales_returns r ON r.id = sri.sales_return_id
                          WHERE x.invoice_item_id = ii.id AND (xr.created_at < r.created_at OR (xr.created_at = r.created_at AND x.rowid < sri.rowid))), 0) AS returned_before
         FROM sales_return_items sri JOIN invoice_items ii ON ii.id = sri.invoice_item_id ORDER BY sri.rowid LIMIT 400`,
      )
      .all() as { id: string; qty: number; item: string; sold: number; line_total: number; tax_amount: number; tax_refund: number; returned_before: number }[];
    expect(sample.length).toBeGreaterThan(0);
    for (const row of sample) {
      expect(row.tax_refund, row.id).toBe(taxRefundFor({ invoice_item_id: row.item, qty: row.sold, line_total: row.line_total, tax_amount: row.tax_amount, qty_returned: row.returned_before }, row.qty));
    }

    // report
    const lines = [
      `5,000 products x 3 sizes = ${facts.products} sizes, ${facts.lines} invoice lines, ${facts.returnLines} return lines; database file ${facts.fileMb.toFixed(1)} MB`,
      ...Object.entries(timings).map(([name, ms]) => `  ${name}: ${(ms / 1000).toFixed(2)} s`),
    ];
    console.log(`\nMIGRATION 005 ON A LARGE SHOP\n${lines.join('\n')}\n`);
    // A generous bound: the point of the number above is the report, this only catches a migration that has become pathologically slow.
    expect(timings['migrate() in total, backup included']!).toBeLessThan(120_000);
  }, 300_000);
});
