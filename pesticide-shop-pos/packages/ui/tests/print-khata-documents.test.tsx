// Phase 6 M6: the customer statement (80 mm and A4), the payment receipt and the statement CSV, as pure rendering from data. The design wording is READ
// from docs/design/CustomerForms.dc.html (sections 3 and 4) and checked against the rendered page, so a reworded design or a drifted page fails here.
// (The same documents made from a real database with the real fonts are tested in apps/desktop/tests/statement-printing.test.ts.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PaymentReceiptData, StatementDocumentData, StatementDocumentLine } from '@pos/core';
import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  csvCell,
  findCostLeaks,
  khataCss,
  renderPaymentReceiptHtml,
  renderPaymentReceiptMarkup,
  renderStatementHtml,
  renderStatementMarkup,
  rupeesText,
  safeText,
  statementCsv,
  statementFileName,
  STATEMENT_CSV_HEADER,
  type DocumentFonts,
} from '../src/print/index.js';

const FONTS: DocumentFonts = { plex400: 'data:font/woff2;base64,AAAA', plex600: 'data:font/woff2;base64,BBBB', plex700: 'data:font/woff2;base64,CCCC', naskh: 'data:font/woff2;base64,DDDD' };

const DESIGN = readFileSync(join(__dirname, '../../../docs/design/CustomerForms.dc.html'), 'utf8');
/** The visible text of a piece of the design file, as `|`-separated tokens. */
const tokens = (html: string): string[] =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/&amp;/g, '&')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
const section = (from: string, to: string): string => {
  const start = DESIGN.indexOf(from);
  expect(start, `design marker "${from}"`).toBeGreaterThan(-1);
  return DESIGN.slice(start, DESIGN.indexOf(to, start));
};
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const ent = (id: string, label: StatementDocumentLine['label'], date: string, delta: number, running: number, extra: Partial<StatementDocumentLine> = {}): StatementDocumentLine => ({
  kind: 'entry', label, date, amount_delta: delta, running_balance: running, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null, ...extra,
});
/** The statement of docs/design/CustomerForms.dc.html section 4 (Rashid Ali, Chak 12): the same lines, amounts and numbers. */
const DESIGN_LINES: StatementDocumentLine[] = [
  ent('1', 'opening', '2026-10-01T07:00:00.000Z', 400_000, 400_000),
  ent('2', 'sale', '2026-10-02T07:00:00.000Z', 500_000, 900_000, { invoice_no: 'INV-A-000001' }),
  ent('3', 'payment', '2026-10-02T08:00:00.000Z', -200_000, 700_000, { payment_method: 'cash', receipt_no: 'RCP-A-000001' }),
  ent('4', 'return', '2026-10-02T09:00:00.000Z', -100_000, 600_000, { return_no: 'RET-A-000001' }),
  ent('5', 'sale', '2026-10-05T07:00:00.000Z', 350_000, 950_000, { invoice_no: 'INV-A-000004' }),
  ent('6', 'payment', '2026-10-07T07:00:00.000Z', -150_000, 800_000, { payment_method: 'bank', reference_no: 'TRX 88213', receipt_no: 'RCP-A-000002' }),
  ent('7', 'sale', '2026-10-09T07:00:00.000Z', 240_000, 1_040_000, { invoice_no: 'INV-A-000009' }),
  ent('8', 'payment', '2026-10-10T07:00:00.000Z', -140_000, 900_000, { payment_method: 'easypaisa', reference_no: 'EP-48210937', receipt_no: 'RCP-A-000003' }),
];
const statement = (over: Partial<StatementDocumentData> = {}): StatementDocumentData => ({
  kind: 'receipt',
  shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
  customer: { name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'Chak 12', phone: '0300 1234567' },
  from: null,
  to: null,
  lines: DESIGN_LINES,
  brought_forward: 0,
  totals: { owes_more: 1_490_000, owes_less: 590_000 },
  closing_balance: 900_000,
  credit_limit: 1_000_000,
  copies_printed: 0,
  is_copy: false,
  time_zone: 'Asia/Karachi',
  ...over,
});
const a4 = (over: Partial<StatementDocumentData> = {}): StatementDocumentData => statement({ kind: 'invoice', ...over });

