// In-memory backend for the shared service tests. It behaves like the SQLite adapter on the points the
// services rely on, and the shared suite checks that it really does:
//  - run() is all-or-nothing, refuses nesting, and refuses a callback that returns a Promise
//  - a repository used outside run() throws
//  - a row with created_at, updated_at, deleted_at or version is refused: the database owns those
//  - a few database rules are mirrored (no negative stock, no zero ledger entry)
import type { Batch, Brand, Category, Customer, Invoice, InvoiceItem, LedgerEntry, Product, ProductGroup, PublicUser, Repositories, Supplier, UnitOfWork } from '../../src/index.js';
import { todayUtc, systemClock, addDays } from '../../src/index.js';
import { Instrument, instrument } from './instrument.js';
import { ID, idGenerator, SCOPE, seedData, testClock, type InsertTable, type Row, type ServiceWorld, type TableName, type WorldOptions } from './world.js';

const META_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'version'] as const;
const STAMP = '2026-01-01T00:00:00.000Z';
const meta = { created_at: STAMP, updated_at: STAMP, deleted_at: null, version: 1 };

interface FakeData {
  categories: Category[];
  brands: Brand[];
  product_groups: ProductGroup[];
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
  audit_log: Row[];
  sequences: Record<string, number>;
}

const emptyData = (): FakeData => ({
  categories: [], brands: [], product_groups: [], products: [], batches: [], stock_movements: [], customers: [], suppliers: [], users: [], invoices: [], invoice_items: [],
  sales_returns: [], sales_return_items: [], purchases: [], purchase_items: [], payments: [], ledger_entries: [], audit_log: [],
  sequences: { invoice: 0, return: 0, purchase: 0 },
});

class FakeStore {
  data: FakeData = emptyData();
  inTx = false;
  readonly prefixes: Record<string, string> = { invoice: 'INV-A-', return: 'RET-A-', purchase: 'PUR-A-' };

  insert(table: InsertTable, row: Row): void {
    this.needTx(`insert into ${table}`);
    for (const key of META_COLUMNS) {
      if (key in row) throw new Error(`service set ${key} on ${table}: the database owns that column`);
    }
    if (table === 'stock_movements') {
      const delta = row.qty_delta as number;
      if (delta === 0) throw new Error('stock_movements: qty_delta cannot be 0');
      if (delta < 0 && this.stockOf(row.batch_id as string) + delta < 0) throw new Error('insufficient stock in batch');
    }
    if (table === 'ledger_entries' && row.amount_delta === 0) throw new Error('ledger_entries: amount_delta cannot be 0');
    if (table === 'payments' && (row.amount as number) <= 0) throw new Error('payments: amount must be positive');
    (this.data[table] as Row[]).push({ ...row, ...meta });
  }

  /** Changes columns of one row, like an UPDATE. The database owns version and updated_at, so a service may not set them. */
  update(table: 'products' | 'product_groups', id: string, patch: Row): void {
    this.needTx('update ' + table);
    for (const key of [...META_COLUMNS, 'id']) {
      if (key in patch) throw new Error('service set ' + key + ' on ' + table + ': the database owns that column');
    }
    const row = (this.data[table] as Row[]).find((r) => r.id === id);
    if (!row) throw new Error('update: no row ' + id + ' in ' + table);
    Object.assign(row, patch, { version: (row.version as number) + 1 });
  }

  stockOf(batchId: string): number {
    return this.data.stock_movements.filter((m) => m.batch_id === batchId).reduce((s, m) => s + (m.qty_delta as number), 0);
  }

  needTx(what: string): void {
    if (!this.inTx) throw new Error(`repository used outside a unit of work (${what})`);
  }
}

/** A row as a database hands it back: a fresh copy, so a later UPDATE cannot change what a service already read. */
const copy = <T extends object>(row: T | undefined): T | undefined => (row === undefined ? undefined : { ...row });

