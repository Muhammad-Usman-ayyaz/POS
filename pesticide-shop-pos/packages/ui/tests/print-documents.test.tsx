// The receipt and the A4 invoice, as pure rendering from data. (The same documents made from a real database, with the real fonts, are
// tested in apps/desktop/tests/printing.test.ts.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InvoiceDocumentData } from '@pos/core';
import { describe, expect, it } from 'vitest';
import { documentCss, lineQuantity, PAGE, quantityText, renderDocumentHtml, renderDocumentMarkup, type DocumentFonts } from '../src/print/index.js';
import { smallUnitsIn, UNIT_WORDS } from './unit-scan.js';

const FONTS: DocumentFonts = {
  plex400: 'data:font/woff2;base64,AAAA',
  plex600: 'data:font/woff2;base64,BBBB',
  plex700: 'data:font/woff2;base64,CCCC',
  naskh: 'data:font/woff2;base64,DDDD',
};

/** The sale in the approved designs: Rashid buys Insecticide 1 L x2, 250 g of loose fertilizer, Fungicide x3 with Rs 50 off, pays Rs 1,000, balance now Rs 3,050. */
function sale(over: Partial<InvoiceDocumentData> = {}): InvoiceDocumentData {
  return {
    kind: 'receipt',
    invoice: {
      id: '11111111-1111-4111-8111-111111111111', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', due_date: '2026-11-30', status: 'active',
      payment_method: 'cash', price_type: 'retail', subtotal: 195_900, tax_total: 9100, total: 205_000, paid_amount: 100_000, on_khata: 105_000,
    },
    customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12' },
    customer_id: '22222222-2222-4222-8222-222222222222',
    sold_by: 'Owner',
    lines: [
      { position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', qty: 2000, base_unit: 'ml', pack_size: 1000, unit_price: 50_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 9100, line_total: 100_000 },
      { position: 2, name_en: 'Fertilizer', name_ur: 'کھاد', batch_no: 'F-001', qty: 250, base_unit: 'g', pack_size: 1000, unit_price: 20_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 5000 },
      { position: 3, name_en: 'Fungicide 250 ml', name_ur: 'پھپھوندی کش 250 ملی لیٹر', batch_no: 'FG-014', qty: 750, base_unit: 'ml', pack_size: 250, unit_price: 35_000, line_discount: 5000, tax_rate_bp: 0, tax_amount: 0, line_total: 100_000 },
    ],
    shop: { name: 'Pesticide Club Shop', name_ur: null, address: null, phone: null },
    balance_as_of_sale: 305_000,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
    ...over,
  };
}
const asInvoice = (d: InvoiceDocumentData): InvoiceDocumentData => ({ ...d, kind: 'invoice' });
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the 80 mm receipt', () => {
  it('English: the shop, the invoice, the lines as sold, the discount, the total, what is on Khata and the balance AS OF THE SALE', () => {
    const t = text(renderDocumentMarkup(sale(), 'en'));
    for (const part of ['Pesticide Club Shop', 'Receipt', 'INV-A-000002', '12 Oct 2026, 10:42', 'Rashid · Chak 12', 'Insecticide 1 L', 'Rs 1,000', '2 packs × Rs 500/pack', 'Fertilizer · loose', '0.25 kg × Rs 200/kg', 'Fungicide 0.25 L', '3 packs × Rs 350/pack', 'Discount', '− Rs 50', 'Total', 'Rs 2,050', 'Includes tax', 'Paid · Cash', 'On Khata', 'Rs 1,050', 'Your balance now', 'Rs 3,050', 'Pay by', '30 Nov 2026', 'Thank you. Please keep this receipt.']) {
      expect(t, part).toContain(part);
    }
  });

  it('shows the balance it is GIVEN (the balance as of the sale), whatever else is true today', () => {
    expect(text(renderDocumentMarkup(sale({ balance_as_of_sale: 305_000 }), 'en'))).toContain('Rs 3,050');
    expect(text(renderDocumentMarkup(sale({ balance_as_of_sale: 12_300 }), 'en'))).toContain('Rs 123');
  });

  it('Urdu: right to left, Urdu words, the same amounts and dates in Latin digits', () => {
    const html = renderDocumentMarkup(sale(), 'ur');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ur"');
    const t = text(html);
    for (const part of ['رسید', 'بل', 'گاہک', 'راشد · Chak 12', 'کیڑے مار دوا 1 لیٹر', 'کھاد · کھلی', '0.25 کلو × Rs 200/کلو', 'رعایت', 'کل رقم', 'ٹیکس سمیت', 'ادا شدہ · نقد', 'کھاتے میں باقی', 'آپ کا کل بقایا', 'ادائیگی کی تاریخ', 'شکریہ۔ رسید سنبھال کر رکھیں۔', 'Rs 3,050', '30 Nov 2026']) {
      expect(t, part).toContain(part);
    }
    // an amount is never reversed inside the Urdu text: every one sits in a left-to-right isolate
    expect(html).toMatch(/<span class="num">Rs 2,050<\/span>/);
  });

  it('English is left to right', () => {
    const html = renderDocumentMarkup(sale(), 'en');
    expect(html).toContain('dir="ltr"');
    expect(html).not.toContain('dir="rtl"');
  });

  it('says COPY only when it is a copy', () => {
    expect(renderDocumentMarkup(sale({ is_copy: false }), 'en')).not.toContain('COPY');
    expect(renderDocumentMarkup(sale({ is_copy: false }), 'ur')).not.toContain('COPY');
    expect(renderDocumentMarkup(sale({ is_copy: true, copies_printed: 1 }), 'en')).toContain('COPY');
    expect(renderDocumentMarkup(sale({ is_copy: true, copies_printed: 1 }), 'ur')).toContain('COPY');
  });

  it('address and phone are a marked placeholder until the owner gives them, and are never invented', () => {
    expect(renderDocumentMarkup(sale(), 'en')).toContain('[Address and phone]');
    expect(renderDocumentMarkup(sale(), 'ur')).toContain('[پتہ اور فون]');
    const given = renderDocumentMarkup(sale({ shop: { name: 'Pesticide Club Shop', name_ur: null, address: 'Main Road, Chak 12', phone: '0300 1234567' } }), 'en');
    expect(given).toContain('Main Road, Chak 12 · 0300 1234567');
    expect(given).not.toContain('[Address and phone]');
  });

  it('a walk-in sale has no customer, no balance and no Khata line', () => {
    const t = text(renderDocumentMarkup(sale({ customer: null, customer_id: null, balance_as_of_sale: null, invoice: { ...sale().invoice, paid_amount: 205_000, on_khata: 0, due_date: null } }), 'en'));
    for (const part of ['Customer', 'Your balance now', 'On Khata', 'Pay by']) expect(t, part).not.toContain(part);
    expect(t).toContain('Paid · Cash');
  });

  it('uses the Urdu name of the shop when there is one, else the one real name', () => {
    expect(text(renderDocumentMarkup(sale({ shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null } }), 'ur'))).toContain('پیسٹیسائیڈ کلب شاپ');
    expect(text(renderDocumentMarkup(sale(), 'ur'))).toContain('Pesticide Club Shop');
  });

  it('uses the name saved at sale time, in the language asked, and the other language when one is missing', () => {
    const only = sale({ lines: [{ ...sale().lines[0]!, name_ur: null }] });
    expect(text(renderDocumentMarkup(only, 'ur'))).toContain('Insecticide 1 L');
  });
});

