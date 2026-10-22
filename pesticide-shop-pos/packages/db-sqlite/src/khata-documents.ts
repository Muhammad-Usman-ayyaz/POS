import type { DocumentPaymentMethod, DocumentShop, PaymentReceiptData, Statement, StatementDocumentData, StatementDocumentLine, StatementPaper } from '@pos/core';
import type { Db } from './connection.js';
import { LEDGER_POSITION_SQL, LEDGER_UPTO, positionArgs, type LedgerPosition } from './ledger-order.js';
import { DEFAULT_TIME_ZONE, getPrintConfig, readSetting, TIME_ZONE_KEY } from './documents.js';

// Data for the printed customer statement and the printed payment receipt (Phase 6 M6). Every query NAMES its columns: nothing here can read a
// cost. The statement's figures are copied from `khata.statement` (closing balance, totals, running balances, brought forward): no arithmetic.

/** One audit row per printed or saved statement. Table `customers`, row = the customer. Counting these (same paper, range and closing balance) is how a reprint knows it is a COPY. */
export const STATEMENT_AUDIT_ACTION = 'statement_printed';
/** One audit row per printed or saved payment receipt. Table `payments`, row = the payment. */
export const PAYMENT_RECEIPT_AUDIT_ACTION = 'payment_receipt_printed';

const shopBlock = (db: Db): DocumentShop => {
  const config = getPrintConfig(db);
  return { name: config.shop_name, name_ur: config.shop_name_ur, address: config.shop_address, phone: config.shop_phone, footer: config.receipt_footer || null };
};

const timeZone = (db: Db): string => readSetting(db, TIME_ZONE_KEY) ?? DEFAULT_TIME_ZONE;

/**
 * How many times an IDENTICAL statement was printed before: same customer, same paper (80 mm and A4 are separate kinds), same range, and the same
 * closing balance. A statement that differs (a new sale since, another range) is a new document, not a copy; printing the same month twice is.
 */
export function statementCopies(db: Db, customerId: string, kind: StatementPaper, from: string | null, to: string | null, closingBalance: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log
          WHERE action = '${STATEMENT_AUDIT_ACTION}' AND table_name = 'customers' AND row_id = ?
            AND json_extract(details, '$.kind') = ?
            AND json_extract(details, '$.from') IS ?
            AND json_extract(details, '$.to') IS ?
            AND json_extract(details, '$.closing_balance') = ?`,
      )
      .get(customerId, kind, from, to, closingBalance) as { n: number }
  ).n;
}

/** The statement the shell made, as a printable document. `statement` is `khata.statement`'s reply; nothing in it is recomputed. */
export function statementDocumentData(db: Db, statement: Statement, kind: StatementPaper): StatementDocumentData {
  const lines: StatementDocumentLine[] = statement.lines.map((l) => ({
    kind: l.kind,
    label: l.label,
    date: l.entry ? l.entry.entry_date : null,
    amount_delta: l.amount_delta,
    running_balance: l.running_balance,
    invoice_no: l.invoice_no,
    return_no: l.return_no,
    payment_method: (l.payment_method as DocumentPaymentMethod | null) ?? null,
    reference_no: l.reference_no,
    receipt_no: l.receipt_no,
    note: l.note,
  }));
  const limit = (db.prepare('SELECT credit_limit FROM customers WHERE id = ?').get(statement.customer.id) as { credit_limit: number } | undefined)?.credit_limit ?? null;
  const copies = statementCopies(db, statement.customer.id, kind, statement.from, statement.to, statement.closing_balance);
  return {
    kind,
    shop: shopBlock(db),
    customer: { name_en: statement.customer.name_en, name_ur: statement.customer.name_ur, village: statement.customer.village, phone: statement.customer.phone },
    from: statement.from,
    to: statement.to,
    lines,
    brought_forward: statement.brought_forward,
    totals: { owes_more: statement.totals.owes_more, owes_less: statement.totals.owes_less },
    closing_balance: statement.closing_balance,
    credit_limit: limit,
    copies_printed: copies,
    is_copy: copies > 0,
    time_zone: timeZone(db),
  };
}

/** How many times this payment's receipt was printed (or saved as PDF) before. */
export function paymentReceiptCopies(db: Db, paymentId: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = '${PAYMENT_RECEIPT_AUDIT_ACTION}' AND table_name = 'payments' AND row_id = ?`).get(paymentId) as { n: number }).n;
}

interface PaymentRow {
  id: string;
  party_id: string;
  receipt_no: string | null;
  paid_at: string;
  created_at: string;
  method: DocumentPaymentMethod;
  reference_no: string | null;
  note: string | null;
  amount: number;
}

/**
 * The customer's balance right after this payment: every ledger row of the customer up to and including the payment's own row, in the stable
 * ledger order (`ledger-order.ts`, migration 008: seq, old rows first by rowid; the same rule `balanceAsOfSale` uses). A sale or payment made later
 * has a later position and never changes it.
 */
export function balanceAfterPayment(db: Db, customerId: string, paymentId: string, createdAt: string): number {
  const entry = db.prepare(`${LEDGER_POSITION_SQL} WHERE party_type = 'customer' AND party_id = ? AND ref_type = 'payment' AND ref_id = ?`).get(customerId, paymentId) as LedgerPosition | undefined;
  const sum = entry
    ? db.prepare(`SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND ${LEDGER_UPTO}`).get(customerId, ...positionArgs(entry))
    : db.prepare("SELECT COALESCE(SUM(amount_delta), 0) AS s FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND created_at <= ?").get(customerId, createdAt);
  return (sum as { s: number }).s;
}

/** Everything one payment receipt needs. undefined when there is no such customer payment (a supplier payment is not one). */
export function paymentReceiptData(db: Db, paymentId: string): PaymentReceiptData | undefined {
  const p = db
    .prepare(
      `SELECT id, party_id, receipt_no, paid_at, created_at, method, reference_no, note, amount
         FROM payments WHERE id = ? AND party_type = 'customer' AND direction = 'in'`,
    )
    .get(paymentId) as PaymentRow | undefined;
  if (!p) return undefined;
  // A soft-deleted customer is gone everywhere (like the statement, which uses the same live-customer rule): no receipt for their payments either.
  const c = db.prepare('SELECT name_en, name_ur, village, phone FROM customers WHERE id = ? AND deleted_at IS NULL').get(p.party_id) as { name_en: string | null; name_ur: string | null; village: string | null; phone: string | null } | undefined;
  if (!c) return undefined;
  const copies = paymentReceiptCopies(db, paymentId);
  return {
    shop: shopBlock(db),
    customer: c,
    payment: { id: p.id, receipt_no: p.receipt_no, paid_at: p.paid_at, method: p.method, reference_no: p.reference_no, note: p.note, amount: p.amount },
    balance_after: balanceAfterPayment(db, p.party_id, p.id, p.created_at),
    copies_printed: copies,
    is_copy: copies > 0,
    time_zone: timeZone(db),
  };
}
