import { DomainError } from '../errors.js';

// Money is integer paisa everywhere. Format to "Rs 1,250" only at the display edge.

function assertSafe(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new DomainError('INVALID_MONEY', `${what} is not a safe integer: ${n}`);
}

/**
 * Integer division rounded to the nearest whole number, halves away from zero (same as SQLite ROUND).
 * Uses the remainder, not floating division, so it is exact for every safe integer.
 */
export function roundDiv(n: number, d: number): number {
  assertSafe(n, 'numerator');
  if (!Number.isSafeInteger(d) || d <= 0) throw new DomainError('INVALID_MONEY', `divisor must be a positive integer: ${d}`);
  const abs = Math.abs(n);
  let q = (abs - (abs % d)) / d;
  if ((abs % d) * 2 >= d) q += 1;
  return n < 0 ? -q : q;
}

/** `a * b` that refuses to silently lose precision. */
export function mul(a: number, b: number): number {
  const product = a * b;
  assertSafe(product, `${a} * ${b}`);
  return product;
}

/** Price of `qty` base units when `unitPrice` is per pack of `packSize`. Rounded once. */
export function priceForQty(qty: number, unitPrice: number, packSize: number): number {
  return roundDiv(mul(qty, unitPrice), packSize);
}

/** Tax on an amount. `rateBp` is basis points: 1800 is 18 percent. Rounded once. */
export function taxOn(amount: number, rateBp: number): number {
  return roundDiv(mul(amount, rateBp), 10_000);
}

/**
 * Splits `total` across `weights` so the shares add up to exactly `total`.
 * Rounds the running total, not each share, so no paisa is lost or invented.
 */
export function splitProportional(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (total !== 0) throw new DomainError('INVALID_MONEY', 'cannot split a non-zero amount across zero weight');
    return weights.map(() => 0);
  }
  let running = 0;
  let previous = 0;
  return weights.map((w) => {
    running += w;
    const cumulative = roundDiv(mul(total, running), sum);
    const share = cumulative - previous;
    previous = cumulative;
    return share;
  });
}

/** 125000 paisa -> "Rs 1,250". Shows paisa only when there are some: "Rs 1,250.50". */
export function formatPaisa(paisa: number): string {
  assertSafe(paisa, 'amount');
  const abs = Math.abs(paisa);
  const rupees = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rem = abs % 100;
  const decimals = rem === 0 ? '' : `.${rem.toString().padStart(2, '0')}`;
  return `${paisa < 0 ? '-' : ''}Rs ${rupees}${decimals}`;
}

/** "1,250.5" typed in a rupee field -> 125050 paisa. Rejects anything that is not a plain amount. */
export function parseRupees(text: string): number {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new DomainError('INVALID_MONEY', `not a valid amount: "${text}"`);
  const [rupees = '0', fraction = ''] = cleaned.split('.');
  return mul(Number(rupees), 100) + Number(fraction.padEnd(2, '0'));
}
