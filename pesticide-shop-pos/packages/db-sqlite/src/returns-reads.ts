import type {
  DocumentCustomer,
  DocumentPaymentMethod,
  DocumentShop,
  InvoiceForReturn,
  ReturnableLine,
  ReturnDetail,
  ReturnDetailLine,
  ReturnDocumentData,
  ReturnList,
  ReturnListFilter,
  ReturnListRow,
  ReturnSlipKind,
} from '@pos/core';
import type { Db } from './connection.js';
import { DEFAULT_TIME_ZONE, getPrintConfig, readSetting, TIME_ZONE_KEY } from './documents.js';
import { LEDGER_POSITION_SQL, LEDGER_UPTO, positionArgs, type LedgerPosition } from './ledger-order.js';

// Reads for the Returns screens and the return slip (credit note). Every query NAMES its columns: `invoice_items.cost_price` and `batches.cost_price`
// are never selected here, so no cost can reach a staff screen or a printed slip. (The deep-scan test in apps/desktop checks the replies too.)

/** One audit row per printed or saved return slip. Table `sales_returns`, row = the return. Counting these (per kind) is how a reprint knows it is a COPY. */
export const RETURN_SLIP_AUDIT_ACTION = 'return_slip_printed';
export const REFUND_PAID_KEY = 'returns.refund_paid_part_to_khata';

const RETURN_COLUMNS = `r.id AS id, r.return_no AS return_no, r.invoice_id AS invoice_id, i.invoice_no AS invoice_no, r.return_date AS return_date, r.created_at AS created_at,
       c.name_en AS customer_name_en, c.name_ur AS customer_name_ur, r.total AS total,
       COALESCE((SELECT SUM(sri.tax_refund) FROM sales_return_items sri WHERE sri.sales_return_id = r.id), 0) AS tax_total,
       r.cash_amount AS cash_amount, r.khata_amount AS khata_amount,
       (SELECT COUNT(*) FROM sales_return_items sri WHERE sri.sales_return_id = r.id) AS line_count,
       ru.name AS requested_by, au.name AS approved_by,
       (SELECT COUNT(*) FROM audit_log a WHERE a.action = '${RETURN_SLIP_AUDIT_ACTION}' AND a.table_name = 'sales_returns' AND a.row_id = r.id) AS print_count`;
const RETURN_JOINS = `FROM sales_returns r
         JOIN invoices i ON i.id = r.invoice_id
         JOIN users au ON au.id = r.approved_by
         LEFT JOIN users ru ON ru.id = r.requested_by
         LEFT JOIN customers c ON c.id = i.customer_id`;

/** Past returns, newest first. Search matches the return number, the invoice number, the customer's English or Urdu name, and phone. */
export function listReturns(db: Db, filter: ReturnListFilter = {}): ReturnList {
  const where: string[] = ['r.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const query = filter.query?.trim();
  if (query) {
    where.push(
      `(instr(lower(r.return_no), lower(?)) > 0 OR instr(lower(i.invoice_no), lower(?)) > 0 OR instr(lower(COALESCE(c.name_en, '')), lower(?)) > 0 OR instr(COALESCE(c.name_ur, ''), ?) > 0 OR instr(COALESCE(c.phone, ''), ?) > 0)`,
    );
    params.push(query, query, query, query, query);
  }
  if (filter.invoice_id) (where.push('r.invoice_id = ?'), params.push(filter.invoice_id));
  if (filter.from) (where.push('r.return_date >= ?'), params.push(filter.from));
  if (filter.to) (where.push('r.return_date <= ?'), params.push(filter.to));
  const clause = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS n ${RETURN_JOINS} WHERE ${clause}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT ${RETURN_COLUMNS} ${RETURN_JOINS} WHERE ${clause} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(filter.limit ?? 50, 200), filter.offset ?? 0) as ReturnListRow[];
  return { rows, total };
}

interface LineRow {
  invoice_item_id: string;
  name_en: string | null;
  name_ur: string | null;
  batch_no: string;
  base_unit: ReturnableLine['base_unit'];
  pack_size: number;
  allow_loose: number;
  qty: number;
  qty_returned: number;
  unit_price: number;
  line_discount: number;
  tax_amount: number;
  line_total: number;
  expiry_date: string;
}

