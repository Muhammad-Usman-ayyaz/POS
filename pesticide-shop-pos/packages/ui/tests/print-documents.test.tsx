// The receipt and the A4 invoice, as pure rendering from data. (The same documents made from a real database, with the real fonts, are
// tested in apps/desktop/tests/printing.test.ts.)
import type { InvoiceDocumentData } from '@pos/core';
import { describe, expect, it } from 'vitest';
import { documentCss, lineQuantity, PAGE, quantityText, renderDocumentHtml, renderDocumentMarkup, type DocumentFonts } from '../src/print/index.js';

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
    for (const part of ['Pesticide Club Shop', 'Receipt', 'INV-A-000002', '12 Oct 2026, 10:42', 'Rashid · Chak 12', 'Insecticide 1 L', 'Rs 1,000', '2 × Rs 500', 'Fertilizer · loose', '250 g × Rs 200/kg', 'Fungicide 250 ml', '3 × Rs 350', 'Discount', '– Rs 50', 'Total', 'Rs 2,050', 'Includes tax', 'Paid · Cash', 'On Khata', 'Rs 1,050', 'Your balance now', 'Rs 3,050', 'Pay by', '30 Nov 2026', 'Thank you. Please keep this receipt.']) {
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
    for (const part of ['رسید', 'بل', 'گاہک', 'راشد · Chak 12', 'کیڑے مار دوا 1 لیٹر', 'کھاد · کھلی', '250 گرام × Rs 200/کلو', 'رعایت', 'کل رقم', 'ٹیکس سمیت', 'ادا شدہ · نقد', 'کھاتے میں باقی', 'آپ کا کل بقایا', 'ادائیگی کی تاریخ', 'شکریہ۔ رسید سنبھال کر رکھیں۔', 'Rs 3,050', '30 Nov 2026']) {
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

describe('quantities', () => {
  const line = sale().lines;
  it('a whole-pack line is "packs x price"; a loose line is "amount x price per pack unit"', () => {
    expect(lineQuantity(line[0]!, 'en')).toEqual({ loose: false, packs: 2, qtyText: '2', rateText: 'Rs 500' });
    expect(lineQuantity(line[1]!, 'en')).toEqual({ loose: true, packs: null, qtyText: '250 g', rateText: 'Rs 200/kg' });
    expect(lineQuantity(line[1]!, 'ur')).toMatchObject({ qtyText: '250 گرام', rateText: 'Rs 200/کلو' });
    expect(lineQuantity({ ...line[1]!, qty: 1500 }, 'en').qtyText).toBe('1.5 kg');
    expect(lineQuantity({ ...line[2]!, qty: 100, unit_price: 35_000 }, 'en')).toMatchObject({ loose: true, qtyText: '100 ml', rateText: 'Rs 350/250 ml' });
  });

  it('a product sold by the piece is always whole packs', () => {
    const piece = { ...line[0]!, base_unit: 'piece' as const, pack_size: 1, qty: 3, unit_price: 12_000 };
    expect(lineQuantity(piece, 'en')).toMatchObject({ loose: false, packs: 3, qtyText: '3', rateText: 'Rs 120' });
    expect(quantityText(3, 'piece', 'en')).toBe('3 pc');
  });
});
