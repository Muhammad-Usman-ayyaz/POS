import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { addDays, type DeviceScope } from '@pos/core';
import { openDatabase, type Db } from './connection.js';

// DEV AND TEST ONLY. This file is imported as '@pos/db-sqlite/demo', never from the package index, so the
// desktop app's production bundle cannot reach it (a test builds the app and checks that it cannot).
//
// Demo shop data that matches the approved design mockups: eight products with batches, a supplier and five
// customers with opening balances. It is used by `npm run dev:db` (so the screens have something to show)
// and by tests that need real products. It is plain SQL inserts, the same rows the real screens will create.

export interface DemoIds {
  supplierId: string;
  /** keys: insecticide1l, insecticide500, fungicide250, weedicide1l, dap50, fertilizer1kg, vegseed1kg, rodenticide100 */
  products: Record<string, string>;
  /** one batch per product, same keys */
  batches: Record<string, string>;
  /** keys: rashid, imran, bashir, tariq, sajid */
  customers: Record<string, string>;
}

interface DemoProduct {
  key: string;
  category: string;
  nameEn: string;
  nameUr: string;
  baseUnit: 'ml' | 'g' | 'piece';
  packSize: number;
  allowLoose: 0 | 1;
  /** Paisa per pack. */
  cost: number;
  retail: number;
  wholesale: number;
  /** In base units. */
  stock: number;
  minStock: number;
  /** A date, or days from today (negative means already expired). */
  expiry: string | number;
}

const CATEGORIES: [string, string][] = [
  ['Insecticide', 'کیڑے مار دوا'],
  ['Fungicide', 'پھپھوندی کش'],
  ['Weedicide', 'جڑی بوٹی مار دوا'],
  ['Fertilizer', 'کھاد'],
  ['Seeds', 'بیج'],
  ['Rodenticide', 'چوہے مار دوا'],
];

const PRODUCTS: DemoProduct[] = [
  { key: 'insecticide1l', category: 'Insecticide', nameEn: 'Insecticide 1L', nameUr: 'کیڑے مار دوا', baseUnit: 'ml', packSize: 1000, allowLoose: 0, cost: 40_000, retail: 50_000, wholesale: 45_000, stock: 12_000, minStock: 5000, expiry: '2027-03-12' },
  { key: 'insecticide500', category: 'Insecticide', nameEn: 'Insecticide 500ml', nameUr: 'کیڑے مار دوا', baseUnit: 'ml', packSize: 500, allowLoose: 0, cost: 21_500, retail: 27_000, wholesale: 24_500, stock: 10_000, minStock: 2500, expiry: '2027-01-18' },
  { key: 'fungicide250', category: 'Fungicide', nameEn: 'Fungicide 250ml', nameUr: 'پھپھوندی کش', baseUnit: 'ml', packSize: 250, allowLoose: 0, cost: 28_000, retail: 35_000, wholesale: 32_000, stock: 2250, minStock: 500, expiry: 24 },
  { key: 'weedicide1l', category: 'Weedicide', nameEn: 'Weedicide 1L', nameUr: 'جڑی بوٹی مار دوا', baseUnit: 'ml', packSize: 1000, allowLoose: 0, cost: 62_000, retail: 78_000, wholesale: 72_000, stock: 3000, minStock: 5000, expiry: '2027-06-04' },
  { key: 'dap50', category: 'Fertilizer', nameEn: 'DAP fertilizer 50kg', nameUr: 'ڈی اے پی کھاد', baseUnit: 'g', packSize: 50_000, allowLoose: 0, cost: 1_180_000, retail: 1_250_000, wholesale: 1_220_000, stock: 700_000, minStock: 100_000, expiry: '2028-08-15' },
  { key: 'fertilizer1kg', category: 'Fertilizer', nameEn: 'Fertilizer 1kg', nameUr: 'کھاد', baseUnit: 'g', packSize: 1000, allowLoose: 1, cost: 15_000, retail: 20_000, wholesale: 18_000, stock: 9750, minStock: 2000, expiry: '2027-09-30' },
  { key: 'vegseed1kg', category: 'Seeds', nameEn: 'Vegetable seed 1kg', nameUr: 'سبزی کا بیج', baseUnit: 'g', packSize: 1000, allowLoose: 0, cost: 190_000, retail: 240_000, wholesale: 220_000, stock: 2000, minStock: 4000, expiry: '2026-12-10' },
  { key: 'rodenticide100', category: 'Rodenticide', nameEn: 'Rodenticide 100g', nameUr: 'چوہے مار دوا', baseUnit: 'g', packSize: 100, allowLoose: 0, cost: 9000, retail: 13_000, wholesale: 11_500, stock: 100, minStock: 100, expiry: -17 },
];

