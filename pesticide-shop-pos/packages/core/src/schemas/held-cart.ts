import { z } from 'zod';
import { Id, NonNegPaisa, PriceType, Qty } from './common.js';

// What a held bill remembers (migration 006's `held_bills.payload` and the input of `bills:hold`).
//
// RULE: only what the cashier CHOSE. No unit price, no tax, no total, no cost, and no user id (the shell takes the holder from the session).
// Every schema is strict, so a price or an actor_id sent by the renderer is an error, not something quietly stored. The prices come back from
// `sale:quote` when the bill is resumed.

/** One line of a held cart. */
export const HeldCartLineSchema = z.strictObject({
  /** The size (a `products` row) that was chosen. */
  product_id: Id,
  /** Base units (ml, g or piece). */
  qty: Qty,
  /**
   * The discount as the cashier entered it. The line dialog turns a typed percent into paisa when it is applied, so what the screen holds is an
   * amount; `kind` is there so a percent can be kept as a percent later without changing the stored shape.
   */
  discount: z.strictObject({ kind: z.literal('amount'), value: NonNegPaisa }).optional(),
  /** A batch picked by hand. Left out: earliest expiry first. */
  batch_id: Id.optional(),
});

export const HeldCartSchema = z.strictObject({
  customer_id: Id.optional(),
  price_type: PriceType.optional(),
  note: z.string().trim().min(1).max(200).optional(),
  lines: z.array(HeldCartLineSchema).min(1).max(200),
});

/** The part of the cart kept in `held_bills.payload` (the customer and price type have their own columns). */
export const HeldPayloadSchema = z.strictObject({
  note: z.string().min(1).max(200).optional(),
  lines: z.array(HeldCartLineSchema).min(1).max(200),
});

export type HeldCartLine = z.infer<typeof HeldCartLineSchema>;
export type HeldCart = z.infer<typeof HeldCartSchema>;
export type HeldPayload = z.infer<typeof HeldPayloadSchema>;
