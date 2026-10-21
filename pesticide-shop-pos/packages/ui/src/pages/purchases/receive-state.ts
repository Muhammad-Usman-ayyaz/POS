// The Receive stock form, without any React: what is typed (text), what is checked, where a batch number clashes with one that
// already exists (or with another line), and the exact request that is sent. Pure, so the rules that matter can be tested alone.
import { parseQuantity, priceForQty, type BaseUnitCode } from '@pos/core';
import { parseRupees } from '../products/product-form-state.js';

export { parseRupees, rupeesText } from '../products/product-form-state.js';

export interface ExistingBatch {
  batch_no: string;
  expiry_date: string;
  /** Paisa per pack. */
  cost_price: number;
}

/** One line of the receipt: a size that arrived, with the batch it becomes. Numbers are text while typing. */
export interface LineDraft {
  key: string;
  productId: string;
  nameEn: string | null;
  nameUr: string | null;
  /** Base units per pack. The size is shown from this and `baseUnit` (the units module derives the "0.5 L" text). */
  packSize: number;
  /** The stored unit of the size: its quantity is typed in kg, L or pieces. */
  baseUnit: BaseUnitCode;
  /** True for a size that is sold loose: it can also be received as an amount in kg or L. */
  allowLoose: boolean;
  /** What `packs` holds: a whole number of packs (default), or an amount in kg / L / pieces (loose sizes only). */
  by: 'packs' | 'amount';
  batchNo: string;
  /** YYYY-MM-DD as typed, or ''. */
  expiry: string;
  /** Whole packs, or an amount in kg / L when `by` is 'amount', as typed. */
  packs: string;
  /** Rupees per pack, as typed. */
  cost: string;
}

let counter = 0;
export const newLineKey = (): string => `line-${(counter += 1)}`;

// ---------- parsing ----------

/** A real calendar date, YYYY-MM-DD. */
export function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Whole packs above zero. */
export function parsePacks(text: string): number | null {
  const match = /^\d{1,7}$/.exec(text.trim());
  const n = match ? Number(match[0]) : NaN;
  return n > 0 ? n : null;
}

/** The quantity of a line in BASE units (what is stored and sent): packs times the pack size, or the amount typed in kg / L through the units module. null when it is not valid. */
export function lineQty(line: Pick<LineDraft, 'packs' | 'by' | 'packSize' | 'baseUnit'>): number | null {
  if (line.by === 'packs') {
    const packs = parsePacks(line.packs);
    return packs === null ? null : packs * line.packSize;
  }
  const parsed = parseQuantity(line.baseUnit, line.packs);
  return parsed.ok ? parsed.value : null;
}

/** Today as the shell counts it (the UTC date), so "refuse a future date" agrees with the shell. */
export const todayText = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

// ---------- checking one line ----------

export type LineProblem = 'batchRequired' | 'expiryInvalid' | 'packsInvalid' | 'amountInvalid' | 'costInvalid';
export type LineProblems = Partial<Record<'batchNo' | 'expiry' | 'packs' | 'cost', LineProblem>>;

export function checkLine(line: LineDraft): LineProblems {
  const p: LineProblems = {};
  if (line.batchNo.trim() === '') p.batchNo = 'batchRequired';
  if (!isIsoDate(line.expiry)) p.expiry = 'expiryInvalid';
  if (lineQty(line) === null) p.packs = line.by === 'packs' ? 'packsInvalid' : 'amountInvalid';
  if (parseRupees(line.cost) === null) p.cost = 'costInvalid';
  return p;
}

// ---------- clashes ----------

export type Clash =
  /** The batch number exists for this size with a different expiry (and the same cost): the existing expiry may be used. */
  | { kind: 'expiry'; batchNo: string; existingExpiry: string; typedExpiry: string }
  /** The batch number exists with a different cost: only a new batch number will do (a cost is never rewritten). */
  | { kind: 'cost'; batchNo: string; existingCost: number; typedCost: number }
  /** The same batch number for the same size is on another line of this receipt. */
  | { kind: 'duplicate'; batchNo: string };

/**
 * Where each line's batch number clashes. `existing` holds the batches each product already has (every one, empty ones too).
 * A line is only judged once its batch number and the values to compare are valid. Different cost comes before different expiry,
 * the same order the shell uses, so the screen offers what the shell would accept.
 */
export function findClashes(lines: readonly LineDraft[], existing: Readonly<Record<string, readonly ExistingBatch[]>>): Record<string, Clash | null> {
  const result: Record<string, Clash | null> = {};
  const seen = new Set<string>();
  for (const line of lines) {
    const batchNo = line.batchNo.trim();
    result[line.key] = null;
    if (batchNo === '') continue;
    const id = `${line.productId}\u0000${batchNo}`;
    if (seen.has(id)) {
      result[line.key] = { kind: 'duplicate', batchNo };
      continue;
    }
    seen.add(id);
    const found = (existing[line.productId] ?? []).find((b) => b.batch_no === batchNo);
    if (!found) continue;
    const typedCost = parseRupees(line.cost);
    if (typedCost !== null && typedCost !== found.cost_price) {
      result[line.key] = { kind: 'cost', batchNo, existingCost: found.cost_price, typedCost };
    } else if (typedCost !== null && isIsoDate(line.expiry) && line.expiry.trim() !== found.expiry_date) {
      result[line.key] = { kind: 'expiry', batchNo, existingExpiry: found.expiry_date, typedExpiry: line.expiry.trim() };
    }
  }
  return result;
}

