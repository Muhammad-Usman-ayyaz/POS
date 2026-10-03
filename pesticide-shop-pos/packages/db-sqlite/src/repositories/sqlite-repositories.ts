import type {
  Batch,
  BatchWithStock,
  Brand,
  Category,
  Customer,
  DeviceScope,
  DocumentSequence,
  GroupWithSizes,
  Invoice,
  InvoiceItem,
  LedgerEntry,
  Product,
  ProductGroup,
  PublicUser,
  Repositories,
  Supplier,
} from '@pos/core';
import type { Statement } from 'better-sqlite3';
import type { Db } from '../connection.js';

// Hand-written repositories for the core ports. This is the only place that talks SQL to the services' data.
// Rules this file keeps:
//  - every method must run inside a transaction (the unit of work); outside one it refuses to work
//  - inserts never set created_at, updated_at, deleted_at or version: the database triggers and defaults own them
//  - stock and balances are always SUMs over stock_movements and ledger_entries, never a stored number
//  - reads of editable tables skip soft-deleted rows where the port says so
//
// Every function here is an arrow function inside an object literal (no `this`), so a wrapper can spread a
// repository and replace one method, as the failure injection in the tests does.

const META_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'version'] as const;
const COLUMN_NAME = /^[a-z][a-z0-9_]*$/;

type InsertableTable =
  | 'product_groups' | 'products' | 'batches' | 'stock_movements' | 'invoices' | 'invoice_items' | 'sales_returns' | 'sales_return_items'
  | 'purchases' | 'purchase_items' | 'payments' | 'ledger_entries' | 'audit_log';

/** Columns of a user that are safe to hand to the services. The password hash is never selected. */
const PUBLIC_USER_COLUMNS = 'id, name, username, role, is_active, shop_id, branch_id, device_id, created_at, updated_at, deleted_at, version';

