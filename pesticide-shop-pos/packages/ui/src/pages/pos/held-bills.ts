// Held bills. They live in the shop's database, reached through the bills:* channels (hold, list, resume, discard); nothing about a held bill
// is kept in the browser's storage. What is stored is only what the cashier chose (product, quantity, discount as entered, batch, customer,
// price type): no price. Who held a bill comes back from the shell with the list; the screen never says who is acting.
//
// The two "this changed while it was held" warnings need the price (and batch) the cashier SAW. They are not stored. They are remembered here,
// in this window's memory only, from the moment of holding until the bill is resumed or the app is closed. A bill held before the app was
// restarted (or held by someone else on another run) is resumed without those two warnings; a line that can no longer be sold is still
// reported, because the new quote says that by itself. (Decision recorded in docs/decisions.md.)
import type { HeldBillCustomer, HeldBillSummary, Input, ResumedHeldBill, SaleQuoteView } from '@pos/api-contract';
import { newKey, type CartLine, type Customer, type PriceType } from './pos-state.js';

export type HeldBill = HeldBillSummary;

/** What was seen for one line when the bill was held: the price per pack and the batch the bill would have taken. Memory only. */
export interface SeenLine {
  price: number | null;
  batch: { no: string; expiry: string } | null;
}

const seenByBill = new Map<string, Map<string, SeenLine>>();

/** The `bills:hold` request for the bill on the screen: the choices only. */
export function holdRequest(cart: readonly CartLine[], customer: Customer | null, priceType: PriceType): Input<'bills:hold'> {
  return {
    ...(customer ? { customer_id: customer.id } : {}),
    price_type: priceType,
    lines: cart.map((l) => ({
      product_id: l.productId,
      qty: l.qty,
      ...(l.discount > 0 ? { discount: { kind: 'amount' as const, value: l.discount } } : {}),
      ...(l.batchId ? { batch_id: l.batchId } : {}),
    })),
  };
}

/** Remembers, for this run of the app only, what the cashier saw on each line of a bill that was just held. */
export function rememberSeen(billId: string, cart: readonly CartLine[], quote: SaleQuoteView | null): void {
  const seen = new Map<string, SeenLine>();
  for (const line of cart) {
    const q = quote?.lines.find((l) => l.product_id === line.productId);
    const price = q?.unit_price ?? line.seenPrice;
    const first = q?.batches[0];
    const batch = first ? { no: first.batch_no, expiry: first.expiry_date } : (line.seenBatch ?? null);
    seen.set(line.productId, { price, batch });
  }
  seenByBill.set(billId, seen);
}

/** What was remembered for a bill (and forgets it: a bill is resumed once). */
export function takeSeen(billId: string): Map<string, SeenLine> | undefined {
  const seen = seenByBill.get(billId);
  seenByBill.delete(billId);
  return seen;
}

export function forgetSeen(billId: string): void {
  seenByBill.delete(billId);
}

export const customerOf = (c: HeldBillCustomer | null): Customer | null =>
  c ? { id: c.id, nameEn: c.name_en, nameUr: c.name_ur, village: c.village, defaultPriceType: c.default_price_type } : null;

/** The cart lines of a resumed bill. `seen` (when this run remembers it) gives each line the price and batch the cashier saw before. */
export function cartFromResumed(bill: ResumedHeldBill, seen: Map<string, SeenLine> | undefined): CartLine[] {
  return bill.lines.map((l) => ({
    key: newKey(),
    productId: l.product_id,
    nameEn: l.name_en,
    nameUr: l.name_ur,
    label: l.pack_label,
    packSize: l.pack_size,
    allowLoose: l.allow_loose,
    baseUnit: l.base_unit,
    qty: l.qty,
    discount: l.discount,
    batchId: l.batch_id,
    seenPrice: seen?.get(l.product_id)?.price ?? null,
    seenBatch: seen?.get(l.product_id)?.batch ?? null,
  }));
}
