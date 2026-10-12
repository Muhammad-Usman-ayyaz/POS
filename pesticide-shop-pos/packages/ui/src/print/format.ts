// How the numbers on a document are said. Pure functions of the document data.

import { formatPaisa, type DocumentLanguage, type DocumentLine, type DocumentUnit, type InvoiceDocumentData } from '@pos/core';
import { formatDate } from '../i18n/format.js';
import { LABELS } from './labels.js';

export const money = (paisa: number): string => formatPaisa(paisa);

/** "− Rs 50" (a true minus sign, U+2212, as designed) for a discount line. */
export const minusMoney = (paisa: number): string => `− ${formatPaisa(paisa)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "12 Oct 2026, 10:42" in the shop's time zone, with Latin digits and English month names in both languages (as in the approved designs). */
export function formatDateTime(isoUtc: string, timeZone: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const month = MONTHS[Number(get('month')) - 1] ?? get('month');
  return `${Number(get('day'))} ${month} ${get('year')}, ${get('hour')}:${get('minute')}`;
}

export const formatDueDate = (isoDate: string): string => formatDate(isoDate, 'en');

/** `1.5` not `1.500`: up to three decimals, trailing zeros dropped. */
function trimmed(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** An amount of a base unit: 250 g, 1.5 kg, 500 ml, 2 L, 3 pc. Urdu uses the Urdu unit words. */
export function quantityText(qty: number, unit: DocumentUnit, language: DocumentLanguage): string {
  const labels = LABELS[language];
  if (unit !== 'piece' && qty >= 1000) return `${trimmed(qty / 1000)} ${labels.bigUnits[unit]}`;
  return `${qty} ${labels.units[unit]}`;
}

/** The unit a pack is priced per, after the slash: "/kg" for a 1000 g pack, "/500 ml" for a 500 ml pack. */
function perPackText(line: DocumentLine, language: DocumentLanguage): string {
  const labels = LABELS[language];
  if (line.base_unit !== 'piece' && line.pack_size === 1000) return labels.bigUnits[line.base_unit];
  if (line.pack_size === 1) return labels.perUnit[line.base_unit];
  return `${line.pack_size} ${labels.perUnit[line.base_unit]}`;
}

/** A line sold in whole packs ("2 × Rs 500") or loose ("250 g × Rs 200/kg"). */
export interface LineQuantity {
  loose: boolean;
  /** Whole packs when sealed, else null. */
  packs: number | null;
  /** "2" when sealed, "250 g" when loose. */
  qtyText: string;
  /** "Rs 500" when sealed, "Rs 200/kg" when loose. */
  rateText: string;
}

export function lineQuantity(line: DocumentLine, language: DocumentLanguage): LineQuantity {
  const loose = line.pack_size > 1 && line.qty % line.pack_size !== 0;
  if (!loose) {
    const packs = line.qty / line.pack_size;
    return { loose: false, packs, qtyText: String(packs), rateText: money(line.unit_price) };
  }
  return { loose: true, packs: null, qtyText: quantityText(line.qty, line.base_unit, language), rateText: `${money(line.unit_price)}/${perPackText(line, language)}` };
}

/** The name as it was when sold, in the language of the document (the other language when that one is missing). */
export function lineName(line: Pick<DocumentLine, 'name_en' | 'name_ur'>, language: DocumentLanguage): string {
  const first = language === 'ur' ? line.name_ur : line.name_en;
  const second = language === 'ur' ? line.name_en : line.name_ur;
  return first?.trim() || second?.trim() || '';
}

/** "Rashid · Chak 12": the customer's name, then the village. null for a walk-in sale. */
export function customerText(data: Pick<InvoiceDocumentData, 'customer'>, language: DocumentLanguage): string | null {
  if (!data.customer) return null;
  const name = lineName(data.customer, language);
  const village = data.customer.village?.trim();
  return [name, village].filter(Boolean).join(' · ') || null;
}

/** The shop's name for this language: the Urdu spelling when there is one, otherwise the one real name. */
export function shopName(data: Pick<InvoiceDocumentData, 'shop'>, language: DocumentLanguage): string {
  return language === 'ur' && data.shop.name_ur ? data.shop.name_ur : data.shop.name;
}

/** Address and phone, or null: then the document prints the marked placeholder. */
export function addressText(data: Pick<InvoiceDocumentData, 'shop'>): string | null {
  const parts = [data.shop.address, data.shop.phone].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** What the lines add up to before discounts (the receipt shows the discounts together, on one line). */
export const grossOf = (line: DocumentLine): number => line.line_total + line.line_discount;
export const totalDiscount = (data: Pick<InvoiceDocumentData, 'lines'>): number => data.lines.reduce((sum, line) => sum + line.line_discount, 0);
