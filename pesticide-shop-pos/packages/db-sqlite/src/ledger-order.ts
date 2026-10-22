// The ONE ordering rule for ledger rows (migration 008). Rows made before migration 008 have seq = NULL and come first, in rowid order
// (the order they always had). Rows made after it have a seq and follow in seq order. rowid is only the last tie-break.
// Never ORDER BY rowid alone on ledger_entries: a row that reaches this file from another device could land between local ones.

/** ORDER BY terms for ledger_entries, unqualified (a query on ledger_entries alone). */
export const LEDGER_ORDER = '(seq IS NOT NULL), seq, rowid';

/** The same terms for a query that aliases ledger_entries as `l`. */
export const LEDGER_ORDER_L = '(l.seq IS NOT NULL), l.seq, l.rowid';

/** A row's position in that order, as the three bound values of LEDGER_BEFORE / LEDGER_UPTO. */
export interface LedgerPosition {
  has_seq: number;
  seq: number;
  rowid: number;
}

/** SELECT list that gives the position of a ledger row (use with `.get(...)`). */
export const LEDGER_POSITION_SQL = 'SELECT (seq IS NOT NULL) AS has_seq, COALESCE(seq, 0) AS seq, rowid AS rowid FROM ledger_entries';

/** WHERE term: the row comes strictly before the position (bind has_seq, seq, rowid). */
export const LEDGER_BEFORE = '((seq IS NOT NULL), COALESCE(seq, 0), rowid) < (?, ?, ?)';

/** WHERE term: the row is at or before the position (bind has_seq, seq, rowid). */
export const LEDGER_UPTO = '((seq IS NOT NULL), COALESCE(seq, 0), rowid) <= (?, ?, ?)';

export const positionArgs = (p: LedgerPosition): [number, number, number] => [p.has_seq, p.seq, p.rowid];
