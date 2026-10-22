// The rules behind the Opening balance box, without React. Exposed through `@pos/ui/rules` for the desktop tests.
// The contract's `khata:setOpeningBalance` takes ONE signed amount in paisa (plus: the customer owes us; minus: we owe them), a customer id
// and nothing else: no note, no date (so the design's Note and Date fields are not built).
import type { Api } from '@pos/api-contract';
import { parseRupees } from '../../products/product-form-state.js';

export type OpeningDirection = 'they_owe_us' | 'we_owe_them';
/** The box starts on "They owe us": the usual case (an old Khata the customer still owes). */
export const DEFAULT_DIRECTION: OpeningDirection = 'they_owe_us';
type OpeningInput = Parameters<Api['khata']['setOpeningBalance']>[0];
type AdjustInput = Parameters<Api['khata']['adjustOpening']>[0];

/** The amount in paisa, or null when it is not an amount above zero. */
export function openingPaisa(text: string): number | null {
  const p = parseRupees(text);
  return p !== null && p > 0 ? p : null;
}

/** The sign the shell expects: they owe us is plus, we owe them is minus. */
export const signedOpening = (direction: OpeningDirection, paisa: number): number => (direction === 'they_owe_us' ? paisa : -paisa);

// ---------- Correcting an opening balance (owner only; khata:adjustOpening) ----------

/**
 * The delta to send to `khata:adjustOpening`: how many paisa to ADD to what the customer owes so that the opening balance becomes `newOpening`.
 * Both numbers are signed paisa (plus: they owe us; minus: we owe them). The ledger is never edited: the shell writes one `adjustment` row of this size.
 * Example: opening is 650,000 (Rs 6,500) and should be 500,000: the delta is -150,000. Opening 100,000 that should be -20,000: delta -120,000.
 * 0 means nothing to correct (the box refuses it).
 */
export const adjustmentFor = (currentOpening: number, newOpening: number): number => newOpening - currentOpening;

/** The part of a statement line this module reads. */
interface LineLike {
  label: string;
  amount_delta: number;
}

/**
 * What the opening balance is NOW, from the statement's own lines: the `opening` line plus every `adjustment` line (the only adjustments the app
 * writes are opening corrections). null when the statement has no opening line. The numbers come from the shell.
 */
export function effectiveOpening(lines: readonly LineLike[]): number | null {
  const opening = lines.find((l) => l.label === 'opening');
  if (!opening) return null;
  return opening.amount_delta + lines.filter((l) => l.label === 'adjustment').reduce((sum, l) => sum + l.amount_delta, 0);
}

/** The direction word for a signed opening amount. */
export const directionOf = (signed: number): OpeningDirection => (signed < 0 ? 'we_owe_them' : 'they_owe_us');

export const REASON_MAX = 200;
/** A reason is needed: 1 to 200 characters once trimmed. */
export const reasonOk = (reason: string): boolean => reason.trim().length >= 1 && reason.trim().length <= REASON_MAX;

export function buildAdjustRequest(customerId: string, currentOpening: number, direction: OpeningDirection, amountText: string, reason: string): AdjustInput {
  const next = signedOpening(direction, openingPaisa(amountText) as number);
  return { customer_id: customerId, delta: adjustmentFor(currentOpening, next), reason: reason.trim() };
}

export function buildOpeningRequest(customerId: string, direction: OpeningDirection, amountText: string): OpeningInput {
  return { customer_id: customerId, amount: signedOpening(direction, openingPaisa(amountText) as number) };
}
