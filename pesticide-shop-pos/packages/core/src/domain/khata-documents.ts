// What a printed customer statement and a printed payment receipt are made from (Phase 6 M6). Plain data only.
//
// RULE: no cost, margin or profit lives in these types. Every figure on a statement is a figure `khata.statement` returned (the document does no
// arithmetic of its own): the balance after each line, the totals, the brought-forward line and the closing balance all come from the shell.

import type { DocumentPaymentMethod, DocumentShop } from './documents.js';
import type { StatementLabel } from './statement.js';

/** The 80 mm slip ('receipt') or the A4 page ('invoice'): the same words as the invoice documents use, so the print buttons share code. */
export type StatementPaper = 'receipt' | 'invoice';

export interface StatementDocumentLine {
  kind: 'brought_forward' | 'entry';
  label: StatementLabel;
  /** UTC ISO moment of the ledger row. null on the brought-forward line. */
  date: string | null;
  /** Plus: the customer owes more. Minus: owes less. (On the brought-forward line, the balance brought forward.) */
  amount_delta: number;
  /** Balance after this line, from the shell. */
  running_balance: number;
  invoice_no: string | null;
  return_no: string | null;
  payment_method: DocumentPaymentMethod | null;
  reference_no: string | null;
  receipt_no: string | null;
  note: string | null;
}

export interface StatementDocumentCustomer {
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  phone: string | null;
}

export interface StatementDocumentData {
  kind: StatementPaper;
  shop: DocumentShop;
  customer: StatementDocumentCustomer;
  /** `YYYY-MM-DD` or null (no range start). */
  from: string | null;
  to: string | null;
  lines: StatementDocumentLine[];
  /** Balance before `from` (0 when there is no `from`). */
  brought_forward: number;
  totals: { owes_more: number; owes_less: number };
  /** The shell's closing balance: plus means he owes, minus means an advance, 0 is clear. */
  closing_balance: number;
  /** The customer's credit limit in paisa; null (or 0) means no limit: the line is left out. */
  credit_limit: number | null;
  /** How many times an identical statement (same customer, paper, range and closing balance) was printed already. */
  copies_printed: number;
  is_copy: boolean;
  time_zone: string;
}

export interface PaymentReceiptData {
  shop: DocumentShop;
  customer: StatementDocumentCustomer;
  payment: {
    id: string;
    /** null for a payment made before receipt numbers existed (migration 007). */
    receipt_no: string | null;
    /** UTC ISO moment. */
    paid_at: string;
    method: DocumentPaymentMethod;
    reference_no: string | null;
    note: string | null;
    amount: number;
  };
  /**
   * The customer's balance right after THIS payment: the ledger up to and including the payment's own row (by row order). Later sales and
   * payments have later rows and never change it. Plus: owes. Minus: an advance. LIMIT: `rowid` order, like `balanceAsOfSale`: a ledger
   * with rows from another device needs a stable sequence column first (docs/decisions.md).
   */
  balance_after: number;
  copies_printed: number;
  is_copy: boolean;
  time_zone: string;
}