const CUSTOMERS: { key: string; nameEn: string; nameUr: string; village: string; limit: number; owes: number }[] = [
  { key: 'rashid', nameEn: 'Rashid', nameUr: 'راشد', village: 'Chak 12', limit: 1_000_000, owes: 200_000 },
  { key: 'imran', nameEn: 'Imran', nameUr: 'عمران', village: 'Chak 45', limit: 2_000_000, owes: 1_550_000 },
  { key: 'bashir', nameEn: 'Bashir', nameUr: 'بشیر', village: 'Chak 7', limit: 2_000_000, owes: 820_000 },
  { key: 'tariq', nameEn: 'Tariq', nameUr: 'طارق', village: 'Chak 45', limit: 1_000_000, owes: 475_000 },
  { key: 'sajid', nameEn: 'Sajid', nameUr: 'ساجد', village: 'Chak 12', limit: 500_000, owes: 0 },
];

/** The settings row that says "this database holds demo data". */
export const DEMO_MARKER_KEY = 'demo_data';

export type ExistingDatabase =
  /** There is no file. */
  | 'none'
  /** A file with no shop in it (new, or never set up). Safe to replace. */
  | 'empty'
  /** Exactly one shop, and it is the demo one. Safe to replace. */
  | 'demo'
  /** Anything else: a real shop, several shops, or a file that cannot be read. Never replace it. */
  | 'real';

/**
 * Looks inside an existing database file WITHOUT changing it, so a dev tool can decide whether it may delete it.
 * Anything it is not sure about counts as 'real'.
 */
export function inspectExistingDatabase(path: string): ExistingDatabase {
  if (!existsSync(path)) return 'none';
  let db: Db | undefined;
  try {
    db = openDatabase(path, { readonly: true });
    const has = (table: string) => db!.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
    if (!has('shops')) return 'empty';
    const shops = (db.prepare('SELECT COUNT(*) AS c FROM shops').get() as { c: number }).c;
    if (shops === 0) return 'empty';
    if (shops > 1 || !has('settings')) return 'real';
    const marker = db.prepare('SELECT value FROM settings WHERE "key" = ? AND deleted_at IS NULL').get(DEMO_MARKER_KEY) as { value: string } | undefined;
    return marker?.value === '1' ? 'demo' : 'real';
  } catch {
    return 'real';
  } finally {
    db?.close();
  }
}

/** `today` is `YYYY-MM-DD`. Expiry dates in the mockups that depend on today ("24 days", "17 days ago") are relative to it. */
export function seedDemoData(db: Db, scope: DeviceScope, ownerId: string, today: string): DemoIds {
  const s = [scope.shop_id, scope.branch_id, scope.device_id] as const;
  const ids: DemoIds = { supplierId: randomUUID(), products: {}, batches: {}, customers: {} };

  const insert = db.transaction(() => {
    // A marker, so tools can tell a demo database from a real shop's (see inspectExistingDatabase).
    db.prepare('INSERT INTO settings (id, "key", value, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), DEMO_MARKER_KEY, '1', ...s);
    db.prepare('INSERT INTO suppliers (id, name_en, name_ur, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(ids.supplierId, 'Agri Dealer', 'ایگری ڈیلر', ...s);

    const categoryIds = new Map<string, string>();
    for (const [en, ur] of CATEGORIES) {
      const id = randomUUID();
      categoryIds.set(en, id);
      db.prepare('INSERT INTO categories (id, name_en, name_ur, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, en, ur, ...s);
    }

    for (const p of PRODUCTS) {
      const productId = randomUUID();
      const batchId = randomUUID();
      ids.products[p.key] = productId;
      ids.batches[p.key] = batchId;
      db.prepare(
        `INSERT INTO products (id, category_id, name_en, name_ur, base_unit, pack_size, allow_loose, retail_price, wholesale_price, min_stock, shop_id, branch_id, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(productId, categoryIds.get(p.category), p.nameEn, p.nameUr, p.baseUnit, p.packSize, p.allowLoose, p.retail, p.wholesale, p.minStock, ...s);
      db.prepare('INSERT INTO batches (id, product_id, supplier_id, batch_no, expiry_date, cost_price, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        batchId, productId, ids.supplierId, `${p.key.slice(0, 3).toUpperCase()}-001`, typeof p.expiry === 'number' ? addDays(today, p.expiry) : p.expiry, p.cost, ...s,
      );
      db.prepare(
        `INSERT INTO stock_movements (id, batch_id, qty_delta, movement_type, created_by, shop_id, branch_id, device_id)
         VALUES (?, ?, ?, 'opening', ?, ?, ?, ?)`,
      ).run(randomUUID(), batchId, p.stock, ownerId, ...s);
    }

    for (const c of CUSTOMERS) {
      const customerId = randomUUID();
      ids.customers[c.key] = customerId;
      db.prepare('INSERT INTO customers (id, name_en, name_ur, village, credit_limit, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(customerId, c.nameEn, c.nameUr, c.village, c.limit, ...s);
      if (c.owes > 0) {
        db.prepare(
          `INSERT INTO ledger_entries (id, party_type, party_id, entry_type, amount_delta, created_by, shop_id, branch_id, device_id)
           VALUES (?, 'customer', ?, 'opening', ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), customerId, c.owes, ownerId, ...s);
      }
    }
  });
  insert();
  return ids;
}
