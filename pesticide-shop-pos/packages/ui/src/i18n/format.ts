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

const WORDS = {
  en: { pack: 'pack', packs: 'packs', loose: 'loose', and: 'and' },
  ur: { pack: 'پیک', packs: 'پیک', loose: 'کھلا', and: 'اور' },
} as const;

/**
 * A quantity in base units, said the way a shopkeeper says it: "3 packs", "250 loose", "2 packs and 250 loose".
 * A product sold by the piece (pack size 1) is just a number.
 */
export function formatQty(qty: number, packSize: number, language: Language = 'en'): string {
  const w = WORDS[language];
  const text = (() => {
    if (packSize <= 1) return String(qty);
    const packs = Math.floor(qty / packSize);
    const rest = qty - packs * packSize;
    const packText = `${packs} ${packs === 1 ? w.pack : w.packs}`;
    if (packs === 0) return `${rest} ${w.loose}`;
    return rest === 0 ? packText : `${packText} ${w.and} ${rest} ${w.loose}`;
  })();
  return language === 'ur' ? ltr(text) : text;
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
} as const;

/** `2026-11-30` to "30 Nov 2026" or "30 نومبر 2026". Latin digits in both, as in the designs. */
export function formatDate(isoDate: string, language: Language = 'en'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const month = MONTHS[language][Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : isoDate;
}
