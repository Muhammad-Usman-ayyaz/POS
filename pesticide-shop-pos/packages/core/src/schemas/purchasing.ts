import { z } from 'zod';
import { editableMeta, Id, IsoDate, lineMeta, NonNegPaisa, Qty, syncScope } from './common.js';

export const Purchase = z.object({
  id: Id,
  supplier_id: Id,
  supplier_invoice_no: z.string().nullable(),
  purchase_date: IsoDate,
  discount: NonNegPaisa,
  total: NonNegPaisa,
  paid_amount: NonNegPaisa,
  ...syncScope,
  ...editableMeta,
});
export type Purchase = z.infer<typeof Purchase>;

export const PurchaseItem = z.object({
  id: Id,
  purchase_id: Id,
  batch_id: Id,
  qty: Qty,
  cost_price: NonNegPaisa,
  ...syncScope,
  ...lineMeta,
});
export type PurchaseItem = z.infer<typeof PurchaseItem>;

export const PurchaseReturn = z.object({
  id: Id,
  supplier_id: Id,
  purchase_id: Id.nullable(),
  return_date: IsoDate,
  reason: z.string().nullable(),
  total: NonNegPaisa,
  ...syncScope,
  ...editableMeta,
});
export type PurchaseReturn = z.infer<typeof PurchaseReturn>;

export const PurchaseReturnItem = z.object({
  id: Id,
  purchase_return_id: Id,
  batch_id: Id,
  qty: Qty,
  cost_price: NonNegPaisa,
  ...syncScope,
  ...lineMeta,
});
export type PurchaseReturnItem = z.infer<typeof PurchaseReturnItem>;
