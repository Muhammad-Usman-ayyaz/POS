// Small pure helpers for the customer page and its two dialogs. No React. Every balance on these screens comes from the shell; the ONLY
// arithmetic is the two PREVIEW helpers below, which are never shown after a save (the saved box shows the shell's reply).
import type { Language, StatementView } from '@pos/api-contract';

export type { BalanceKind } from '../list/customer-list-state.js';
export { balanceView, creditChipKind, displayName } from '../list/customer-list-state.js';

export type StatementLineView = StatementView['lines'][number];

/** How many of the last statement lines the customer page shows. */
export const PREVIEW_LINES = 10;

/**
 * PREVIEW ONLY (the live "Balance after" line in the Receive payment box): what the balance would be after taking `amount`.
 * A negative result means an advance. It is never saved and never shown once the payment is saved: then the screen shows the
 * `balance_after` the shell sent back.
 */
export const balanceAfterPreview = (balance: number, amount: number): number => balance - amount;

/** PREVIEW ONLY: how much of `amount` is more than the customer owes (0 when it is not more). Used for the advance confirm text. */
export const advanceExtraPreview = (balance: number, amount: number): number => Math.max(0, amount - Math.max(balance, 0));

/** The last lines of a statement, oldest first (the shell already sent them in order, with their running balance). */
export const lastLines = (lines: readonly StatementLineView[], n = PREVIEW_LINES): StatementLineView[] => lines.slice(-n);

export type LedgerPill = 'opening' | 'sale' | 'payment' | 'return' | 'adjustment' | 'broughtForward';

/** The type pill of a ledger line, from the label the shell gave it. */
export function pillOf(line: Pick<StatementLineView, 'label'>): LedgerPill {
  switch (line.label) {
    case 'opening':
      return 'opening';
    case 'sale':
      return 'sale';
    case 'payment':
      return 'payment';
    case 'return':
      return 'return';
    case 'brought_forward':
      return 'broughtForward';
    default:
      return 'adjustment';
  }
}

/** The customer's name for the language on screen (the other language when missing). */
export function nameFor(c: { name_en: string | null; name_ur: string | null }, language: Language): string {
  const first = language === 'ur' ? c.name_ur : c.name_en;
  const second = language === 'ur' ? c.name_en : c.name_ur;
  return first?.trim() || second?.trim() || '';
}