describe('the A4 invoice', () => {
  it('has the table with batch, quantity, rate, discount, tax and amount per line, then the totals and the signatures', () => {
    const t = text(renderDocumentMarkup(asInvoice(sale()), 'en'));
    for (const part of ['Invoice', 'INV-A-000002', 'Customer', 'Rashid · Chak 12', 'Batch', 'Qty', 'Rate', 'Disc.', 'Tax', 'Amount', 'B-001', 'F-001', 'FG-014', 'Rs 91', 'Rs 50', 'Total', 'Rs 2,050', 'Paid · Cash', 'On Khata', 'Your balance now', 'Rs 3,050', 'Customer signature', 'Authorised signature']) {
      expect(t, part).toContain(part);
    }
    // tax per line: the line with tax shows it, the lines without show a dash
    expect(renderDocumentMarkup(asInvoice(sale()), 'en')).toContain('<span class="num">—</span>'); // the lines without tax show a dash
  });

  it('Urdu: right to left with Urdu column headings', () => {
    const html = renderDocumentMarkup(asInvoice(sale()), 'ur');
    expect(html).toContain('dir="rtl"');
    const t = text(html);
    for (const part of ['بل', 'نمبر', 'آئٹم', 'بیچ', 'مقدار', 'ریٹ', 'رعایت', 'ٹیکس', 'رقم', 'گاہک کے دستخط', 'مجاز دستخط', 'کل رقم']) expect(t, part).toContain(part);
  });

  it('says COPY only when it is a copy', () => {
    expect(renderDocumentMarkup(asInvoice(sale()), 'en')).not.toContain('COPY');
    expect(renderDocumentMarkup(asInvoice(sale({ is_copy: true })), 'en')).toContain('COPY');
  });
});

