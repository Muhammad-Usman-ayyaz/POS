import { z } from 'zod';
import { editableMeta, Id, IsoDate, IsoDateTime, lineMeta, NonNegPaisa, PriceType, Qty, syncScope, TaxRateBp } from './common.js';

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
    status: InvoiceStatus,
    void_reason: z.string().nullable(),
    voided_by: Id.nullable(),
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
  condition: ReturnCondition,
  ...syncScope,
  ...lineMeta,
});
export type SalesReturnItem = z.infer<typeof SalesReturnItem>;
