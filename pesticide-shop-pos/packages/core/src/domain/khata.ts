/** The part of a ledger row this module needs. */
export interface LedgerLike {
  entry_type: string;
  amount_delta: number;
  ref_type: string | null;
  ref_id: string | null;
  /** UTC ISO text. Sorts correctly as plain text. */
  entry_date: string;
}

export interface Debt {
  /** `opening` for the opening balance, `invoice` for a sale, `other` for any other positive row. */
  source: 'opening' | 'invoice' | 'other';
  /** The invoice id for `invoice` debts. */
  ref_id: string | null;
  entry_date: string;
  original: number;
  outstanding: number;
}

/**
 * Payments reduce the customer's overall balance, not one invoice. To tell which invoices are still open
 * we treat the money received (payments, returns, other credits) as paying the oldest debts first.
 * Returns only debts with something left to pay, oldest first.
 */
export function outstandingDebts(entries: readonly LedgerLike[]): Debt[] {
  const ordered = entries.map((e, i) => ({ e, i })).sort((a, b) => (a.e.entry_date < b.e.entry_date ? -1 : a.e.entry_date > b.e.entry_date ? 1 : a.i - b.i));

  let credit = 0;
  for (const { e } of ordered) if (e.amount_delta < 0) credit += -e.amount_delta;

  const debts: Debt[] = [];
  for (const { e } of ordered) {
    if (e.amount_delta <= 0) continue;
    const applied = Math.min(credit, e.amount_delta);
    credit -= applied;
    const outstanding = e.amount_delta - applied;
    if (outstanding === 0) continue;
    debts.push({
      source: e.entry_type === 'opening' ? 'opening' : e.entry_type === 'invoice' ? 'invoice' : 'other',
      ref_id: e.entry_type === 'invoice' ? e.ref_id : null,
      entry_date: e.entry_date,
      original: e.amount_delta,
      outstanding,
    });
  }
  return debts;
}
