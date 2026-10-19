// The CSV a statement is exported as (Phase 6 M6). Pure: it takes the statement document data (the shell's figures) and returns text.
//
//  - UTF-8 with a byte order mark, so Excel reads Urdu notes and names as Urdu (without it Excel assumes the PC's ANSI code page).
//  - Rows end in CRLF (what Excel writes), cells with a comma, quote, CR or LF are quoted and their quotes doubled (RFC 4180).
//  - Text a person typed (reference, note) that starts with = + - @ (or a tab or CR) gets a single quote put in front, so a spreadsheet shows it as text and never runs it as a formula ("CSV injection"). Amounts are written by us and are exact
//    decimal text built from whole paisa (no floating point): 125050 paisa is `1250.50`, 500000 is `5000`. A negative balance (an advance) is `-500`.
//  - Nothing is worked out here: owes more, owes less, running balance and closing balance are the shell's figures. No cost anywhere.

import type { StatementDocumentData } from '@pos/core';
import { dayText, lineReference, lineType } from './khata-format.js';
import { KHATA_LABELS } from './khata-labels.js';

export const CSV_BOM = '﻿';

/** Whole paisa as exact rupee text: 500000 -> "5000", 125050 -> "1250.50", -50000 -> "-500". Integer maths only. */
export function rupeesText(paisa: number): string {
  if (!Number.isSafeInteger(paisa)) throw new Error('an amount must be a whole number of paisa');
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const rupees = Math.trunc(abs / 100);
  const rem = abs % 100;
  return `${sign}${rupees}${rem === 0 ? '' : `.${String(rem).padStart(2, '0')}`}`;
}

/** Text typed by a person is never allowed to start a formula. */
export function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** One cell, quoted when it has to be. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const row = (cells: string[]): string => cells.map(csvCell).join(',');

export const STATEMENT_CSV_HEADER = ['Date', 'Type', 'Reference', 'Receipt no', 'Note', 'Owes more (Rs)', 'Owes less (Rs)', 'Balance (Rs)'] as const;

export function statementCsv(data: StatementDocumentData): string {
  const t = KHATA_LABELS.en;
  const lines: string[] = [row([...STATEMENT_CSV_HEADER])];
  for (const line of data.lines) {
    if (line.kind === 'brought_forward') {
      lines.push(row(['', t.types.brought_forward, '', '', '', '', '', rupeesText(line.running_balance)]));
      continue;
    }
    lines.push(
      row([
        line.date ? dayText(line.date, data.time_zone) : '',
        lineType(line, t),
        safeText(lineReference(line)),
        // the receipt number of a payment that also has its own reference ("TRX 88213") is kept in its own column
        safeText(line.reference_no && line.receipt_no ? line.receipt_no : ''),
        safeText(line.note ?? ''),
        line.amount_delta > 0 ? rupeesText(line.amount_delta) : '',
        line.amount_delta < 0 ? rupeesText(-line.amount_delta) : '',
        rupeesText(line.running_balance),
      ]),
    );
  }
  lines.push(row(['', t.totals, '', '', '', rupeesText(data.totals.owes_more), rupeesText(data.totals.owes_less), rupeesText(data.closing_balance)]));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** A file name for the save box: "Statement - Rashid Ali - 2026-10-12.csv". Only characters a file name may hold. */
export function statementFileName(data: StatementDocumentData, today: string): string {
  const name = (data.customer.name_en || data.customer.name_ur || 'customer').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'customer';
  return `Statement - ${name} - ${today}.csv`;
}
