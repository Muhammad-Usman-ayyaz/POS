// In-memory fake repositories for testing services without SQLite.
// The fake behaves like the real adapter on the points that matter to the services:
//  - run() is all-or-nothing: if the work throws, every write is undone (including the document counters)
//  - a repository used outside run() throws
//  - a row with created_at, updated_at, deleted_at or version is refused: the database owns those
//  - failures can be injected on the Nth insert into a table, to prove nothing is left half-written
//  - a few database rules are mirrored (no negative stock, no zero ledger entry) so a service bug shows up
import { createKhataService, createPaymentService, createPurchaseService, createSaleService, createSalesReturnService, createStockService, DomainError, fixedClock, type Batch, type Clock, type Customer, type Invoice, type InvoiceItem, type LedgerEntry, type Product, type PublicUser, type Repositories, type Supplier, type UnitOfWork } from '../../src/index.js';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Row = Record<string, unknown>;
const META_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'version'] as const;
const STAMP = '2026-01-01T00:00:00.000Z';

export interface FakeData {
  products: Product[];
  batches: Batch[];
  stock_movements: Row[];
  customers: Customer[];
  suppliers: Supplier[];
  users: PublicUser[];
  invoices: Invoice[];
  invoice_items: InvoiceItem[];
  sales_returns: Row[];
  sales_return_items: Row[];
  purchases: Row[];
  purchase_items: Row[];
  payments: Row[];
  ledger_entries: LedgerEntry[];
  sequences: Record<string, number>;
}

const emptyData = (): FakeData => ({
  products: [], batches: [], stock_movements: [], customers: [], suppliers: [], users: [], invoices: [],
  invoice_items: [], sales_returns: [], sales_return_items: [], purchases: [], purchase_items: [], payments: [],
  ledger_entries: [], sequences: { invoice: 0, return: 0, purchase: 0 },
});

export class FakeStore {
  data: FakeData = emptyData();
  inTx = false;
  /** How many times run() was entered. */
  runs = 0;
  failure: { table: string; nth: number } | null = null;
  private insertCounts: Record<string, number> = {};

  /** Called when a run starts: the failure position is counted per run. */
  startRun(): void {
    this.insertCounts = {};
  }
  readonly prefixes: Record<string, string> = { invoice: 'INV-A-', return: 'RET-A-', purchase: 'PUR-A-' };

  /** Make the Nth insert (1-based, counted per run) into `table` throw. */
  failOnInsert(table: keyof FakeData, nth = 1): void {
    this.failure = { table, nth };
  }

  /** A deep copy of everything, to compare before and after. */
  snapshot(): FakeData {
    return structuredClone(this.data);
  }

  insert(table: Exclude<keyof FakeData, 'sequences'>, row: Row): void {
    if (!this.inTx) throw new Error(`repository used outside a unit of work (insert into ${table})`);
    for (const key of META_COLUMNS) {
      if (key in row) throw new Error(`service set ${key} on ${table}: the database owns that column`);
    }
    const n = (this.insertCounts[table] = (this.insertCounts[table] ?? 0) + 1);
    if (this.failure && this.failure.table === table && this.failure.nth === n) {
      throw new Error(`injected failure on insert #${n} into ${table}`);
    }

    if (table === 'stock_movements') {
      const delta = row.qty_delta as number;
      if (delta === 0) throw new Error('stock_movements: qty_delta cannot be 0');
      if (delta < 0 && this.stockOf(row.batch_id as string) + delta < 0) throw new Error('insufficient stock in batch');
    }
    if (table === 'ledger_entries' && row.amount_delta === 0) throw new Error('ledger_entries: amount_delta cannot be 0');
    if (table === 'payments' && (row.amount as number) <= 0) throw new Error('payments: amount must be positive');

    (this.data[table] as Row[]).push({ ...row, created_at: STAMP, updated_at: STAMP, deleted_at: null, version: 1 });
  }

  stockOf(batchId: string): number {
    return this.data.stock_movements.filter((m) => m.batch_id === batchId).reduce((s, m) => s + (m.qty_delta as number), 0);
  }

  needTx(what: string): void {
    if (!this.inTx) throw new Error(`repository used outside a unit of work (${what})`);
  }
}

