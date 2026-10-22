// Development tool, not part of the app: `npm run check:pdf` makes the 80 mm receipt and the A4 invoice in Urdu with Electron's REAL printToPDF
// (the same driver the app prints with), then reads the PDFs back with pdf.js (a devDependency, used only here) and checks
//   (a) the text layer: every Urdu string is in the PDF as shaped, right-to-left text; Latin runs ("1 L", "Rs 1,200") are in reading order; the Urdu font is Noto Naskh;
//   (b) the picture: each page is drawn to a PNG, saved next to the PDF, to LOOK at (a person must; a program cannot tell "joined" from "almost joined").
// It never runs unless POS_PDF_CHECK_DIR is set, and it is compiled in only by the special dev-tools build (see electron.vite.config.ts).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { baseUnitOf, type InvoiceDocumentData, type PaymentReceiptData, type StatementDocumentData, type StatementDocumentLine } from '@pos/core';
import { findCostLeaks, PAGE, renderDocumentHtml, renderPaymentReceiptHtml, renderStatementHtml } from '@pos/ui/print';
import { createElectronPrintDriver } from './printing/electron-driver.js';
import { documentFonts } from './printing/fonts.js';

// The stored unit codes come from the units module (the only place that names them).
const VOLUME = baseUnitOf('L');
const WEIGHT = baseUnitOf('kg');

/** Urdu is real text on purpose: a customer, three products whose Urdu names end in a Latin size ("1 L"), and amounts with a thousands comma. */
export function urduSale(kind: 'receipt' | 'invoice'): InvoiceDocumentData {
  return {
    kind,
    invoice: {
      id: '11111111-1111-4111-8111-111111111111', invoice_no: 'INV-A-000007', invoice_date: '2026-10-12T05:42:00.000Z', due_date: '2026-11-30', status: 'active',
      payment_method: 'cash', price_type: 'retail', subtotal: 330_000, tax_total: 18_000, total: 360_000, paid_amount: 200_000, on_khata: 160_000,
    },
    customer: { name_en: 'Muhammad Rashid', name_ur: 'محمد راشد', village: 'چک 12' },
    customer_id: '22222222-2222-4222-8222-222222222222',
    sold_by: 'Owner',
    lines: [
      { position: 1, name_en: 'Insecticide X 1 L', name_ur: 'کیڑے مار دوا ایکس 1 L', batch_no: 'B-001', qty: 1000, base_unit: VOLUME, pack_size: 1000, unit_price: 120_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 10_900, line_total: 120_000 },
      { position: 2, name_en: 'DAP Fertilizer 50 kg', name_ur: 'کھاد ڈی اے پی 50 kg', batch_no: 'F-001', qty: 1, base_unit: 'piece', pack_size: 1, unit_price: 200_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 200_000 },
      { position: 3, name_en: 'Fungicide 0.25 L', name_ur: 'پھپھوندی کش 0.25 L', batch_no: 'FG-014', qty: 250, base_unit: VOLUME, pack_size: 250, unit_price: 40_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 3_600, line_total: 40_000 },
    ],
    shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
    balance_as_of_sale: 160_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
  };
}

/**
 * The sample sale drawn in the design files (`docs/design/Receipts80.dc.html`, `InvoiceA4.dc.html`): the same lines, amounts and wording, so the
 * built page can be put next to the design. A loose sale of fertilizer, a discount, tax inside the price, part paid, the rest on Khata.
 */
