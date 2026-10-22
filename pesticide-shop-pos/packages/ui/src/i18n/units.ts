// The unit WORDS for the screen, and the one-line helpers every screen calls to show a quantity. All the arithmetic lives in
// packages/core/src/units.ts (the only converter); this file only picks the words for the language and keeps numbers left to right in Urdu.

import {
  displayUnitOf,
  formatPaisa,
  legacyLabelToDisplay,
  packLabel,
  parseQuantity,
  pricePerUnit,
  quantityParts,
  splitPacks,
  unitWord,
  type BaseUnitCode,
  type DisplayUnit,
  type QuantityError,
  type UnitWords,
} from '@pos/core';
import type { Language } from '@pos/api-contract';
import { ltr } from './format.js';
import type { Messages } from './messages/en.js';

export type { BaseUnitCode, DisplayUnit };

export const wordsOf = (m: Pick<Messages, 'units'>): UnitWords => m.units.words;

/** "1.5 kg", "3 L", "2 pieces". In Urdu the number is isolated so it stays left to right: "⁦1.5⁩ کلو". */
export function qtyText(m: Pick<Messages, 'units'>, language: Language, base: BaseUnitCode, qty: number): string {
  const { value, unit } = quantityParts(base, qty, wordsOf(m));
  return language === 'ur' ? `${ltr(value)} ${unit}` : `${value} ${unit}`;
}

/** The size of a pack from its pack size ("0.5 L", "250 pieces"); '' for a single piece. The stored label text is never used. */
export function packText(m: Pick<Messages, 'units'>, language: Language, base: BaseUnitCode, packSize: number): string {
  const label = packLabel(base, packSize, wordsOf(m));
  if (label === '') return '';
  return language === 'ur' ? label.replace(/^(\S+)/, (num) => ltr(num)) : label;
}

/** The unit word on its own: "kg", "L", "piece". */
export const unitName = (m: Pick<Messages, 'units'>, base: BaseUnitCode, n = 2): string => unitWord(displayUnitOf(base), n, wordsOf(m));

/** "Rs 450 / kg" from the price of one pack. */
export function perUnitPriceText(m: Pick<Messages, 'units'>, language: Language, base: BaseUnitCode, packSize: number, packPrice: number): string {
  const { paisa, unit } = pricePerUnit(base, packSize, packPrice);
  const text = `${formatPaisa(paisa)} / ${unitWord(unit, 1, wordsOf(m))}`;
  return language === 'ur' ? ltr(formatPaisa(paisa)) + ` / ${unitWord(unit, 1, wordsOf(m))}` : text;
}

/** Old text that still has "500 ml" or "250 g" in it (a sale-time name, a stored label), shown in kg and L in the language on screen. */
export const legacyText = (m: Pick<Messages, 'units'>, text: string): string => legacyLabelToDisplay(text, { kg: m.units.words.kg, L: m.units.words.L });

/** The sentence for a quantity that could not be read (an error from `parseQuantity`). */
export function quantityProblem(m: Pick<Messages, 'units'>, error: QuantityError): string {
  const p = m.units.problem;
  return error.code === 'TOO_MANY_DECIMALS' ? p.TOO_MANY_DECIMALS(error.maxDecimals ?? 0) : p[error.code];
}

/** Reads typed text in a unit; the number, or the sentence to show. */
export function readQuantity(m: Pick<Messages, 'units'>, base: BaseUnitCode, text: string, allowZero = false): { ok: true; value: number } | { ok: false; message: string } {
  const r = parseQuantity(base, text, { allowZero });
  return r.ok ? r : { ok: false, message: quantityProblem(m, r.error) };
}

/**
 * Stock or a quantity said the way the shop says it: "3 packs", "0.25 kg", "2 packs and 0.25 kg", "5 pieces". A single-unit size
 * (pack size 1) is just the quantity in its unit. The numbers come from the units module.
 */
export function stockText(m: Pick<Messages, 'units'>, language: Language, base: BaseUnitCode, packSize: number, qty: number): string {
  if (packSize <= 1) return qtyText(m, language, base, qty);
  const { packs, rest } = splitPacks(qty, packSize);
  const packText = `${language === 'ur' ? ltr(String(packs)) : String(packs)} ${packs === 1 ? m.units.pack : m.units.packs}`;
  if (packs === 0) return qtyText(m, language, base, rest);
  return rest === 0 ? packText : `${packText} ${m.units.and} ${qtyText(m, language, base, rest)}`;
}
