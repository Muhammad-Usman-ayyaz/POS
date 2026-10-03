// The contract between the shared service tests and a backend.
//
// The same test suites run against the in-memory fakes and against the real SQLite adapter. Each backend
// provides a `WorldFactory` that builds a "world": a small shop with seed data, the dependencies the
// services need, and a few helpers for looking at (and poking) the stored data. Anything a test needs
// from the backend goes through `ServiceWorld`, so a difference between the two backends fails a test.
import {
  addDays,
  createKhataService,
  createPaymentService,
  createPurchaseService,
  createSaleService,
  createSalesReturnService,
  createStockService,
  DomainError,
  type Repositories,
  type ServiceDeps,
} from '../../src/index.js';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SCOPE = { shop_id: uuid(900), branch_id: uuid(901), device_id: uuid(902) };

export const ID = {
  owner: uuid(1), staff: uuid(2), inactive: uuid(5), supplier: uuid(3), customer: uuid(4),
  bottle: uuid(10), fert: uuid(11), taxed: uuid(12), retired: uuid(13),
  bA: uuid(20), bB: uuid(21), bExpired: uuid(22), bFert: uuid(23), bTaxed: uuid(24),
  scope: SCOPE,
} as const;

export type Row = Record<string, unknown>;

export type TableName =
  | 'products' | 'batches' | 'stock_movements' | 'customers' | 'suppliers' | 'users' | 'invoices' | 'invoice_items'
  | 'sales_returns' | 'sales_return_items' | 'purchases' | 'purchase_items' | 'payments' | 'ledger_entries'
  | 'audit_log' | 'number_sequences';

/** Tables a service can insert into. A test can make the Nth insert into one of these fail. */
export type InsertTable = Exclude<TableName, 'products' | 'customers' | 'suppliers' | 'users' | 'number_sequences'>;

export interface WorldOptions {
  /** false: the same shop with no batches and no stock (for end-to-end scenarios that buy their own). Default true. */
  stock?: boolean;
}

export interface ServiceWorld {
  /** Dependencies for the services. The unit of work counts runs and can inject failures. */
  deps: ServiceDeps;
  /** Today in UTC when the world was built. Every seed date is relative to it. */
  today: string;
  /** `YYYY-MM-DD`, `n` days from today. */
  day(n: number): string;
  /** An ISO date-time on day `n`, for moving the clock. */
  at(n: number, time?: string): string;
  setNow(iso: string): void;

  /** How many times the unit of work was entered. */
  runs(): number;
  inTransaction(): boolean;
  /** Every row of a table, in insertion order. */
  rows(table: TableName): Row[];
  stockOf(batchId: string): number;
  /** Everything stored, to compare before and after. */
  snapshot(): unknown;
  /** Change rows directly, the way an admin tool or another module would (not through a service). */
  update(table: TableName, id: string, patch: Row): void;
  /** Put stock on a batch as seed data. */
  addStock(batchId: string, qty: number): void;

  /** Make the Nth insert (1-based, counted per unit of work) into `table` throw. */
  failOnInsert(table: InsertTable, nth?: number): void;
  clearFailure(): void;

  /** The repositories with no transaction around them. They must refuse to work. */
  outsideTransaction(): Repositories;
  close(): void;
}

export type WorldFactory = (options?: WorldOptions) => ServiceWorld | Promise<ServiceWorld>;

/** All six services over one world. */
export function services(w: ServiceWorld) {
  return {
    stock: createStockService(w.deps),
    purchase: createPurchaseService(w.deps),
    sale: createSaleService(w.deps),
    payment: createPaymentService(w.deps),
    khata: createKhataService(w.deps),
    salesReturn: createSalesReturnService(w.deps),
  };
}

/** The DomainError thrown by `fn` (code, message, params). Fails loudly if it threw something else or nothing. */
export function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw new Error(`expected a DomainError, got: ${String(e)}`);
  }
  throw new Error('expected a DomainError, but nothing was thrown');
}