describe('the whole page', () => {
  it('carries its fonts INSIDE it (data addresses), loads nothing from anywhere, and forbids the network', () => {
    for (const language of ['en', 'ur'] as const) {
      for (const kind of ['receipt', 'invoice'] as const) {
        const html = renderDocumentHtml({ ...sale(), kind }, language, FONTS);
        expect(html).toContain("font-family:'Naskh'");
        expect(html).toContain('data:font/woff2;base64,DDDD'); // the Urdu font
        expect(html).toContain('data:font/woff2;base64,AAAA'); // the English font
        expect(html).not.toMatch(/https?:/i); // no address of any kind to fetch
        expect(html).not.toMatch(/<link|<script|@import|<img/i);
        for (const url of html.matchAll(/url\(([^)]*)\)/g)) expect(url[1], 'every url() is a data: address').toMatch(/^data:font\/woff2;base64,/);
        expect(html).toContain("default-src 'none'");
        expect(html).toContain('font-src data:');
      }
    }
  });

  it('is a complete page in the document language and direction', () => {
    expect(renderDocumentHtml(sale(), 'ur', FONTS)).toMatch(/^<!doctype html><html lang="ur" dir="rtl">/);
    expect(renderDocumentHtml(sale(), 'en', FONTS)).toMatch(/^<!doctype html><html lang="en" dir="ltr">/);
  });

  it('the Urdu stack puts the Latin font first (numbers, the English shop name) and the Urdu font behind it', () => {
    expect(documentCss(FONTS, 'receipt')).toContain("[lang=\"ur\"]{font-family:'Plex','Naskh'");
  });

  it('receipt paper is 80 mm wide (72 mm printable) and as long as it needs; the invoice is A4', () => {
    expect(PAGE.receipt).toMatchObject({ widthMm: 80, printableMm: 72, heightMm: null });
    expect(PAGE.invoice).toMatchObject({ widthMm: 210, heightMm: 297 });
    expect(documentCss(FONTS, 'receipt')).toContain('@page{size:80mm auto;margin:0}');
    expect(documentCss(FONTS, 'invoice')).toContain('@page{size:A4;margin:0}');
  });

  it('NO cost, margin or profit appears in any document, whatever the language or paper', () => {
    for (const language of ['en', 'ur'] as const) {
      for (const kind of ['receipt', 'invoice'] as const) {
        const html = renderDocumentHtml({ ...sale(), kind, is_copy: true }, language, FONTS);
        expect(html.replace(/<style>[\s\S]*<\/style>/, '')).not.toMatch(/cost|margin|profit|purchase price/i); // (the stylesheet has CSS margins)
      }
    }
  });
});

