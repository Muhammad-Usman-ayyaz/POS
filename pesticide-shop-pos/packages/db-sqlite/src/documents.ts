import { randomUUID } from 'node:crypto';
import type {
  DeviceScope,
  DocumentCustomer,
  DocumentKind,
  DocumentLanguage,
  DocumentLine,
  DocumentPaymentMethod,
  InvoiceDetail,
  InvoiceDocumentData,
  InvoiceList,
  InvoiceListFilter,
  InvoiceListRow,
  PrintConfig,
} from '@pos/core';
import { DEFAULT_SHOP_TIME_ZONE, isTimeZone } from '@pos/core';
import type { Db } from './connection.js';
import { LEDGER_BEFORE, LEDGER_POSITION_SQL, positionArgs, type LedgerPosition } from './ledger-order.js';

// Reads for the invoice history and for receipts, and the print settings. Every query NAMES its columns: `invoice_items.cost_price` is
// never selected here, so no cost can reach a receipt, a history row or a staff screen. (The deep-scan test in apps/desktop checks the replies too.)

/** The audit-log action written for each printed document. Counting these is how a reprint knows it is a COPY. */
export const PRINT_AUDIT_ACTION = 'invoice_printed';

export const DEFAULT_TIME_ZONE = DEFAULT_SHOP_TIME_ZONE;

interface InvoiceRow {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  invoice_date: string;
  due_date: string | null;
  price_type: 'retail' | 'wholesale';
  subtotal: number;
  tax_total: number;
  total: number;
  paid_amount: number;
  status: 'active' | 'voided';
  payment_method: DocumentPaymentMethod;
  sold_by: string;
  c_name_en: string | null;
  c_name_ur: string | null;
  c_village: string | null;
}

