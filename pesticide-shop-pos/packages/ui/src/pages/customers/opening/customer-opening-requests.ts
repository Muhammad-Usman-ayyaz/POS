// The rules behind the Opening balance box, without React. Exposed through `@pos/ui/rules` for the desktop tests.
// The contract's `khata:setOpeningBalance` takes ONE signed amount in paisa (plus: the customer owes us; minus: we owe them), a customer id
// and nothing else: no note, no date (so the design's Note and Date fields are not built).
import type { Api } from '@pos/api-contract';
import { parseRupees } from '../../products/product-form-state.js';

export type OpeningDirection = 'they_owe_us' | 'we_owe_them';
/** The box starts on "They owe us": the usual case (an old Khata the customer still owes). */
export const DEFAULT_DIRECTION: OpeningDirection = 'they_owe_us';
type OpeningInput = Parameters<Api['khata']['setOpeningBalance']>[0];

/** The amount in paisa, or null when it is not an amount above zero. */
export function openingPaisa(text: string): number | null {
  const p = parseRupees(text);
  return p !== null && p > 0 ? p : null;
}

/** The sign the shell expects: they owe us is plus, we owe them is minus. */
export const signedOpening = (direction: OpeningDirection, paisa: number): number => (direction === 'they_owe_us' ? paisa : -paisa);

export function buildOpeningRequest(customerId: string, direction: OpeningDirection, amountText: string): OpeningInput {
  return { customer_id: customerId, amount: signedOpening(direction, openingPaisa(amountText) as number) };
}
