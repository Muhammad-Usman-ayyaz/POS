// THE ONLY PLACE THAT CONVERTS UNITS.
//
// The shop thinks in kg (weight), L (volume) and pieces (counted things). The database stores whole numbers in the smallest unit: grams,
// millilitres and pieces ("base units"). Nothing stored ever changes. Every screen, receipt, report, CSV and print that shows or reads a
// quantity goes through this file; no other code may multiply or divide by 1000, or write a base-unit code ('g', 'ml') as visible text.
//
//   1 kg = 1000 g      1 L = 1000 ml      1 piece = 1 piece
//
// DISPLAY RULE (decided for the "standard units" change; recorded in docs/decisions.md and docs/design-system.md):
//   * A quantity is shown as a plain decimal number in the standard unit, then the unit word: "0.25 kg", "0.5 L", "1.5 kg", "3 pieces".
//   * Up to 3 decimals (that is exactly 1 g or 1 ml), trailing zeros are dropped ("1.5" not "1.500", "2" not "2.000"), no thousands
//     separator ("1000 kg"). The same rule everywhere: a quantity is NEVER shown as g or ml, even when it is small (1 g is "0.001 kg").
//   * Typed quantities follow the same grammar, read STRICTLY (see `parseQuantity`).
//   * Prices are per standard unit: "Rs 450 / kg".
// The unit WORDS (kg, L, piece/pieces, and the Urdu names) come from the caller (the i18n messages), so this file stays pure and has no text
// of its own except `ENGLISH_UNIT_WORDS`, a default for code that has no messages (tests, CSV headers).

import { DomainError } from './errors.js';
import { formatPaisa, mul, roundDiv } from './money/index.js';

/** What is stored: grams, millilitres or pieces. */
export type BaseUnitCode = 'g' | 'ml' | 'piece';
/** What people see and type: kilograms, litres or pieces. */
export type DisplayUnit = 'kg' | 'L' | 'piece';

export const BASE_UNIT_CODES: readonly BaseUnitCode[] = ['g', 'ml', 'piece'];
export const DISPLAY_UNITS: readonly DisplayUnit[] = ['kg', 'L', 'piece'];

/** Base units in one display unit. */
const FACTOR: Record<BaseUnitCode, number> = { g: 1000, ml: 1000, piece: 1 };
/** Decimals the display unit allows: 3 for kg and L (down to 1 g / 1 ml), none for pieces. */
const DECIMALS: Record<BaseUnitCode, number> = { g: 3, ml: 3, piece: 0 };

/** Largest quantity accepted from the keyboard, in base units (100,000 kg / 100,000 L / 100 million pieces). */
export const MAX_BASE_QTY = 100_000_000;

export const isBaseUnit = (value: unknown): value is BaseUnitCode => value === 'g' || value === 'ml' || value === 'piece';

/** The unit people see for a stored base unit: 'g' is kg, 'ml' is L, 'piece' stays piece. */
export function displayUnitOf(base: BaseUnitCode): DisplayUnit {
  return base === 'g' ? 'kg' : base === 'ml' ? 'L' : 'piece';
}

/** The base unit stored for a unit chosen on a form: kg is 'g', L is 'ml', piece is 'piece'. */
export function baseUnitOf(unit: DisplayUnit): BaseUnitCode {
  return unit === 'kg' ? 'g' : unit === 'L' ? 'ml' : 'piece';
}

/** How many decimals a quantity in this unit may have when typed (3 for kg and L, 0 for pieces). */
export const maxDecimals = (base: BaseUnitCode): number => DECIMALS[base];

/** Base units in one display unit (1000 for kg and L, 1 for pieces). Needed by code that must scale (a stepper, a price per unit); never to print. */
export const baseUnitsPerDisplayUnit = (base: BaseUnitCode): number => FACTOR[base];

// ---------- words ----------

/** The words for the units, in one language. Pieces have a singular and a plural; kg and L do not change. */
export interface UnitWords {
  kg: string;
  L: string;
  piece: { one: string; other: string };
}

/** Used where there are no messages (tests, CSV headers). Screens and documents pass their own language's words. */
export const ENGLISH_UNIT_WORDS: UnitWords = { kg: 'kg', L: 'L', piece: { one: 'piece', other: 'pieces' } };

/** The word for a unit, for the count `n` (matters only for pieces: "1 piece", "2 pieces"). */
export function unitWord(unit: DisplayUnit, n: number, words: UnitWords = ENGLISH_UNIT_WORDS): string {
  if (unit === 'piece') return n === 1 ? words.piece.one : words.piece.other;
  return words[unit];
}

// ---------- base -> text ----------

