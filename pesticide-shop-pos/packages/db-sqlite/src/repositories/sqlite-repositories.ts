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
  LedgerDisplayRow,
  LedgerEntry,
  Product,
  ProductGroup,
  PublicUser,
  Repositories,
  SizeStatus,
  Supplier,
} from '@pos/core';
import { randomUUID } from 'node:crypto';
import type { Statement } from 'better-sqlite3';
import type { Db } from '../connection.js';
import { LEDGER_ORDER, LEDGER_ORDER_L } from '../ledger-order.js';

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
/** The next ledger sequence number. The partial index (seq IS NOT NULL) makes MAX cheap. */
const NEXT_LEDGER_SEQ = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM ledger_entries WHERE seq IS NOT NULL)';
const COLUMN_NAME = /^[a-z][a-z0-9_]*$/;

type InsertableTable =
  | 'customers' | 'suppliers' | 'categories' | 'brands' | 'product_groups' | 'products' | 'batches' | 'stock_movements' | 'invoices' | 'invoice_items' | 'sales_returns' | 'sales_return_items'
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
    if (table === 'ledger_entries') {
      // The ONE place a ledger row gets its sequence number (migration 008): the next one, taken inside the write transaction.
      if (columns.includes('seq')) throw new Error('service set seq on ledger_entries: the repository owns that column');
      const sql = `INSERT INTO ledger_entries (${columns.join(', ')}, seq) VALUES (${columns.map(() => '?').join(', ')}, ${NEXT_LEDGER_SEQ})`;
      stmt(sql).run(...columns.map((c) => row[c]));
      return;
    }
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    stmt(sql).run(...columns.map((c) => row[c]));
  };

  /** UPDATE of the given columns of one row. Same checks as insert: the database owns id and the meta columns. */
  const update = (table: 'products' | 'product_groups' | 'customers', id: string, patch: Record<string, unknown>): void => {
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
    settings: {
      getInt: (key, fallback) => {
        const row = one<{ value: string | null }>('settings', 'SELECT value FROM settings WHERE "key" = ? AND deleted_at IS NULL', key);
        const n = row?.value == null ? Number.NaN : Number.parseInt(row.value, 10);
        return Number.isInteger(n) ? n : fallback;
      },
      setInt: (key, value) => {
        needTx('settings');
        if (!Number.isSafeInteger(value)) throw new Error(`setting ${key} must be a whole number`);
        const changed = stmt('UPDATE settings SET value = ? WHERE "key" = ? AND deleted_at IS NULL').run(String(value), key).changes;
        if (changed === 0) {
          stmt('INSERT INTO settings (id, "key", value, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), key, String(value), scope.shop_id, scope.branch_id, scope.device_id);
        }
      },
    },

    categories: {
      getById: (id) => one<Category>('categories', 'SELECT * FROM categories WHERE id = ?', id),
      list: () => all<Category>('categories', 'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id'),
      insert: (row) => insert('categories', row),
    },

    brands: {
      getById: (id) => one<Brand>('brands', 'SELECT * FROM brands WHERE id = ?', id),
      list: () => all<Brand>('brands', 'SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id'),
      insert: (row) => insert('brands', row),
    },

    productGroups: {
      getById: (id) => one<ProductGroup>('product groups', 'SELECT * FROM product_groups WHERE id = ?', id),
      insert: (row) => insert('product_groups', row),
      update: (id, patch) => update('product_groups', id, patch),
      listWithSizes: (today) => {
        const groups = all<ProductGroup>('product groups', 'SELECT * FROM product_groups WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id');
        const products = all<Product>('product groups', 'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY pack_size, id');
        // Stock of every size in ONE pass over the batches and movements (not a lookup per size), summed over live batches;
        // expired ones are left out of stock_sellable. Same numbers as v_product_stock.
        const stockRows = all<{ product_id: string; total: number; sellable: number }>(
          'product groups',
          `SELECT b.product_id AS product_id,
                  SUM(m.qty_delta) AS total,
                  SUM(CASE WHEN b.expiry_date >= ? THEN m.qty_delta ELSE 0 END) AS sellable
             FROM batches b
             JOIN stock_movements m ON m.batch_id = b.id
            WHERE b.deleted_at IS NULL
            GROUP BY b.product_id`,
          today,
        );
        const stock = new Map(stockRows.map((r) => [r.product_id, r]));
        // Sizes are put under their group in ONE pass, in the order they were read (smallest pack first).
        const byGroup = new Map<string, GroupWithSizes['sizes']>();
        for (const p of products) {
          const row = stock.get(p.id);
          const size = { ...p, stock_total: row?.total ?? 0, stock_sellable: row?.sellable ?? 0 };
          const list = byGroup.get(p.group_id);
          if (list) list.push(size);
          else byGroup.set(p.group_id, [size]);
        }
        return groups.map((group) => ({ group, sizes: byGroup.get(group.id) ?? [] }));
      },
      listCatalogue: () => {
        const groups = all<ProductGroup>('product groups', 'SELECT * FROM product_groups WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id');
        const products = all<Product>('product groups', 'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY pack_size, id');
        // Sizes are put under their group in ONE pass, in the order they were read (smallest pack first).
        const byGroup = new Map<string, Product[]>();
        for (const p of products) {
          const list = byGroup.get(p.group_id);
          if (list) list.push(p);
          else byGroup.set(p.group_id, [p]);
        }
        return groups.map((group) => ({ group, sizes: byGroup.get(group.id) ?? [] }));
      },
      // One count and one sum per table (version goes up on every insert, update and soft delete): cheap to read, and it
      // does not move when stock does, so a sale does not make the catalogue cache rebuild.
      catalogueSignature: () => {
        const r = one<{ pc: number; pv: number; gc: number; gv: number }>(
          'product groups',
          `SELECT (SELECT COUNT(*) FROM products) AS pc, (SELECT COALESCE(SUM(version), 0) FROM products) AS pv,
                  (SELECT COUNT(*) FROM product_groups) AS gc, (SELECT COALESCE(SUM(version), 0) FROM product_groups) AS gv`,
        )!;
        return `${r.pc}:${r.pv}:${r.gc}:${r.gv}`;
      },
      changeToken: () => {
        needTx('product groups');
        return (stmt('SELECT total_changes() AS t').get() as { t: number }).t;
      },
      sizeStatuses: (today) => {
        needTx('product groups');
        // ONE pass. Per batch: its stock. Then per size: totals, expired stock, soonest expiry, counts. The batch that sells first
        // (earliest unexpired batch with stock, ties by id) is the smallest "expiry|id|cost" text, so its cost rides along.
        const rows = stmt(
          `WITH bs AS (
             SELECT b.id AS id, b.product_id AS product_id, b.expiry_date AS expiry_date, b.cost_price AS cost_price, COALESCE(SUM(m.qty_delta), 0) AS stock
               FROM batches b LEFT JOIN stock_movements m ON m.batch_id = b.id
              WHERE b.deleted_at IS NULL
              GROUP BY b.id)
           SELECT product_id,
                  SUM(stock) AS stock_total,
                  SUM(CASE WHEN expiry_date >= @today THEN stock ELSE 0 END) AS stock_sellable,
                  SUM(CASE WHEN expiry_date < @today THEN stock ELSE 0 END) AS expired_stock,
                  MIN(CASE WHEN stock > 0 THEN expiry_date END) AS next_expiry,
                  MIN(CASE WHEN stock > 0 AND expiry_date >= @today THEN expiry_date END) AS next_sellable_expiry,
                  COUNT(*) AS batch_count,
                  SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS stocked_batch_count,
                  MIN(CASE WHEN stock > 0 AND expiry_date >= @today THEN expiry_date || '|' || id || '|' || cost_price END) AS first_batch
             FROM bs
            GROUP BY product_id`,
        ).all({ today }) as (Omit<SizeStatus, 'next_cost'> & { product_id: string; first_batch: string | null })[];
        return new Map(
          rows.map(({ product_id, first_batch, ...rest }) => [product_id, { ...rest, next_cost: first_batch === null ? null : Number(first_batch.slice(first_batch.lastIndexOf('|') + 1)) }]),
        );
      },
      stockOfSizes: (productIds, today) => {
        needTx('product groups');
        const result = new Map<string, { stock_total: number; stock_sellable: number }>(productIds.map((id) => [id, { stock_total: 0, stock_sellable: 0 }]));
        const CHUNK = 500; // SQLite's limit on bound parameters is far higher; this keeps each statement small
        for (let i = 0; i < productIds.length; i += CHUNK) {
          const ids = productIds.slice(i, i + CHUNK);
          const rows = stmt(
            `SELECT b.product_id AS product_id, SUM(m.qty_delta) AS total, SUM(CASE WHEN b.expiry_date >= ? THEN m.qty_delta ELSE 0 END) AS sellable
               FROM batches b JOIN stock_movements m ON m.batch_id = b.id
              WHERE b.deleted_at IS NULL AND b.product_id IN (${ids.map(() => '?').join(', ')})
              GROUP BY b.product_id`,
          ).all(today, ...ids) as { product_id: string; total: number; sellable: number }[];
          for (const r of rows) result.set(r.product_id, { stock_total: r.total, stock_sellable: r.sellable });
        }
        return result;
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
      list: () => all<Customer>('customers', 'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id'),
      insert: (row) => insert('customers', row),
      update: (id, patch) => update('customers', id, patch),
    },

    suppliers: {
      getById: (id) => one<Supplier>('suppliers', 'SELECT * FROM suppliers WHERE id = ?', id),
      list: () => all<Supplier>('suppliers', 'SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY COALESCE(name_en, name_ur), id'),
      insert: (row) => insert('suppliers', row),
    },

    users: {
      getById: (id) => one<PublicUser>('users', `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, id),
    },

    invoices: {
      getById: (id) => one<Invoice>('invoices', 'SELECT * FROM invoices WHERE id = ?', id),
      getByRequestId: (requestId) => one<Invoice>('invoices', 'SELECT * FROM invoices WHERE request_id = ?', requestId),
      listItems: (invoiceId) => all<InvoiceItem>('invoices', 'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid', invoiceId),
      insert: (row) => insert('invoices', row),
      insertItem: (row) => insert('invoice_items', row),
      markVoided: (id, reason, voidedBy) => {
        needTx('void invoice');
        const changed = stmt("UPDATE invoices SET status = 'voided', void_reason = ?, voided_by = ? WHERE id = ? AND status = 'active'").run(reason, voidedBy, id).changes;
        if (changed !== 1) throw new Error('void: no active invoice ' + id);
      },
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
      khataCreditedSoFar: (invoiceId) =>
        sum('sales returns', 'SELECT COALESCE(SUM(khata_amount), 0) AS total FROM sales_returns WHERE invoice_id = ? AND deleted_at IS NULL', invoiceId),
      hasReturns: (invoiceId) =>
        sum('sales returns', 'SELECT COUNT(*) AS total FROM sales_returns WHERE invoice_id = ? AND deleted_at IS NULL', invoiceId) > 0,
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
        all<LedgerEntry>('ledger', 'SELECT * FROM ledger_entries WHERE party_type = ? AND party_id = ? ORDER BY entry_date, ' + LEDGER_ORDER, type, id),
      insert: (row) => insert('ledger_entries', row),
      balancesByParty: (type) => {
        const rows = all<{ party_id: string; total: number }>(
          'ledger',
          'SELECT party_id AS party_id, SUM(amount_delta) AS total FROM ledger_entries WHERE party_type = ? GROUP BY party_id',
          type,
        );
        return new Map(rows.map((r) => [r.party_id, r.total]));
      },
      // One row per ledger row: the joins can only add a column, never a row (each ref is one id of a primary key), and every join also
      // checks ref_type so an id from another table can never match. party_type = 'customer' is part of the WHERE: a supplier's rows never show.
      customerStatementRows: (customerId) => {
        const rows = all<{
          id: string; party_type: LedgerEntry['party_type']; party_id: string; entry_type: LedgerEntry['entry_type']; amount_delta: number; ref_type: string | null; ref_id: string | null;
          entry_date: string; created_by: string | null; shop_id: string; branch_id: string; device_id: string; created_at: string; version: number; seq: number | null;
          invoice_no: string | null; return_no: string | null; payment_method: string | null; reference_no: string | null; receipt_no: string | null; note: string | null;
        }>(
          'ledger',
          `SELECT l.id AS id, l.party_type AS party_type, l.party_id AS party_id, l.entry_type AS entry_type, l.amount_delta AS amount_delta,
                  l.ref_type AS ref_type, l.ref_id AS ref_id, l.entry_date AS entry_date, l.created_by AS created_by,
                  l.shop_id AS shop_id, l.branch_id AS branch_id, l.device_id AS device_id, l.created_at AS created_at, l.version AS version, l.seq AS seq,
                  i.invoice_no AS invoice_no, r.return_no AS return_no,
                  p.method AS payment_method, p.reference_no AS reference_no, p.receipt_no AS receipt_no, p.note AS note
             FROM ledger_entries l
             LEFT JOIN invoices i ON l.ref_type = 'invoice' AND i.id = l.ref_id
             LEFT JOIN sales_returns r ON l.ref_type = 'return' AND r.id = l.ref_id
             LEFT JOIN payments p ON l.ref_type = 'payment' AND p.id = l.ref_id
            WHERE l.party_type = 'customer' AND l.party_id = ?
            ORDER BY l.entry_date, ${LEDGER_ORDER_L}`,
          customerId,
        );
        return rows.map(({ invoice_no, return_no, payment_method, reference_no, receipt_no, note, ...entry }): LedgerDisplayRow => ({ entry, invoice_no, return_no, payment_method, reference_no, receipt_no, note }));
      },
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