/** The invoice history, newest first. Search matches the invoice number, the customer's English or Urdu name, and phone. */
export function listInvoices(db: Db, filter: InvoiceListFilter = {}): InvoiceList {
  const where: string[] = ['i.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const query = filter.query?.trim();
  if (query) {
    where.push(
      `(instr(lower(i.invoice_no), lower(?)) > 0 OR instr(lower(COALESCE(c.name_en, '')), lower(?)) > 0 OR instr(COALESCE(c.name_ur, ''), ?) > 0 OR instr(COALESCE(c.phone, ''), ?) > 0)`,
    );
    params.push(query, query, query, query);
  }
  if (filter.from) (where.push('date(i.invoice_date) >= ?'), params.push(filter.from));
  if (filter.to) (where.push('date(i.invoice_date) <= ?'), params.push(filter.to));
  if (filter.customer_id) (where.push('i.customer_id = ?'), params.push(filter.customer_id));
  if (filter.status) (where.push('i.status = ?'), params.push(filter.status));
  const clause = where.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE ${clause}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.status, c.name_en AS customer_name_en, c.name_ur AS customer_name_ur,
              i.total, i.paid_amount, i.total - i.paid_amount AS on_khata, i.payment_method, u.name AS sold_by,
              (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS line_count,
              (SELECT COUNT(*) FROM audit_log a WHERE a.action = '${PRINT_AUDIT_ACTION}' AND a.table_name = 'invoices' AND a.row_id = i.id) AS print_count
         FROM invoices i
         JOIN users u ON u.id = i.created_by
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE ${clause}
        ORDER BY i.invoice_date DESC, i.rowid DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, Math.min(filter.limit ?? 50, 200), filter.offset ?? 0) as InvoiceListRow[];
  return { rows, total };
}

/** One invoice with its lines as sold. undefined when there is no such invoice. */
export function getInvoiceDetail(db: Db, invoiceId: string): InvoiceDetail | undefined {
  const row = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.customer_id, i.invoice_date, i.due_date, i.price_type, i.subtotal, i.tax_total, i.total, i.paid_amount, i.status,
              i.payment_method, u.name AS sold_by, c.name_en AS c_name_en, c.name_ur AS c_name_ur, c.village AS c_village
         FROM invoices i
         JOIN users u ON u.id = i.created_by
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ? AND i.deleted_at IS NULL`,
    )
    .get(invoiceId) as InvoiceRow | undefined;
  if (!row) return undefined;

  // Names are the ones saved at the time of sale (invoice_items.name_en / name_ur), never the product's current name. No cost column is read.
  const lines = db
    .prepare(
      `SELECT ii.rowid AS position, ii.name_en, ii.name_ur, b.batch_no, ii.qty, p.base_unit, p.pack_size,
              ii.unit_price, ii.line_discount, ii.tax_rate_bp, ii.tax_amount, ii.line_total
         FROM invoice_items ii
         JOIN batches b ON b.id = ii.batch_id
         JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
        ORDER BY ii.rowid`,
    )
    .all(invoiceId) as DocumentLine[];
  lines.forEach((line, index) => (line.position = index + 1));

  const customer: DocumentCustomer | null = row.customer_id ? { name_en: row.c_name_en, name_ur: row.c_name_ur, village: row.c_village } : null;
  return {
    invoice: {
      id: row.id,
      invoice_no: row.invoice_no,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      status: row.status,
      payment_method: row.payment_method,
      price_type: row.price_type,
      subtotal: row.subtotal,
      tax_total: row.tax_total,
      total: row.total,
      paid_amount: row.paid_amount,
      on_khata: row.total - row.paid_amount,
    },
    customer,
    customer_id: row.customer_id,
    lines,
    sold_by: row.sold_by,
  };
}

/**
 * The customer's balance right after this sale: everything in the ledger BEFORE this invoice's own entry, plus what this sale added (total - paid).
 * Later payments, returns and sales have later rows and do not change it. Ledger rows are append-only, and their order is the stable sequence (`ledger-order.ts`: seq, with pre-008 rows first in rowid order), never rowid alone.
 */
export function balanceAsOfSale(db: Db, invoiceId: string): number | null {
  const inv = db.prepare('SELECT customer_id, total, paid_amount, created_at FROM invoices WHERE id = ?').get(invoiceId) as
    | { customer_id: string | null; total: number; paid_amount: number; created_at: string }
    | undefined;
  if (!inv || inv.customer_id === null) return null;
  const entry = db
    .prepare(`${LEDGER_POSITION_SQL} WHERE party_type = 'customer' AND party_id = ? AND ref_type = 'invoice' AND ref_id = ?`)
    .get(inv.customer_id, invoiceId) as LedgerPosition | undefined;
  const before = entry
    ? (db.prepare(`SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND ${LEDGER_BEFORE}`).get(inv.customer_id, ...positionArgs(entry)) as { s: number }).s
    : (db.prepare("SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND created_at < ?").get(inv.customer_id, inv.created_at) as { s: number }).s;
  return before + inv.total - inv.paid_amount;
}

/** How many times this kind of document for this invoice has been printed (or saved as PDF) before. */
export function copiesPrinted(db: Db, invoiceId: string, kind: DocumentKind): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log
          WHERE action = '${PRINT_AUDIT_ACTION}' AND table_name = 'invoices' AND row_id = ? AND json_extract(details, '$.kind') = ?`,
      )
      .get(invoiceId, kind) as { n: number }
  ).n;
}

const SETTING_KEYS = {
  print_format: 'print.format',
  receipt_footer: 'print.receipt_footer',
  printer_name: 'print.printer',
  receipt_language: 'print.receipt_language',
  invoice_language: 'print.invoice_language',
  shop_name_ur: 'shop.name_ur',
  shop_address: 'shop.address',
  shop_phone: 'shop.phone',
} as const satisfies Record<Exclude<keyof PrintConfig, 'shop_name'>, string>;
export const TIME_ZONE_KEY = 'shop.time_zone';

/** The shop's time zone for statements and documents: the setting `shop.time_zone`, else Asia/Karachi. */
export const shopTimeZone = (db: Db): string => {
  const set = readSetting(db, TIME_ZONE_KEY);
  return set !== null && isTimeZone(set) ? set : DEFAULT_TIME_ZONE; // a mistyped setting must not break statements
};

export function readSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE "key" = ? AND deleted_at IS NULL').get(key) as { value: string | null } | undefined;
  const value = row?.value?.trim();
  return value ? value : null;
}