export function designSale(kind: 'receipt' | 'invoice', language: 'en' | 'ur', overrides: Partial<InvoiceDocumentData> = {}): InvoiceDocumentData {
  const ur = language === 'ur';
  return {
    kind,
    invoice: {
      id: '33333333-3333-4333-8333-333333333333', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', due_date: '2026-11-30', status: 'active',
      payment_method: 'cash', price_type: 'retail', subtotal: 195_900, tax_total: 9_100, total: 205_000, paid_amount: 100_000, on_khata: 105_000,
    },
    customer: { name_en: 'Rashid', name_ur: 'راشد', village: ur ? 'چک 12' : 'Chak 12' },
    customer_id: '44444444-4444-4444-8444-444444444444',
    sold_by: 'Owner',
    lines: [
      { position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', qty: 2, base_unit: 'piece', pack_size: 1, unit_price: 50_000, line_discount: 0, tax_rate_bp: 500, tax_amount: 4_800, line_total: 100_000 },
      { position: 2, name_en: 'Fertilizer', name_ur: 'کھاد', batch_no: 'F-001', qty: 250, base_unit: WEIGHT, pack_size: 1000, unit_price: 20_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 5_000 },
      { position: 3, name_en: 'Fungicide 0.25 L', name_ur: 'پھپھوندی کش 0.25 لیٹر', batch_no: 'FG-014', qty: 3, base_unit: 'piece', pack_size: 1, unit_price: 35_000, line_discount: 5_000, tax_rate_bp: 500, tax_amount: 4_300, line_total: 100_000 },
    ],
    shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
    balance_as_of_sale: 305_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
    ...overrides,
  };
}

/** A cost no price in the shop looks like: 76,543.21 rupees. */
const COST_SENTINEL = 7_654_321;

/** Everything the page script reports back for one PDF. */
export interface PdfReport {
  pages: number;
  /** pdf.js text items in the order the PDF stores them, with where each one sits on the page (points from the left edge, from the bottom edge). */
  items: { str: string; dir: string; x: number; y: number; width: number }[];
  /** All items joined, one line per text row. */
  text: string;
  /** The text of each page on its own (page 1 first): to tell which page a row is on. */
  pageTexts: string[];
  /** Each page drawn at `scale` pixels per CSS pixel (3 unless asked), as a PNG data address. */
  pngs: string[];
}

/** Runs inside the hidden window: pdf.js reads the bytes the local server gives it, lists text and fonts, and draws each page. */
const READ_PDF = (scale: number) => `(async () => {
  const pdfjs = await import('./pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await fetch('./doc.pdf')).arrayBuffer()), useSystemFonts: false }).promise;
  const out = { pages: doc.numPages, items: [], text: '', pngs: [], pageTexts: [] };
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let line = '';
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      out.items.push({ str: it.str, dir: it.dir, x: it.transform[4], y: it.transform[5], width: it.width });
      line += it.str;
      if (it.hasEOL) { line += '\\n'; }
    }
    out.text += line + '\\n';
    out.pageTexts.push(line);
    const canvas = document.createElement('canvas');
    const viewport = page.getViewport({ scale: ${scale} * 96 / 72 });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
    out.pngs.push(canvas.toDataURL('image/png'));
  }
  return out;
})()`;

export async function readPdf(pdf: Uint8Array, pdfjsBuildDir: string, workDir: string, scale = 3): Promise<PdfReport> {
  // pdf.js is a module script and starts a worker: both load from a file address, so the page, pdf.js and the PDF sit in one folder.
  mkdirSync(workDir, { recursive: true });
  for (const name of ['pdf.mjs', 'pdf.worker.mjs']) copyFileSync(join(pdfjsBuildDir, name), join(workDir, name));
  writeFileSync(join(workDir, 'doc.pdf'), pdf);
  writeFileSync(join(workDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>pdf</title>');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false } });
  try {
    await win.loadFile(join(workDir, 'index.html'));
    return (await win.webContents.executeJavaScript(READ_PDF(scale), true)) as PdfReport;
  } finally {
    win.destroy();
  }
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string | undefined;
}

/** Arabic Presentation Forms-A and -B: what the text layer holds for a letter that was SHAPED (isolated, initial, medial or final form). Unshaped text would hold the plain letters U+0600 to U+06FF only. */
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/g;
const BIDI_MARKS = /[​-‏‪-‮⁦-⁩]/g;
const isArabicScript = (s: string): boolean => /[؀-ۿﭐ-﷿ﹰ-﻿]/.test(s);

/** Presentation forms back to the plain letters (NFKC), no spaces, no direction marks, no NUL: to compare shaped text with the Urdu the page was written in. */
const plain = (s: string): string => s.normalize('NFKC').replace(BIDI_MARKS, '').replace(/[\u0000\s]/g, '');
const reversed = (s: string): string => [...s].reverse().join('');

/**
 * The font names the PDF carries. A PDF keeps them as plain text (`/FontName /AAAAAA+Noto-Naskh-Arabic`), so no PDF library is needed. Chromium embeds a variable
 * font such as Noto Naskh Arabic as glyph drawings ("Type 3") named after the font; the Plex fonts are real TrueType subsets.
 */
export function pdfFontNames(pdf: Uint8Array): string[] {
  const names = new Set<string>();
  for (const m of Buffer.from(pdf).toString('latin1').matchAll(/\/FontName\s*\/([A-Z]{6}\+[^\s/>\]]+)/g)) names.add((m[1] ?? '').replace(/^[A-Z]{6}\+/, ''));
  return [...names].sort();
}

/** The text of a PDF as the command-line tool `pdftotext` (xpdf or poppler) reads it, or null when the tool is not installed. It reads the letters back in reading order. */
export function pdftotext(pdfPath: string): string | null {
  const run = spawnSync('pdftotext', ['-enc', 'UTF-8', pdfPath, '-'], { encoding: 'utf8' });
  return run.status === 0 ? run.stdout : null;
}

export interface Expected {
  /** Urdu strings that must be in the text layer (spaces do not matter: a text extractor may add or drop them inside a word). */
  urdu: string[];
  /** Latin runs that must appear whole, in reading order. */
  latin: string[];
}

/** The text-layer checks on what pdf.js reads (always available). `latinAfterUrdu` pairs a Latin run with the Urdu name it ends. */
export function checkPdfJsText(label: string, report: PdfReport, expected: Expected, latinAfterUrdu: [string, string][]): Check[] {
  const checks: Check[] = [];
  const flat = report.text.replace(/\u0000/g, '');
  const forms = flat.match(PRESENTATION_FORMS)?.length ?? 0;
  const plainLetters = flat.match(/[؀-ۿ]/g)?.length ?? 0;
  checks.push({ name: `${label}: Urdu letters are SHAPED (contextual forms in the text layer)`, ok: forms >= 50 && forms > plainLetters, detail: `${forms} contextual-form letters, ${plainLetters} unshaped` });
  const joined = report.text.replace(/\s+/g, ' ');
  for (const run of expected.latin) checks.push({ name: `${label}: Latin run "${run}" is whole and in order`, ok: joined.includes(run), detail: joined.includes(run) ? undefined : 'not found' });
  checks.push({ name: `${label}: no flipped Latin runs ("L 1", "L 0.25", "kg 50")`, ok: !/\bL 1\b|\bL 0\.25\b|\bkg 50\b/.test(joined) });
  // Where things sit on the line: in a right-to-left line, a Latin run that ends the name stands to the LEFT of the Urdu words (they run from the right edge).
  for (const [latin, urduWord] of latinAfterUrdu) {
    const latinItem = report.items.find((i) => i.str.trim() === latin);
    const urduItems = latinItem ? report.items.filter((i) => Math.abs(i.y - latinItem.y) < 2 && isArabicScript(i.str) && i.x > latinItem.x - 1) : [];
    const ok = !!latinItem && urduItems.length > 0 && urduItems.every((i) => i.x >= latinItem.x + latinItem.width - 1);
    checks.push({ name: `${label}: "${latin}" stands left of the Urdu name "${urduWord}" on its line (Urdu runs from the right)`, ok, detail: latinItem ? `${latin} at x=${latinItem.x.toFixed(0)}..${(latinItem.x + latinItem.width).toFixed(0)}, ${urduItems.length} Urdu glyph runs to its right` : 'run not found' });
  }
  return checks;
}

/** The text-layer checks on what pdftotext reads: the Urdu strings, whole and in logical order. */
export function checkReadingOrder(label: string, text: string, expected: Expected): Check[] {
  const flat = plain(text);
  return expected.urdu.map((word) => {
    const w = plain(word);
    const ok = flat.includes(w);
    return { name: `${label}: Urdu "${word}" reads back whole, joined letters in the right order`, ok, detail: ok ? undefined : flat.includes(reversed(w)) ? 'found REVERSED' : 'not found' };
  });
}


// ---------- Phase 6 M6: the customer statement (80 mm and A4) and the payment receipt, English and Urdu ----------

const statementLine = (_n: number, label: StatementDocumentLine['label'], date: string, delta: number, running: number, extra: Partial<StatementDocumentLine> = {}): StatementDocumentLine => ({
  kind: 'entry', label, date, amount_delta: delta, running_balance: running, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null, ...extra,
});

/** The statement of docs/design/CustomerForms.dc.html section 4, with an Urdu customer, an Urdu note and Latin references that sit inside Urdu text. */
export function urduStatement(kind: 'receipt' | 'invoice'): StatementDocumentData {
  return {
    kind,
    shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
    customer: { name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'چک 12', phone: '0300 1234567' },
    from: null,
    to: null,
    lines: [
      statementLine(1, 'opening', '2026-10-01T07:00:00.000Z', 400_000, 400_000),
      statementLine(2, 'sale', '2026-10-02T07:00:00.000Z', 500_000, 900_000, { invoice_no: 'INV-A-000001' }),
      statementLine(3, 'payment', '2026-10-02T08:00:00.000Z', -200_000, 700_000, { payment_method: 'cash', receipt_no: 'RCP-A-000001', note: 'کپاس کی فصل کے بعد' }),
      statementLine(4, 'return', '2026-10-02T09:00:00.000Z', -100_000, 600_000, { return_no: 'RET-A-000001' }),
      statementLine(5, 'payment', '2026-10-07T07:00:00.000Z', -150_000, 450_000, { payment_method: 'bank', reference_no: 'TRX 88213', receipt_no: 'RCP-A-000002' }),
      statementLine(6, 'sale', '2026-10-09T07:00:00.000Z', 450_000, 900_000, { invoice_no: 'INV-A-000009' }),
    ],
    brought_forward: 0,
    totals: { owes_more: 1_350_000, owes_less: 450_000 },
    closing_balance: 900_000,
    credit_limit: 1_000_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
  };
}

/** A long A4 statement: every row has a note under its type, so a row has two lines and could be split by a page break. */
export function longStatement(rows: number): StatementDocumentData {
  const lines: StatementLine[] = [];
  let running = 0;
  for (let i = 1; i <= rows; i++) {
    const sale = i % 3 !== 0;
    const delta = sale ? 100_000 + i * 100 : -(50_000 + i * 100);
    running += delta;
    lines.push(statementLine(i, sale ? 'sale' : 'payment', '2026-10-02T07:00:00.000Z', delta, running, sale ? { invoice_no: `INV-A-${String(i).padStart(6, '0')}`, note: `NOTE-${String(i).padStart(3, '0')}` } : { payment_method: 'cash', receipt_no: `RCP-A-${String(i).padStart(6, '0')}`, note: `NOTE-${String(i).padStart(3, '0')}` }));
  }
  return { ...urduStatement('invoice'), lines, totals: { owes_more: 1, owes_less: 1 }, closing_balance: running };
}
type StatementLine = StatementDocumentLine;

export function urduPaymentReceipt(): PaymentReceiptData {
  return {
    shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
    customer: { name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'چک 12', phone: null },
    payment: { id: '55555555-5555-4555-8555-555555555555', receipt_no: 'RCP-A-000001', paid_at: '2026-10-12T05:42:00.000Z', method: 'easypaisa', reference_no: 'EP-48210937', note: 'دکان پر بیٹے نے ادا کیے', amount: 500_000 },
    balance_after: 400_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
  };
}

const KHATA_URDU = ['راشد علی', 'پیسٹیسائیڈ کلب شاپ', 'ابتدائی بقایا', 'فروخت', 'ادائیگی', 'واپسی کا کریڈٹ', 'ان کے ذمے', 'کپاس کی فصل کے بعد'];
const KHATA_LATIN = ['INV-A-000001', 'RCP-A-000001', 'RET-A-000001', 'TRX 88213', 'Rs 9,000', 'Rs 10,000', '01 Oct'];
const RECEIPT_URDU = ['راشد علی', 'پیسٹیسائیڈ کلب شاپ', 'ادائیگی کی رسید', 'وصول کنندہ از', 'ایزی پیسہ', 'وصول شدہ رقم', 'اس کے بعد بقایا', 'ان کے ذمے', 'دکان پر بیٹے نے ادا کیے'];
const RECEIPT_LATIN = ['RCP-A-000001', 'EP-48210937', 'Rs 5,000', 'Rs 4,000', '12 Oct 2026, 10:42'];

/** Prints each new document to a real PDF, reads it back, and checks: Urdu joined and right to left, Latin runs whole, fonts, no cost, and A4 pagination without a split row. */
async function runKhataChecks(driver: ReturnType<typeof createElectronPrintDriver>, outDir: string, pdfjsBuildDir: string, checks: Check[]): Promise<void> {
  const receiptPage = { widthMm: PAGE.receipt.widthMm, heightMm: PAGE.receipt.heightMm };
  const a4Page = { widthMm: PAGE.invoice.widthMm, heightMm: PAGE.invoice.heightMm };
  const docs: { label: string; file: string; language: 'en' | 'ur'; html: string; page: { widthMm: number; heightMm: number | null }; urdu: string[]; latin: string[]; sample: unknown }[] = [];
  for (const language of ['en', 'ur'] as const) {
    docs.push({ label: `statement 80 mm (${language})`, file: `statement-80mm-${language}`, language, html: renderStatementHtml(urduStatement('receipt'), language, documentFonts), page: receiptPage, urdu: KHATA_URDU.filter((s) => s !== 'کپاس کی فصل کے بعد'), latin: KHATA_LATIN, sample: urduStatement('receipt') });
    docs.push({ label: `statement A4 (${language})`, file: `statement-a4-${language}`, language, html: renderStatementHtml(urduStatement('invoice'), language, documentFonts), page: a4Page, urdu: KHATA_URDU, latin: KHATA_LATIN.filter((s) => s !== '01 Oct'), sample: urduStatement('invoice') });
    docs.push({ label: `payment receipt (${language})`, file: `payment-receipt-${language}`, language, html: renderPaymentReceiptHtml(urduPaymentReceipt(), language, documentFonts), page: receiptPage, urdu: RECEIPT_URDU, latin: RECEIPT_LATIN, sample: urduPaymentReceipt() });
  }
  for (const d of docs) {
    const label = d.label;
    const pdf = await driver.toPdf(d.html, { page: d.page });
    const pdfPath = join(outDir, `${d.file}.pdf`);
    writeFileSync(pdfPath, pdf);
    const report = await readPdf(pdf, pdfjsBuildDir, join(outDir, '.reader'), 2);
    report.pngs.forEach((png, i) => writeFileSync(join(outDir, `${d.file}${i === 0 ? '' : ` page ${i + 1}`}.png`), Buffer.from(png.split(',')[1] ?? '', 'base64')));
    checks.push({ name: `${label}: one PDF page`, ok: report.pages === 1, detail: `${report.pages} page(s)` });
    const fonts = pdfFontNames(pdf);
    checks.push({ name: `${label}: embedded fonts are only Noto Naskh Arabic and IBM Plex Sans`, ok: fonts.length > 0 && fonts.every((f) => /Naskh|Plex/i.test(f)), detail: fonts.join(', ') });
    const flat = report.text.replace(/\s+/g, ' ');
    for (const run of d.latin) checks.push({ name: `${label}: "${run}" is whole and in order`, ok: flat.includes(run), detail: flat.includes(run) ? undefined : 'not found' });
    checks.push({ name: `${label}: no flipped Latin runs ("88213 TRX", "000001-A-INV", "Oct 01")`, ok: !/88213 TRX|000001-A-INV|000001-A-RCP|\bOct 0?[1-9]\b(?! 2026)/.test(flat) });
    const text = pdftotext(pdfPath);
    if (d.language === 'ur') {
      const forms = report.text.match(PRESENTATION_FORMS)?.length ?? 0;
      checks.push({ name: `${label}: Urdu letters are SHAPED (contextual forms in the text layer)`, ok: forms >= 40, detail: `${forms} contextual-form letters` });
      if (text !== null) checks.push(...checkReadingOrder(label, text, { urdu: d.urdu, latin: [] }));
    }
    // No cost: the same document, but its data carries a cost on everything (a field that must never be printed).
    const dirty = d.sample as Record<string, unknown>;
    const withCost = { ...dirty, cost_total: COST_SENTINEL, profit: COST_SENTINEL, cost: COST_SENTINEL, margin: COST_SENTINEL, ...(Array.isArray(dirty['lines']) ? { lines: (dirty['lines'] as object[]).map((l) => ({ ...l, cost_price: COST_SENTINEL, margin: COST_SENTINEL })) } : {}) };
    const costHtml = d.file.startsWith('payment') ? renderPaymentReceiptHtml(withCost as unknown as PaymentReceiptData, d.language, documentFonts) : renderStatementHtml(withCost as unknown as StatementDocumentData, d.language, documentFonts);
    const costPdf = await driver.toPdf(costHtml, { page: d.page });
    const costPath = join(outDir, `${d.file}-costscan.pdf`);
    writeFileSync(costPath, costPdf);
    const costReport = await readPdf(costPdf, pdfjsBuildDir, join(outDir, '.reader'), 1);
    const costText = pdftotext(costPath);
    const leaks = [...findCostLeaks(costReport.text, COST_SENTINEL), ...(costText === null ? [] : findCostLeaks(costText, COST_SENTINEL))];
    checks.push({ name: `${label}: no cost, margin or profit in the PDF text layer (sentinel ${COST_SENTINEL} paisa in the data)`, ok: leaks.length === 0, detail: leaks.length ? leaks.join(', ') : 'pdf.js and pdftotext text' });
  }

  // Urdu direction: in a right-to-left line the first word sits at the right edge. The customer's Urdu name and the label "Received from" (Urdu) are on the right of their amounts.
  {
    const html = renderPaymentReceiptHtml(urduPaymentReceipt(), 'ur', documentFonts);
    const report = await readPdf(await driver.toPdf(html, { page: receiptPage }), pdfjsBuildDir, join(outDir, '.reader'), 1);
    const amount = report.items.find((i) => i.str.trim() === 'Rs 5,000');
    const label = report.items.find((i) => /^\s*[\u0600-\u06FF\uFB50-\uFEFF]/.test(i.str) && amount && Math.abs(i.y - amount.y) < 2 && i.x > amount.x);
    checks.push({ name: 'payment receipt (ur): right to left, the label stands to the RIGHT of its amount on the same line', ok: !!amount && !!label, detail: amount ? `amount at x=${amount.x.toFixed(0)}, ${label ? 'label at x=' + label.x.toFixed(0) : 'no label to its right'}` : 'amount not found' });
  }

  // A long A4 statement: several pages, the column heads on every page, no row split (a row's reference, its note and its balance are on ONE page), totals and closing on the last page.
  for (const language of ['en', 'ur'] as const) {
    const rows = 90;
    const data = longStatement(rows);
    const label = `long A4 statement (${language}, ${rows} rows)`;
    const pdf = await driver.toPdf(renderStatementHtml(data, language, documentFonts), { page: a4Page });
    writeFileSync(join(outDir, `statement-a4-long-${language}.pdf`), pdf);
    const report = await readPdf(pdf, pdfjsBuildDir, join(outDir, '.reader'), 1);
    report.pngs.forEach((png, i) => writeFileSync(join(outDir, `statement-a4-long-${language} page ${i + 1}.png`), Buffer.from(png.split(',')[1] ?? '', 'base64')));
    checks.push({ name: `${label}: runs over several pages`, ok: report.pages >= 2, detail: `${report.pages} pages` });
    const heads = language === 'en' ? 'Owes more' : 'بقایا بڑھا';
    // Urdu in pdf.js comes in visual order; pdftotext reads it in logical order, one page per form feed.
    const viaTool = pdftotext(join(outDir, `statement-a4-long-${language}.pdf`));
    const readable = language === 'ur' && viaTool !== null ? viaTool.split('\f').filter((p, i, all) => p.trim() !== '' || i < all.length - 1) : report.pageTexts;
    const headCounts = readable.map((t) => (plain(t).includes(plain(heads)) ? 1 : 0));
    checks.push({ name: `${label}: the column heads repeat on every page`, ok: headCounts.every((n) => n >= 1), detail: headCounts.join(',') });
    const split: string[] = [];
    for (let i = 1; i <= rows; i++) {
      const ref = i % 3 !== 0 ? `INV-A-${String(i).padStart(6, '0')}` : `RCP-A-${String(i).padStart(6, '0')}`;
      const note = `NOTE-${String(i).padStart(3, '0')}`;
      const pageOf = (needle: string): number => report.pageTexts.findIndex((t) => t.includes(needle));
      const a = pageOf(ref);
      const b = pageOf(note);
      if (a === -1 || b === -1 || a !== b) split.push(`row ${i} (ref page ${a + 1}, note page ${b + 1})`);
    }
    checks.push({ name: `${label}: every row is whole on one page (reference and note together), and every row is present`, ok: split.length === 0, detail: split.slice(0, 5).join('; ') || undefined });
    const last = readable[readable.length - 1] ?? '';
    checks.push({ name: `${label}: totals and the closing balance are on the last page`, ok: plain(last).includes(plain(language === 'en' ? 'Totals' : 'میزان')) && plain(last).includes(plain(language === 'en' ? 'He owes' : 'ان کے ذمے')) });
  }
}

export async function runPdfCheck(outDir: string, pdfjsBuildDir: string): Promise<boolean> {
  mkdirSync(outDir, { recursive: true });
  // The app quits when its last window closes (and the driver closes each window it opens): this one keeps it alive until the checks are done.
  const anchor = new BrowserWindow({ show: false });
  const driver = createElectronPrintDriver();
  const checks: Check[] = [];
  const expected: Expected = {
    urdu: ['محمد راشد', 'کیڑے مار دوا ایکس', 'کھاد ڈی اے پی', 'پھپھوندی کش', 'پیسٹیسائیڈ کلب شاپ', 'رسید', 'گاہک', 'کل رقم'],
    latin: ['1 L', '50 kg', '0.25 L', 'Rs 1,200', 'Rs 2,000', 'Rs 400', 'Rs 3,600', 'INV-A-000007', '12 Oct 2026, 10:42'],
  };
  const papers = [
    { kind: 'receipt' as const, page: { widthMm: PAGE.receipt.widthMm, heightMm: PAGE.receipt.heightMm }, png: 'Built 80 mm receipt (Urdu PDF).png', pdf: 'receipt-ur.pdf' },
    { kind: 'invoice' as const, page: { widthMm: PAGE.invoice.widthMm, heightMm: PAGE.invoice.heightMm }, png: 'Built A4 invoice (Urdu PDF).png', pdf: 'invoice-ur.pdf' },
  ];
  for (const paper of papers) {
    const label = paper.kind === 'receipt' ? '80 mm receipt' : 'A4 invoice';
    const pdf = await driver.toPdf(renderDocumentHtml(urduSale(paper.kind), 'ur', documentFonts), { page: paper.page });
    const pdfPath = join(outDir, paper.pdf);
    writeFileSync(pdfPath, pdf);
    const report = await readPdf(pdf, pdfjsBuildDir, join(outDir, '.reader'));
    writeFileSync(join(outDir, paper.pdf.replace('.pdf', '.pdfjs-text.json')), JSON.stringify({ ...report, pngs: undefined }, null, 1));
    // One page each is the point (a receipt is as long as it needs; the invoice here fits one A4 page); more would be named "... page 2.png".
    report.pngs.forEach((png, i) => writeFileSync(join(outDir, i === 0 ? paper.png : paper.png.replace('.png', ` page ${i + 1}.png`)), Buffer.from(png.split(',')[1] ?? '', 'base64')));
    checks.push({ name: `${label}: one PDF page`, ok: report.pages === 1, detail: `${report.pages} page(s), ${(pdf.length / 1024).toFixed(0)} KB` });

    const fonts = pdfFontNames(pdf);
    checks.push({ name: `${label}: embedded Urdu font is Noto Naskh Arabic, Latin is IBM Plex Sans`, ok: fonts.some((f) => /Naskh/i.test(f)) && fonts.some((f) => /Plex/i.test(f)), detail: fonts.join(', ') });
    checks.push({ name: `${label}: no other font is embedded (no fallback font drew a letter)`, ok: fonts.every((f) => /Naskh|Plex/i.test(f)) });

    checks.push(...checkPdfJsText(label, report, expected, [['1 L', 'کیڑے مار دوا ایکس'], ['50 kg', 'کھاد ڈی اے پی'], ['0.25 L', 'پھپھوندی کش']]));
    const text = pdftotext(pdfPath);
    if (text === null) console.log(`SKIP ${label}: the Urdu strings read back in logical order (pdftotext is not installed; the picture and the shaping checks above still ran)`);
    else {
      writeFileSync(join(outDir, paper.pdf.replace('.pdf', '.pdftotext.txt')), text);
      checks.push(...checkReadingOrder(label, text, expected));
    }
  }
  // The design's own sample sale, English and Urdu, on both papers: PNGs at 2 pixels per CSS pixel to put beside the design renders (see
  // scripts/render-design-ref.mjs), and a check that every wording and amount the design prints is in the PDF text layer.
  for (const kind of ['receipt', 'invoice'] as const) {
    for (const language of ['en', 'ur'] as const) {
      const label = `design sample ${kind === 'receipt' ? '80 mm receipt' : 'A4 invoice'} (${language})`;
      const paper = kind === 'receipt' ? PAGE.receipt : PAGE.invoice;
      const pdf = await driver.toPdf(renderDocumentHtml(designSale(kind, language), language, documentFonts), { page: { widthMm: paper.widthMm, heightMm: paper.heightMm } });
      const base = `design-${kind}-${language}`;
      writeFileSync(join(outDir, `${base}.pdf`), pdf);
      const report = await readPdf(pdf, pdfjsBuildDir, join(outDir, '.reader'), 2);
      report.pngs.forEach((png, i) => writeFileSync(join(outDir, `${base}${i === 0 ? '' : ` page ${i + 1}`}.png`), Buffer.from(png.split(',')[1] ?? '', 'base64')));
      checks.push({ name: `${label}: one PDF page`, ok: report.pages === 1, detail: `${report.pages} page(s)` });
      const flat = report.text.replace(/\s+/g, ' ');
      const common = ['INV-A-000002', '12 Oct 2026, 10:42', 'Rs 1,000', 'Rs 2,050', 'Rs 91', 'Rs 1,050', 'Rs 3,050', '30 Nov 2026'];
      const missing = [...common, ...(kind === 'invoice' ? ['B-001', 'F-001', 'FG-014', 'Rs 500', 'Rs 200/', 'Rs 350'] : ['× Rs 500', '× Rs 350', '0.25'])].filter((s) => !flat.includes(s));
      // No cost in the print output: the same sale, but its data carries a cost on every line (7654321 paisa, a field that must never be printed).
      // The PDF's text layer (pdf.js, and pdftotext when installed) is searched for the amount in every format and for the words cost, margin, profit.
      const dirty = designSale(kind, language);
      const withCost = { ...dirty, invoice: { ...dirty.invoice, cost_total: COST_SENTINEL, profit: COST_SENTINEL }, lines: dirty.lines.map((l) => ({ ...l, cost_price: COST_SENTINEL, unit_cost: COST_SENTINEL, margin: COST_SENTINEL })) };
      const costPdf = await driver.toPdf(renderDocumentHtml(withCost, language, documentFonts), { page: { widthMm: paper.widthMm, heightMm: paper.heightMm } });
      const costPath = join(outDir, `${base}-costscan.pdf`);
      writeFileSync(costPath, costPdf);
      const costReport = await readPdf(costPdf, pdfjsBuildDir, join(outDir, '.reader'), 1);
      const costText = pdftotext(costPath);
      const leaks = [...findCostLeaks(costReport.text, COST_SENTINEL), ...(costText === null ? [] : findCostLeaks(costText, COST_SENTINEL))];
      checks.push({ name: `${label}: no cost, margin or profit in the PDF text layer (sentinel ${COST_SENTINEL} paisa in the data, every format and word searched)`, ok: leaks.length === 0, detail: leaks.length ? leaks.join(', ') : costText === null ? 'pdf.js text only; pdftotext not installed' : 'pdf.js and pdftotext text' });
      checks.push({ name: `${label}: every amount and number of the design is in the text layer`, ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(' | ')}` : undefined });
    }
  }
  await runKhataChecks(driver, outDir, pdfjsBuildDir, checks);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`PDF CHECK: ${checks.length - failed} passed, ${failed} failed. PDFs, text dumps and PNGs are in ${outDir}. Now LOOK at the two PNGs: joined letters, right to left, "1 L" not "L 1".`);
  anchor.destroy();
  return failed === 0;
}