/** The number of display units in a base quantity, as exact text: 250 g is "0.25", 1500 g is "1.5", 1 g is "0.001", 3 pieces is "3". Negative numbers keep their sign. */
export function formatNumber(base: BaseUnitCode, qty: number): string {
  if (!Number.isSafeInteger(qty)) throw new DomainError('INVALID_QUANTITY', `a quantity must be a whole number of base units: ${qty}`);
  const sign = qty < 0 ? '-' : '';
  const abs = Math.abs(qty);
  const factor = FACTOR[base];
  if (factor === 1) return `${sign}${abs}`;
  const whole = (abs - (abs % factor)) / factor;
  const rest = abs % factor;
  if (rest === 0) return `${sign}${whole}`;
  const fraction = String(rest).padStart(3, '0').replace(/0+$/, '');
  return `${sign}${whole}.${fraction}`;
}

/** A quantity in two pieces, for layouts that style the number and the unit apart. */
export function quantityParts(base: BaseUnitCode, qty: number, words: UnitWords = ENGLISH_UNIT_WORDS): { value: string; unit: string } {
  return { value: formatNumber(base, qty), unit: unitWord(displayUnitOf(base), qty === 1 && base === 'piece' ? 1 : 2, words) };
}

/** "1.5 kg", "3 L", "1 piece", "2 pieces". */
export function quantityLabel(base: BaseUnitCode, qty: number, words: UnitWords = ENGLISH_UNIT_WORDS): string {
  const { value, unit } = quantityParts(base, qty, words);
  return `${value} ${unit}`;
}

/**
 * The size of one pack, derived from the pack size and the base unit: 500 ml is "0.5 L", 250 g is "0.25 kg", a box of 10 pieces is "10 pieces".
 * A single piece (pack size 1) has no size label: it returns ''. The stored `pack_label` text is not used for display any more.
 */
export function packLabel(base: BaseUnitCode, packSize: number, words: UnitWords = ENGLISH_UNIT_WORDS): string {
  if (base === 'piece' && packSize === 1) return '';
  return quantityLabel(base, packSize, words);
}

/** The label stored in `products.pack_label` for NEW sizes: the derived English label ("0.5 L"). Old rows keep their old text and are never shown. */
export const storedPackLabel = (base: BaseUnitCode, packSize: number): string => packLabel(base, packSize, ENGLISH_UNIT_WORDS);

/** Whole packs and what is left over, from a base quantity: 2500 ml of 1000 ml packs is 2 packs and 500 ml. */
export function splitPacks(qty: number, packSize: number): { packs: number; rest: number } {
  const size = Math.max(1, packSize);
  const rest = qty % size;
  return { packs: (qty - rest) / size, rest };
}

// ---------- text -> base (strict) ----------

export type QuantityErrorCode = 'EMPTY' | 'NOT_A_NUMBER' | 'NEGATIVE' | 'ZERO' | 'TOO_MANY_DECIMALS' | 'TOO_LARGE';

export interface QuantityError {
  code: QuantityErrorCode;
  /** For TOO_MANY_DECIMALS: how many the unit allows (3 for kg and L, 0 for pieces). */
  maxDecimals?: number;
}

export type QuantityParse = { ok: true; value: number } | { ok: false; error: QuantityError };

export interface ParseOptions {
  /** Accept 0 (a minimum stock of none). Default: false, a quantity must be more than nothing. */
  allowZero?: boolean;
}

/**
 * Reads a typed quantity in the display unit and returns the base-unit integer. STRICT: it never guesses and never rounds.
 *   accepted: "2", "2.5", "0.25", "0.5", ".5" (a leading dot is accepted, it can only mean 0.5), "007" (leading zeros), spaces around the text.
 *   refused:  "" or only spaces (EMPTY); "2..5", "2,5", "1e3", "5.", "2 kg", "abc", "+2", "1 000" (NOT_A_NUMBER); "-2" (NEGATIVE);
 *             "0", "0.0", ".0" (ZERO, unless allowZero); more decimals than the unit allows: "0.2501" for kg, "2.5" for pieces (TOO_MANY_DECIMALS);
 *             more than MAX_BASE_QTY (TOO_LARGE).
 * A trailing dot ("5.") is refused because it is usually a half-typed number.
 */
export function parseQuantity(base: BaseUnitCode, text: string, options: ParseOptions = {}): QuantityParse {
  const fail = (code: QuantityErrorCode, extra: Partial<QuantityError> = {}): QuantityParse => ({ ok: false, error: { code, ...extra } });
  const trimmed = text.trim();
  if (trimmed === '') return fail('EMPTY');
  if (/^-\s*\.?\d/.test(trimmed)) return fail('NEGATIVE');
  const match = /^(\d*)(?:\.(\d+))?$/.exec(trimmed);
  if (!match || (match[1] === '' && match[2] === undefined)) return fail('NOT_A_NUMBER');
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (fraction.length > DECIMALS[base]) return fail('TOO_MANY_DECIMALS', { maxDecimals: DECIMALS[base] });
  if (whole.length > 12) return fail('TOO_LARGE');
  const factor = FACTOR[base];
  const value = mul(Number(whole === '' ? '0' : whole), factor) + (factor === 1 ? 0 : Number(fraction.padEnd(3, '0')));
  if (value === 0 && !options.allowZero) return fail('ZERO');
  if (value > MAX_BASE_QTY) return fail('TOO_LARGE');
  return { ok: true, value };
}

