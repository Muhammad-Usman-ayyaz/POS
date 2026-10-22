// Phase 7: the return slip (80 mm) and the credit note (A4), English and Urdu, as pure rendering from data. (The same documents made from a real
// database with the real fonts are tested in apps/desktop/tests/returns-api.test.ts and by `npm run check:pdf`.)
import type { ReturnDocumentData } from '@pos/core';
import { describe, expect, it } from 'vitest';
import { findCostLeaks, renderReturnSlipHtml, renderReturnSlipMarkup, RETURN_LABELS, type DocumentFonts } from '../src/print/index.js';
import { smallUnitsIn } from './unit-scan.js';

const FONTS: DocumentFonts = { plex400: 'data:font/woff2;base64,AAAA', plex600: 'data:font/woff2;base64,BBBB', plex700: 'data:font/woff2;base64,CCCC', naskh: 'data:font/woff2;base64,DDDD' };
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const slip = (over: Partial<ReturnDocumentData> = {}, kind: 'receipt' | 'invoice' = 'receipt'): ReturnDocumentData => ({
  kind,
  shop: { name: 'Pesticide Club Shop', name_ur: 'پیسٹیسائیڈ کلب شاپ', address: null, phone: null },
  return: { id: 'r1', return_no: 'RET-A-000001', return_date: '2026-10-12', created_at: '2026-10-12T06:30:00.000Z', note: null, total: 83_300, tax_total: 3700, cash_amount: 0, khata_amount: 83_300, requested_by: 'Salesman', approved_by: 'Owner' },
  invoice: { id: 'i2', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', status: 'active', total: 205_000 },
  customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12' },
  customer_id: 'c1',
  lines: [
    { position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', base_unit: 'ml', pack_size: 1000, qty: 1000, unit_price: 50_000, refund_amount: 50_000, tax_refund: 2000, condition: 'resellable', reason: 'changed_mind' },
    { position: 2, name_en: 'Fertilizer', name_ur: 'کھاد', batch_no: 'F-001', base_unit: 'g', pack_size: 1000, qty: 500, unit_price: 20_000, refund_amount: 10_000, tax_refund: 0, condition: 'damaged', reason: 'leaked' },
    { position: 3, name_en: 'Fungicide 250 ml', name_ur: 'پھپھوندی کش 0.25 لیٹر', batch_no: 'G-001', base_unit: 'ml', pack_size: 250, qty: 250, unit_price: 35_000, refund_amount: 23_300, tax_refund: 1700, condition: 'expired', reason: 'expired' },
  ],
  balance_after: 221_700,
  copies_printed: 0,
  is_copy: false,
  time_zone: 'Asia/Karachi',
  ...over,
});

describe('the 80 mm return slip', () => {
  it('says what came back in each line\'s own unit, the refund, the included tax, how it was paid and where the customer stands', () => {
    const page = text(renderReturnSlipMarkup(slip(), 'en'));
    for (const part of ['RETURN SLIP', 'RET-A-000001', 'INV-A-000002', '12 Oct 2026, 11:30', 'Rashid · Chak 12', 'Refund total', 'Rs 833', 'Included tax', 'Rs 37']) expect(page, part).toContain(part);
    expect(page).toContain('1 pack × Rs 500/pack');
    expect(page).toContain('0.5 kg × Rs 200/kg'); // 500 g of a 1 kg size is loose: said in kg
    expect(page).toContain('1 pack × Rs 350/pack');
    expect(page).toContain('Customer changed mind · Back to stock');
    expect(page).toContain('Leaked in transit · Written off');
    expect(page).toContain('Taken off Khata');
    expect(page).not.toContain('Cash back'); // nothing was paid back in cash
    expect(page).toContain('Owes now');
    expect(page).toContain('Rs 2,217');
    expect(page).toContain('Invoice INV-A-000002 is unchanged.');
    expect(smallUnitsIn(page)).toEqual([]);
  });

  it('a part-paid return shows both parts, a cash return shows only cash and no balance line, and an advance is words not a minus sign', () => {
    const both = text(renderReturnSlipMarkup(slip({ return: { ...slip().return, cash_amount: 20_000, khata_amount: 63_300 } }), 'en'));
    expect(both).toContain('Cash back');
    expect(both).toContain('Taken off Khata');
    const cash = text(renderReturnSlipMarkup(slip({ return: { ...slip().return, cash_amount: 83_300, khata_amount: 0 }, balance_after: null }), 'en'));
    expect(cash).toContain('Cash back');
    expect(cash).not.toContain('Taken off Khata');
    expect(cash).not.toContain('Owes now');
    const advance = text(renderReturnSlipMarkup(slip({ balance_after: -50_000 }), 'en'));
    expect(advance).toContain('Advance');
    expect(advance).not.toMatch(/Rs -/);
    const clear = text(renderReturnSlipMarkup(slip({ balance_after: 0 }), 'en'));
    expect(clear).toContain('Clear');
  });

  it('a walk-in return has no customer and no balance', () => {
    const page = text(renderReturnSlipMarkup(slip({ customer: null, customer_id: null, balance_after: null }), 'en'));
    expect(page).not.toContain('Rashid');
    expect(page).not.toContain('Owes now');
  });

  it('says COPY from the second print, and not before', () => {
    expect(text(renderReturnSlipMarkup(slip(), 'en'))).not.toContain('COPY');
    expect(text(renderReturnSlipMarkup(slip({ is_copy: true, copies_printed: 1 }), 'en'))).toContain('COPY');
    expect(text(renderReturnSlipMarkup(slip({ is_copy: true, copies_printed: 1 }), 'ur'))).toContain('COPY');
  });

  it('prints a marked placeholder until the owner enters the address, and the real one after', () => {
    expect(text(renderReturnSlipMarkup(slip(), 'en'))).toContain('[Address and phone]');
    expect(text(renderReturnSlipMarkup(slip({ shop: { ...slip().shop, address: 'Main Bazaar', phone: '0300 1234567' } }), 'en'))).toContain('Main Bazaar · 0300 1234567');
  });
});

describe('the A4 credit note', () => {
  it('is a table of the returned lines with batch, quantity with unit, rate, tax, refund, reason and stock, then the totals and two signatures', () => {
    const page = text(renderReturnSlipMarkup(slip({}, 'invoice'), 'en'));
    for (const part of ['CREDIT NOTE', 'RET-A-000001', 'Batch', 'Qty', 'Rate', 'Tax', 'Refund', 'Reason', 'Stock', 'B-001', 'Back to stock', 'Written off', 'Refund total', 'Approved by', 'Owner', 'Customer signature', 'Authorised signature']) {
      expect(page, part).toContain(part);
    }
    expect(page).toContain('0.5 kg');
    expect(smallUnitsIn(page)).toEqual([]);
  });
});

describe('Urdu', () => {
  it('is right to left, uses the Urdu unit words, keeps Latin runs in a left-to-right island and has no g or ml', () => {
    for (const kind of ['receipt', 'invoice'] as const) {
      const html = renderReturnSlipHtml(slip({}, kind), 'ur', FONTS);
      expect(html).toContain('<html lang="ur" dir="rtl">');
      const page = text(html.replace(/<style>[\s\S]*?<\/style>/, ''));
      expect(page).toContain(kind === 'receipt' ? RETURN_LABELS.ur.returnSlip : RETURN_LABELS.ur.creditNote);
      expect(page).toContain('کلو');
      expect(page).toContain('پیک');
      expect(html).toContain('class="ltr"'); // "1 L" in a name stays "1 L"
      expect(smallUnitsIn(page)).toEqual([]);
    }
  });

  it('has the same words in both languages', () => {
    expect(Object.keys(RETURN_LABELS.ur).sort()).toEqual(Object.keys(RETURN_LABELS.en).sort());
    expect(Object.keys(RETURN_LABELS.ur.reasons).sort()).toEqual(Object.keys(RETURN_LABELS.en.reasons).sort());
  });
});

describe('no cost on any slip', () => {
  it('even if the data carried a cost (a field added by mistake), the slip prints none of it, in either language or paper', () => {
    const COST = 7_654_321;
    const dirty = {
      ...slip(),
      return: { ...slip().return, cost_total: COST, profit: COST },
      lines: slip().lines.map((l) => ({ ...l, cost_price: COST, unit_cost: COST, margin: COST })),
    } as unknown as ReturnDocumentData;
    for (const kind of ['receipt', 'invoice'] as const) {
      for (const language of ['en', 'ur'] as const) {
        const html = renderReturnSlipHtml({ ...dirty, kind }, language, FONTS);
        expect(findCostLeaks(html, COST), `${kind} ${language}`).toEqual([]);
        expect(findCostLeaks(html, 1)).toEqual(expect.not.arrayContaining(['word "cost"']));
      }
    }
  });

  it('a page is a whole document with its fonts inside and no network request allowed', () => {
    const html = renderReturnSlipHtml(slip(), 'en', FONTS);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('data:font/woff2;base64,AAAA');
    expect(html).toContain('@page{size:80mm auto;margin:0}');
    expect(renderReturnSlipHtml(slip({}, 'invoice'), 'en', FONTS)).toContain('@page{size:A4;margin:0}');
    expect(html).toContain('<title>RETURN SLIP RET-A-000001 - Pesticide Club Shop</title>');
  });

  it('text typed by a person (a note, a village) is escaped, never markup', () => {
    const page = renderReturnSlipMarkup(slip({ return: { ...slip().return, note: '<img src=x onerror=alert(1)>' }, customer: { name_en: '<b>Rashid</b>', name_ur: null, village: null } }), 'en');
    expect(page).not.toContain('<img src');
    expect(page).not.toContain('<b>Rashid</b>');
    expect(page).toContain('&lt;img');
  });
});
