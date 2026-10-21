import { formatPaisa } from '@pos/core';
import type { Language } from '@pos/api-contract';
import { ltr } from '../../i18n/index.js';

/** The left-to-right isolate marks taken out: text with Urdu WORDS in it ("9 پیک اور 750 کھلا", "15 اگست 2028") must follow the right-to-left order, or it comes out scrambled. */
export const withoutIsolates = (text: string): string => text.replace(/[⁦-⁩]/g, '');

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const dash = '—';

/** 1700 basis points is "17%", 250 is "2.5%". */
export const formatTaxRate = (basisPoints: number): string => `${NUMBER.format(basisPoints / 100)}%`;

/** "Rs 190 – 500" for a range, "Rs 190" when every size costs the same, a dash when there are no sizes. */
export function formatRange(min: number | null, max: number | null, language: Language): string {
  if (min === null || max === null) return dash;
  const text = min === max ? formatPaisa(min) : `${formatPaisa(min)} – ${formatPaisa(max).replace(/^Rs\s*/, '')}`;
  return language === 'ur' ? ltr(text) : text;
}