function createRepositories(store: FakeStore): Repositories {
  const byExpiryThenId = (a: Batch, b: Batch) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : a.id < b.id ? -1 : 1);
  return {
    categories: { getById: (id) => (store.needTx('categories'), store.data.categories.find((c) => c.id === id)) },
    brands: { getById: (id) => (store.needTx('brands'), store.data.brands.find((b) => b.id === id)) },
    productGroups: {
      getById: (id) => (store.needTx('product_groups'), copy(store.data.product_groups.find((g) => g.id === id))),
      insert: (row) => store.insert('product_groups', row),
      update: (id, patch) => store.update('product_groups', id, patch),
      listWithSizes: (today) => {
        store.needTx('product_groups');
        const stockOf = (productId: string, onlyUnexpired: boolean): number =>
          store.data.batches
            .filter((b) => b.product_id === productId && b.deleted_at === null && (!onlyUnexpired || b.expiry_date >= today))
            .reduce((sum, b) => sum + store.stockOf(b.id), 0);
        const nameOf = (g: ProductGroup) => g.name_en ?? g.name_ur ?? '';
        return store.data.product_groups
          .filter((g) => g.deleted_at === null)
          .sort((a, b) => (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : a.id < b.id ? -1 : 1))
          .map((group) => ({
            group: { ...group },
            sizes: store.data.products
              .filter((p) => p.group_id === group.id && p.deleted_at === null)
              .sort((a, b) => a.pack_size - b.pack_size || (a.id < b.id ? -1 : 1))
              .map((p) => ({ ...p, stock_total: stockOf(p.id, false), stock_sellable: stockOf(p.id, true) })),
          }));
      },
    },
    products: {
      getById: (id) => (store.needTx('products'), copy(store.data.products.find((p) => p.id === id))),
      listByGroup: (groupId) => (
        store.needTx('products'),
        store.data.products.filter((p) => p.group_id === groupId && p.deleted_at === null).sort((a, b) => a.pack_size - b.pack_size || (a.id < b.id ? -1 : 1)).map((p) => ({ ...p }))
      ),
      findByBarcode: (barcode) => (store.needTx('products'), copy(store.data.products.find((p) => p.barcode === barcode))),
      findBySku: (sku) => (store.needTx('products'), copy(store.data.products.find((p) => p.sku === sku))),
      insert: (row) => store.insert('products', row),
      update: (id, patch) => store.update('products', id, patch),
    },
    batches: {
      getById: (id) => (store.needTx('batches'), store.data.batches.find((b) => b.id === id)),
      getByProductAndNo: (productId, batchNo) => (store.needTx('batches'), store.data.batches.find((b) => b.product_id === productId && b.batch_no === batchNo)),
      listForProduct: (productId) => {
        store.needTx('batches');
        return store.data.batches
          .filter((b) => b.product_id === productId && b.deleted_at === null)
          .sort(byExpiryThenId)
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
    audit: { insert: (row) => store.insert('audit_log', row) },
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

function createUnitOfWork(store: FakeStore, repos: Repositories): UnitOfWork {
  return {
    run<T>(work: (tx: Repositories) => T): T {
      if (store.inTx) throw new Error('run() called inside run(): use the tx you were given');
      const before = structuredClone(store.data);
      store.inTx = true;
      try {
        const result = work(repos);
        if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
          throw new Error('the unit of work callback must be synchronous: a transaction cannot wait on a Promise');
        }
        return result;
      } catch (error) {
        store.data = before; // undo everything, including the document counters
        throw error;
      } finally {
        store.inTx = false;
      }
    },
  };
}

export function createFakeWorld(options: WorldOptions = {}): ServiceWorld {
  const today = todayUtc(systemClock);
  const store = new FakeStore();
  const seed = seedData(today, options);
  const d = store.data;
  d.users.push(...(seed.users.map((r) => ({ ...r, ...meta })) as unknown as PublicUser[]));
  d.suppliers.push(...(seed.suppliers.map((r) => ({ ...r, ...meta })) as unknown as Supplier[]));
  d.customers.push(...(seed.customers.map((r) => ({ ...r, ...meta })) as unknown as Customer[]));
  d.categories.push(...(seed.categories.map((r) => ({ ...r, ...meta })) as unknown as Category[]));
  d.brands.push(...(seed.brands.map((r) => ({ ...r, ...meta })) as unknown as Brand[]));
  d.product_groups.push(...(seed.product_groups.map((r) => ({ ...r, ...meta })) as unknown as ProductGroup[]));
  d.products.push(...(seed.products.map((r) => ({ ...r, ...meta })) as unknown as Product[]));
  d.batches.push(...(seed.batches.map((r) => ({ ...r, ...meta })) as unknown as Batch[]));

  const addStock = (batch_id: string, qty: number) =>
    d.stock_movements.push({ id: `seed-${d.stock_movements.length}`, batch_id, qty_delta: qty, movement_type: 'opening', ref_type: null, ref_id: null, created_by: ID.owner, ...SCOPE, ...meta });
  for (const o of seed.openings) addStock(o.batch_id, o.qty);

  const day = (n: number) => addDays(today, n);
  const clock = testClock(`${today}T12:00:00.000Z`);
  const probe = new Instrument();
  const repos = createRepositories(store);
  const tableOf = (table: TableName): Row[] => (table === 'number_sequences' ? [] : (store.data[table] as Row[]));

  return {
    deps: { uow: instrument(createUnitOfWork(store, repos), probe), clock, ids: idGenerator(), scope: SCOPE },
    today,
    day,
    at: (n, time = '12:00:00.000') => `${day(n)}T${time}Z`,
    setNow: clock.set,
    runs: () => probe.runs,
    inTransaction: () => store.inTx,
    rows: (table) => tableOf(table).map((r) => ({ ...r })),
    stockOf: (batchId) => store.stockOf(batchId),
    snapshot: () => structuredClone(store.data),
    update: (table, id, patch) => {
      const row = tableOf(table).find((r) => r.id === id);
      if (!row) throw new Error(`update: no row ${id} in ${table}`);
      Object.assign(row, patch);
    },
    addStock,
    failOnInsert: (table, nth) => probe.failOnInsert(table, nth),
    clearFailure: () => probe.clearFailure(),
    outsideTransaction: () => repos,
    close: () => undefined,
  };
}