/**
 * The next batch number that is free: "B-014" becomes "B-015" (same width), "LOT7" becomes "LOT8", and a number with no digits at the
 * end gets "-2". `taken` holds every number already used for this size (existing batches and other lines).
 */
export function nextFreeBatchNo(batchNo: string, taken: ReadonlySet<string>): string {
  const base = batchNo.trim();
  const match = /^(.*?)(\d+)$/.exec(base);
  const next = (n: number): string => (match ? `${match[1]}${String(n).padStart(match[2]!.length, '0')}` : `${base}-${n}`);
  let n = match ? Number(match[2]) + 1 : 2;
  while (taken.has(next(n))) n += 1;
  return next(n);
}

/** Every batch number the size already has, plus the ones typed on the other lines for it. */
export function takenBatchNumbers(line: LineDraft, lines: readonly LineDraft[], existing: Readonly<Record<string, readonly ExistingBatch[]>>): Set<string> {
  const taken = new Set((existing[line.productId] ?? []).map((b) => b.batch_no));
  for (const other of lines) if (other.key !== line.key && other.productId === line.productId && other.batchNo.trim() !== '') taken.add(other.batchNo.trim());
  return taken;
}

// ---------- totals and the request ----------

export interface Totals {
  lines: number;
  packs: number;
  /** Paisa. Lines that are not valid yet count as 0. */
  cost: number;
}

/** What one line costs: the quantity at the cost per pack, rounded once with the shared integer helper, in paisa. 0 until both are valid. */
export function lineTotal(line: LineDraft): number {
  const qty = lineQty(line);
  const cost = parseRupees(line.cost);
  return qty === null || cost === null ? 0 : priceForQty(qty, cost, line.packSize);
}

export function totalsOf(lines: readonly LineDraft[]): Totals {
  return {
    lines: lines.length,
    packs: lines.reduce((sum, l) => sum + (l.by === 'packs' ? (parsePacks(l.packs) ?? 0) : 0), 0),
    cost: lines.reduce((sum, l) => sum + lineTotal(l), 0),
  };
}

export interface ReceiveHeader {
  supplierId: string;
  invoiceNo: string;
  /** YYYY-MM-DD. */
  date: string;
}

export type HeaderProblem = 'supplier' | 'dateInvalid' | 'dateFuture';

export function checkHeader(header: ReceiveHeader, today: string): HeaderProblem | null {
  if (header.supplierId === '') return 'supplier';
  if (!isIsoDate(header.date)) return 'dateInvalid';
  if (header.date.trim() > today) return 'dateFuture';
  return null;
}

export interface ReceiveRequest {
  supplier_id: string;
  supplier_invoice_no?: string;
  purchase_date: string;
  confirm_old_date?: true;
  items: { product_id: string; batch_no: string; expiry_date: string; qty: number; cost_price: number }[];
}

/**
 * The call to the shell. Packs become BASE UNITS (packs times the pack size): 12 packs of a 1000 ml bottle is 12000 ml. The cost stays
 * per pack, in paisa. Call only when every line and the header are valid and no batch number clashes.
 */
export function buildReceiveRequest(header: ReceiveHeader, lines: readonly LineDraft[], confirmedOldDate: boolean): ReceiveRequest {
  const invoice = header.invoiceNo.trim();
  return {
    supplier_id: header.supplierId,
    ...(invoice === '' ? {} : { supplier_invoice_no: invoice }),
    purchase_date: header.date.trim(),
    ...(confirmedOldDate ? { confirm_old_date: true as const } : {}),
    items: lines.map((l) => ({
      product_id: l.productId,
      batch_no: l.batchNo.trim(),
      expiry_date: l.expiry.trim(),
      qty: lineQty(l) as number,
      cost_price: parseRupees(l.cost) as number,
    })),
  };
}

/** Why Receive is off, in the order the person should fix things. Null when it can be pressed. */
export type Blocker = 'noLines' | 'header' | 'fix' | 'clash' | 'loading';

export function blockerOf(args: { lines: readonly LineDraft[]; header: HeaderProblem | null; clashes: Readonly<Record<string, Clash | null>>; loadedProducts: ReadonlySet<string> }): Blocker | null {
  if (args.lines.length === 0) return 'noLines';
  if (args.header !== null) return 'header';
  if (args.lines.some((l) => Object.keys(checkLine(l)).length > 0)) return 'fix';
  if (args.lines.some((l) => args.clashes[l.key] != null)) return 'clash';
  if (args.lines.some((l) => !args.loadedProducts.has(l.productId))) return 'loading';
  return null;
}
