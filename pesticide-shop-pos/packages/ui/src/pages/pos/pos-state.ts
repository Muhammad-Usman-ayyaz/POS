// The POS bill, without any React: the cart, the customer, and the exact requests that are sent. Pure, so the rules that matter can be
// tested alone. The screen does NO money arithmetic of its own: prices, discounts' effect, tax, totals and credit all come from `sale:quote`.
import type { ApprovalAction, CustomerMatch, Input } from '@pos/api-contract';
import { looseStep, type BaseUnitCode } from '@pos/core';
import { parseRupees } from '../products/product-form-state.js';

export { parseRupees, rupeesText } from '../products/product-form-state.js';

export type BaseUnit = BaseUnitCode;
export type PriceType = 'retail' | 'wholesale';
export type PaymentMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash';
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'bank', 'easypaisa', 'jazzcash'];

/** A size as the search shows it, and as the cart keeps it. */
export interface SizePick {
  productId: string;
  nameEn: string | null;
  nameUr: string | null;
  /** Base units per pack. (The size is shown from this and `baseUnit`, derived by the units module: the stored label text is not kept.) */
  packSize: number;
  allowLoose: boolean;
  baseUnit: BaseUnit;
}

/** One line of the bill. `qty` is in base units (ml, g or pieces). */
export interface CartLine extends SizePick {
  key: string;
  qty: number;
  /** Paisa taken off this line. */
  discount: number;
  /** A batch chosen by hand (the whole line comes from it). null: earliest expiry first. */
  batchId: string | null;
  /** The price per pack the screen last saw (from a quote), kept so a held bill can say "price changed". */
  seenPrice: number | null;
  /** The batch the bill would have taken, kept so a held bill can say "batch changed". (Bills held before this was added have none.) */
  seenBatch?: { no: string; expiry: string } | null;
}

let counter = 0;
export const newKey = (): string => `cart-${(counter += 1)}`;

/** How far one press of + or - moves the quantity, in base units: a whole pack for a sealed size; for a loose one 0.5 kg, 0.1 L or 1 piece (the units module decides). */
export function stepOf(size: Pick<SizePick, 'packSize' | 'allowLoose' | 'baseUnit'>): number {
  if (!size.allowLoose) return Math.max(1, size.packSize);
  return looseStep(size.baseUnit);
}

/** The first quantity of a size added to the bill: one pack. */
export const firstQty = (size: Pick<SizePick, 'packSize'>): number => Math.max(1, size.packSize);

/** Adds a size, or one more pack of it when it is already on the bill. */
export function addSize(cart: readonly CartLine[], size: SizePick): CartLine[] {
  const at = cart.findIndex((l) => l.productId === size.productId);
  if (at === -1) return [...cart, { ...size, key: newKey(), qty: firstQty(size), discount: 0, batchId: null, seenPrice: null }];
  return cart.map((l, i) => (i === at ? { ...l, qty: l.qty + firstQty(l), batchId: l.batchId } : l));
}

export const setQty = (cart: readonly CartLine[], key: string, qty: number): CartLine[] => cart.map((l) => (l.key === key ? { ...l, qty } : l));
export const setDiscount = (cart: readonly CartLine[], key: string, discount: number): CartLine[] => cart.map((l) => (l.key === key ? { ...l, discount } : l));
export const setBatch = (cart: readonly CartLine[], key: string, batchId: string | null): CartLine[] => cart.map((l) => (l.key === key ? { ...l, batchId } : l));
export const removeLine = (cart: readonly CartLine[], key: string): CartLine[] => cart.filter((l) => l.key !== key);

/** Changes the quantity by `delta` steps; never below one step (use Remove to take a line off). */
export function stepQty(cart: readonly CartLine[], key: string, delta: 1 | -1): CartLine[] {
  return cart.map((l) => {
    if (l.key !== key) return l;
    const step = stepOf(l);
    return { ...l, qty: Math.max(step, l.qty + delta * step) };
  });
}

export interface Customer {
  id: string;
  nameEn: string | null;
  nameUr: string | null;
  village: string | null;
  defaultPriceType: PriceType;
}

export const customerFrom = (c: CustomerMatch): Customer => ({ id: c.id, nameEn: c.name_en, nameUr: c.name_ur, village: c.village, defaultPriceType: c.default_price_type });

/** The name in the language on screen, with the other language as the fallback. */
export const pickName = (en: string | null, ur: string | null, language: 'en' | 'ur'): string => (language === 'ur' ? (ur ?? en) : (en ?? ur)) ?? '';

// ---------- the requests ----------

export type SaleLineInput = Input<'sale:create'>['lines'][number];

/** The cart as the shell wants it. A discount of 0 and "earliest expiry first" are left out. */
export function saleLines(cart: readonly CartLine[]): SaleLineInput[] {
  return cart.map((l) => ({
    product_id: l.productId,
    qty: l.qty,
    ...(l.discount > 0 ? { line_discount: l.discount } : {}),
    ...(l.batchId ? { batches: [{ batch_id: l.batchId, qty: l.qty }] } : {}),
  }));
}