/** The error code of a DomainError thrown by `fn`, or undefined if it did not throw one. */
export function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : `not a DomainError: ${String(e)}`;
  }
  return undefined;
}

// ---- seed data: the same shop for every backend ----

export interface SeedData {
  users: Row[];
  suppliers: Row[];
  customers: Row[];
  products: Row[];
  batches: Row[];
  /** Opening stock, as `opening` movements. */
  openings: { batch_id: string; qty: number }[];
}

/**
 * Users: an owner, a staff member, an inactive user. One supplier, one customer (limit Rs 10,000).
 * Bottle (1000 ml packs only, Rs 500): batch A 8 packs expiring in 120 days, batch B 10 packs in 270 days, and an
 * expired batch with 1 pack. Fertilizer (loose, Rs 200 per kg): 10 kg. A product with 18% tax: 10 packs.
 * Dates are relative to `today` because the SQLite triggers use the real date.
 */
export function seedData(today: string, options: WorldOptions = {}): SeedData {
  const day = (n: number) => addDays(today, n);
  const s = SCOPE;
  const user = (id: string, o: Row = {}) => ({ id, name: 'User', username: `user-${id.slice(-3)}`, role: 'staff', is_active: 1, ...s, ...o });
  const product = (id: string, o: Row = {}) => ({
    id, category_id: null, brand_id: null, name_en: 'Product', name_ur: null, sku: null, barcode: null, base_unit: 'ml', pack_size: 1000,
    allow_loose: 0, retail_price: 50_000, wholesale_price: 45_000, tax_rate_bp: 0, min_stock: 0, is_active: 1, ...s, ...o,
  });
  const batch = (id: string, product_id: string, o: Row) => ({ id, product_id, supplier_id: null, ...s, ...o });

  const withStock = options.stock !== false;
  return {
    users: [user(ID.owner, { name: 'Owner', role: 'owner' }), user(ID.staff), user(ID.inactive, { is_active: 0 })],
    suppliers: [{ id: ID.supplier, name_en: 'Agri Dealer', name_ur: null, phone: null, address: null, ...s }],
    customers: [{ id: ID.customer, name_en: 'Rashid', name_ur: null, phone: null, village: null, credit_limit: 1_000_000, default_price_type: 'retail', notes: null, ...s }],
    products: [
      product(ID.bottle, { name_en: 'Insecticide 1L' }),
      product(ID.fert, { name_en: 'Fertilizer 1kg', base_unit: 'g', allow_loose: 1, retail_price: 20_000, wholesale_price: 18_000 }),
      product(ID.taxed, { name_en: 'Taxed 1L', tax_rate_bp: 1800 }),
      product(ID.retired, { name_en: 'Retired', is_active: 0 }),
    ],
    batches: withStock
      ? [
          batch(ID.bA, ID.bottle, { batch_no: 'A', expiry_date: day(120), cost_price: 40_000 }),
          batch(ID.bB, ID.bottle, { batch_no: 'B', expiry_date: day(270), cost_price: 41_000 }),
          batch(ID.bExpired, ID.bottle, { batch_no: 'OLD', expiry_date: '2020-01-01', cost_price: 39_000 }),
          batch(ID.bFert, ID.fert, { batch_no: 'F1', expiry_date: day(150), cost_price: 15_000 }),
          batch(ID.bTaxed, ID.taxed, { batch_no: 'T1', expiry_date: day(150), cost_price: 40_000 }),
        ]
      : [],
    openings: withStock
      ? [{ batch_id: ID.bA, qty: 8000 }, { batch_id: ID.bB, qty: 10_000 }, { batch_id: ID.bExpired, qty: 1000 }, { batch_id: ID.bFert, qty: 10_000 }, { batch_id: ID.bTaxed, qty: 10_000 }]
      : [],
  };
}

/** Pieces every backend builds the same way. */
export function testClock(startIso: string) {
  let now = startIso;
  return { now: () => new Date(now), set: (iso: string) => void (now = iso) };
}

export function idGenerator(start = 10_000) {
  let next = start;
  return { newId: () => uuid(next++) };
}