/**
 * The sale with what can still be returned on each line. `today` is the shop's calendar day (Asia/Karachi, from the shell's clock): a batch whose
 * expiry date is before it has expired, and its goods cannot go back on the shelf. undefined when there is no such invoice.
 */
export function invoiceForReturn(db: Db, invoiceId: string, today: string): InvoiceForReturn | undefined {
  const inv = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.customer_id, i.invoice_date, i.due_date, i.price_type, i.subtotal, i.tax_total, i.total, i.paid_amount, i.status, i.void_reason,
              i.payment_method, c.name_en AS c_name_en, c.name_ur AS c_name_ur, c.village AS c_village
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ? AND i.deleted_at IS NULL`,
    )
    .get(invoiceId) as
    | {
        id: string; invoice_no: string; customer_id: string | null; invoice_date: string; due_date: string | null; price_type: 'retail' | 'wholesale';
        subtotal: number; tax_total: number; total: number; paid_amount: number; status: 'active' | 'voided'; void_reason: string | null;
        payment_method: DocumentPaymentMethod; c_name_en: string | null; c_name_ur: string | null; c_village: string | null;
      }
    | undefined;
  if (!inv) return undefined;

  const rows = db
    .prepare(
      `SELECT ii.id AS invoice_item_id, ii.name_en, ii.name_ur, b.batch_no, p.base_unit, p.pack_size, p.allow_loose, ii.qty,
              COALESCE((SELECT SUM(sri.qty) FROM sales_return_items sri WHERE sri.invoice_item_id = ii.id), 0) AS qty_returned,
              ii.unit_price, ii.line_discount, ii.tax_amount, ii.line_total, b.expiry_date
         FROM invoice_items ii
         JOIN batches b ON b.id = ii.batch_id
         JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
        ORDER BY ii.rowid`,
    )
    .all(invoiceId) as LineRow[];
  const lines: ReturnableLine[] = rows.map((r, index) => ({
    invoice_item_id: r.invoice_item_id,
    position: index + 1,
    name_en: r.name_en,
    name_ur: r.name_ur,
    batch_no: r.batch_no,
    base_unit: r.base_unit,
    pack_size: r.pack_size,
    whole_packs_only: r.allow_loose === 0,
    qty: r.qty,
    qty_returned: r.qty_returned,
    qty_returnable: r.qty - r.qty_returned,
    unit_price: r.unit_price,
    line_discount: r.line_discount,
    tax_amount: r.tax_amount,
    line_total: r.line_total,
    batch_expired: r.expiry_date < today,
  }));

  const balance =
    inv.customer_id === null
      ? null
      : (db.prepare("SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ?").get(inv.customer_id) as { s: number }).s;
  const customer: DocumentCustomer | null = inv.customer_id ? { name_en: inv.c_name_en, name_ur: inv.c_name_ur, village: inv.c_village } : null;
  const returns = listReturns(db, { invoice_id: invoiceId, limit: 200 }).rows;
  const setting = readSetting(db, REFUND_PAID_KEY);
  return {
    invoice: {
      id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, due_date: inv.due_date, status: inv.status, payment_method: inv.payment_method,
      price_type: inv.price_type, subtotal: inv.subtotal, tax_total: inv.tax_total, total: inv.total, paid_amount: inv.paid_amount, on_khata: inv.total - inv.paid_amount,
      void_reason: inv.void_reason,
    },
    customer,
    customer_id: inv.customer_id,
    lines,
    khata_balance: balance,
    has_returns: returns.length > 0,
    refund_paid_part_to_khata: setting === '1',
    returns,
  };
}

/** One return with its lines as they came back. undefined when there is no such return. */
export function getReturnDetail(db: Db, returnId: string): ReturnDetail | undefined {
  const r = db
    .prepare(
      `SELECT r.id, r.return_no, r.return_date, r.created_at, r.reason AS note, r.total, r.cash_amount, r.khata_amount, r.invoice_id, ru.name AS requested_by, au.name AS approved_by,
              i.invoice_no, i.invoice_date, i.status AS invoice_status, i.total AS invoice_total, i.customer_id,
              c.name_en AS c_name_en, c.name_ur AS c_name_ur, c.village AS c_village
         FROM sales_returns r
         JOIN invoices i ON i.id = r.invoice_id
         JOIN users au ON au.id = r.approved_by
         LEFT JOIN users ru ON ru.id = r.requested_by
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE r.id = ? AND r.deleted_at IS NULL`,
    )
    .get(returnId) as
    | {
        id: string; return_no: string; return_date: string; created_at: string; note: string | null; total: number; cash_amount: number; khata_amount: number; invoice_id: string;
        requested_by: string | null; approved_by: string; invoice_no: string; invoice_date: string; invoice_status: 'active' | 'voided'; invoice_total: number;
        customer_id: string | null; c_name_en: string | null; c_name_ur: string | null; c_village: string | null;
      }
    | undefined;
  if (!r) return undefined;

  const lines = db
    .prepare(
      `SELECT sri.rowid AS position, ii.name_en, ii.name_ur, b.batch_no, p.base_unit, p.pack_size, sri.qty, ii.unit_price,
              sri.refund_amount, sri.tax_refund, sri.condition, sri.reason
         FROM sales_return_items sri
         JOIN invoice_items ii ON ii.id = sri.invoice_item_id
         JOIN batches b ON b.id = ii.batch_id
         JOIN products p ON p.id = ii.product_id
        WHERE sri.sales_return_id = ?
        ORDER BY sri.rowid`,
    )
    .all(returnId) as ReturnDetailLine[];
  lines.forEach((line, index) => (line.position = index + 1));

  let balanceAfter: number | null = null;
  if (r.customer_id !== null) {
    // The customer's balance right after this return's own ledger row (stable ledger order, as for a payment receipt). A return that put nothing on
    // Khata (cash only) has no row of its own: then the balance is not part of the document.
    const entry = db
      .prepare(`${LEDGER_POSITION_SQL} WHERE party_type = 'customer' AND party_id = ? AND ref_type = 'return' AND ref_id = ?`)
      .get(r.customer_id, r.id) as LedgerPosition | undefined;
    if (entry) {
      balanceAfter = (db.prepare(`SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND ${LEDGER_UPTO}`).get(r.customer_id, ...positionArgs(entry)) as { s: number }).s;
    }
  }
  return {
    return: {
      id: r.id, return_no: r.return_no, return_date: r.return_date, created_at: r.created_at, note: r.note, total: r.total,
      tax_total: lines.reduce((n, l) => n + l.tax_refund, 0), cash_amount: r.cash_amount, khata_amount: r.khata_amount, requested_by: r.requested_by, approved_by: r.approved_by,
    },
    invoice: { id: r.invoice_id, invoice_no: r.invoice_no, invoice_date: r.invoice_date, status: r.invoice_status, total: r.invoice_total },
    customer: r.customer_id ? { name_en: r.c_name_en, name_ur: r.c_name_ur, village: r.c_village } : null,
    customer_id: r.customer_id,
    lines,
    balance_after: balanceAfter,
  };
}

/** How many times this kind of slip for this return was printed (or saved as PDF) before. */
export function returnSlipCopies(db: Db, returnId: string, kind: ReturnSlipKind): number {
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = '${RETURN_SLIP_AUDIT_ACTION}' AND table_name = 'sales_returns' AND row_id = ? AND json_extract(details, '$.kind') = ?`)
      .get(returnId, kind) as { n: number }
  ).n;
}

/** Everything one return slip needs. undefined when there is no such return. */
export function returnDocumentData(db: Db, returnId: string, kind: ReturnSlipKind): ReturnDocumentData | undefined {
  const detail = getReturnDetail(db, returnId);
  if (!detail) return undefined;
  const config = getPrintConfig(db);
  const shop: DocumentShop = { name: config.shop_name, name_ur: config.shop_name_ur, address: config.shop_address, phone: config.shop_phone, footer: config.receipt_footer || null };
  const copies = returnSlipCopies(db, returnId, kind);
  return { ...detail, kind, shop, copies_printed: copies, is_copy: copies > 0, time_zone: readSetting(db, TIME_ZONE_KEY) ?? DEFAULT_TIME_ZONE };
}