describe('Latin words inside Urdu text', () => {
  it('each Latin or number run is its own left-to-right island in an Urdu document (or "1 L" would be shown as "L 1"), and English text is left alone', () => {
    const named = sale({ lines: [{ ...sale().lines[0]!, name_ur: 'کیڑے مار دوا ایکس 1 L' }] });
    expect(renderDocumentMarkup(named, 'ur')).toContain('کیڑے مار دوا ایکس <span class="ltr">1 L</span>');
    expect(renderDocumentMarkup(named, 'en')).not.toContain('class="ltr"');
    expect(renderDocumentMarkup(asInvoice(named), 'ur')).toContain('<span class="ltr">Chak 12</span>');
  });
});

describe('the COPY and VOIDED marks (both papers, both languages)', () => {
  const papers = [
    ['receipt', (d: InvoiceDocumentData) => d],
    ['A4 invoice', asInvoice],
  ] as const;

  it.each(papers)('%s: the English mark is exactly "COPY"; the Urdu one is "COPY · نقل" in full, in its own mark', (_paper, make) => {
    const en = renderDocumentMarkup(make(sale({ is_copy: true, copies_printed: 1 })), 'en');
    expect(en).toContain('<div class="copy-mark">COPY</div>');
    expect(en).not.toContain('نقل');
    const ur = renderDocumentMarkup(make(sale({ is_copy: true, copies_printed: 1 })), 'ur');
    expect(ur).toContain('<div class="copy-mark">COPY · نقل</div>');
    expect(text(ur)).toContain('COPY · نقل');
    expect(renderDocumentMarkup(make(sale({ is_copy: false })), 'ur')).not.toContain('نقل');
  });

  it.each(papers)('%s: a voided invoice says VOIDED (English) or منسوخ (Urdu) in a mark, and an active one never does', (_paper, make) => {
    const voided = (over: Partial<InvoiceDocumentData['invoice']> = {}) => sale({ invoice: { ...sale().invoice, status: 'voided', ...over } });
    expect(renderDocumentMarkup(make(voided()), 'en')).toContain('<div class="copy-mark">VOIDED</div>');
    expect(renderDocumentMarkup(make(voided()), 'ur')).toContain('<div class="copy-mark">منسوخ</div>');
    expect(renderDocumentMarkup(make(sale()), 'en')).not.toContain('VOIDED');
    expect(renderDocumentMarkup(make(sale()), 'ur')).not.toContain('منسوخ');
    // a voided COPY carries both marks
    const both = renderDocumentMarkup(make({ ...voided(), is_copy: true }), 'en');
    expect(both).toContain('COPY');
    expect(both).toContain('VOIDED');
  });
});

describe('rows that appear only when they apply', () => {
  const papers = [
    ['receipt', (d: InvoiceDocumentData) => d],
    ['A4 invoice', asInvoice],
  ] as const;
  const noTax = (): InvoiceDocumentData => sale({ invoice: { ...sale().invoice, tax_total: 0 }, lines: sale().lines.map((l) => ({ ...l, tax_amount: 0 })) });

  // docs/design/Receipts80.dc.html only shows "Includes tax" on a sale that has tax (Rs 91). With no tax in the sale a row saying "Includes tax Rs 0" would be noise,
  // so the row is left out (as on the A4 page).
  it.each(papers)('%s: "Includes tax" shows with tax in the sale and is left out at zero tax (English and Urdu)', (_paper, make) => {
    expect(text(renderDocumentMarkup(make(sale()), 'en'))).toContain('Includes tax Rs 91');
    expect(text(renderDocumentMarkup(make(sale()), 'ur'))).toContain('ٹیکس سمیت Rs 91');
    expect(text(renderDocumentMarkup(make(noTax()), 'en'))).not.toContain('Includes tax');
    expect(text(renderDocumentMarkup(make(noTax()), 'ur'))).not.toContain('ٹیکس سمیت');
  });

  it.each(papers)('%s: "Pay by" shows only when something is on Khata, even if a due date is stored', (_paper, make) => {
    expect(text(renderDocumentMarkup(make(sale()), 'en'))).toContain('Pay by 30 Nov 2026');
    expect(text(renderDocumentMarkup(make(sale()), 'ur'))).toContain('ادائیگی کی تاریخ 30 Nov 2026');
    const paidInFull = sale({ invoice: { ...sale().invoice, paid_amount: 205_000, on_khata: 0, due_date: '2026-11-30' } });
    expect(text(renderDocumentMarkup(make(paidInFull), 'en'))).not.toContain('Pay by');
    expect(text(renderDocumentMarkup(make(paidInFull), 'en'))).not.toContain('30 Nov 2026');
    expect(text(renderDocumentMarkup(make(paidInFull), 'ur'))).not.toContain('ادائیگی کی تاریخ');
    expect(text(renderDocumentMarkup(make(paidInFull), 'en'))).not.toContain('On Khata');
    const noDate = sale({ invoice: { ...sale().invoice, due_date: null } });
    expect(text(renderDocumentMarkup(make(noDate), 'en'))).not.toContain('Pay by');
  });
});

