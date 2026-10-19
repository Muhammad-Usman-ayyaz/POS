// How the statement and payment receipt say things. Pure functions of the document data. NO arithmetic on balances: a balance is shown as the shell
// gave it (the only operation is taking the size of a negative number to print it as "Advance Rs X": the sign is words, never "Owes Rs -X").

import { formatPaisa, type DocumentLanguage, type StatementDocumentCustomer, type StatementDocumentLine } from '@pos/core';
import { KHATA_LABELS, type KhataDocumentLabels } from './khata-labels.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "01 Oct 2026" (or "01 Oct") of a stored UTC moment, in the shop's time zone: Latin digits, English month, two-digit day as in the design. */
export function dayText(isoUtc: string, timeZone: string, withYear = true): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: '2-digit' }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const month = MONTHS[Number(get('month')) - 1] ?? get('month');
  return withYear ? `${get('day')} ${month} ${get('year')}` : `${get('day')} ${month}`;
}

/** "01 Oct 2026" of a `YYYY-MM-DD` day typed in a range box (no time zone: it is already a calendar day). */
export function calendarDayText(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export type BalanceKind = 'owes' | 'advance' | 'clear';

/** A balance in words: plus owes, minus is an advance (shown as a size, never with a minus sign), zero is clear. */
export function balanceParts(paisa: number): { kind: BalanceKind; amount: string } {
  if (paisa > 0) return { kind: 'owes', amount: formatPaisa(paisa) };
  if (paisa < 0) return { kind: 'advance', amount: formatPaisa(-paisa) };
  return { kind: 'clear', amount: formatPaisa(0) };
}

/** The label for the closing line: "He owes", "Advance" or "Clear". */
export const balanceLabel = (kind: BalanceKind, t: KhataDocumentLabels): string => (kind === 'owes' ? t.heOwes : kind === 'advance' ? t.advance : t.clear);

/** "Bal 4,000" / "Adv 500" on the 80 mm slip (the design has no "Rs" there). */
export function shortBalance(paisa: number, t: KhataDocumentLabels): string {
  const { kind, amount } = balanceParts(paisa);
  return `${kind === 'advance' ? t.advShort : t.balShort} ${amount.replace(/^Rs /, '')}`;
}

/** The balance column on A4: "Rs 9,000", "Advance Rs 500" (never "Rs -500"). */
export function columnBalance(paisa: number, t: KhataDocumentLabels): string {
  const { kind, amount } = balanceParts(paisa);
  return kind === 'advance' ? `${t.advance} ${amount}` : amount;
}

/** The reference of a line as the design shows it: the invoice, return or receipt number; a bank or wallet payment shows its own reference. */
export function lineReference(line: StatementDocumentLine): string {
  if (line.invoice_no) return line.invoice_no;
  if (line.return_no) return line.return_no;
  return line.reference_no || line.receipt_no || '';
}

/** "Payment · Cash" for a payment, the type word for anything else. */
export function lineType(line: StatementDocumentLine, t: KhataDocumentLabels): string {
  const base = t.types[line.label];
  return line.label === 'payment' && line.payment_method ? `${base} · ${t.methods[line.payment_method]}` : base;
}

/** The part of a statement line a person reads on the first line of the 80 mm slip: "Sale INV-A-000001", "Payment · Cash RCP-A-000001". */
export function lineDescription(line: StatementDocumentLine, t: KhataDocumentLabels): string {
  return [lineType(line, t), lineReference(line)].filter(Boolean).join(' ');
}

/** The money of one line as the design writes it on the slip: "+ Rs 5,000" (owes more) or "- Rs 2,000" (owes less). */
export function signedMoney(paisa: number): string {
  return paisa < 0 ? `- ${formatPaisa(-paisa)}` : `+ ${formatPaisa(paisa)}`;
}

/** "01 Oct to 12 Oct 2026", "From 01 Oct 2026", "Up to 12 Oct 2026" or "All entries". */
export function rangeText(from: string | null, to: string | null, language: DocumentLanguage): string {
  const t = KHATA_LABELS[language];
  if (from && to) return t.rangeBoth(calendarDayText(from), calendarDayText(to));
  if (from) return t.rangeFrom(calendarDayText(from));
  if (to) return t.rangeTo(calendarDayText(to));
  return t.rangeAll;
}

export function customerLine(customer: StatementDocumentCustomer, language: DocumentLanguage): string {
  const first = language === 'ur' ? customer.name_ur : customer.name_en;
  const second = language === 'ur' ? customer.name_en : customer.name_ur;
  const name = first?.trim() || second?.trim() || '';
  return [name, customer.village?.trim()].filter(Boolean).join(' · ');
}
