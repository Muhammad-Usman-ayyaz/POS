import { formatPaisa } from '@pos/core';
import type { Language } from '@pos/api-contract';
import { ltr, type Messages } from '../../i18n/index.js';

/** The left-to-right isolate marks taken out: text with Urdu WORDS in it ("9 پیک اور 750 کھلا", "15 اگست 2028") must follow the right-to-left order, or it comes out scrambled. */
export const withoutIsolates = (text: string): string => text.replace(/[⁦-⁩]/g, '');

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const dash = '—';

/** A product's whole stock in the unit a shopkeeper counts it in: 35,000 ml is "35 L", 9,750 g is "9.75 kg", pieces stay pieces. */
export function formatTotal(qty: number, unit: 'ml' | 'g' | 'piece' | null, m: Messages['products']): string {
  if (unit === 'ml') return `${NUMBER.format(qty / 1000)} ${m.unitLitres}`;
  if (unit === 'g') return `${NUMBER.format(qty / 1000)} ${m.unitKg}`;
  return `${NUMBER.format(qty)} ${m.unitPieces(qty)}`;
}

/** The minimum stock of a size, which is stored in base units, as a number of packs: 5000 ml of a 1000 ml pack is "5". */
export const minInPacks = (minStock: number, packSize: number): string => NUMBER.format(minStock / packSize);

/** 1700 basis points is "17%", 250 is "2.5%". */
export const formatTaxRate = (basisPoints: number): string => `${NUMBER.format(basisPoints / 100)}%`;

/** "Rs 190 – 500" for a range, "Rs 190" when every size costs the same, a dash when there are no sizes. */
export function formatRange(min: number | null, max: number | null, language: Language): string {
  if (min === null || max === null) return dash;
  const text = min === max ? formatPaisa(min) : `${formatPaisa(min)} – ${formatPaisa(max).replace(/^Rs\s*/, '')}`;
  return language === 'ur' ? ltr(text) : text;
}