export interface BillDraft {
  customerId: string | null;
  priceType: PriceType;
  method: PaymentMethod;
  reference: string;
  /** YYYY-MM-DD, sent only with a customer. */
  dueDate: string;
}

/** What `sale:quote` and `sale:create` both take, except the amount paid. */
function common(cart: readonly CartLine[], bill: BillDraft) {
  const reference = bill.reference.trim();
  return {
    ...(bill.customerId ? { customer_id: bill.customerId, ...(bill.dueDate !== '' ? { due_date: bill.dueDate } : {}) } : {}),
    price_type: bill.priceType,
    payment_method: bill.method,
    ...(reference !== '' && bill.method !== 'cash' ? { reference_no: reference } : {}),
    lines: saleLines(cart),
  };
}

/** `paid` left out means "paid in full". */
export function quoteRequest(cart: readonly CartLine[], bill: BillDraft, paid: number | null): Input<'sale:quote'> {
  return { ...common(cart, bill), ...(paid === null ? {} : { paid_amount: paid }) };
}

export interface SaleExtras {
  requestId: string;
  approvalToken?: string | undefined;
  creditOverride?: boolean | undefined;
}

export function saleRequest(cart: readonly CartLine[], bill: BillDraft, paid: number, extras: SaleExtras): Input<'sale:create'> {
  return {
    ...common(cart, bill),
    paid_amount: paid,
    request_id: extras.requestId,
    ...(extras.approvalToken ? { approval_token: extras.approvalToken } : {}),
    ...(extras.creditOverride ? { credit_override: true as const } : {}),
  };
}

/** What an owner's approval is for: exactly the cart and the amount (the shell refuses it for anything else). */
export function approvalSubject(cart: readonly CartLine[], bill: BillDraft, paid: number): Input<'approval:request'>['sale'] {
  return {
    ...(bill.customerId ? { customer_id: bill.customerId } : {}),
    price_type: bill.priceType,
    paid_amount: paid,
    lines: saleLines(cart),
  };
}

/** A key that changes whenever anything a quote depends on changes (so an old quote is never taken for the current one). */
export function quoteKey(cart: readonly CartLine[], bill: BillDraft, paidText: string | null): string {
  // The amount, not the text: "1000" and "1,000" are the same bill, so tidying the text must not ask for a new quote.
  return JSON.stringify([saleLines(cart), bill.customerId, bill.priceType, bill.method, bill.dueDate, paidFromText(paidText)]);
}

// ---------- the amount paid ----------

/** What was typed in "Paid now", in paisa; null when it is empty (paid in full) and 'invalid' when it is not an amount. */
export function paidFromText(text: string | null): number | null | 'invalid' {
  if (text === null || text.trim() === '') return null;
  const paisa = parseRupees(text);
  return paisa === null ? 'invalid' : paisa;
}

/** 9750 is "9,750". */
export const groupDigits = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 100000 paisa is "1,000", 105050 is "1,050.50": the way the design shows the amount in the Paid now field (no "Rs": the field has its own). */
export function groupedRupeesText(paisa: number): string {
  const whole = Math.floor(paisa / 100);
  const rest = paisa % 100;
  const grouped = groupDigits(whole);
  return rest === 0 ? grouped : `${grouped}.${String(rest).padStart(2, '0')}`;
}

/**
 * What is typed in "Paid now", with the thousands separators put in as it goes ("1000" becomes "1,000"). Only the whole-rupee part is
 * touched: the paisa are left exactly as typed ("1,000.5" stays, so a half-typed amount is never rewritten under the cursor).
 * Text that is not an amount is returned as it is.
 */
export function groupTyped(text: string): string {
  const match = /^(\s*)(\d[\d,]*)(\.\d{0,2})?(\s*)$/.exec(text);
  if (!match) return text;
  const whole = (match[2] ?? '').replace(/,/g, '');
  return `${match[1] ?? ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3] ?? ''}${match[4] ?? ''}`;
}

/** A typed amount tidied up with thousands separators ("1000" to "1,000"); text that is not an amount is returned as it is. */
export function tidyPaidText(text: string): string {
  const paisa = parseRupees(text);
  return paisa === null || text.trim() === '' ? text : groupedRupeesText(paisa);
}

/** `2026-10-12` plus 30 days. Done on the calendar date alone (no time zone). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A new id for one bill. It is kept for every retry of THAT bill, so a double click or a repeat can never bill twice. */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The actions the owner has to approve, as the shell says them in an APPROVAL_REQUIRED reply ("credit_override,discount_override"). */
export function actionsFromParams(value: unknown): ApprovalAction[] {
  const all: ApprovalAction[] = ['credit_override', 'price_override', 'discount_override'];
  if (typeof value !== 'string') return [];
  return all.filter((a) => value.split(',').includes(a));
}