function writeSetting(db: Db, scope: DeviceScope, key: string, value: string | null): void {
  const existing = db.prepare('SELECT id, deleted_at FROM settings WHERE "key" = ?').get(key) as { id: string; deleted_at: string | null } | undefined;
  if (existing) {
    // Nothing soft-deletes a setting. If one ever is, bringing it back is a decision for the code that deleted it, not a side effect of saving.
    if (existing.deleted_at !== null) throw new Error(`setting ${key} is deleted and cannot be changed here`);
    db.prepare('UPDATE settings SET value = ? WHERE id = ?').run(value ?? '', existing.id);
  } else if (value !== null) {
    db.prepare('INSERT INTO settings (id, "key", value, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), key, value, scope.shop_id, scope.branch_id, scope.device_id);
  }
}

const asLanguage = (value: string | null, fallback: DocumentLanguage): DocumentLanguage => (value === 'en' || value === 'ur' ? value : fallback);

/** The shop's English name: the `shops` row that first-launch setup made (the same name the sidebar shows). */
function readShopName(db: Db): string {
  const row = db.prepare('SELECT name FROM shops WHERE deleted_at IS NULL ORDER BY created_at, rowid LIMIT 1').get() as { name: string } | undefined;
  return row?.name ?? '';
}

/** The print settings. Receipts and invoices are in English until the owner chooses; address and phone stay null (a marked placeholder) until given. */
export function getPrintConfig(db: Db): PrintConfig {
  return {
    shop_name: readShopName(db),
    print_format: readSetting(db, SETTING_KEYS.print_format) === 'a4' ? 'a4' : '80mm',
    receipt_footer: readSetting(db, SETTING_KEYS.receipt_footer) ?? '',
    printer_name: readSetting(db, SETTING_KEYS.printer_name),
    receipt_language: asLanguage(readSetting(db, SETTING_KEYS.receipt_language), 'en'),
    invoice_language: asLanguage(readSetting(db, SETTING_KEYS.invoice_language), 'en'),
    shop_name_ur: readSetting(db, SETTING_KEYS.shop_name_ur),
    shop_address: readSetting(db, SETTING_KEYS.shop_address),
    shop_phone: readSetting(db, SETTING_KEYS.shop_phone),
  };
}

/** One setting that really changed in a save, with the value before and after (null: not set). */
export interface PrintConfigChange {
  field: keyof PrintConfig;
  from: string | null;
  to: string | null;
}

const asValue = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Changes only the fields given AND different from what is saved: a field sent with its current value is not written and not audited.
 * null (or an empty text) clears a field (the shop name cannot be cleared). Returns the settings as they are now.
 * `audit` runs inside the same transaction, after the settings are written, with the fields that changed: if it throws, the settings roll back too.
 * It is not called at all when nothing changed.
 */
export function setPrintConfig(db: Db, scope: DeviceScope, changes: Partial<PrintConfig>, audit?: (changed: PrintConfigChange[]) => void): PrintConfig {
  db.transaction(() => {
    const before = getPrintConfig(db);
    const changed: PrintConfigChange[] = [];
    for (const key of Object.keys(changes) as (keyof PrintConfig)[]) {
      const value = asValue(changes[key]);
      const current = asValue(before[key]);
      if (value === current) continue;
      if (key === 'shop_name') {
        if (value === null) throw new Error('the shop name cannot be empty');
        db.prepare('UPDATE shops SET name = ? WHERE id = ?').run(value, scope.shop_id);
      } else {
        writeSetting(db, scope, SETTING_KEYS[key], value);
      }
      changed.push({ field: key, from: current, to: value });
    }
    if (changed.length > 0) audit?.(changed);
  }).immediate();
  return getPrintConfig(db);
}

/** Everything one printed document needs. undefined when there is no such invoice. */
export function invoiceDocumentData(db: Db, invoiceId: string, kind: DocumentKind): InvoiceDocumentData | undefined {
  const detail = getInvoiceDetail(db, invoiceId);
  if (!detail) return undefined;
  const config = getPrintConfig(db);
  const copies = copiesPrinted(db, invoiceId, kind);
  return {
    ...detail,
    kind,
    shop: { name: config.shop_name, name_ur: config.shop_name_ur, address: config.shop_address, phone: config.shop_phone, footer: config.receipt_footer || null },
    balance_as_of_sale: balanceAsOfSale(db, invoiceId),
    copies_printed: copies,
    is_copy: copies > 0,
    time_zone: readSetting(db, TIME_ZONE_KEY) ?? DEFAULT_TIME_ZONE,
  };
}
