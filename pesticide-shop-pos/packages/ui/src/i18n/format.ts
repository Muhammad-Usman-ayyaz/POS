import { formatPaisa } from '@pos/core';
import type { Language } from '@pos/api-contract';

/**
 * Keeps a number, amount or date left to right when it sits inside Urdu text that is built as a plain string
 * (a toast, an error message). Plain strings cannot carry the .num class, so we wrap them in the Unicode
 * "left-to-right isolate" marks instead. In JSX, use the <Num> component.
 */
export const ltr = (text: string): string => `⁦${text}⁩`;

/** Paisa to "Rs 1,250". The same in both languages: the designs keep "Rs" and Latin digits in Urdu too. */
export function formatMoney(paisa: number, language: Language = 'en'): string {
  const text = formatPaisa(paisa);
  return language === 'ur' ? ltr(text) : text;
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
} as const;

/**
 * Decided with the owner's brief: Urdu mode shows English month names and Latin digits, as the approved design does, so no
 * month is mistranslated. Whether the owner wants Urdu month names is a question in docs/urdu-review.md; to switch, set this to true.
 */
const URDU_MONTH_NAMES = false;

/** `2026-11-30` to "30 Nov 2026" in both languages (see URDU_MONTH_NAMES). Latin digits, as in the designs. */
export function formatDate(isoDate: string, language: Language = 'en'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const month = MONTHS[URDU_MONTH_NAMES ? language : 'en'][Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : isoDate;
}