export function createFakeRepositories(store: FakeStore): Repositories {
  return {
    products: { getById: (id) => (store.needTx('products'), store.data.products.find((p) => p.id === id)) },
    batches: {
      getById: (id) => (store.needTx('batches'), store.data.batches.find((b) => b.id === id)),
      getByProductAndNo: (productId, batchNo) => (store.needTx('batches'), store.data.batches.find((b) => b.product_id === productId && b.batch_no === batchNo)),
      listForProduct: (productId) => {
        store.needTx('batches');
        return store.data.batches
          .filter((b) => b.product_id === productId && b.deleted_at === null)
          .map((b) => ({ ...b, stock: store.stockOf(b.id) }));
      },
      insert: (row) => store.insert('batches', row),
    },
    stock: {
      stockOfBatch: (id) => (store.needTx('stock'), store.stockOf(id)),
      insert: (row) => store.insert('stock_movements', row),
    },
    customers: { getById: (id) => (store.needTx('customers'), store.data.customers.find((c) => c.id === id)) },
    suppliers: { getById: (id) => (store.needTx('suppliers'), store.data.suppliers.find((s) => s.id === id)) },
    users: { getById: (id) => (store.needTx('users'), store.data.users.find((u) => u.id === id)) },
    invoices: {
      getById: (id) => (store.needTx('invoices'), store.data.invoices.find((i) => i.id === id)),
      listItems: (invoiceId) => (store.needTx('invoices'), store.data.invoice_items.filter((i) => i.invoice_id === invoiceId)),
      insert: (row) => store.insert('invoices', row),
      insertItem: (row) => store.insert('invoice_items', row),
    },
    salesReturns: {
      returnedQtyByItem: (invoiceId) => {
        store.needTx('sales returns');
        const itemIds = new Set(store.data.invoice_items.filter((i) => i.invoice_id === invoiceId).map((i) => i.id));
        const result = new Map<string, number>();
        for (const r of store.data.sales_return_items) {
          const id = r.invoice_item_id as string;
          if (itemIds.has(id)) result.set(id, (result.get(id) ?? 0) + (r.qty as number));
        }
        return result;
      },
      insert: (row) => store.insert('sales_returns', row),
      insertItem: (row) => store.insert('sales_return_items', row),
    },
    purchases: {
      insert: (row) => store.insert('purchases', row),
      insertItem: (row) => store.insert('purchase_items', row),
    },
    payments: { insert: (row) => store.insert('payments', row) },
    ledger: {
      balance: (type, id) => (store.needTx('ledger'), store.data.ledger_entries.filter((e) => e.party_type === type && e.party_id === id).reduce((s, e) => s + e.amount_delta, 0)),
      list: (type, id) => (store.needTx('ledger'), store.data.ledger_entries.filter((e) => e.party_type === type && e.party_id === id)),
      insert: (row) => store.insert('ledger_entries', row),
    },
    numbers: {
      next: (sequence) => {
        store.needTx('numbers');
        const n = (store.data.sequences[sequence] ?? 0) + 1;
        store.data.sequences[sequence] = n;
        return `${store.prefixes[sequence]}${String(n).padStart(6, '0')}`;
      },
    },
  };
}

export function createFakeUnitOfWork(store: FakeStore): UnitOfWork {
  const tx = createFakeRepositories(store);
  return {
    run<T>(work: (repos: Repositories) => T): T {
      if (store.inTx) throw new Error('run() called inside run(): use the tx you were given');
      store.runs += 1;
      const before = structuredClone(store.data);
      store.inTx = true;
      store.startRun();
      try {
        return work(tx);
      } catch (error) {
        store.data = before; // roll everything back, including the document counters
        throw error;
      } finally {
        store.inTx = false;
      }
    },
  };
}

// ---- builders for seed data (full entities, as the database would return them) ----

const scope = { shop_id: uuid(900), branch_id: uuid(901), device_id: uuid(902) };
const meta = { created_at: STAMP, updated_at: STAMP, deleted_at: null, version: 1 };

export const product = (o: Partial<Product> & { id: string }): Product => ({
  category_id: null, brand_id: null, name_en: 'Product', name_ur: null, sku: null, barcode: null, base_unit: 'ml', pack_size: 1000,
  allow_loose: 0, retail_price: 50_000, wholesale_price: 45_000, tax_rate_bp: 0, min_stock: 0, is_active: 1, ...scope, ...meta, ...o,
});
export const batch = (o: Partial<Batch> & { id: string; product_id: string }): Batch => ({
  supplier_id: null, batch_no: o.id.slice(-4), expiry_date: '2027-01-31', cost_price: 40_000, ...scope, ...meta, ...o,
});
export const customer = (o: Partial<Customer> & { id: string }): Customer => ({
  name_en: 'Rashid', name_ur: null, phone: null, village: null, credit_limit: 1_000_000, default_price_type: 'retail', notes: null, ...scope, ...meta, ...o,
});
export const supplier = (o: Partial<Supplier> & { id: string }): Supplier => ({
  name_en: 'Agri Dealer', name_ur: null, phone: null, address: null, ...scope, ...meta, ...o,
});
export const user = (o: Partial<PublicUser> & { id: string }): PublicUser => ({
  name: 'User', username: `user-${o.id.slice(-3)}`, role: 'staff', is_active: 1, ...scope, ...meta, ...o,
});

