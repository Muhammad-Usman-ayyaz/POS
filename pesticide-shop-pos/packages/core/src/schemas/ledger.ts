import { z } from 'zod';
import {
  editableMeta,
  Id,
  IsoDate,
  IsoDateTime,
  lineMeta,
  Paisa,
  PartyType,
  PaymentMethod,
  syncScope,
} from './common.js';

export const MovementType = z.enum([
  'opening',
  'purchase',
  'sale',
  'sale_return',
  'purchase_return',
  'void',
  'adjustment',
  'damage',
  'expired',
]);
export type MovementType = z.infer<typeof MovementType>;

const POSITIVE_MOVEMENTS: readonly MovementType[] = ['opening', 'purchase', 'sale_return', 'void'];
const NEGATIVE_MOVEMENTS: readonly MovementType[] = ['sale', 'purchase_return', 'damage', 'expired'];

/** Stock is never stored: it is the sum of qty_delta per batch. Rows are append-only. */
export const StockMovement = z
  .object({
    id: Id,
    batch_id: Id,
    qty_delta: z.number().int().refine((n) => n !== 0, { message: 'qty_delta cannot be 0' }),
    movement_type: MovementType,
    ref_type: z.string().nullable(),
    ref_id: z.string().nullable(),
    created_by: Id.nullable(),
    ...syncScope,
    ...lineMeta,
  })
  .refine(
    (m) =>
      (POSITIVE_MOVEMENTS.includes(m.movement_type) && m.qty_delta > 0) ||
      (NEGATIVE_MOVEMENTS.includes(m.movement_type) && m.qty_delta < 0) ||
      m.movement_type === 'adjustment',
    { message: 'qty_delta has the wrong sign for this movement type' },
  );
export type StockMovement = z.infer<typeof StockMovement>;

export const PaymentDirection = z.enum(['in', 'out']);

export const Payment = z.object({
  id: Id,
  party_type: PartyType,
  party_id: Id,
  method: PaymentMethod,
  reference_no: z.string().nullable(),
  amount: z.number().int().positive(),
  direction: PaymentDirection,
  paid_at: IsoDateTime,
  created_by: Id.nullable(),
  ...syncScope,
  ...lineMeta,
});
export type Payment = z.infer<typeof Payment>;

export const LedgerEntryType = z.enum(['opening', 'invoice', 'payment', 'return', 'adjustment', 'purchase', 'purchase_return']);

/** Balance is never stored: it is the sum of amount_delta. Plus means the party owes more. */
export const LedgerEntry = z.object({
  id: Id,
  party_type: PartyType,
  party_id: Id,
  entry_type: LedgerEntryType,
  amount_delta: Paisa.refine((n) => n !== 0, { message: 'amount_delta cannot be 0' }),
  ref_type: z.string().nullable(),
  ref_id: z.string().nullable(),
  entry_date: IsoDateTime,
  created_by: Id.nullable(),
  ...syncScope,
  ...lineMeta,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const Expense = z.object({
  id: Id,
  expense_date: IsoDate,
  category: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.number().int().positive(),
  method: PaymentMethod.nullable(),
  created_by: Id.nullable(),
  ...syncScope,
  ...editableMeta,
});
export type Expense = z.infer<typeof Expense>;
