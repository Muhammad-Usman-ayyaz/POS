import { DomainError } from '../errors.js';
import { roundDiv, mul } from '../money/index.js';
import type { InvoiceStatus, ReturnCondition } from '../schemas/sales.js';

/** An invoice row as seen by a return: what was sold, what it cost the customer, what already came back. */
export interface SoldLine {
  invoice_item_id: string;
  /** Sold, in base units. */
  qty: number;
  /** Paisa the customer was charged for this row: after discount, tax included. */
  line_total: number;
  /** The tax inside line_total. */
  tax_amount: number;
  /** Sum of earlier sales_return_items for this row. */
  qty_returned: number;
  /** Base units per pack, if known: lets an error say how many packs. */
  pack_size?: number;
  /** The stored unit, so an error can say the quantity in kg, L or pieces. */
  base_unit?: string;
  /** True for a size that is sold in whole packs only (not a loose size): it can only come back in whole packs. */
  whole_packs_only?: boolean;
  /** True when the batch this row was sold from has passed its expiry date today: such goods can never go back on the shelf. */
  batch_expired?: boolean;
}

/** Why a line came back. The screen offers these; the code is what is stored. */
export const RETURN_REASONS = ['changed_mind', 'wrong_item', 'damaged', 'leaked', 'expired', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const isReturnReason = (value: unknown): value is ReturnReason => (RETURN_REASONS as readonly unknown[]).includes(value);

export interface ReturnRequestLine {
  invoice_item_id: string;
  qty: number;
  condition: ReturnCondition;
  /** Required for every line (a code from RETURN_REASONS). */
  reason: ReturnReason;
}

export interface PlannedReturnLine {
  invoice_item_id: string;
  qty: number;
  /** Paisa given back, tax included. */
  refund_amount: number;
  /** The part of refund_amount that is tax. */
  tax_refund: number;
  condition: ReturnCondition;
  reason: ReturnReason;
  /** Only resellable goods go back into sellable stock. */
  restock: boolean;
  /** The other goods are written off: 'damage' (damaged) or 'expired'. Null for resellable goods. */
  write_off: 'damage' | 'expired' | null;
}

export interface ReturnPlan {
  lines: PlannedReturnLine[];
  total: number;
}

export function returnableQty(line: SoldLine): number {
  return line.qty - line.qty_returned;
}

/** What the customer was charged for the first `qty` units of this row (`of` is line_total or tax_amount). */
function chargedFor(line: SoldLine, qty: number, of: 'line_total' | 'tax_amount'): number {
  return roundDiv(mul(line[of], qty), line.qty);
}

/**
 * Refund for returning `qty` more units of a row, at the price originally charged (not today's price).
 * The refund is a share of line_total, which already has the discount taken off and the tax inside, so
 * both come back in proportion. Computed as the difference of running totals, so the refunds from several
 * partial returns add up to exactly line_total once everything is returned.
 */
export function refundFor(line: SoldLine, qty: number): number {
  return chargedFor(line, line.qty_returned + qty, 'line_total') - chargedFor(line, line.qty_returned, 'line_total');
}

/** The tax inside that refund, worked out the same way, so all the tax comes back and never more. */
export function taxRefundFor(line: SoldLine, qty: number): number {
  return chargedFor(line, line.qty_returned + qty, 'tax_amount') - chargedFor(line, line.qty_returned, 'tax_amount');
}

export interface ReturnIssue {
  code: 'RETURN_REASON_REQUIRED' | 'WHOLE_PACKS_ONLY' | 'EXPIRED_NOT_RESELLABLE';
  message: string;
  params: Record<string, string | number>;
  invoice_item_id: string;
}

/** The rules about ONE returned line that depend on its reason, pack and batch (not on how much came back before). First problem, or null. */
export function returnLineIssue(sold: SoldLine, r: ReturnRequestLine): ReturnIssue | null {
  const at = { invoice_item_id: r.invoice_item_id };
  if (!isReturnReason(r.reason)) return { ...at, code: 'RETURN_REASON_REQUIRED', message: 'every returned line needs a reason', params: { item: r.invoice_item_id } };
  if (sold.whole_packs_only && sold.pack_size !== undefined && r.qty % sold.pack_size !== 0) {
    return { ...at, code: 'WHOLE_PACKS_ONLY', message: `this size is sold in whole packs only: ${r.qty} is not a multiple of ${sold.pack_size}`, params: { packSize: sold.pack_size, requested: r.qty } };
  }
  if (r.condition === 'resellable' && sold.batch_expired) {
    return { ...at, code: 'EXPIRED_NOT_RESELLABLE', message: 'the batch has expired: these goods cannot go back on the shelf', params: { item: r.invoice_item_id } };
  }
  return null;
}

/**
 * Checks a return request against the invoice and works out refunds. It does not decide how the refund
 * is paid (cash or Khata credit): that is `splitRefund`.
 */
export function planReturn(
  args: {
    invoice_status: InvoiceStatus;
    lines: readonly SoldLine[];
    requested: readonly ReturnRequestLine[];
  },
  /** Give an array to COLLECT the "soft" problems (reason, whole packs, expired batch) instead of throwing on the first: for a preview. */
  collect?: ReturnIssue[],
): ReturnPlan {
  if (args.invoice_status !== 'active') throw new DomainError('INVOICE_VOIDED', 'cannot return against a voided invoice');
  if (args.requested.length === 0) throw new DomainError('EMPTY_RETURN', 'nothing to return');

  const seen = new Set<string>();
  const lines = args.requested.map((r): PlannedReturnLine => {
    if (seen.has(r.invoice_item_id)) throw new DomainError('DUPLICATE_LINE', `item listed twice: ${r.invoice_item_id}`);
    seen.add(r.invoice_item_id);

    const sold = args.lines.find((l) => l.invoice_item_id === r.invoice_item_id);
    if (!sold) throw new DomainError('ITEM_NOT_ON_INVOICE', `item is not on this invoice: ${r.invoice_item_id}`);
    if (!Number.isInteger(r.qty) || r.qty <= 0) throw new DomainError('INVALID_QUANTITY', `quantity must be a positive integer: ${r.qty}`);
    if (r.qty > returnableQty(sold)) {
      throw new DomainError('RETURN_EXCEEDS_SOLD', `only ${returnableQty(sold)} can still be returned, ${r.qty} requested`, {
        returnable: returnableQty(sold),
        requested: r.qty,
        ...(sold.pack_size !== undefined ? { packSize: sold.pack_size } : {}),
        ...(sold.base_unit !== undefined ? { unit: sold.base_unit } : {}),
      });
    }
    const issue = returnLineIssue(sold, r);
    if (issue) {
      if (!collect) throw new DomainError(issue.code, issue.message, issue.params);
      collect.push(issue);
    }
    return {
      invoice_item_id: r.invoice_item_id,
      qty: r.qty,
      refund_amount: refundFor(sold, r.qty),
      tax_refund: taxRefundFor(sold, r.qty),
      condition: r.condition,
      reason: r.reason,
      restock: r.condition === 'resellable',
      write_off: r.condition === 'resellable' ? null : r.condition === 'expired' ? 'expired' : 'damage',
    };
  });

  return { lines, total: lines.reduce((sum, l) => sum + l.refund_amount, 0) };
}

/** What the invoice put on the customer's Khata and what earlier returns of it already took off. */
export interface RefundSplitInput {
  /** The refund, paisa, tax included. */
  total: number;
  /** A walk-in sale has no Khata: the refund is always cash. */
  has_customer: boolean;
  /** invoice.total - invoice.paid_amount: what this sale left on the customer's Khata. */
  unpaid_on_invoice: number;
  /** Sum of `khata_amount` of the invoice's earlier returns. */
  khata_credited_so_far: number;
  /** The owner's setting (default off): give Khata credit instead of cash even for the part the customer paid. */
  refund_paid_part_to_khata: boolean;
}

/**
 * Q8 (decisions.md): a refund of what the customer PAID gives cash back and makes no Khata entry; a refund of what is still ON KHATA takes it
 * off the customer's balance (a compensating ledger row). A credit sale is all Khata, a cash sale is all cash, a part-paid sale takes the
 * Khata part first. The sum is always exactly the refund.
 */
export function splitRefund(a: RefundSplitInput): { cash: number; khata: number } {
  if (!a.has_customer || a.total <= 0) return { cash: a.total, khata: 0 };
  if (a.refund_paid_part_to_khata) return { cash: 0, khata: a.total };
  const stillOnKhata = Math.max(0, a.unpaid_on_invoice - a.khata_credited_so_far);
  const khata = Math.min(a.total, stillOnKhata);
  return { cash: a.total - khata, khata };
}

export interface VoidPlan {
  /** Put back on the batch each line was sold from, base units. */
  stock: { invoice_item_id: string; batch_id: string; qty: number }[];
  /** Taken off the customer's Khata (a ledger row), paisa. */
  khata: number;
  /** Handed back in cash, paisa. */
  cash: number;
}

/** What voiding a whole sale undoes. Same Khata rule as a return (`splitRefund`), applied to the full invoice total. */
export function planVoid(args: {
  invoice: { status: InvoiceStatus; total: number; paid_amount: number; customer_id: string | null };
  items: readonly { id: string; batch_id: string; qty: number }[];
  has_returns: boolean;
  refund_paid_part_to_khata: boolean;
}): VoidPlan {
  if (args.invoice.status !== 'active') throw new DomainError('INVOICE_VOIDED', 'the invoice is already voided');
  if (args.has_returns) throw new DomainError('VOID_HAS_RETURNS', 'an invoice that has returns cannot be voided: return the rest instead');
  const split = splitRefund({
    total: args.invoice.total,
    has_customer: args.invoice.customer_id !== null,
    unpaid_on_invoice: args.invoice.total - args.invoice.paid_amount,
    khata_credited_so_far: 0,
    refund_paid_part_to_khata: args.refund_paid_part_to_khata,
  });
  return { stock: args.items.map((i) => ({ invoice_item_id: i.id, batch_id: i.batch_id, qty: i.qty })), khata: split.khata, cash: split.cash };
}
