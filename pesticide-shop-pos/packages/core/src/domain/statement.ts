import type { LedgerDisplayRow } from '../ports/types.js';
import type { LedgerEntry } from '../schemas/index.js';

/** The word a statement line carries, as a key the screens translate. */
export type StatementLabel = 'brought_forward' | 'opening' | 'sale' | 'payment' | 'return' | 'adjustment';

export interface StatementLine {
  kind: 'brought_forward' | 'entry';
  /** The ledger row. NULL on the brought-forward line, which is not a ledger row. */
  entry: LedgerEntry | null;
  label: StatementLabel;
  /** Plus: the customer owes more. Minus: owes less. On the brought-forward line, the balance brought forward. */
  amount_delta: number;
  /** Balance after this line. */
  running_balance: number;
  invoice_no: string | null;
  return_no: string | null;
  payment_method: string | null;
  reference_no: string | null;
  receipt_no: string | null;
  note: string | null;
}

export interface StatementTotals {
  /** Sum of the plus rows inside the range. */
  owes_more: number;
  /** Sum of the minus rows inside the range, as a positive number. */
  owes_less: number;
}

export interface StatementResult {
  lines: StatementLine[];
  /** The balance before `from` (0 when there is no `from`). */
  brought_forward: number;
  totals: StatementTotals;
  /** Always the sum of EVERY ledger row up to and including `to` (all rows when there is no `to`). */
  closing_balance: number;
}

const LABELS: Record<LedgerEntry['entry_type'], StatementLabel> = {
  opening: 'opening',
  invoice: 'sale',
  payment: 'payment',
  return: 'return',
  adjustment: 'adjustment',
  // never on a customer ledger; shown as an adjustment rather than hidden if one ever appears
  purchase: 'adjustment',
  purchase_return: 'adjustment',
};

/** The calendar date (UTC) of a stored moment. */
const dayOf = (entryDate: string): string => entryDate.slice(0, 10);

/**
 * Builds a statement from a customer's ledger rows. Pure: it never reads or writes anything.
 *  - rows are ordered by (entry_date, position in `rows`), which is the order the database lists them in;
 *  - `from` and `to` are whole days (YYYY-MM-DD, UTC), both included;
 *  - with a `from`, the first line is a brought-forward line equal to the sum of every row before that day;
 *  - the closing balance is brought-forward + the rows inside the range, which is the sum of every row up to `to`.
 */
export function buildStatement(rows: readonly LedgerDisplayRow[], range: { from?: string | undefined; to?: string | undefined } = {}): StatementResult {
  const ordered = rows.map((row, i) => ({ row, i })).sort((a, b) => (a.row.entry.entry_date < b.row.entry.entry_date ? -1 : a.row.entry.entry_date > b.row.entry.entry_date ? 1 : a.i - b.i));

  let brought = 0;
  const inside: LedgerDisplayRow[] = [];
  for (const { row } of ordered) {
    const day = dayOf(row.entry.entry_date);
    if (range.from !== undefined && day < range.from) brought += row.entry.amount_delta;
    else if (range.to === undefined || day <= range.to) inside.push(row);
  }

  let running = brought;
  let more = 0;
  let less = 0;
  const lines: StatementLine[] = [];
  if (range.from !== undefined) {
    lines.push({ kind: 'brought_forward', entry: null, label: 'brought_forward', amount_delta: brought, running_balance: brought, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null });
  }
  for (const r of inside) {
    const delta = r.entry.amount_delta;
    running += delta;
    if (delta > 0) more += delta;
    else less += -delta;
    lines.push({
      kind: 'entry',
      entry: r.entry,
      label: LABELS[r.entry.entry_type],
      amount_delta: delta,
      running_balance: running,
      invoice_no: r.invoice_no,
      return_no: r.return_no,
      payment_method: r.payment_method,
      reference_no: r.reference_no,
      receipt_no: r.receipt_no,
      note: r.note,
    });
  }
  return { lines, brought_forward: brought, totals: { owes_more: more, owes_less: less }, closing_balance: running };
}
