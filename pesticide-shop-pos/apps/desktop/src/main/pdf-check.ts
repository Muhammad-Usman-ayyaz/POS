// Development tool, not part of the app: `npm run check:pdf` makes the 80 mm receipt and the A4 invoice in Urdu with Electron's REAL printToPDF
// (the same driver the app prints with), then reads the PDFs back with pdf.js (a devDependency, used only here) and checks
//   (a) the text layer: every Urdu string is in the PDF as shaped, right-to-left text; Latin runs ("1 L", "Rs 1,200") are in reading order; the Urdu font is Noto Naskh;
//   (b) the picture: each page is drawn to a PNG, saved next to the PDF, to LOOK at (a person must; a program cannot tell "joined" from "almost joined").
// It never runs unless POS_PDF_CHECK_DIR is set, and it is compiled in only by the special dev-tools build (see electron.vite.config.ts).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import type { InvoiceDocumentData } from '@pos/core';
import { PAGE, renderDocumentHtml } from '@pos/ui/print';
import { createElectronPrintDriver } from './printing/electron-driver.js';
import { documentFonts } from './printing/fonts.js';

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
      { position: 1, name_en: 'Insecticide X 1 L', name_ur: 'کیڑے مار دوا ایکس 1 L', batch_no: 'B-001', qty: 1000, base_unit: 'ml', pack_size: 1000, unit_price: 120_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 10_900, line_total: 120_000 },
      { position: 2, name_en: 'DAP Fertilizer 50 kg', name_ur: 'کھاد ڈی اے پی 50 kg', batch_no: 'F-001', qty: 1, base_unit: 'piece', pack_size: 1, unit_price: 200_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 200_000 },
      { position: 3, name_en: 'Fungicide 250 ml', name_ur: 'پھپھوندی کش 250 ml', batch_no: 'FG-014', qty: 250, base_unit: 'ml', pack_size: 250, unit_price: 40_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 3_600, line_total: 40_000 },
    ],
    shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
    balance_as_of_sale: 160_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
  };
}

/** Everything the page script reports back for one PDF. */
export interface PdfReport {
  pages: number;
  /** pdf.js text items in the order the PDF stores them, with where each one sits on the page (points from the left edge, from the bottom edge). */
  items: { str: string; dir: string; x: number; y: number; width: number }[];
  /** All items joined, one line per text row. */
  text: string;
  /** Each page drawn at 3 pixels per CSS pixel, as a PNG data address. */
  pngs: string[];
}

/** Runs inside the hidden window: pdf.js reads the bytes the local server gives it, lists text and fonts, and draws each page. */
const READ_PDF = () => `(async () => {
  const pdfjs = await import('./pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await fetch('./doc.pdf')).arrayBuffer()), useSystemFonts: false }).promise;
  const out = { pages: doc.numPages, items: [], text: '', pngs: [] };
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
    const canvas = document.createElement('canvas');
    const viewport = page.getViewport({ scale: 3 * 96 / 72 });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
    out.pngs.push(canvas.toDataURL('image/png'));
  }
  return out;
})()`;

export async function readPdf(pdf: Uint8Array, pdfjsBuildDir: string, workDir: string): Promise<PdfReport> {
  // pdf.js is a module script and starts a worker: both load from a file address, so the page, pdf.js and the PDF sit in one folder.
  mkdirSync(workDir, { recursive: true });
  for (const name of ['pdf.mjs', 'pdf.worker.mjs']) copyFileSync(join(pdfjsBuildDir, name), join(workDir, name));
  writeFileSync(join(workDir, 'doc.pdf'), pdf);
  writeFileSync(join(workDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>pdf</title>');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false } });
  try {
    await win.loadFile(join(workDir, 'index.html'));
    return (await win.webContents.executeJavaScript(READ_PDF(), true)) as PdfReport;
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
  checks.push({ name: `${label}: no flipped Latin runs ("L 1", "ml 250", "kg 50")`, ok: !/\bL 1\b|\bml 250\b|\bkg 50\b/.test(joined) });
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

export async function runPdfCheck(outDir: string, pdfjsBuildDir: string): Promise<boolean> {
  mkdirSync(outDir, { recursive: true });
  // The app quits when its last window closes (and the driver closes each window it opens): this one keeps it alive until the checks are done.
  const anchor = new BrowserWindow({ show: false });
  const driver = createElectronPrintDriver();
  const checks: Check[] = [];
  const expected: Expected = {
    urdu: ['محمد راشد', 'کیڑے مار دوا ایکس', 'کھاد ڈی اے پی', 'پھپھوندی کش', 'پیسٹیسائیڈ کلب شاپ', 'رسید', 'گاہک', 'کل رقم'],
    latin: ['1 L', '50 kg', '250 ml', 'Rs 1,200', 'Rs 2,000', 'Rs 400', 'Rs 3,600', 'INV-A-000007', '12 Oct 2026, 10:42'],
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

    checks.push(...checkPdfJsText(label, report, expected, [['1 L', 'کیڑے مار دوا ایکس'], ['50 kg', 'کھاد ڈی اے پی'], ['250 ml', 'پھپھوندی کش']]));
    const text = pdftotext(pdfPath);
    if (text === null) console.log(`SKIP ${label}: the Urdu strings read back in logical order (pdftotext is not installed; the picture and the shaping checks above still ran)`);
    else {
      writeFileSync(join(outDir, paper.pdf.replace('.pdf', '.pdftotext.txt')), text);
      checks.push(...checkReadingOrder(label, text, expected));
    }
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`PDF CHECK: ${checks.length - failed} passed, ${failed} failed. PDFs, text dumps and PNGs are in ${outDir}. Now LOOK at the two PNGs: joined letters, right to left, "1 L" not "L 1".`);
  anchor.destroy();
  return failed === 0;
}