describe('left-to-right isolation inside Urdu documents', () => {
  const urdu = (over: Partial<InvoiceDocumentData> = {}): InvoiceDocumentData =>
    sale({ shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ Club 7', address: null, phone: null }, ...over });

  it('the stylesheet really isolates: .ltr and .num are direction:ltr with unicode-bidi:isolate (without it the wrapper does nothing)', () => {
    for (const kind of ['receipt', 'invoice'] as const) {
      const css = /<style>([\s\S]*?)<\/style>/.exec(renderDocumentHtml({ ...urdu(), kind }, 'ur', FONTS))![1]!.replace(/\s+/g, '');
      expect(css).toContain('.ltr{direction:ltr;unicode-bidi:isolate}');
      expect(css).toMatch(/\.num\{direction:ltr;unicode-bidi:isolate;/);
    }
  });

  it('A4: the shop name and the customer keep their Latin words as left-to-right islands in Urdu, and English text is left alone', () => {
    const ur = renderDocumentMarkup(asInvoice(urdu()), 'ur');
    expect(ur).toContain('<div class="shop">پیسٹیسائیڈ <span class="ltr">Club 7</span></div>');
    expect(ur).toContain('<div class="value">راشد · <span class="ltr">Chak 12</span></div>');
    const en = renderDocumentMarkup(asInvoice(urdu()), 'en');
    expect(en).toContain('<div class="shop">Pesticide Club Shop</div>');
    expect(en).not.toContain('class="ltr"');
  });

  it('receipt: the shop name and the customer line keep their Latin words as left-to-right islands in Urdu', () => {
    const ur = renderDocumentMarkup(urdu(), 'ur');
    expect(ur).toContain('<div class="shop">پیسٹیسائیڈ <span class="ltr">Club 7</span></div>');
    expect(ur).toContain('<span>راشد · <span class="ltr">Chak 12</span></span>');
    expect(renderDocumentMarkup(urdu(), 'en')).not.toContain('class="ltr"');
  });

  it('A4: the position and the batch number cells are numbers (isolated), in both languages', () => {
    for (const language of ['en', 'ur'] as const) {
      const html = renderDocumentMarkup(asInvoice(sale()), language);
      expect(html, language).toContain('<td><span class="num">1</span></td>');
      expect(html, language).toContain('<td><span class="num">3</span></td>');
      expect(html, language).toContain('<td><span class="num">B-001</span></td>');
      expect(html, language).toContain('<td><span class="num">FG-014</span></td>');
      expect(html, language).toContain('<td class="c-num"><span class="num">Rs 500/' + (language === 'ur' ? 'پیک' : 'pack') + '</span></td>');
    }
  });

  it('receipt: the invoice number, the date and every "quantity × rate" line are numbers (isolated), in both languages', () => {
    for (const language of ['en', 'ur'] as const) {
      const html = renderDocumentMarkup(sale(), language);
      expect(html, language).toContain('<span class="num">INV-A-000002</span>');
      expect(html, language).toContain('<span class="num">12 Oct 2026, 10:42</span>');
      expect(html, language).toContain(language === 'ur' ? '<span class="num">2 پیک × Rs 500/پیک</span>' : '<span class="num">2 packs × Rs 500/pack</span>');
      expect(html, language).toContain(language === 'ur' ? '<span class="num">3 پیک × Rs 350/پیک</span>' : '<span class="num">3 packs × Rs 350/pack</span>');
    }
  });
});

describe('quantities', () => {
  const line = sale().lines;
  it('a whole-pack line is "packs x price"; a loose line is "amount x price per pack unit"', () => {
    expect(lineQuantity(line[0]!, 'en')).toEqual({ loose: false, packs: 2, qtyText: '2 packs', rateText: 'Rs 500/pack' });
    expect(lineQuantity(line[0]!, 'ur')).toMatchObject({ qtyText: '2 پیک', rateText: 'Rs 500/پیک' });
    expect(lineQuantity(line[1]!, 'en')).toEqual({ loose: true, packs: null, qtyText: '0.25 kg', rateText: 'Rs 200/kg' });
    expect(lineQuantity(line[1]!, 'ur')).toMatchObject({ qtyText: '0.25 کلو', rateText: 'Rs 200/کلو' });
    expect(lineQuantity({ ...line[1]!, qty: 1500 }, 'en').qtyText).toBe('1.5 kg');
    expect(lineQuantity({ ...line[2]!, qty: 100, unit_price: 35_000 }, 'en')).toMatchObject({ loose: true, qtyText: '0.1 L', rateText: 'Rs 1,400/L' });
  });

  it('a product sold by the piece is always whole packs', () => {
    const piece = { ...line[0]!, base_unit: 'piece' as const, pack_size: 1, qty: 3, unit_price: 12_000 };
    expect(lineQuantity(piece, 'en')).toMatchObject({ loose: false, packs: 3, qtyText: '3 pieces', rateText: 'Rs 120/piece' });
    expect(quantityText(3, 'piece', 'en')).toBe('3 pieces');
    expect(quantityText(1, 'piece', 'en')).toBe('1 piece');
    expect(quantityText(3, 'piece', 'ur')).toBe('3 عدد');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Conformance with the design files: docs/design/Receipts80.dc.html and InvoiceA4.dc.html are plain HTML. Every piece of text the design prints
// (English and Urdu, exact) must be on the built page, and the main measurements are the design's.
// ---------------------------------------------------------------------------------------------------------------------------
describe('conformance with docs/design (Receipts80.dc.html, InvoiceA4.dc.html)', () => {
  const read = (name: string): string => readFileSync(join(__dirname, '..', '..', '..', 'docs', 'design', name), 'utf8');
  /** The text pieces of the part of the design between two markers, one per element (empty ones dropped). */
  const designTexts = (html: string, from: string, to: string): string[] => {
    const start = html.indexOf(from);
    const part = html.slice(start, html.indexOf(to, start + 1));
    return [...part.matchAll(/>([^<>]+)</g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim()).filter((t) => t !== '' && !t.includes('right to left'));
  };
  const SUPERSEDED: Record<'en' | 'ur', Record<string, string>> = {
    en: { '2 × Rs 500': '2 packs × Rs 500/pack', '3 × Rs 350': '3 packs × Rs 350/pack', '250 g × Rs 200/kg': '0.25 kg × Rs 200/kg', '250 g': '0.25 kg', 'Fungicide 250 ml': 'Fungicide 0.25 L' },
    ur: { '2 × Rs 500': '2 پیک × Rs 500/پیک', '3 × Rs 350': '3 پیک × Rs 350/پیک', '250 گرام × Rs 200/کلو': '0.25 کلو × Rs 200/کلو', '250 گرام': '0.25 کلو', 'پھپھوندی کش 250 ملی لیٹر': 'پھپھوندی کش 0.25 لیٹر' },
  };
  const urduSale = (): InvoiceDocumentData => sale({ customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'چک 12' }, shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null } });

  const cases: { file: string; kind: 'receipt' | 'invoice'; language: 'en' | 'ur'; from: string; to: string }[] = [
    { file: 'Receipts80.dc.html', kind: 'receipt', language: 'en', from: 'dir="ltr" lang="en"', to: 'dir="rtl" lang="ur"' },
    { file: 'Receipts80.dc.html', kind: 'receipt', language: 'ur', from: 'dir="rtl" lang="ur"', to: '>Notes<' },
    { file: 'InvoiceA4.dc.html', kind: 'invoice', language: 'en', from: 'dir="ltr" lang="en"', to: 'dir="rtl" lang="ur"' },
    { file: 'InvoiceA4.dc.html', kind: 'invoice', language: 'ur', from: 'dir="rtl" lang="ur"', to: '</x-dc>' },
  ];
  for (const c of cases) {
    it(`every text the design prints is on the built ${c.kind === 'receipt' ? '80 mm receipt' : 'A4 invoice'} (${c.language}), word for word`, () => {
      const wanted = designTexts(read(c.file), c.from, c.to);
      expect(wanted.length).toBeGreaterThan(25);
      const data = c.language === 'ur' ? urduSale() : sale();
      const page = text(renderDocumentMarkup(c.kind === 'receipt' ? data : asInvoice(data), c.language));
      // The designs were drawn before the standard-units rule (kg, L, piece; never g or ml). These pieces are replaced by what the rule prints now.
      const missing = wanted.map((w) => SUPERSEDED[c.language][w] ?? w).filter((w) => !page.includes(w));
      expect(missing).toEqual([]);
    });
  }

  it("the measurements are the design's: 14px text, 19px shop name, 22px total on the receipt; 26px name, 24px title, 22px total, 340px totals block, 56px margins on the A4 page", () => {
    const css = documentCss(FONTS, 'receipt').replace(/\s+/g, '');
    for (const rule of [
      '.receipt{width:72mm;margin:0auto;padding:18px024px;font-size:14px;line-height:1.5',
      '.receipt.shop{font-size:19px;font-weight:700}',
      '.receipt.row.total{font-size:22px;font-weight:700}',
      '.receipt.totals{margin-top:8px;border-top:2pxsolid#111;padding-top:8px}',
      '.receipt.items.item{padding:6px0;border-bottom:1pxdashed#9AA39D}',
      '.invoice{width:182mm;height:1120px;margin:0auto;padding:56px0;font-size:14px;line-height:1.6',
      '.invoice.shop{font-size:26px;font-weight:700}',
      '.invoice.title{font-size:24px;font-weight:700;letter-spacing:.06em}',
      '.invoice.sums{width:340px',
      'gap:28px',
      '.invoice.sums.row.total{font-size:22px;font-weight:700;color:#1F5D3A;padding-top:8px;border-top:2pxsolid#1B2A22}',
      '.invoicetable.linesth{background:#EFEDE4;border-bottom:1pxsolid#CFCBBE;font-size:12px;font-weight:700;letter-spacing:.04em;padding:10px12px',
    ]) {
      expect(css, rule).toContain(rule);
    }
  });
});

describe('standard units on every printed document (English and Urdu)', () => {
  for (const language of ['en', 'ur'] as const) {
    for (const kind of ['receipt', 'invoice'] as const) {
      it(`${language} ${kind === 'receipt' ? '80 mm receipt' : 'A4 invoice'}: quantities in kg / L / pieces; old g and ml names are shown converted; never g or ml`, () => {
        const data = kind === 'receipt' ? sale() : asInvoice(sale());
        const page = text(renderDocumentMarkup(data, language));
        expect(smallUnitsIn(page)).toEqual([]);
        expect(UNIT_WORDS[language].test(page)).toBe(true);
        expect(page).toContain(language === 'ur' ? '0.25 کلو' : '0.25 kg');
        // the sale-time name still says "250 ml" in its snapshot; it is shown as 0.25 L
        expect(page).toContain(language === 'ur' ? '0.25 لیٹر' : '0.25 L');
      });
    }
  }
});