const receipt = (over: Partial<PaymentReceiptData> = {}): PaymentReceiptData => ({
  shop: { name: 'Pesticide Club Shop', name_ur: null, address: null, phone: null },
  customer: { name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'Chak 12', phone: null },
  payment: { id: 'p1', receipt_no: 'RCP-A-000001', paid_at: '2026-10-12T05:42:00.000Z', method: 'easypaisa', reference_no: 'EP-48210937', note: 'Paid at the shop by his son', amount: 500_000 },
  balance_after: 400_000,
  copies_printed: 0,
  is_copy: false,
  time_zone: 'Asia/Karachi',
  ...over,
});

describe('the 80 mm statement against the design (section 4, "80 mm print")', () => {
  const mock = tokens(section('80 mm print', 'class Component'));
  // What the design's print mock says that this build words differently on purpose: the legend (owes more / owes less, as decided in the plan),
  // and the range line (the page prints both years). Everything else must be on the page.
  const reworded = new Set(['+ he owes more, - he owes less', '01 Oct to 12 Oct 2026', '80 mm print']);

  it('every other piece of text in the design mock is on the rendered slip', () => {
    const page = text(renderStatementMarkup(statement(), 'en'));
    const expected = mock.filter((s) => !reworded.has(s) && !/^\s*\|?$/.test(s));
    expect(expected.length).toBeGreaterThan(30); // the file was really read
    const missing = expected.filter((s) => !page.includes(s));
    expect(missing).toEqual([]);
  });

  it('the legend and the range are as decided: owes more / owes less, and the customer line', () => {
    const page = text(renderStatementMarkup(statement({ from: '2026-10-01', to: '2026-10-12' }), 'en'));
    expect(page).toContain('+ owes more, - owes less');
    expect(page).toContain('01 Oct 2026 to 12 Oct 2026');
    expect(page).toContain('Rashid Ali · Chak 12');
    expect(text(renderStatementMarkup(statement(), 'en'))).toContain('All entries');
  });

  it('shows a brought-forward line when the statement has one, with the shell\'s balance', () => {
    const page = text(renderStatementMarkup(statement({ from: '2026-10-05', lines: [{ ...ent('b', 'opening', '', 0, 0), kind: 'brought_forward', label: 'brought_forward', date: null, amount_delta: 600_000, running_balance: 600_000 }, ...DESIGN_LINES.slice(4)] }), 'en'));
    expect(page).toContain('Brought forward');
    expect(page).toContain('Bal 6,000');
  });

  it('totals come from the shell: both totals and the closing figure are on the slip', () => {
    const page = text(renderStatementMarkup(statement(), 'en'));
    expect(page).toContain('Total owes more');
    expect(page).toContain('Rs 14,900');
    expect(page).toContain('Rs 5,900');
  });

  it('closing: He owes Rs X, Advance Rs X (never a minus), or Clear', () => {
    const owes = renderStatementMarkup(statement(), 'en');
    expect(owes).toContain('data-closing="owes"');
    expect(text(owes)).toContain('He owes Rs 9,000');
    const adv = renderStatementMarkup(statement({ closing_balance: -100_000 }), 'en');
    expect(adv).toContain('data-closing="advance"');
    expect(text(adv)).toContain('Advance Rs 1,000');
    expect(text(adv)).not.toMatch(/Owes Rs -|He owes|Rs -/);
    const clear = renderStatementMarkup(statement({ closing_balance: 0 }), 'en');
    expect(clear).toContain('data-closing="clear"');
    expect(text(clear)).toContain('Clear');
    expect(text(clear)).not.toContain('He owes');
  });

  it('a negative running balance on a line reads Adv, not a minus', () => {
    const page = text(renderStatementMarkup(statement({ lines: [ent('x', 'payment', '2026-10-02T07:00:00.000Z', -150_000, -50_000, { payment_method: 'cash' })], closing_balance: -50_000 }), 'en'));
    expect(page).toContain('Adv 500');
    expect(page).not.toMatch(/Bal -/);
  });

  it('with no credit limit (null or 0) the credit limit line is left out', () => {
    expect(text(renderStatementMarkup(statement({ credit_limit: 0 }), 'en'))).not.toContain('Credit limit');
    expect(text(renderStatementMarkup(statement({ credit_limit: null }), 'en'))).not.toContain('Credit limit');
  });
});