export function createSqliteRepositories(db: Db, scope: DeviceScope): Repositories {
  const cache = new Map<string, Statement>();
  const stmt = (sql: string): Statement => {
    let s = cache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };

  const needTx = (what: string): void => {
    if (!db.inTransaction) throw new Error(`repository used outside a unit of work (${what})`);
  };
  const one = <T>(what: string, sql: string, ...params: unknown[]): T | undefined => {
    needTx(what);
    return stmt(sql).get(...params) as T | undefined;
  };
  const all = <T>(what: string, sql: string, ...params: unknown[]): T[] => {
    needTx(what);
    return stmt(sql).all(...params) as T[];
  };
  const sum = (what: string, sql: string, ...params: unknown[]): number => {
    needTx(what);
    const row = stmt(sql).get(...params) as { total: number };
    return row.total;
  };

  /** INSERT from an object. Table and column names are checked, values are always bound parameters. */
  const insert = (table: InsertableTable, row: Record<string, unknown>): void => {
    needTx(`insert into ${table}`);
    const columns = Object.keys(row);
    for (const column of columns) {
      if ((META_COLUMNS as readonly string[]).includes(column)) {
        throw new Error(`service set ${column} on ${table}: the database owns that column`);
      }
      if (!COLUMN_NAME.test(column)) throw new Error(`bad column name for ${table}: ${column}`);
    }
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    stmt(sql).run(...columns.map((c) => row[c]));
  };

  /** UPDATE of the given columns of one row. Same checks as insert: the database owns id and the meta columns. */
  const update = (table: 'products' | 'product_groups', id: string, patch: Record<string, unknown>): void => {
    needTx('update ' + table);
    const columns = Object.keys(patch);
    for (const column of columns) {
      if (column === 'id' || (META_COLUMNS as readonly string[]).includes(column)) {
        throw new Error('service set ' + column + ' on ' + table + ': the database owns that column');
      }
      if (!COLUMN_NAME.test(column)) throw new Error('bad column name for ' + table + ': ' + column);
    }
    if (columns.length === 0) return;
    const result = stmt('UPDATE ' + table + ' SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?').run(...columns.map((c) => patch[c]), id);
    if (result.changes !== 1) throw new Error('update: no row ' + id + ' in ' + table);
  };

  return {
    categories: {
      getById: (id) => one<Category>('categories', 'SELECT * FROM categories WHERE id = ?', id),
    },

    brands: {
      getById: (id) => one<Brand>('brands', 'SELECT * FROM brands WHERE id = ?', id),
    },

    productGroups: {
      getById: (id) => one<ProductGroup>('product groups', 'SELECT * FROM product_groups WHERE id = ?', id),
      insert: (row) => insert('product_groups', row),
      update: (id, patch) => update('product_groups', id, patch),
      listWithSizes: (today) => {
        const groups = all<ProductGroup>('product groups', 'SELECT * FROM product_groups WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id');
        // Stock is summed over live batches (expired ones are left out of stock_sellable), like v_product_stock.
        const sizes = all<GroupWithSizes['sizes'][number]>(
          'product groups',
          `SELECT p.*,
                  COALESCE((SELECT SUM(m.qty_delta) FROM stock_movements m JOIN batches b ON b.id = m.batch_id
                             WHERE b.product_id = p.id AND b.deleted_at IS NULL), 0) AS stock_total,
                  COALESCE((SELECT SUM(m.qty_delta) FROM stock_movements m JOIN batches b ON b.id = m.batch_id
                             WHERE b.product_id = p.id AND b.deleted_at IS NULL AND b.expiry_date >= ?), 0) AS stock_sellable
             FROM products p
            WHERE p.deleted_at IS NULL
            ORDER BY p.pack_size, p.id`,
          today,
        );
        return groups.map((group) => ({ group, sizes: sizes.filter((s) => s.group_id === group.id) }));
      },
    },

    products: {
      getById: (id) => one<Product>('products', 'SELECT * FROM products WHERE id = ?', id),
      listByGroup: (groupId) => all<Product>('products', 'SELECT * FROM products WHERE group_id = ? AND deleted_at IS NULL ORDER BY pack_size, id', groupId),
      findByBarcode: (barcode) => one<Product>('products', 'SELECT * FROM products WHERE barcode = ?', barcode),
      findBySku: (sku) => one<Product>('products', 'SELECT * FROM products WHERE sku = ?', sku),
      insert: (row) => insert('products', row),
      update: (id, patch) => update('products', id, patch),
    },

    batches: {
      getById: (id) => one<Batch>('batches', 'SELECT * FROM batches WHERE id = ?', id),
      getByProductAndNo: (productId, batchNo) =>
        one<Batch>('batches', 'SELECT * FROM batches WHERE product_id = ? AND batch_no = ?', productId, batchNo),
      listForProduct: (productId) =>
        all<BatchWithStock>(
          'batches',
          `SELECT b.*, COALESCE((SELECT SUM(m.qty_delta) FROM stock_movements m WHERE m.batch_id = b.id), 0) AS stock
             FROM batches b
            WHERE b.product_id = ? AND b.deleted_at IS NULL
            ORDER BY b.expiry_date, b.id`,
          productId,
        ),
      insert: (row) => insert('batches', row),
    },

    stock: {
      stockOfBatch: (id) => sum('stock', 'SELECT COALESCE(SUM(qty_delta), 0) AS total FROM stock_movements WHERE batch_id = ?', id),
      insert: (row) => insert('stock_movements', row),
    },

    customers: {
      getById: (id) => one<Customer>('customers', 'SELECT * FROM customers WHERE id = ?', id),
    },

    suppliers: {
      getById: (id) => one<Supplier>('suppliers', 'SELECT * FROM suppliers WHERE id = ?', id),
    },

    users: {
      getById: (id) => one<PublicUser>('users', `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, id),
    },

    invoices: {
      getById: (id) => one<Invoice>('invoices', 'SELECT * FROM invoices WHERE id = ?', id),
      listItems: (invoiceId) => all<InvoiceItem>('invoices', 'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid', invoiceId),
      insert: (row) => insert('invoices', row),
      insertItem: (row) => insert('invoice_items', row),
    },

    salesReturns: {
      returnedQtyByItem: (invoiceId) => {
        const rows = all<{ invoice_item_id: string; qty: number }>(
          'sales returns',
          `SELECT r.invoice_item_id AS invoice_item_id, SUM(r.qty) AS qty
             FROM sales_return_items r
             JOIN invoice_items i ON i.id = r.invoice_item_id
            WHERE i.invoice_id = ?
            GROUP BY r.invoice_item_id`,
          invoiceId,
        );
        return new Map(rows.map((r) => [r.invoice_item_id, r.qty]));
      },
      insert: (row) => insert('sales_returns', row),
      insertItem: (row) => insert('sales_return_items', row),
    },

    purchases: {
      insert: (row) => insert('purchases', row),
      insertItem: (row) => insert('purchase_items', row),
    },

    payments: {
      insert: (row) => insert('payments', row),
    },

    ledger: {
      balance: (type, id) =>
        sum('ledger', 'SELECT COALESCE(SUM(amount_delta), 0) AS total FROM ledger_entries WHERE party_type = ? AND party_id = ?', type, id),
      list: (type, id) =>
        all<LedgerEntry>('ledger', 'SELECT * FROM ledger_entries WHERE party_type = ? AND party_id = ? ORDER BY entry_date, rowid', type, id),
      insert: (row) => insert('ledger_entries', row),
    },

    audit: {
      insert: (row) => insert('audit_log', row),
    },

    numbers: {
      /**
       * The next number for this device, like INV-A-000123. The counter is bumped in the same transaction as
       * the document, so a rolled-back sale gives its number back. (number_sequences has no updated_at
       * trigger, and we leave that column alone.)
       */
      next: (sequence: DocumentSequence) => {
        needTx('numbers');
        const row = stmt(
          `UPDATE number_sequences SET last_number = last_number + 1
            WHERE device_id = ? AND sequence_name = ?
        RETURNING prefix, last_number`,
        ).get(scope.device_id, sequence) as { prefix: string; last_number: number } | undefined;
        if (!row) throw new Error(`no '${sequence}' number sequence for device ${scope.device_id}: run first-launch setup`);
        return `${row.prefix}${String(row.last_number).padStart(6, '0')}`;
      },
    },
  };
}
