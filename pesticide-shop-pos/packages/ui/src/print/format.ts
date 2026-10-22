// How the numbers on a document are said. Pure functions of the document data.

import { formatPaisa, legacyLabelToDisplay, pricePerUnit, quantityLabel, unitWord, type DocumentLanguage, type DocumentLine, type DocumentUnit, type InvoiceDocumentData } from '@pos/core';
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

/** An amount of a base unit in the standard unit: 0.25 kg, 1.5 kg, 0.5 L, 2 L, 3 pieces. Urdu uses the Urdu unit words. Done by the units module. */
export function quantityText(qty: number, unit: DocumentUnit, language: DocumentLanguage): string {
  return quantityLabel(unit, qty, LABELS[language].units);
}

/** A line sold in whole packs ("2 packs" at "Rs 500/pack") or loose ("1.5 kg" at "Rs 450/kg"). */
export interface LineQuantity {
  loose: boolean;
  /** Whole packs when sealed, else null. */
  packs: number | null;
  /** "2 packs" or "3 pieces" when sealed, "1.5 kg" when loose. */
  qtyText: string;
  /** "Rs 500/pack" when sealed, "Rs 450/kg" when loose (the price of one kg, L or piece, worked out in integer paisa by the units module). */
  rateText: string;
}

export function lineQuantity(line: Pick<DocumentLine, 'qty' | 'pack_size' | 'base_unit' | 'unit_price'>, language: DocumentLanguage): LineQuantity {
  const labels = LABELS[language];
  const loose = line.pack_size > 1 && line.qty % line.pack_size !== 0;
  if (!loose) {
    const packs = line.qty / line.pack_size;
    // A pack of one piece (or of a single unit) is said in its unit; a bigger pack is said in packs.
    if (line.pack_size === 1) {
      const per = pricePerUnit(line.base_unit, 1, line.unit_price);
      return { loose: false, packs, qtyText: quantityLabel(line.base_unit, line.qty, labels.units), rateText: `${money(per.paisa)}/${unitWord(per.unit, 1, labels.units)}` };
    }
    return { loose: false, packs, qtyText: `${packs} ${packs === 1 ? labels.pack : labels.packs}`, rateText: `${money(line.unit_price)}/${labels.pack}` };
  }
  const per = pricePerUnit(line.base_unit, line.pack_size, line.unit_price);
  return { loose: true, packs: null, qtyText: quantityText(line.qty, line.base_unit, language), rateText: `${money(per.paisa)}/${unitWord(per.unit, 1, labels.units)}` };
}

/** Old text that still carries the old small units (a sale-time name) shown in kg and L, in the words of the document language. */
export const legacyOf = (text: string, language: DocumentLanguage): string => legacyLabelToDisplay(text, { kg: LABELS[language].units.kg, L: LABELS[language].units.L });

/** The name as it was when sold, in the language of the document (the other language when that one is missing). */
export function lineName(line: Pick<DocumentLine, 'name_en' | 'name_ur'>, language: DocumentLanguage): string {
  const first = language === 'ur' ? line.name_ur : line.name_en;
  const second = language === 'ur' ? line.name_en : line.name_ur;
  return legacyOf(first?.trim() || second?.trim() || '', language);
}

/** "Rashid · Chak 12": the customer's name, then the village. null for a walk-in sale. */
export function customerText(data: { customer: Pick<NonNullable<InvoiceDocumentData['customer']>, 'name_en' | 'name_ur' | 'village'> | null }, language: DocumentLanguage): string | null {
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