describe('the payment receipt against the design (section 3)', () => {
  const form = tokens(section('Receive payment', 'Customer statement'));
  it('the words the design gives the payment (amount, method, reference, note, balance after) are the words on the slip', () => {
    for (const word of ['Amount received', 'Method', 'Reference number', 'Note', 'Balance after', 'Easypaisa']) expect(form, word).toContain(word);
    const page = text(renderPaymentReceiptMarkup(receipt(), 'en'));
    for (const word of ['Amount received', 'Method', 'Reference number', 'Note', 'Balance after', 'Easypaisa', 'EP-48210937', 'Paid at the shop by his son']) expect(page, word).toContain(word);
    // the sample amounts of the design: Rs 5,000 paid, Rs 4,000 left
    expect(form).toEqual(expect.arrayContaining(['Rs 4,000', 'Normal: Rs 5,000']));
    expect(page).toContain('Rs 5,000');
    expect(page).toContain('He owes Rs 4,000');
  });

  it('shop, title, number, date and time in the shop zone, who paid', () => {
    const page = text(renderPaymentReceiptMarkup(receipt(), 'en'));
    for (const part of ['Pesticide Club Shop', '[Address and phone]', 'PAYMENT RECEIPT', 'RCP-A-000001', '12 Oct 2026, 10:42', 'Received from', 'Rashid Ali · Chak 12', 'Thank you.']) expect(page, part).toContain(part);
  });

  it('balance after: He owes, Advance (never a minus), Clear; reference and note lines only when there are some', () => {
    expect(text(renderPaymentReceiptMarkup(receipt({ balance_after: -100_000 }), 'en'))).toContain('Advance Rs 1,000');
    expect(text(renderPaymentReceiptMarkup(receipt({ balance_after: -100_000 }), 'en'))).not.toMatch(/Rs -/);
    const clear = renderPaymentReceiptMarkup(receipt({ balance_after: 0 }), 'en');
    expect(clear).toContain('data-balance-after="clear"');
    expect(text(clear)).toContain('Clear');
    const cash = text(renderPaymentReceiptMarkup(receipt({ payment: { ...receipt().payment, method: 'cash', reference_no: null, note: null } }), 'en'));
    expect(cash).toContain('Cash');
    expect(cash).not.toContain('Reference number');
    expect(cash).not.toContain('Note');
  });

  it('an old payment without a receipt number prints without that line', () => {
    expect(text(renderPaymentReceiptMarkup(receipt({ payment: { ...receipt().payment, receipt_no: null } }), 'en'))).not.toContain('Receipt');
  });

  it('is the 80 mm slip: 72 mm printable, page 80 mm wide', () => {
    const html = renderPaymentReceiptHtml(receipt(), 'en', FONTS);
    expect(html).toContain('@page{size:80mm auto;margin:0}');
    expect(html).toContain('width:72mm');
  });
});

