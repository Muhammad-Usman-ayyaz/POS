import { z } from 'zod';
import { editableMeta, Id, IsoDate, IsoDateTime, lineMeta, NonNegPaisa, PaymentMethod, PriceType, Qty, syncScope, TaxRateBp } from './common.js';

export const InvoiceStatus = z.enum(['active', 'voided']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const Invoice = z
  .object({
    id: Id,
    invoice_no: z.string().min(1),
    customer_id: Id.nullable(),
    created_by: Id,
    invoice_date: IsoDateTime,
    due_date: IsoDate.nullable(),
    price_type: PriceType,
    /** Sum of (line_total - tax_amount). */
    subtotal: NonNegPaisa,
    tax_total: NonNegPaisa,
    total: NonNegPaisa,
    paid_amount: NonNegPaisa,
    /** How the amount paid at sale was paid. For a customer sale the payments row uses the same method. */
    payment_method: PaymentMethod,
    status: InvoiceStatus,
    void_reason: z.string().nullable(),
    voided_by: Id.nullable(),
    /**
     * The id the screen made for this attempt to complete the sale (migration 006). A second request with the same id gets this invoice back
     * instead of making another. Unique, never changed once set. Null for invoices made before it existed, or without one.
     */
    request_id: z.string().nullable(),
    ...syncScope,
    ...editableMeta,
  })
  // The same four rules as the CHECK constraints on the invoices table.
  .refine((i) => i.total === i.subtotal + i.tax_total, { message: 'total must equal subtotal + tax_total' })
  .refine((i) => i.paid_amount <= i.total, { message: 'paid_amount cannot exceed total' })
  .refine((i) => i.customer_id !== null || i.paid_amount === i.total, { message: 'a walk-in sale must be paid in full' })
  .refine((i) => i.status === 'active' || (i.void_reason !== null && i.voided_by !== null), {
    message: 'a voided invoice needs a reason and who voided it',
  });
export type Invoice = z.infer<typeof Invoice>;

export const InvoiceItem = z.object({
  id: Id,
  invoice_id: Id,
  product_id: Id,
  batch_id: Id,
  qty: Qty,
  /** Paisa per pack. */
  unit_price: NonNegPaisa,
  /** Copied from the batch at sale time. Profit uses this copy. */
  cost_price: NonNegPaisa,
  line_discount: NonNegPaisa,
  tax_rate_bp: TaxRateBp,
  tax_amount: NonNegPaisa,
  line_total: NonNegPaisa,
  /**
   * What was sold, as the shop's catalogue named it AT SALE TIME (group name + size label, in English and Urdu; at least one is set).
   * Copied by the sale service from the product, never typed by the screen and never edited, so a receipt or reprint shows the name the
   * customer was given even if the product is renamed later.
   */
  name_en: z.string().nullable(),
  name_ur: z.string().nullable(),
  ...syncScope,
  ...lineMeta,
});
export type InvoiceItem = z.infer<typeof InvoiceItem>;

export const RefundMethod = z.enum(['cash', 'khata_credit']);
export const ReturnCondition = z.enum(['resellable', 'damaged', 'expired']);
export type ReturnCondition = z.infer<typeof ReturnCondition>;

export const SalesReturn = z.object({
  id: Id,
  return_no: z.string().min(1),
  invoice_id: Id,
  approved_by: Id,
  return_date: IsoDate,
  reason: z.string().nullable(),
  refund_method: RefundMethod,
  total: NonNegPaisa,
  ...syncScope,
  ...editableMeta,
});
export type SalesReturn = z.infer<typeof SalesReturn>;

export const SalesReturnItem = z.object({
  id: Id,
  sales_return_id: Id,
  invoice_item_id: Id,
  qty: Qty,
  refund_amount: NonNegPaisa,
  /** The tax inside `refund_amount`, worked out the same running-difference way, so all of a line's tax comes back and never more. */
  tax_refund: NonNegPaisa,
  condition: ReturnCondition,
  ...syncScope,
  ...lineMeta,
});
export type SalesReturnItem = z.infer<typeof SalesReturnItem>;

export const HeldBillStatus = z.enum(['held', 'resumed', 'discarded']);

/**
 * A bill put on hold at the counter (migration 006): a DRAFT of a cart, not a sale. `payload` is the cart as the screen made it (JSON text:
 * product, quantity, batches chosen, discount); it holds no price, no stock and no money, and is re-priced and re-checked when resumed.
 * Written once; it is later resumed or discarded, once.
 */
export const HeldBill = z.object({
  id: Id,
  held_by: Id,
  customer_id: Id.nullable(),
  price_type: PriceType,
  line_count: z.number().int().positive(),
  payload: z.string().min(2),
  status: HeldBillStatus,
  resolved_by: Id.nullable(),
  resolved_at: IsoDateTime.nullable(),
  ...syncScope,
  ...editableMeta,
});
export type HeldBill = z.infer<typeof HeldBill>;
