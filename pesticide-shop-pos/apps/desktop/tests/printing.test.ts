// Phase 5, M5 + M6: the invoice history channels, receipts and A4 invoices, printing and the PDF fallback, through the real main-process
// handlers, a real SQLite database and the REAL bundled fonts. The printer and the PDF maker are a fake that records what it is given.
import { randomUUID } from 'node:crypto';
import { channels, type Channel } from '@pos/api-contract';
import { DomainError, systemClock, createPaymentService } from '@pos/core';
import { createSqliteUnitOfWork, loadDeviceInfo } from '@pos/db-sqlite';
import { renderDocumentMarkup } from '@pos/ui/print';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { documentFonts } from '../src/main/printing/fonts.js';
import { day, fakePrinting, makeShop, type Shop } from './support.js';

const attempt = async <T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: DomainError }> => {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
};

const COST = 7_654_321; // a cost nothing else in the shop looks like

describe('invoice history, receipts and printing', () => {
  let shop: Shop;
  let printer: ReturnType<typeof fakePrinting>;
  const h = () => shop.runtime.handlers;
  const rashid = () => shop.demo.customers['rashid']!;
  const p = (key: string) => shop.demo.products[key]!;

  /** The sale in the approved designs, on Rashid's Khata (he owed Rs 2,000): paid Rs 1,000, Rs 1,050 on Khata, balance Rs 3,050. */
  async function designSale() {
    return h()['sale:create']({
      customer_id: rashid(),
      paid_amount: 100_000,
      due_date: '2026-11-30',
      lines: [
        { product_id: p('insecticide1l'), qty: 2000 },
        { product_id: p('fertilizer1kg'), qty: 250 },
        { product_id: p('fungicide250'), qty: 750, line_discount: 5000 },
      ],
    });
  }

  beforeEach(async () => {
    printer = fakePrinting();
    shop = await makeShop({ printing: printer.driver });
    await shop.signInAs('owner');
    // a distinctive COST in the batch the sale will draw from (the earliest expiry), so a leak of it anywhere is visible
    await h()['stock:openingStock']({ product_id: p('insecticide1l'), batch_no: 'B-001', expiry_date: day(5), cost_price: COST, qty: 10_000 });
  });
  afterEach(() => shop.runtime.close());

  describe('who may call what', () => {
    it('staff can look up invoices, read a receipt, print and read the print settings', async () => {
      const sold = await designSale();
      await shop.signOut();
      await shop.signInAs('staff');
      expect((await h()['invoices:list']({})).rows).toHaveLength(1);
      expect((await h()['invoices:get']({ invoice_id: sold.invoice.id })).invoice.invoice_no).toBe(sold.invoice.invoice_no);
      expect((await h()['invoices:receipt']({ invoice_id: sold.invoice.id })).kind).toBe('receipt');
      expect(await h()['printers:list']({})).toHaveLength(1);
      expect((await h()['print:getConfig']({})).receipt_language).toBe('en');
      expect((await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' })).status).toBe('printed');
    });

    it('only the owner changes the print settings: staff get NOT_AUTHORIZED naming the capability, and nothing is written', async () => {
      await shop.signOut();
      await shop.signInAs('staff');
      const before = [shop.count('settings'), shop.count('audit_log')];
      const result = await attempt(h()['print:setConfig']({ shop_phone: '0300 1234567', printer_name: 'POS-80' }));
      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED', params: { capability: 'print.configure' } } });
      expect([shop.count('settings'), shop.count('audit_log')]).toEqual(before);
      expect((await h()['print:getConfig']({})).shop_phone).toBeNull();
    });

    it('nobody signed in: every invoice and print channel says NOT_SIGNED_IN', async () => {
      const sold = await designSale();
      await shop.signOut();
      const inputs: Partial<Record<Channel, unknown>> = {
        'invoices:list': {},
        'invoices:get': { invoice_id: sold.invoice.id },
        'invoices:receipt': { invoice_id: sold.invoice.id },
        'print:document': { invoice_id: sold.invoice.id, kind: 'receipt' },
        'printers:list': {},
        'print:getConfig': {},
        'print:setConfig': { shop_phone: 'x' },
      };
      expect(Object.keys(inputs).sort()).toEqual(channels.filter((c) => /^(invoices|print|printers):/.test(c)).sort());
      for (const [channel, input] of Object.entries(inputs)) {
        const handler = h()[channel as Channel] as (i: unknown) => Promise<unknown>;
        expect(await attempt(handler(input)), channel).toMatchObject({ ok: false, error: { code: 'NOT_SIGNED_IN' } });
      }
      expect(printer.state.printed).toHaveLength(0);
    });

    it('the owner changes the settings, which are written to the audit log; staff then see them', async () => {
      const config = await h()['print:setConfig']({ printer_name: 'POS-80', receipt_language: 'ur', shop_address: 'Main Road, Chak 12', shop_phone: '0300 1234567', shop_name_ur: 'پیسٹیسائیڈ کلب شاپ' });
      expect(config).toEqual({ printer_name: 'POS-80', receipt_language: 'ur', invoice_language: 'en', shop_name_ur: 'پیسٹیسائیڈ کلب شاپ', shop_address: 'Main Road, Chak 12', shop_phone: '0300 1234567' });
      expect(shop.runtime.db.prepare("SELECT user_id FROM audit_log WHERE action = 'print_config_changed'").all()).toEqual([{ user_id: shop.ownerId }]);
      // a partial change leaves the rest; null clears
      expect(await h()['print:setConfig']({ shop_phone: null })).toMatchObject({ shop_phone: null, shop_address: 'Main Road, Chak 12', receipt_language: 'ur' });
      await shop.signOut();
      await shop.signInAs('staff');
      expect(await h()['print:getConfig']({})).toMatchObject({ printer_name: 'POS-80', shop_address: 'Main Road, Chak 12' });
    });
  });

  describe('the invoice history', () => {
    it('lists newest first, searches the number and the English or Urdu name, and filters by status, customer and date', async () => {
      const first = await designSale();
      const second = await h()['sale:create']({ paid_amount: 50_000, lines: [{ product_id: p('insecticide1l'), qty: 1000 }] }); // a walk-in
      const all = await h()['invoices:list']({});
      expect(all.total).toBe(2);
      expect(all.rows.map((r) => r.id)).toEqual([second.invoice.id, first.invoice.id]);
      expect(all.rows[1]).toMatchObject({ invoice_no: first.invoice.invoice_no, customer_name_en: 'Rashid', customer_name_ur: 'راشد', total: 205_000, paid_amount: 100_000, on_khata: 105_000, sold_by: 'Owner', line_count: 3, print_count: 0 });
      expect(all.rows[0]).toMatchObject({ customer_name_en: null, on_khata: 0, line_count: 1 });

      expect((await h()['invoices:list']({ query: first.invoice.invoice_no.toLowerCase() })).rows.map((r) => r.id)).toEqual([first.invoice.id]);
      expect((await h()['invoices:list']({ query: 'rash' })).rows.map((r) => r.id)).toEqual([first.invoice.id]);
      expect((await h()['invoices:list']({ query: 'راشد' })).rows.map((r) => r.id)).toEqual([first.invoice.id]);
      expect((await h()['invoices:list']({ query: 'nobody-by-that-name' })).rows).toEqual([]);
      expect((await h()['invoices:list']({ customer_id: rashid() })).total).toBe(1);
      expect((await h()['invoices:list']({ status: 'voided' })).total).toBe(0);
      expect((await h()['invoices:list']({ from: shop.today, to: shop.today })).total).toBe(2);
      expect((await h()['invoices:list']({ from: day(1) })).total).toBe(0);
      expect((await h()['invoices:list']({ limit: 1, offset: 1 })).rows.map((r) => r.id)).toEqual([first.invoice.id]);
    });

    it('invoices:get gives the lines as sold, with the batch number and the tax per line, and says NOT_FOUND for an unknown invoice', async () => {
      await h()['catalogue:updateSize']({ product_id: p('insecticide1l'), changes: { tax_rate_bp: 1800 } });
      const sold = await designSale();
      const detail = await h()['invoices:get']({ invoice_id: sold.invoice.id });
      expect(detail.lines).toHaveLength(3);
      expect(detail.lines[0]).toMatchObject({ position: 1, name_en: 'Insecticide X 1 L', batch_no: 'B-001', qty: 2000, base_unit: 'ml', pack_size: 1000, unit_price: 50_000, tax_rate_bp: 1800, line_total: 100_000 });
      expect(detail.lines[0]!.tax_amount).toBe(Math.round((100_000 * 1800) / 11_800));
      expect(detail.lines[1]).toMatchObject({ qty: 250, base_unit: 'g', pack_size: 1000, line_total: 5000 });
      expect(detail.lines[2]).toMatchObject({ line_discount: 5000, line_total: 100_000 });
      expect(detail).toMatchObject({ sold_by: 'Owner', customer: { name_en: 'Rashid', village: 'Chak 12' }, invoice: { on_khata: 105_000, due_date: '2026-11-30' } });
      expect(await attempt(h()['invoices:get']({ invoice_id: randomUUID() }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['invoices:receipt']({ invoice_id: randomUUID() }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['print:document']({ invoice_id: randomUUID(), kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('a line keeps the name it was SOLD under: renaming the product or its size afterwards does not change the invoice or its receipt', async () => {
      const sold = await designSale();
      const group = shop.runtime.db.prepare('SELECT group_id FROM products WHERE id = ?').get(p('insecticide1l')) as { group_id: string };
      await h()['catalogue:updateGroup']({ group_id: group.group_id, name_en: 'Totally New Name', name_ur: 'بالکل نیا نام' });
      await h()['catalogue:updateSize']({ product_id: p('insecticide1l'), changes: { pack_label: '1 litre' } });
      const detail = await h()['invoices:get']({ invoice_id: sold.invoice.id });
      expect(detail.lines[0]).toMatchObject({ name_en: 'Insecticide X 1 L', name_ur: 'کیڑے مار دوا ایکس 1 L' });
      const t = renderDocumentMarkup(await h()['invoices:receipt']({ invoice_id: sold.invoice.id }), 'en');
      expect(t).toContain('Insecticide X 1 L');
      expect(t).not.toContain('Totally New Name');
    });
  });

  describe('the balance on a receipt is as of the sale', () => {
    it('is the balance right after that sale (Rs 2,000 owed + Rs 1,050 on Khata = Rs 3,050)', async () => {
      const sold = await designSale();
      const doc = await h()['invoices:receipt']({ invoice_id: sold.invoice.id });
      expect(doc.balance_as_of_sale).toBe(305_000);
      expect(doc.invoice.on_khata).toBe(105_000);
    });

    it('does not change when the customer pays later or buys again: the old receipt reads exactly as before', async () => {
      const sold = await designSale();
      const before = await h()['invoices:receipt']({ invoice_id: sold.invoice.id });
      const htmlBefore = renderDocumentMarkup(before, 'en');

      // Rashid pays Rs 1,500 the next day, then buys again on credit
      const info = loadDeviceInfo(shop.runtime.db)!;
      const payments = createPaymentService({ uow: createSqliteUnitOfWork(shop.runtime.db, info.scope), clock: systemClock, ids: { newId: () => randomUUID() }, scope: info.scope });
      payments.receiveFromCustomer({ party_id: rashid(), amount: 150_000, method: 'cash', created_by: shop.ownerId });
      const later = await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: p('insecticide1l'), qty: 1000 }] });
      const todays = (shop.runtime.db.prepare("SELECT SUM(amount_delta) AS b FROM ledger_entries WHERE party_type = 'customer' AND party_id = ?").get(rashid()) as { b: number }).b;
      expect(todays).toBe(305_000 - 150_000 + 50_000); // today's balance really did move (so this test can tell)

      const after = await h()['invoices:receipt']({ invoice_id: sold.invoice.id });
      expect(after.balance_as_of_sale).toBe(305_000);
      expect(after).toEqual(before);
      expect(renderDocumentMarkup(after, 'en')).toBe(htmlBefore);
      // and the later sale has its own balance: 3,050 - 1,500 + 500 = 2,050
      expect((await h()['invoices:receipt']({ invoice_id: later.invoice.id })).balance_as_of_sale).toBe(205_000);
    });

    it('a walk-in sale has no balance', async () => {
      const walkIn = await h()['sale:create']({ paid_amount: 50_000, lines: [{ product_id: p('insecticide1l'), qty: 1000 }] });
      expect((await h()['invoices:receipt']({ invoice_id: walkIn.invoice.id })).balance_as_of_sale).toBeNull();
    });
  });

  describe('printing: COPY on a reprint, never on the first print', () => {
    it('the first print is not a copy; the second and later ones say COPY; each kind of document counts on its own', async () => {
      const sold = await designSale();
      const id = sold.invoice.id;
      expect((await h()['invoices:receipt']({ invoice_id: id })).is_copy).toBe(false);

      const first = await h()['print:document']({ invoice_id: id, kind: 'receipt' });
      expect(first).toMatchObject({ status: 'printed', is_copy: false, fallback: null, pdf_path: null, kind: 'receipt' });
      expect(printer.state.printed[0]!.html).not.toContain('COPY');

      const second = await h()['print:document']({ invoice_id: id, kind: 'receipt' });
      expect(second).toMatchObject({ status: 'printed', is_copy: true });
      expect(printer.state.printed[1]!.html).toContain('COPY');
      expect((await h()['print:document']({ invoice_id: id, kind: 'receipt' })).is_copy).toBe(true);

      // the A4 invoice has not been printed yet: its first print is not a copy
      const a4 = await h()['print:document']({ invoice_id: id, kind: 'invoice' });
      expect(a4.is_copy).toBe(false);
      expect(printer.state.printed[3]!.html).not.toContain('COPY');
      expect((await h()['invoices:receipt']({ invoice_id: id, kind: 'invoice' })).is_copy).toBe(true); // a print now would say COPY
      expect((await h()['invoices:list']({})).rows[0]!.print_count).toBe(4);
      expect(shop.runtime.db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'invoice_printed' AND row_id = ?").get(id)).toEqual({ c: 4 });
    });

    it('another invoice is not affected, and merely looking at a receipt never counts as a print', async () => {
      const a = await designSale();
      const b = await h()['sale:create']({ paid_amount: 50_000, lines: [{ product_id: p('insecticide1l'), qty: 1000 }] });
      await h()['invoices:receipt']({ invoice_id: a.invoice.id });
      await h()['invoices:receipt']({ invoice_id: a.invoice.id });
      expect((await h()['print:document']({ invoice_id: a.invoice.id, kind: 'receipt' })).is_copy).toBe(false);
      expect((await h()['print:document']({ invoice_id: b.invoice.id, kind: 'receipt' })).is_copy).toBe(false);
    });

    it('a print is recorded for the signed-in user (not for whoever the renderer names)', async () => {
      const sold = await designSale();
      await shop.signOut();
      await shop.signInAs('staff');
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      expect(shop.runtime.db.prepare("SELECT user_id FROM audit_log WHERE action = 'invoice_printed'").all()).toEqual([{ user_id: shop.staffId }]);
    });
  });

  describe('the printed page: real fonts inside it, Urdu right to left, paper size', () => {
    it('the Urdu receipt is right to left, in Urdu, and carries the real Urdu and English fonts as data (nothing to fetch)', async () => {
      const sold = await designSale();
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt', language: 'ur' });
      const html = printer.state.printed[0]!.html;
      expect(html).toMatch(/^<!doctype html><html lang="ur" dir="rtl">/);
      expect(html).toContain('رسید');
      expect(html).toContain('کھاتے میں باقی');
      expect(html).toContain('کیڑے مار دوا ایکس <span class="ltr">1 L</span>'); // the Latin label is its own left-to-right island, or the bidi rules would show it as "L 1"
      expect(html).toContain('Rs 3,050');
      // the real files: woff2 data (the "wOF2" signature is "d09GMg" in base64) of a real size, for the Urdu face and the three English ones
      expect(documentFonts.naskh).toMatch(/^data:font\/woff2;base64,d09GMg/);
      expect(documentFonts.naskh.length).toBeGreaterThan(50_000);
      for (const face of [documentFonts.plex400, documentFonts.plex600, documentFonts.plex700]) expect(face).toMatch(/^data:font\/woff2;base64,d09GMg/);
      expect(html).toContain(documentFonts.naskh);
      expect(html).toContain(documentFonts.plex400);
      expect(html).not.toMatch(/https?:|<link|<script|@import/i);
      expect([...html.matchAll(/url\(([^)]*)\)/g)].every((m) => m[1]!.startsWith('data:font/woff2;base64,'))).toBe(true);
    });

    it('the receipt goes to 80 mm paper that is as long as it needs; the invoice goes to A4', async () => {
      const sold = await designSale();
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice' });
      expect(printer.state.printed[0]!.page).toEqual({ widthMm: 80, heightMm: null });
      expect(printer.state.printed[1]!.page).toEqual({ widthMm: 210, heightMm: 297 });
      expect(printer.state.printed[1]!.html).toContain('data-document="invoice"');
    });

    it('the language is the owner\'s setting for that kind of document, unless the call says otherwise', async () => {
      const sold = await designSale();
      await h()['print:setConfig']({ receipt_language: 'ur', invoice_language: 'en' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice', language: 'ur' });
      expect(printer.state.printed.map((x) => x.html.slice(0, 40))).toEqual([
        '<!doctype html><html lang="ur" dir="rtl">', '<!doctype html><html lang="en" dir="ltr">', '<!doctype html><html lang="ur" dir="rtl">',
      ].map((s) => s.slice(0, 40)));
    });

    it('the shop name is the real one; address and phone are a marked placeholder until the owner gives them', async () => {
      const sold = await designSale();
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      expect(printer.state.printed[0]!.html).toContain('Pesticide Club Shop');
      expect(printer.state.printed[0]!.html).toContain('[Address and phone]');
      await h()['print:setConfig']({ shop_address: 'Main Road, Chak 12', shop_phone: '0300 1234567' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      expect(printer.state.printed[1]!.html).toContain('Main Road, Chak 12 · 0300 1234567');
      expect(printer.state.printed[1]!.html).not.toContain('[Address and phone]');
    });

    it('prints to the printer the owner chose', async () => {
      const sold = await designSale();
      await h()['print:setConfig']({ printer_name: 'POS-80' });
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      expect(printer.state.printed[0]!.printerName).toBe('POS-80');
    });
  });

  describe('the PDF fallback is a normal outcome, not an error', () => {
    it('no printer available: the document is saved as a PDF and the reply says why', async () => {
      printer.state.printers = [];
      const sold = await designSale();
      const result = await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' });
      expect(result).toMatchObject({ status: 'pdf_saved', fallback: 'no_printer', is_copy: false });
      expect(result.pdf_path).toBe(`C:/Documents/Receipts/${sold.invoice.invoice_no}-receipt-en.pdf`);
      expect(printer.state.printed).toHaveLength(0);
      expect(printer.state.pdfs).toHaveLength(1);
      expect(printer.state.saved).toEqual([{ fileName: `${sold.invoice.invoice_no}-receipt-en.pdf`, bytes: 4 }]);
    });

    it('the printer fails: the document is saved as a PDF, with the reason print_failed', async () => {
      printer.state.failPrint = true;
      const sold = await designSale();
      const result = await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice' });
      expect(result).toMatchObject({ status: 'pdf_saved', fallback: 'print_failed', kind: 'invoice' });
      expect(printer.state.pdfs[0]!.page).toEqual({ widthMm: 210, heightMm: 297 });
    });

    it('the chosen printer is no longer there: no_printer, a PDF', async () => {
      await h()['print:setConfig']({ printer_name: 'Old printer' });
      const sold = await designSale();
      expect(await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' })).toMatchObject({ status: 'pdf_saved', fallback: 'no_printer' });
    });

    it('asking for a PDF skips the printer, and there is no fallback reason', async () => {
      const sold = await designSale();
      const result = await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt', output: 'pdf' });
      expect(result).toMatchObject({ status: 'pdf_saved', fallback: null });
      expect(printer.state.printed).toHaveLength(0);
    });

    it('a PDF counts as the first copy: printing the same receipt afterwards says COPY', async () => {
      const sold = await designSale();
      await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt', output: 'pdf' });
      expect((await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' })).is_copy).toBe(true);
    });

    it('if not even a PDF can be made it IS an error, and nothing is recorded as printed', async () => {
      printer.state.printers = [];
      printer.state.failPdf = true;
      const sold = await designSale();
      expect(await attempt(h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      expect(shop.runtime.db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'invoice_printed'").get()).toEqual({ c: 0 });
    });

    it('a runtime with no printing at all still answers: no printers, and a print is an error only because there is no way to make a PDF either', async () => {
      const bare = await makeShop();
      try {
        await bare.signInAs('owner');
        expect(await bare.runtime.handlers['printers:list']({})).toEqual([]);
      } finally {
        bare.runtime.close();
      }
    });
  });

  describe('no cost anywhere', () => {
    it('no reply, page or PDF input of any invoice or print channel holds a cost key or the cost the batch was bought at', async () => {
      const sold = await designSale();
      const replies: unknown[] = [
        await h()['invoices:list']({}),
        await h()['invoices:get']({ invoice_id: sold.invoice.id }),
        await h()['invoices:receipt']({ invoice_id: sold.invoice.id }),
        await h()['invoices:receipt']({ invoice_id: sold.invoice.id, kind: 'invoice' }),
        await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' }),
        await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice', language: 'ur' }),
        await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'invoice', output: 'pdf' }),
        await h()['print:getConfig']({}),
        await h()['printers:list']({}),
      ];
      // the owner's own sale reply DOES carry the cost (profit): so the sentinel is real and in the database
      expect(JSON.stringify(sold)).toContain(String(COST));
      expect(shop.runtime.db.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE cost_price = ?').get(COST)).toEqual({ c: 1 });

      const everything = JSON.stringify(replies);
      expect(everything).not.toMatch(/cost/i);
      expect(everything).not.toContain(String(COST));
      for (const { html } of [...printer.state.printed, ...printer.state.pdfs]) {
        expect(html.replace(/<style>[\s\S]*<\/style>/, '')).not.toMatch(/cost|margin|profit/i);
        expect(html).not.toMatch(/7,?654,?321|76,?543\.21/);
      }
      expect(printer.state.printed.length + printer.state.pdfs.length).toBe(3);
    });
  });
});