describe('Urdu: right to left, joined text from the embedded font, Latin runs isolated', () => {
  it('the statement (both papers) is dir=rtl lang=ur, in Urdu words, with the Naskh font carried inside the page', () => {
    for (const data of [statement(), a4()]) {
      const html = renderStatementHtml(data, 'ur', FONTS);
      expect(html).toContain('<html lang="ur" dir="rtl">');
      // the document itself (what a window loads inside any page) is right to left too, not only the page around it
      const body = html.slice(html.indexOf('<body>'));
      expect(body).toContain('lang="ur" dir="rtl"');
      expect(body).not.toContain('dir="ltr"');
      expect(html).toContain("font-family:'Naskh'");
      expect(html).toContain('data:font/woff2;base64,DDDD');
      expect(html).toContain("default-src 'none'");
      const t = text(html);
      for (const word of ['کھاتے کی تفصیل', 'ابتدائی بقایا', 'فروخت', 'ادائیگی · نقد', 'واپسی کا کریڈٹ', 'ان کے ذمے', 'راشد علی · Chak 12']) expect(t, word).toContain(word);
      // real text, not a picture
      expect(html).not.toMatch(/<img|<canvas|<svg/);
    }
  });

  it('every Latin run is its own left-to-right island: the village, a bank reference, a note, and every amount and date', () => {
    const data = statement({ lines: [ent('x', 'payment', '2026-10-07T07:00:00.000Z', -150_000, 750_000, { payment_method: 'bank', reference_no: 'TRX 88213' })] });
    const html = renderStatementMarkup(data, 'ur');
    expect(html).toContain('<span class="ltr">Chak 12</span>');
    expect(html).toContain('<span class="ltr">TRX 88213</span>');
    expect(html).toMatch(/<span class="num semi">- Rs 1,500<\/span>/);
    expect(html).toMatch(/<span class="num">07 Oct<\/span>/);
    const a4html = renderStatementMarkup(a4({ lines: data.lines }), 'ur');
    expect(a4html).toContain('<span class="ltr">TRX 88213</span>');
    expect(a4html).toMatch(/<span class="num">07 Oct 2026<\/span>/);
    const slip = renderPaymentReceiptMarkup(receipt(), 'ur');
    expect(slip).toContain('<span class="ltr">EP-48210937</span>');
    expect(slip).toMatch(/<span class="num">RCP-A-000001<\/span>/);
    expect(slip).toMatch(/<span class="num">Rs 5,000<\/span>/);
    expect(slip).toContain('dir="rtl"');
  });

  it('the stylesheet makes .ltr and .num isolates (so "L 1" cannot happen) and English is left to right', () => {
    const html = renderStatementHtml(statement(), 'en', FONTS);
    expect(html).toContain('.ltr{direction:ltr;unicode-bidi:isolate}');
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html.slice(html.indexOf('<body>'))).not.toContain('dir="rtl"');
  });
});

describe('COPY only on a reprint', () => {
  it('no mark on the first print, a COPY mark on a later one: statement (80 mm and A4) and payment receipt, English and Urdu', () => {
    for (const language of ['en', 'ur'] as const) {
      for (const html of [renderStatementMarkup(statement(), language), renderStatementMarkup(a4(), language), renderPaymentReceiptMarkup(receipt(), language)]) expect(html, language).not.toContain('COPY');
      for (const html of [
        renderStatementMarkup(statement({ is_copy: true, copies_printed: 1 }), language),
        renderStatementMarkup(a4({ is_copy: true, copies_printed: 1 }), language),
        renderPaymentReceiptMarkup(receipt({ is_copy: true, copies_printed: 1 }), language),
      ])
        expect(html, language).toContain('COPY');
    }
  });
});

describe('no cost, and every typed text is escaped', () => {
  const COST = 7_654_321;
  it('even if the data carried a cost (a field added by mistake) no page prints it', () => {
    const dirty = { ...statement(), cost_total: COST, profit: COST, lines: DESIGN_LINES.map((l) => ({ ...l, cost_price: COST, margin: COST })) };
    const dirtyReceipt = { ...receipt(), cost: COST, profit: COST };
    for (const language of ['en', 'ur'] as const) {
      for (const html of [renderStatementHtml(dirty, language, FONTS), renderStatementHtml({ ...dirty, kind: 'invoice' }, language, FONTS), renderPaymentReceiptHtml(dirtyReceipt, language, FONTS)]) {
        expect(findCostLeaks(html, COST)).toEqual([]);
      }
    }
  });

  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
  it('customer name, village, reference, note, shop name and footer are escaped on every document (an XSS attempt)', () => {
    const lines = [ent('e', 'payment', '2026-10-07T07:00:00.000Z', -150_000, 750_000, { payment_method: 'bank', reference_no: evil, note: evil })];
    const shop = { name: evil, name_ur: evil, address: evil, phone: null, footer: evil };
    const customer = { name_en: evil, name_ur: evil, village: evil, phone: evil };
    const pages = (['en', 'ur'] as const).flatMap((language) => [
      renderStatementHtml(statement({ lines, shop, customer }), language, FONTS),
      renderStatementHtml(a4({ lines, shop, customer }), language, FONTS),
      renderPaymentReceiptHtml(receipt({ shop, customer, payment: { ...receipt().payment, reference_no: evil, note: evil } }), language, FONTS),
    ]);
    for (const html of pages) {
      const body = html.slice(html.indexOf('<body>'));
      expect(body).not.toContain('<script');
      expect(body).not.toContain('<img');
      expect(body).not.toMatch(/<[^>]*\sonerror=/); // the words may stay as text, never as an attribute of a tag
      expect(body).toContain('&lt;script&gt;');
      expect(html.slice(0, html.indexOf('<body>'))).not.toContain('<script');
    }
  });
});

