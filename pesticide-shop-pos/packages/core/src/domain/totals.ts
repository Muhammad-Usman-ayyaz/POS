import { DomainError } from '../errors.js';
import { priceForQty, splitProportional, taxIncludedIn } from '../money/index.js';
import type { Allocation } from './allocation.js';

export interface LineInput {
  /** Base units. */
  qty: number;
  /** Paisa per pack, tax included. */
  unit_price: number;
  pack_size: number;
  /** Paisa taken off this line. Discounts are per item only. */
  line_discount: number;
  tax_rate_bp: number;
}

export interface LineAmounts {
  /** qty * unit_price / pack_size, rounded once. Tax is already inside it. */
  gross: number;
  line_discount: number;
  /** gross - line_discount. What the customer pays for the line; the database stores it as line_total. */
  line_total: number;
  /** The part of line_total that is tax: ROUND(line_total * rate / (10000 + rate)). */
  tax_amount: number;
  /** line_total - tax_amount: the line without its tax. */
  net: number;
}

/**
 * Prices include tax (open question 6, answered by the owner), so tax is never added on top:
 * line_total = ROUND(qty * unit_price / pack_size) - line_discount, and tax_amount is the part of that
 * total which is tax, taken out of the discounted line.
 */
export function calcLine(input: LineInput): LineAmounts {
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new DomainError('INVALID_QUANTITY', `quantity must be a positive integer: ${input.qty}`);
  const gross = priceForQty(input.qty, input.unit_price, input.pack_size);
  if (input.line_discount < 0 || input.line_discount > gross) {
    throw new DomainError('DISCOUNT_EXCEEDS_LINE', `discount ${input.line_discount} is more than the line price ${gross}`, { discount: input.line_discount, linePrice: gross });
  }
  const line_total = gross - input.line_discount;
  const tax_amount = taxIncludedIn(line_total, input.tax_rate_bp);
  return { gross, line_discount: input.line_discount, line_total, tax_amount, net: line_total - tax_amount };
}

/** One line the cashier rang up, before batches are chosen. */
export interface CartLine {
  product_id: string;
  qty: number;
  unit_price: number;
  pack_size: number;
  line_discount: number;
  tax_rate_bp: number;
}

export interface AllocatedBatch extends Allocation {
  /** Copied onto the invoice row so profit uses the cost at sale time. */
  cost_price: number;
}

/** One `invoice_items` row. A cart line that spans two batches becomes two of these. */
export interface InvoiceLineDraft {
  product_id: string;
  batch_id: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  line_discount: number;
  tax_rate_bp: number;
  /** The tax inside line_total. */
  tax_amount: number;
  /** What the customer pays for this row, tax included. */
  line_total: number;
}

/**
 * Turns a cart line into one invoice row per batch. Each row is priced and rounded on its own, so two
 * rows can differ by a paisa from pricing the whole quantity at once; the rows are what the database keeps.
 * The line discount is shared between rows by price, adding up to exactly the discount that was given.
 */
export function buildInvoiceLines(cart: CartLine, batches: readonly AllocatedBatch[]): InvoiceLineDraft[] {
  const allocated = batches.reduce((sum, b) => sum + b.qty, 0);
  if (allocated !== cart.qty) throw new DomainError('ALLOCATION_MISMATCH', `batches add up to ${allocated}, but the line is ${cart.qty}`);

  const grosses = batches.map((b) => priceForQty(b.qty, cart.unit_price, cart.pack_size));
  const totalGross = grosses.reduce((a, b) => a + b, 0);
  if (cart.line_discount < 0 || cart.line_discount > totalGross) {
    throw new DomainError('DISCOUNT_EXCEEDS_LINE', `discount ${cart.line_discount} is more than the line price ${totalGross}`, { discount: cart.line_discount, linePrice: totalGross });
  }
  const discounts = splitProportional(cart.line_discount, grosses);

  return batches.map((b, i) => {
    const amounts = calcLine({
      qty: b.qty,
      unit_price: cart.unit_price,
      pack_size: cart.pack_size,
      line_discount: discounts[i] ?? 0,
      tax_rate_bp: cart.tax_rate_bp,
    });
    return {
      product_id: cart.product_id,
      batch_id: b.batch_id,
      qty: b.qty,
      unit_price: cart.unit_price,
      cost_price: b.cost_price,
      line_discount: amounts.line_discount,
      tax_rate_bp: cart.tax_rate_bp,
      tax_amount: amounts.tax_amount,
      line_total: amounts.line_total,
    };
  });
}

export interface InvoiceTotals {
  subtotal: number;
  tax_total: number;
  total: number;
}

/**
 * subtotal = sum(line_total - tax_amount), tax_total = sum(tax_amount), total = subtotal + tax_total.
 * Every line's tax is rounded once on its own and the invoice only adds those up, so the total is exactly
 * the sum of the line totals (what v_invoice_mismatch checks), whatever the rounding did.
 */
export function calcInvoiceTotals(lines: readonly { line_total: number; tax_amount: number }[]): InvoiceTotals {
  let subtotal = 0;
  let tax_total = 0;
  for (const l of lines) {
    subtotal += l.line_total - l.tax_amount;
    tax_total += l.tax_amount;
  }
  return { subtotal, tax_total, total: subtotal + tax_total };
}

/** The payment rules the invoices table enforces: no overpaying, and a walk-in pays in full. */
export function checkInvoicePayment(args: { total: number; paid_amount: number; has_customer: boolean }): void {
  if (args.paid_amount < 0 || args.paid_amount > args.total) {
    throw new DomainError('OVERPAID', `paid ${args.paid_amount} is more than the total ${args.total}`, { paid: args.paid_amount, total: args.total });
  }
  if (!args.has_customer && args.paid_amount !== args.total) {
    throw new DomainError('CREDIT_NEEDS_CUSTOMER', 'a walk-in sale must be paid in full; choose a customer to sell on credit');
  }
}