// ---- a ready-made shop ----

export const ID = {
  owner: uuid(1), staff: uuid(2), inactive: uuid(5), supplier: uuid(3), customer: uuid(4),
  bottle: uuid(10), fert: uuid(11), taxed: uuid(12), retired: uuid(13),
  bA: uuid(20), bB: uuid(21), bExpired: uuid(22), bFert: uuid(23), bTaxed: uuid(24),
  scope,
} as const;

export interface World {
  store: FakeStore;
  uow: UnitOfWork;
  clock: Clock & { set(iso: string): void };
  deps: { uow: UnitOfWork; clock: Clock; ids: { newId(): string }; scope: typeof scope };
}

/**
 * Users: an owner, a staff member, an inactive user. One supplier, one customer (limit Rs 10,000).
 * Bottle (1000 ml packs only, Rs 500): batch A 8 packs expiring 2027-01-31, batch B 10 packs expiring 2027-06-30,
 * and an expired batch with 1 pack. Fertilizer (loose, Rs 200 per kg): 10 kg. A product with 18% tax: 10 packs.
 * Today is 2026-10-01.
 */
export function makeWorld(): World {
  const store = new FakeStore();
  const d = store.data;
  d.users.push(user({ id: ID.owner, role: 'owner', name: 'Owner' }), user({ id: ID.staff }), user({ id: ID.inactive, is_active: 0 }));
  d.suppliers.push(supplier({ id: ID.supplier }));
  d.customers.push(customer({ id: ID.customer }));
  d.products.push(
    product({ id: ID.bottle, name_en: 'Insecticide 1L' }),
    product({ id: ID.fert, name_en: 'Fertilizer 1kg', base_unit: 'g', allow_loose: 1, retail_price: 20_000, wholesale_price: 18_000 }),
    product({ id: ID.taxed, name_en: 'Taxed 1L', tax_rate_bp: 1800 }),
    product({ id: ID.retired, name_en: 'Retired', is_active: 0 }),
  );
  d.batches.push(
    batch({ id: ID.bA, product_id: ID.bottle, batch_no: 'A', expiry_date: '2027-01-31', cost_price: 40_000 }),
    batch({ id: ID.bB, product_id: ID.bottle, batch_no: 'B', expiry_date: '2027-06-30', cost_price: 41_000 }),
    batch({ id: ID.bExpired, product_id: ID.bottle, batch_no: 'OLD', expiry_date: '2020-01-01', cost_price: 39_000 }),
    batch({ id: ID.bFert, product_id: ID.fert, batch_no: 'F1', expiry_date: '2027-03-01', cost_price: 15_000 }),
    batch({ id: ID.bTaxed, product_id: ID.taxed, batch_no: 'T1', expiry_date: '2027-03-01', cost_price: 40_000 }),
  );
  const opening = (batch_id: string, qty: number) =>
    d.stock_movements.push({ id: uuid(5000 + d.stock_movements.length), batch_id, qty_delta: qty, movement_type: 'opening', ref_type: null, ref_id: null, created_by: ID.owner, ...scope, ...meta });
  opening(ID.bA, 8000);
  opening(ID.bB, 10_000);
  opening(ID.bExpired, 1000);
  opening(ID.bFert, 10_000);
  opening(ID.bTaxed, 10_000);

  let now = '2026-10-01T12:00:00.000Z';
  const clock = Object.assign({ now: () => fixedClock(now).now(), set: (iso: string) => void (now = iso) });
  let next = 10_000;
  const uow = createFakeUnitOfWork(store);
  return { store, uow, clock, deps: { uow, clock, ids: { newId: () => uuid(next++) }, scope } };
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

export function services(w: World) {
  return {
    stock: createStockService(w.deps),
    purchase: createPurchaseService(w.deps),
    sale: createSaleService(w.deps),
    payment: createPaymentService(w.deps),
    khata: createKhataService(w.deps),
    salesReturn: createSalesReturnService(w.deps),
  };
}

/** Put extra stock on a batch, as seed data (not through a service). */
export function addStock(w: World, batchId: string, qty: number): void {
  w.store.data.stock_movements.push({ id: uuid(7000 + w.store.data.stock_movements.length), batch_id: batchId, qty_delta: qty, movement_type: 'opening', ref_type: null, ref_id: null, created_by: ID.owner, ...scope, ...meta });
}