describe('the A4 statement', () => {
  const many = (n: number): StatementDocumentLine[] =>
    Array.from({ length: n }, (_, i) => ent(String(i), i % 3 === 2 ? 'payment' : 'sale', '2026-10-02T07:00:00.000Z', i % 3 === 2 ? -10_000 : 25_000, 100_000 + i * 1000, i % 3 === 2 ? { payment_method: 'cash', receipt_no: `RCP-A-${String(i).padStart(6, '0')}` } : { invoice_no: `INV-A-${String(i).padStart(6, '0')}` }));

  it('the columns are Date, Type, Reference, Owes more, Owes less, Balance, with the totals row and the closing box', () => {
    const html = renderStatementMarkup(a4(), 'en');
    const heads = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(heads).toEqual(['Date', 'Type', 'Reference', 'Owes more', 'Owes less', 'Balance']);
    expect(html).toContain('data-line="totals"');
    expect(html).toContain('data-closing="owes"');
    expect(text(html)).toContain('Owes more: he owes more after this line. Owes less: he owes less. Entries are never edited or deleted.');
    expect(text(html)).toContain('01 Oct 2026');
  });

  it('a long list paginates: the column heads and margins repeat on every page, no row can be split, and every row is there once', () => {
    const html = renderStatementHtml(a4({ lines: many(150), closing_balance: 100_000 }), 'en', FONTS);
    expect(html.match(/data-line="entry"/g)).toHaveLength(150);
    expect(html.match(/<thead>/g)).toHaveLength(1); // one thead: the browser repeats it on each page
    expect(khataCss).toContain('.statement-a4 thead{display:table-header-group}');
    expect(khataCss).toContain('.statement-a4 tbody tr{break-inside:avoid;page-break-inside:avoid}');
    expect(khataCss).toContain('.statement-a4 tfoot{display:table-footer-group}');
    expect(html).toContain('@page{size:A4;margin:0}');
    // the totals and the closing box come after the last entry, in the same table
    expect(html.lastIndexOf('data-line="entry"')).toBeLessThan(html.indexOf('data-line="totals"'));
  });

  it('the brought-forward line sits in the Balance column only', () => {
    const html = renderStatementMarkup(a4({ from: '2026-10-05', lines: [{ ...ent('b', 'opening', '', 0, 0), kind: 'brought_forward', label: 'brought_forward', date: null, amount_delta: 600_000, running_balance: 600_000 }] }), 'en');
    const row = html.slice(html.indexOf('data-line="brought_forward"'), html.indexOf('</tr>', html.indexOf('data-line="brought_forward"')));
    expect(text(row)).toContain('Brought forward');
    expect(text(row)).toContain('Rs 6,000');
    expect(row.match(/<td class="c-num"><\/td>/g)).toHaveLength(2); // owes more and owes less are empty
  });

  it('a payment note is printed under its type', () => {
    expect(text(renderStatementMarkup(a4({ lines: [ent('n', 'payment', '2026-10-07T07:00:00.000Z', -10_000, 5_000, { payment_method: 'cash', note: 'for the wheat' })] }), 'en'))).toContain('for the wheat');
  });
});