/** The base-unit integer for a typed quantity, or null when it is not acceptable (the screen then shows the error from `parseQuantity`). */
export function quantityFromText(base: BaseUnitCode, text: string, options: ParseOptions = {}): number | null {
  const parsed = parseQuantity(base, text, options);
  return parsed.ok ? parsed.value : null;
}

// ---------- steppers ----------

/** How far one press of + or - moves a LOOSE quantity: 0.5 kg, 0.1 L or 1 piece, in base units. */
export function looseStep(base: BaseUnitCode): number {
  return base === 'g' ? 500 : base === 'ml' ? 100 : 1;
}

// ---------- prices ----------

/**
 * The price of one display unit (one kg, one L, one piece) from the price of a pack: Rs 225 for a 500 ml pack is Rs 450 per L. Integer paisa,
 * rounded once with the shared integer helper (halves up), never with floating point.
 */
export function pricePerUnit(base: BaseUnitCode, packSize: number, packPricePaisa: number): { paisa: number; unit: DisplayUnit } {
  if (!Number.isSafeInteger(packSize) || packSize <= 0) throw new DomainError('INVALID_QUANTITY', `a pack size must be a positive whole number: ${packSize}`);
  return { paisa: roundDiv(mul(packPricePaisa, FACTOR[base]), packSize), unit: displayUnitOf(base) };
}

/** "Rs 450 / kg", "Rs 120 / piece". */
export function pricePerUnitLabel(base: BaseUnitCode, packSize: number, packPricePaisa: number, words: UnitWords = ENGLISH_UNIT_WORDS): string {
  const { paisa, unit } = pricePerUnit(base, packSize, packPricePaisa);
  return `${formatPaisa(paisa)} / ${unitWord(unit, 1, words)}`;
}

// ---------- reading unit names (CSV import, forms) ----------

/** "kg", "KG", "kilo", "L", "litre", "liter", "piece", "pcs", "pc", "each" -> the display unit; null when it is none of them. Never 'g' or 'ml' (those are not offered). */
export function displayUnitFromText(text: string): DisplayUnit | null {
  const t = text.trim().toLowerCase();
  if (t === 'kg' || t === 'kilo' || t === 'kgs' || t === 'kilogram' || t === 'kilograms') return 'kg';
  if (t === 'l' || t === 'ltr' || t === 'litre' || t === 'litres' || t === 'liter' || t === 'liters') return 'L';
  if (t === 'piece' || t === 'pieces' || t === 'pc' || t === 'pcs' || t === 'each') return 'piece';
  return null;
}

// ---------- old text ----------

/** `12.5` as exact text moved three places left ("12.5" -> "0.0125"), no floating point. Input is plain digits with an optional fraction. */
function shiftThousandth(whole: string, fraction: string): string {
  const digits = (whole.replace(/^0+(?=\d)/, '') + fraction).padStart(4 + fraction.length, '0');
  const point = digits.length - fraction.length - 3;
  const left = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  const right = (digits.slice(point) ).replace(/0+$/, '');
  return right === '' ? left : `${left}.${right}`;
}

const LEGACY_AMOUNT = /(?<![\p{L}\p{N}.])(\d+)(?:\.(\d+))?(\s?)(ml|mL|ML|Ml|gms?|grams?|g|ملی\s?لیٹر|گرام)(?![\p{L}\p{N}])/gu;

/**
 * OLD TEXT ONLY. Stock used to be labelled in grams and millilitres, and some of that text was copied into history: the sale-time name of an
 * invoice line ("Insecticide X 500 ml") and the stored `pack_label`. Rows are never rewritten, so documents and screens pass that old text
 * through here once: every "<number> ml|g|gm|gram(s)" becomes the same amount in L or kg ("500 ml" -> "0.5 L", "250 g" -> "0.25 kg", "1500 g" -> "1.5 kg"),
 * and the Urdu words for them become لیٹر and کلو. Amounts already in kg or L, and text with no amount, are returned unchanged. The arithmetic is on the
 * digits, not floating point. A unit word with no number in front of it is left alone (there is nothing to convert).
 */
export function legacyLabelToDisplay(text: string, words?: Pick<UnitWords, 'kg' | 'L'>): string {
  return text.replace(LEGACY_AMOUNT, (_all, whole: string, fraction: string | undefined, space: string, unit: string) => {
    const isVolume = /^m/i.test(unit) || unit.startsWith('ملی');
    const number = shiftThousandth(whole, fraction ?? '');
    const urdu = unit === 'گرام' || unit.startsWith('ملی');
    const word = urdu ? (isVolume ? 'لیٹر' : 'کلو') : isVolume ? 'L' : 'kg';
    const shown = words ? (isVolume ? words.L : words.kg) : word;
    return `${number}${space === '' ? ' ' : space}${shown}`;
  });
}
