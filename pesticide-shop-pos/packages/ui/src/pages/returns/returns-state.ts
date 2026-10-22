// The rules of the Returns screen, without React: what a draft return is, the requests the screen sends, and when it may be completed.
// A separate file so the desktop tests can send exactly these requests through the real handlers (`returnRules` in `@pos/ui/rules`).
// NO money arithmetic here: the refund, its tax and the cash / Khata split come from `returns:preview` (the core's numbers).

import type { Input, InvoiceForReturnView, ReturnPreviewView } from '@pos/api-contract';
import { formatNumber, RETURN_REASONS, type ReturnReason } from '@pos/core';

export type Condition = 'resellable' | 'damaged' | 'expired';
export { RETURN_REASONS, type ReturnReason };

export interface DraftLine {
  /** Base units (g, ml, piece) to give back; 0 means this line stays. */
  qty: number;
  condition: Condition;
  /** A code from RETURN_REASONS, or '' until one is chosen. */
  reason: ReturnReason | '';
}
export type Draft = Record<string, DraftLine>;
export type ReturnLine = InvoiceForReturnView['lines'][number];

/** Every line starts at 0; a line from an expired batch starts as written off (it can never be resellable). */
export function emptyDraft(view: InvoiceForReturnView): Draft {
  return Object.fromEntries(view.lines.map((l) => [l.invoice_item_id, { qty: 0, condition: l.batch_expired ? 'expired' : 'resellable', reason: '' } satisfies DraftLine]));
}

/** A line that comes back in whole packs (a sealed size, or a single piece): the stepper counts packs. Any other line is typed in kg or L. */
export const countsPacks = (line: ReturnLine): boolean => line.whole_packs_only || line.pack_size <= 1;

/** How far one press of + or - moves a quantity, in base units: a whole pack for a sealed size, else the counter's loose step (50 / 10 / 1). */
export function stepOf(line: ReturnLine): number {
  if (countsPacks(line)) return Math.max(1, line.pack_size);
  return line.pack_size >= 500 ? 50 : line.pack_size >= 100 ? 10 : 1;
}

export const clampQty = (line: ReturnLine, qty: number): number => Math.max(0, Math.min(line.qty_returnable, Math.trunc(qty)));

/** The stepper moves by one step, never past what can still come back (the last step of a loose line lands exactly on it). */
export function stepQty(line: ReturnLine, qty: number, direction: 1 | -1): number {
  return clampQty(line, qty + direction * stepOf(line));
}

/** The quantity as the number box shows it: whole packs for a sealed size, else kg or L. The conversion is done by the units module. */
export function qtyBoxText(line: ReturnLine, qty: number): string {
  return countsPacks(line) ? String(qty / Math.max(1, line.pack_size)) : formatNumber(line.base_unit, qty);
}

export const chosenLines = (view: InvoiceForReturnView, draft: Draft): { line: ReturnLine; item: DraftLine }[] =>
  view.lines.flatMap((line) => {
    const item = draft[line.invoice_item_id];
    return item && item.qty > 0 ? [{ line, item }] : [];
  });

type PreviewInput = Input<'returns:preview'>;
type CreateInput = Input<'salesReturn:create'>;

/** The draft as a preview request, or null while nothing is chosen. A reason that is not chosen yet is simply left out (the reply says so). */
export function previewRequest(view: InvoiceForReturnView, draft: Draft): PreviewInput | null {
  const chosen = chosenLines(view, draft);
  if (chosen.length === 0) return null;
  return {
    invoice_id: view.invoice.id,
    items: chosen.map(({ line, item }) => ({
      invoice_item_id: line.invoice_item_id,
      qty: item.qty,
      condition: item.condition,
      ...(item.reason !== '' ? { reason: item.reason } : {}),
    })),
  };
}

/** The complete return: every chosen line needs a reason. null when it is not ready. The note is sent only when typed. No approver, no amounts. */
export function createRequest(view: InvoiceForReturnView, draft: Draft, note: string, approvalToken?: string): CreateInput | null {
  const chosen = chosenLines(view, draft);
  if (chosen.length === 0 || chosen.some(({ item }) => item.reason === '')) return null;
  return {
    invoice_id: view.invoice.id,
    ...(note.trim() !== '' ? { note: note.trim() } : {}),
    items: chosen.map(({ line, item }) => ({ invoice_item_id: line.invoice_item_id, qty: item.qty, condition: item.condition, reason: item.reason as ReturnReason })),
    ...(approvalToken ? { approval_token: approvalToken } : {}),
  };
}

/** The same lines for the owner's approval: the token is worthless for any other lines, quantities, conditions or reasons. */
export function approvalRequest(view: InvoiceForReturnView, draft: Draft, username: string, password: string): Input<'approval:requestReturn'> | null {
  const body = createRequest(view, draft, '');
  if (!body) return null;
  return { username: username.trim(), password, return: { invoice_id: body.invoice_id, items: body.items } };
}

export type Readiness = { ok: true } | { ok: false; why: 'nothing' | 'reason' | 'issues' | 'waiting' };

/** May the return be completed (or sent for approval)? Only when something is chosen, every chosen line has a reason, and the core's preview has no issue. */
export function readiness(view: InvoiceForReturnView, draft: Draft, preview: ReturnPreviewView | null): Readiness {
  const chosen = chosenLines(view, draft);
  if (chosen.length === 0) return { ok: false, why: 'nothing' };
  if (chosen.some(({ item }) => item.reason === '')) return { ok: false, why: 'reason' };
  if (preview === null) return { ok: false, why: 'waiting' };
  if (preview.issues.length > 0) return { ok: false, why: 'issues' };
  return { ok: true };
}

/** How the refund is paid, in words the screen picks a sentence for. */
export function refundTarget(preview: Pick<ReturnPreviewView, 'cash_amount' | 'khata_amount'>): 'cash' | 'khata' | 'both' {
  return preview.cash_amount > 0 && preview.khata_amount > 0 ? 'both' : preview.khata_amount > 0 ? 'khata' : 'cash';
}

/** Nothing returned, some of it, or all of it (for the chip). */
export function returnedState(view: InvoiceForReturnView): 'none' | 'some' | 'all' {
  const returned = view.lines.reduce((n, l) => n + l.qty_returned, 0);
  if (returned === 0) return 'none';
  return view.lines.every((l) => l.qty_returnable === 0) ? 'all' : 'some';
}
