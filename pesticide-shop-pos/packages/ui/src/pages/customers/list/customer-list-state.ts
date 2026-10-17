// Small pure helpers for the customer list. No balance arithmetic: every figure comes from `customers:list`; these only choose words.
import type { Language } from '@pos/api-contract';

export type BalanceKind = 'owes' | 'advance' | 'clear';

/** How a balance is worded: a positive one is owed, a negative one is an advance (shown as a positive amount: never "Owes Rs -1,000"). */
export function balanceView(balance: number): { kind: BalanceKind; amount: number } {
  if (balance > 0) return { kind: 'owes', amount: balance };
  if (balance < 0) return { kind: 'advance', amount: -balance };
  return { kind: 'clear', amount: 0 };
}

export type CreditChipKind = 'no_limit' | 'over_limit' | 'left';

/** Which credit chip a row gets. A limit of 0 is "no limit" (loud), never "Rs 0 left". */
export function creditChipKind(row: { no_limit: boolean; over_limit: boolean }): CreditChipKind {
  if (row.no_limit) return 'no_limit';
  if (row.over_limit) return 'over_limit';
  return 'left';
}

/** The name in the language on screen, the other language when that one is missing, '' when neither. */
export function displayName(customer: { name_en: string | null; name_ur: string | null }, language: Language): string {
  const first = language === 'ur' ? customer.name_ur : customer.name_en;
  const second = language === 'ur' ? customer.name_en : customer.name_ur;
  return first?.trim() || second?.trim() || '';
}

/** "26-50 of 60": the first and last row number on this page, and the total the shell counted. */
export function pageRange(offset: number, rowCount: number, total: number): { from: number; to: number; total: number } {
  return { from: offset + 1, to: offset + rowCount, total };
}
