// What a printed receipt or invoice is made from, and what the invoice history shows. Plain data only.
//
// RULE: no cost, margin or profit lives in any of these types. `invoice_items.cost_price` is never selected for them (the queries in
// packages/db-sqlite/src/documents.ts name their columns), and the deep-scan test in apps/desktop/tests fails if one ever appears.

export type DocumentKind = 'receipt' | 'invoice';
export type DocumentLanguage = 'en' | 'ur';
export type DocumentUnit = 'ml' | 'g' | 'piece';

/** One invoice line as it was SOLD: the name at sale time (`invoice_items.name_en/name_ur`, group name plus pack label), not today's product name. */
export interface DocumentLine {
  position: number;
  name_en: string | null;
  name_ur: string | null;
  batch_no: string;
  /** Base units (ml, g or piece). */
  qty: number;
  base_unit: DocumentUnit;
  /** Base units in one pack: tells a whole-pack line (qty is a multiple) from a loose one. */
  pack_size: number;
  /** Paisa per pack, tax included. */
  unit_price: number;
  line_discount: number;
  tax_rate_bp: number;
  /** The tax inside `line_total`. */
  tax_amount: number;
  /** After the discount, tax included. */
  line_total: number;
}

export interface DocumentCustomer {
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
}

export interface DocumentShop {
  /** The real name of the shop. */
  name: string;
  /** Optional Urdu spelling of the name (setting `shop.name_ur`). Without it the Urdu document shows `name`. */
  name_ur: string | null;
  /** null: the owner has not given it yet, so the document shows a clearly marked placeholder. Never invented. */
  address: string | null;
  phone: string | null;
  /** The owner's footer text (setting `print.receipt_footer`). Left out or empty: the standard thank-you line is printed. */
  footer?: string | null;
}

export type DocumentPaymentMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash';

export interface DocumentInvoiceHeader {
  id: string;
  invoice_no: string;
  /** UTC ISO date-time. */
  invoice_date: string;
  /** `YYYY-MM-DD` */
  due_date: string | null;
  status: 'active' | 'voided';
  payment_method: DocumentPaymentMethod;
  price_type: 'retail' | 'wholesale';
  /** Total without tax. */
  subtotal: number;
  tax_total: number;
  total: number;
  paid_amount: number;
  /** total - paid_amount: what went on the customer's Khata with this sale. */
  on_khata: number;
}

/** The whole sale, everything a document or a history screen needs. */
export interface InvoiceDetail {
  invoice: DocumentInvoiceHeader;
  customer: DocumentCustomer | null;
  customer_id: string | null;
  lines: DocumentLine[];
  /** The name of the user who made the sale. */
  sold_by: string;
}

/**
 * What is printed. `balance_as_of_sale` is the customer's balance right after THIS sale (everything in the ledger up to this invoice and its payment),
 * not today's: a payment made later does not change an old receipt. null for a walk-in sale.
 */
export interface InvoiceDocumentData extends InvoiceDetail {
  kind: DocumentKind;
  shop: DocumentShop;
  balance_as_of_sale: number | null;
  /** How many times this kind of document for this invoice has been printed already. */
  copies_printed: number;
  /** `copies_printed > 0`: the second and later print of the same invoice says COPY. */
  is_copy: boolean;
  /** IANA zone the date and time are shown in (setting `shop.time_zone`, default Asia/Karachi). */
  time_zone: string;
}

export interface InvoiceListRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: 'active' | 'voided';
  customer_name_en: string | null;
  customer_name_ur: string | null;
  total: number;
  paid_amount: number;
  on_khata: number;
  payment_method: DocumentPaymentMethod;
  sold_by: string;
  line_count: number;
  /** Times any document of this invoice was printed. */
  print_count: number;
}

export interface InvoiceList {
  rows: InvoiceListRow[];
  /** Rows matching the filter, ignoring limit and offset. */
  total: number;
}

export interface InvoiceListFilter {
  query?: string | undefined;
  /** `YYYY-MM-DD`, the UTC date of the invoice (the same day boundary as the profit report). */
  from?: string | undefined;
  to?: string | undefined;
  customer_id?: string | undefined;
  status?: 'active' | 'voided' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/** What the owner sets once for printing and the document header. Staff may read it (they print), only the owner changes it. */
export type PrintFormat = '80mm' | 'a4';

export interface PrintConfig {
  /** The shop's English name (the `shops` row made by setup). Never empty. Printed on both documents and shown in the sidebar. */
  shop_name: string;
  /** Which document the plain "Print" action prints: the 80 mm receipt (default) or the A4 invoice. */
  print_format: PrintFormat;
  /** Printed at the bottom of both documents in place of the standard thank-you line. '' (default): the standard line stays. */
  receipt_footer: string;
  /** The OS name of the receipt printer, or null: use the system default printer. */
  printer_name: string | null;
  receipt_language: DocumentLanguage;
  invoice_language: DocumentLanguage;
  shop_name_ur: string | null;
  /** null: not given yet (documents show a marked placeholder). */
  shop_address: string | null;
  shop_phone: string | null;
}

export interface PrinterInfo {
  name: string;
  display_name: string;
  is_default: boolean;
}
