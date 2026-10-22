// What the return screens and the return slip (credit note) are made from. Plain data only.
//
// RULE (same as documents.ts): no cost, margin or profit lives in any of these types. The queries in packages/db-sqlite/src/returns-reads.ts
// name their columns and never select `invoice_items.cost_price` or `batches.cost_price`; the deep-scan test in apps/desktop fails if one appears.

import type { DocumentCustomer, DocumentInvoiceHeader, DocumentShop } from './documents.js';
import type { BaseUnitCode } from '../units.js';

export type ReturnConditionCode = 'resellable' | 'damaged' | 'expired';
export type ReturnSlipKind = 'receipt' | 'invoice';

/** One line of the sale as a return sees it: what was sold, what already came back, what can still come back. Quantities are base units (g, ml, piece). */
export interface ReturnableLine {
  invoice_item_id: string;
  position: number;
  /** The name as sold. */
  name_en: string | null;
  name_ur: string | null;
  batch_no: string;
  base_unit: BaseUnitCode;
  pack_size: number;
  /** A sealed size: it can come back in whole packs only. */
  whole_packs_only: boolean;
  qty: number;
  qty_returned: number;
  qty_returnable: number;
  /** Paisa per pack as sold (tax included), before the line discount. */
  unit_price: number;
  line_discount: number;
  tax_amount: number;
  /** What the customer paid for the line (after the discount, tax included). */
  line_total: number;
  /** The batch this line was sold from has passed its expiry date today (on the shop's calendar): the goods cannot go back on the shelf. */
  batch_expired: boolean;
}

export interface ReturnListRow {
  id: string;
  return_no: string;
  invoice_id: string;
  invoice_no: string;
  /** `YYYY-MM-DD` */
  return_date: string;
  /** UTC ISO date-time. */
  created_at: string;
  customer_name_en: string | null;
  customer_name_ur: string | null;
  total: number;
  tax_total: number;
  cash_amount: number;
  khata_amount: number;
  line_count: number;
  requested_by: string | null;
  approved_by: string;
  /** Times the slip was printed or saved. */
  print_count: number;
}

export interface ReturnList {
  rows: ReturnListRow[];
  total: number;
}

export interface ReturnListFilter {
  /** Return number, invoice number, or part of the customer's name (English or Urdu) or phone. */
  query?: string | undefined;
  invoice_id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/** The sale, ready for a return: its lines with what can still come back, and the facts the screen shows around them. */
export interface InvoiceForReturn {
  invoice: DocumentInvoiceHeader & { void_reason: string | null };
  customer: DocumentCustomer | null;
  customer_id: string | null;
  lines: ReturnableLine[];
  /** Today's Khata balance of the customer (plus: owes). null for a walk-in sale. */
  khata_balance: number | null;
  /** Any return has been made against this invoice: it can no longer be voided. */
  has_returns: boolean;
  /** The owner's Q8 setting: what the customer paid is credited to their Khata instead of cash. */
  refund_paid_part_to_khata: boolean;
  returns: ReturnListRow[];
}

export interface ReturnDetailLine {
  position: number;
  name_en: string | null;
  name_ur: string | null;
  batch_no: string;
  base_unit: BaseUnitCode;
  pack_size: number;
  /** Base units that came back. */
  qty: number;
  /** Paisa per pack as sold. */
  unit_price: number;
  refund_amount: number;
  tax_refund: number;
  condition: ReturnConditionCode;
  reason: string | null;
}

export interface ReturnDetail {
  return: {
    id: string;
    return_no: string;
    return_date: string;
    created_at: string;
    note: string | null;
    total: number;
    tax_total: number;
    cash_amount: number;
    khata_amount: number;
    requested_by: string | null;
    approved_by: string;
  };
  invoice: { id: string; invoice_no: string; invoice_date: string; status: 'active' | 'voided'; total: number };
  customer: DocumentCustomer | null;
  customer_id: string | null;
  lines: ReturnDetailLine[];
  /** The customer's Khata balance right after this return (what the credit note says "owes now"). null for a walk-in sale or a cash-only return. */
  balance_after: number | null;
}

/** What is printed on a return slip. */
export interface ReturnDocumentData extends ReturnDetail {
  /** '80mm' slip or A4 credit note. */
  kind: ReturnSlipKind;
  shop: DocumentShop;
  copies_printed: number;
  is_copy: boolean;
  time_zone: string;
}
