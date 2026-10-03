import { DomainError } from '../errors.js';
import { roundDiv, mul } from '../money/index.js';
import type { InvoiceStatus, ReturnCondition } from '../schemas/sales.js';

/** An invoice row as seen by a return: what was sold, what it cost the customer, what already came back. */
export interface SoldLine {
  invoice_item_id: string;
  /** Sold, in base units. */
  qty: number;
  /** Paisa the customer was charged for this row: after discount, including tax. */
  line_total: number;
  /** Sum of earlier sales_return_items for this row. */
  qty_returned: number;
  /** Base units per pack, if known: lets an error say how many packs. */
  pack_size?: number;
}

export interface ReturnRequestLine {
  invoice_item_id: string;
  qty: number;
  condition: ReturnCondition;
}

export interface PlannedReturnLine {
  invoice_item_id: string;
  qty: number;
  refund_amount: number;
  condition: ReturnCondition;
  /** Only resellable goods go back into sellable stock. */
  restock: boolean;
}

export interface ReturnPlan {
  lines: PlannedReturnLine[];
  total: number;
}

export function returnableQty(line: SoldLine): number {
  return line.qty - line.qty_returned;
}

/** What the customer was charged for the first `qty` units of this row. */
function chargedFor(line: SoldLine, qty: number): number {
  return roundDiv(mul(line.line_total, qty), line.qty);
}

/**
 * Refund for returning `qty` more units of a row, at the price originally charged (not today's price).
 * The discount and tax come back in proportion. Computed as the difference of running totals, so the
 * refunds from several partial returns add up to exactly line_total once everything is returned.
 */
export function refundFor(line: SoldLine, qty: number): number {
  return chargedFor(line, line.qty_returned + qty) - chargedFor(line, line.qty_returned);
}

/**
 * Checks a return request against the invoice and works out refunds. It does not decide how the refund
 * is paid (cash or Khata credit); that is for the service, once open question 8 is answered.
 */
export function planReturn(args: {
  invoice_status: InvoiceStatus;
  lines: readonly SoldLine[];
  requested: readonly ReturnRequestLine[];
}): ReturnPlan {
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
      });
    }
    return {
      invoice_item_id: r.invoice_item_id,
      qty: r.qty,
      refund_amount: refundFor(sold, r.qty),
      condition: r.condition,
      restock: r.condition === 'resellable',
    };
  });

  return { lines, total: lines.reduce((sum, l) => sum + l.refund_amount, 0) };
}