describe('the CSV', () => {
  const csvOf = (lines: StatementDocumentLine[], over: Partial<StatementDocumentData> = {}) => statementCsv(statement({ lines, ...over }));
  const rows = (csv: string): string[] => csv.slice(CSV_BOM.length).split('\r\n').filter((r) => r !== '');

  it('starts with the UTF-8 byte order mark (so Excel reads Urdu), has a header and CRLF rows', () => {
    const csv = csvOf(DESIGN_LINES);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Buffer.from(csv, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(rows(csv)[0]).toBe(STATEMENT_CSV_HEADER.join(','));
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('rows: date, type, reference, receipt no, note, owes more, owes less, running balance; then the totals row with the shell\'s totals and closing balance', () => {
    const r = rows(csvOf(DESIGN_LINES));
    expect(r).toHaveLength(1 + 8 + 1);
    expect(r[1]).toBe('01 Oct 2026,Opening balance,,,,4000,,4000');
    expect(r[2]).toBe('02 Oct 2026,Sale,INV-A-000001,,,5000,,9000');
    expect(r[3]).toBe('02 Oct 2026,Payment · Cash,RCP-A-000001,,,,2000,7000');
    expect(r[6]).toBe('07 Oct 2026,Payment · Bank,TRX 88213,RCP-A-000002,,,1500,8000');
    expect(r[9]).toBe(',Totals,,,,14900,5900,9000');
  });

  it('amounts are exact integers or two-decimal text from whole paisa, never floats; an advance is negative', () => {
    expect(rupeesText(500_000)).toBe('5000');
    expect(rupeesText(125_050)).toBe('1250.50');
    expect(rupeesText(5)).toBe('0.05');
    expect(rupeesText(-50_000)).toBe('-500');
    expect(rupeesText(10)).toBe('0.10');
    expect(() => rupeesText(1.5)).toThrow();
    const r = rows(csvOf([ent('a', 'sale', '2026-10-02T07:00:00.000Z', 125_050, 125_050, { invoice_no: 'INV-1' }), ent('b', 'payment', '2026-10-02T08:00:00.000Z', -175_050, -50_000, { payment_method: 'cash' })], { totals: { owes_more: 125_050, owes_less: 175_050 }, closing_balance: -50_000 }));
    expect(r[1]).toBe('02 Oct 2026,Sale,INV-1,,,1250.50,,1250.50');
    expect(r[2]).toBe('02 Oct 2026,Payment · Cash,,,,,1750.50,-500');
    expect(r[3]).toBe(',Totals,,,,1250.50,1750.50,-500');
  });

  it('a brought-forward row carries only the balance', () => {
    const bf: StatementDocumentLine = { ...ent('b', 'opening', '', 0, 0), kind: 'brought_forward', label: 'brought_forward', date: null, amount_delta: 600_000, running_balance: 600_000 };
    expect(rows(csvOf([bf]))[1]).toBe(',Brought forward,,,,,,6000');
  });

  it('quotes cells with a comma, a quote or a line break (quotes doubled)', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('x\r\ny')).toBe('"x\r\ny"');
    const csv = csvOf([ent('q', 'payment', '2026-10-07T07:00:00.000Z', -10_000, 0, { payment_method: 'cash', note: 'paid, "in full"\nthanks' })]);
    expect(csv).toContain('"paid, ""in full""\nthanks"');
  });

  it('a typed text that starts with = + - @ (or a tab) cannot run as a formula: it gets a leading quote', () => {
    for (const bad of ['=SUM(A1:A9)', '+1+1', '-2+3', '@cmd', '\tTAB', '=HYPERLINK("http://x","y")']) expect(safeText(bad)).toBe(`'${bad}`);
    expect(safeText('TRX 88213')).toBe('TRX 88213');
    expect(safeText('')).toBe('');
    const csv = csvOf([ent('f', 'payment', '2026-10-07T07:00:00.000Z', -10_000, 0, { payment_method: 'bank', reference_no: '=1+1', note: '@evil' })]);
    const row = rows(csv)[1]!;
    expect(row).toContain(",'=1+1,");
    expect(row).toContain(",'@evil,");
    // the amounts we write ourselves are numbers, even a negative one
    expect(rows(csvOf([ent('g', 'payment', '2026-10-07T07:00:00.000Z', -10_000, -500, { payment_method: 'cash' })], { closing_balance: -500 }))[1]).toMatch(/,-5$/);
  });

  it('Urdu and Latin text survive; the file name is safe', () => {
    expect(csvOf([ent('u', 'payment', '2026-10-07T07:00:00.000Z', -10_000, 0, { payment_method: 'cash', note: 'کپاس کی رقم' })])).toContain('کپاس کی رقم');
    expect(statementFileName(statement({ customer: { name_en: 'A/B: "C"?', name_ur: null, village: null, phone: null } }), '2026-10-12')).toBe('Statement - A B C - 2026-10-12.csv');
    expect(statementFileName(statement({ customer: { name_en: null, name_ur: 'راشد', village: null, phone: null } }), '2026-10-12')).toBe('Statement - راشد - 2026-10-12.csv');
  });
});
