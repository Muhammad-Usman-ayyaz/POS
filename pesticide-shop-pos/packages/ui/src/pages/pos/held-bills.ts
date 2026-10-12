// Held bills. The shell has the `held_bills` table (migration 006) but no channel to reach it yet, so for now a held bill is kept in this
// window's own browser storage: on this computer only, never synced, and lost if the app's data is cleared. The shape is the table's:
// a draft of a cart (product, quantity, batch, discount) and no money except the price last seen, which is only used to say "price changed".
// When the channels exist, replace this file's load/save/remove with calls to them; nothing else needs to change.
import type { CartLine, Customer, PriceType } from './pos-state.js';

const KEY = 'pos.heldBills.v1';

export interface HeldBill {
  id: string;
  heldByName: string;
  /** ISO date-time. */
  heldAt: string;
  customer: Customer | null;
  priceType: PriceType;
  lines: CartLine[];
}

const isHeld = (v: unknown): v is HeldBill => typeof v === 'object' && v !== null && typeof (v as HeldBill).id === 'string' && Array.isArray((v as HeldBill).lines);

export function loadHeld(): HeldBill[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isHeld) : [];
  } catch {
    return [];
  }
}

function save(all: readonly HeldBill[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Puts a bill on hold. Returns false when it could not be stored (then the bill must stay on the screen). */
export function holdBill(bill: Omit<HeldBill, 'id' | 'heldAt'>, id: string, now: Date = new Date()): boolean {
  return save([...loadHeld(), { ...bill, id, heldAt: now.toISOString() }]);
}

/** A held bill is resumed or discarded once: either way it leaves the list. */
export function removeHeld(id: string): void {
  save(loadHeld().filter((b) => b.id !== id));
}
