// Phase 6 M6: printing a customer statement and a payment receipt, and exporting the statement as CSV, through the REAL main-process handlers, a real
// SQLite database and the REAL bundled fonts. The printer, the PDF maker and the Save-as box are fakes that record what they are given.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { channels, contract, type Channel } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { documentFonts } from '../src/main/printing/fonts.js';
import { day, fakePrinting, fakeSaveDialog, makeShop, type Shop } from './support.js';

const attempt = async <T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: DomainError }> => {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
};
const text = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NEW = ['print:statement', 'print:paymentReceipt', 'khata:exportStatement'] as const satisfies readonly Channel[];

describe('statement and payment receipt printing, and the CSV', () => {
  let shop: Shop;
  let printer: ReturnType<typeof fakePrinting>;
  let saving: ReturnType<typeof fakeSaveDialog>;
  let csvPath: string;
  const h = () => shop.runtime.handlers;
  const rashid = () => shop.demo.customers['rashid']!;
  const imran = () => shop.demo.customers['imran']!;
  const auditRows = (action: string) => shop.runtime.db.prepare('SELECT user_id, table_name, row_id, details FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { user_id: string; table_name: string; row_id: string; details: string }[];
  const lastPage = () => [...printer.state.printed, ...printer.state.pdfs].at(-1)!.html;

  beforeEach(async () => {
    printer = fakePrinting();
    csvPath = join(mkdtempSync(join(tmpdir(), 'pos-stmt-')), 'out.csv');
    saving = fakeSaveDialog(csvPath);
    shop = await makeShop({ printing: printer.driver, saveDialog: saving.dialog });
    await shop.signInAs('owner');
  });
  afterEach(() => shop.runtime.close());

  /** Rashid owes Rs 2,000 (opening). He buys Rs 500 on credit, then pays Rs 1,000 in cash. */
  async function history() {
    await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
    return h()['payments:receive']({ customer_id: rashid(), amount: 100_000, method: 'cash', note: 'part payment' });
  }

  describe('who may call', () => {
    it('staff can print a statement, print a payment receipt and export the CSV', async () => {
      const paid = await history();
      await shop.signOut();
      await shop.signInAs('staff');
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).status).toBe('printed');
      expect((await h()['print:paymentReceipt']({ payment_id: paid.payment.id })).status).toBe('printed');
      expect((await h()['khata:exportStatement']({ customer_id: rashid() })).status).toBe('saved');
      // who printed is the session user
      expect(auditRows('statement_printed')[0]!.user_id).toBe(shop.staffId);
      expect(auditRows('payment_receipt_printed')[0]!.user_id).toBe(shop.staffId);
    });

    it('nobody signed in: every new channel says NOT_SIGNED_IN, prints nothing, asks for no file and writes no audit row', async () => {
      const paid = await history();
      await shop.signOut();
      const inputs = {
        'print:statement': { customer_id: rashid(), kind: 'receipt' },
        'print:paymentReceipt': { payment_id: paid.payment.id },
        'khata:exportStatement': { customer_id: rashid() },
      } as const;
      const audits = shop.count('audit_log');
      for (const channel of NEW) {
        const handler = h()[channel] as (i: unknown) => Promise<unknown>;
        expect(await attempt(handler(inputs[channel])), channel).toMatchObject({ ok: false, error: { code: 'NOT_SIGNED_IN' } });
      }
      expect(printer.state.printed.length + printer.state.pdfs.length).toBe(0);
      expect(saving.state.asked).toHaveLength(0);
      expect(existsSync(csvPath)).toBe(false);
      expect(shop.count('audit_log')).toBe(audits);
    });

    it('the schemas are strict: the renderer cannot say who is acting (created_by, actor, user_id...) and unknown keys are refused', () => {
      const good = { 'print:statement': { customer_id: rashid(), kind: 'receipt' }, 'print:paymentReceipt': { payment_id: randomUUID() }, 'khata:exportStatement': { customer_id: rashid() } } as const;
      for (const channel of NEW) {
        expect(contract[channel].input.safeParse(good[channel]).success, channel).toBe(true);
        for (const key of ['created_by', 'actor_id', 'actor', 'user_id', 'approved_by', 'privileged', 'role', 'surprise']) {
          expect(contract[channel].input.safeParse({ ...good[channel], [key]: randomUUID() }).success, `${channel} with ${key}`).toBe(false);
        }
      }
      // bad dates, from after to, bad ids, bad kind
      expect(contract['print:statement'].input.safeParse({ customer_id: rashid(), kind: 'receipt', from: '2026-10-05', to: '2026-10-01' }).success).toBe(false);
      expect(contract['khata:exportStatement'].input.safeParse({ customer_id: rashid(), from: '2026-13-40' }).success).toBe(false);
      expect(contract['print:statement'].input.safeParse({ customer_id: 'nope', kind: 'receipt' }).success).toBe(false);
      expect(contract['print:statement'].input.safeParse({ customer_id: rashid(), kind: 'poster' }).success).toBe(false);
      expect(channels).toEqual(expect.arrayContaining([...NEW]));
    });
  });

  describe('print:statement', () => {
    it('prints the 80 mm slip with the shell\'s own figures: lines, running balances, totals and the closing balance', async () => {
      await history();
      const statement = await h()['khata:statement']({ customer_id: rashid() });
      expect(statement.closing_balance).toBe(150_000); // 2,000 + 500 - 1,000 = 1,500
      const reply = await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect(reply).toEqual({ status: 'printed', pdf_path: null, fallback: null, kind: 'receipt', language: 'en', is_copy: false });
      const sent = printer.state.printed[0]!;
      expect(sent.page).toEqual({ widthMm: 80, heightMm: null });
      const t = text(sent.html);
      for (const part of ['Pesticide Club Shop', 'STATEMENT', 'Rashid · Chak 12', 'Opening balance', 'Bal 2,000', 'Sale INV-', 'Bal 2,500', 'Payment · Cash RCP-', 'Bal 1,500', 'He owes', 'Rs 1,500', 'Credit limit', 'Rs 10,000', 'Total owes more', 'Rs 2,500', 'Total owes less', 'Rs 1,000']) {
        expect(t, part).toContain(part);
      }
      expect(sent.html).toContain('<html lang="en" dir="ltr">');
      expect(sent.html).not.toContain('COPY');
    });

    it('A4 is a different paper from the same data; Urdu is right to left with the real Naskh font inside the page', async () => {
      await history();
      await h()['print:statement']({ customer_id: rashid(), kind: 'invoice', language: 'ur' });
      const sent = printer.state.printed[0]!;
      expect(sent.page).toEqual({ widthMm: 210, heightMm: 297 });
      expect(sent.html).toContain('<html lang="ur" dir="rtl">');
      expect(sent.html).toContain(documentFonts.naskh); // the real font file, not a stand-in
      expect(text(sent.html)).toContain('کھاتے کی تفصیل');
      expect(sent.html).toContain('data-paper="invoice"');
    });

    it('the language is the one chosen in the print settings for that paper when none is sent', async () => {
      await h()['print:setConfig']({ receipt_language: 'ur', invoice_language: 'en' });
      await history();
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).language).toBe('ur');
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'invoice' })).language).toBe('en');
    });

    it('a range brings a brought-forward line with the balance before it', async () => {
      await history();
      const withRange = await h()['khata:statement']({ customer_id: rashid(), from: day(1) });
      expect(withRange.brought_forward).toBe(150_000);
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt', from: day(1) });
      const t = text(lastPage());
      expect(t).toContain('Brought forward');
      expect(t).toContain('Bal 1,500');
      expect(t).toContain('From ');
      // the closing balance is still everything up to the end
      expect(t).toContain('Rs 1,500');
    });

    it('only that customer\'s rows are on it', async () => {
      await history();
      const other = await h()['sale:create']({ customer_id: imran(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
      await h()['payments:receive']({ customer_id: imran(), amount: 77_700, method: 'cash', note: 'imran only' });
      await h()['print:statement']({ customer_id: rashid(), kind: 'invoice' });
      const page = lastPage();
      expect(page).not.toContain(other.invoice.invoice_no);
      expect(page).not.toContain('imran only');
      expect(page).not.toContain('Imran');
      expect(page).not.toContain('Rs 777');
      await h()['khata:exportStatement']({ customer_id: rashid() });
      expect(readFileSync(csvPath, 'utf8')).not.toContain(other.invoice.invoice_no);
    });

    it('an unknown customer is NOT_FOUND, and a supplier id is not a customer', async () => {
      expect(await attempt(h()['print:statement']({ customer_id: randomUUID(), kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['print:statement']({ customer_id: shop.demo.supplierId, kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(auditRows('statement_printed')).toHaveLength(0);
    });
  });

  describe('PDF fallback (a normal outcome, not an error)', () => {
    it('no printer: a PDF is saved and the reply says so; asked for a PDF: no fallback reason', async () => {
      printer.state.printers = [];
      const reply = await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect(reply).toMatchObject({ status: 'pdf_saved', fallback: 'no_printer', is_copy: false });
      expect(reply.pdf_path).toMatch(/\.pdf$/);
      expect(printer.state.saved).toHaveLength(1);
      printer.state.printers = [{ name: 'POS-80', display_name: 'POS-80', is_default: true }];
      expect(await h()['print:statement']({ customer_id: rashid(), kind: 'invoice', output: 'pdf' })).toMatchObject({ status: 'pdf_saved', fallback: null });
    });

    it('the printer fails: the same page becomes a PDF with fallback print_failed (both new print channels)', async () => {
      const paid = await history();
      printer.state.failPrint = true;
      expect(await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).toMatchObject({ status: 'pdf_saved', fallback: 'print_failed' });
      expect(await h()['print:paymentReceipt']({ payment_id: paid.payment.id })).toMatchObject({ status: 'pdf_saved', fallback: 'print_failed' });
      expect(printer.state.pdfs).toHaveLength(2);
      expect(auditRows('statement_printed').map((r) => JSON.parse(r.details).result)).toEqual(['pdf_saved']);
    });

    it('not even a PDF can be made: INTERNAL, and nothing is recorded (so no COPY is counted for a page nobody got)', async () => {
      const paid = await history();
      printer.state.printers = [];
      printer.state.failPdf = true;
      expect(await attempt(h()['print:statement']({ customer_id: rashid(), kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      expect(await attempt(h()['print:paymentReceipt']({ payment_id: paid.payment.id }))).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      expect(auditRows('statement_printed')).toHaveLength(0);
      expect(auditRows('payment_receipt_printed')).toHaveLength(0);
    });
  });

  describe('COPY, counted from the audit log', () => {
    it('statement: the first print has no COPY, an identical second print says COPY; each print writes one audit row', async () => {
      await history();
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).is_copy).toBe(false);
      expect(lastPage()).not.toContain('COPY');
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).is_copy).toBe(true);
      expect(lastPage()).toContain('COPY');
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt', output: 'pdf' })).is_copy).toBe(true); // a saved PDF counts as a print
      const rows = auditRows('statement_printed');
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.table_name === 'customers' && r.row_id === rashid())).toBe(true);
      expect(rows.map((r) => JSON.parse(r.details).copy)).toEqual([false, true, true]);
      expect(JSON.parse(rows[0]!.details)).toMatchObject({ kind: 'receipt', language: 'en', result: 'printed', fallback: null, from: null, to: null, closing_balance: 150_000 });
    });

    it('80 mm and A4 are separate kinds: printing one does not make the other a COPY', async () => {
      await history();
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'invoice' })).is_copy).toBe(false);
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'invoice' })).is_copy).toBe(true);
    });

    it('a different range, a different customer, or a statement that has changed since (new closing balance) is a new document, not a COPY', async () => {
      await history();
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt', from: day(-30), to: day(0) })).is_copy).toBe(false);
      expect((await h()['print:statement']({ customer_id: imran(), kind: 'receipt' })).is_copy).toBe(false);
      await h()['payments:receive']({ customer_id: rashid(), amount: 10_000, method: 'cash' });
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).is_copy).toBe(false);
      expect((await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' })).is_copy).toBe(true);
    });

    it('payment receipt: first print has no COPY, the second says COPY; one audit row each on the payment', async () => {
      const paid = await history();
      expect((await h()['print:paymentReceipt']({ payment_id: paid.payment.id })).is_copy).toBe(false);
      expect(lastPage()).not.toContain('COPY');
      expect((await h()['print:paymentReceipt']({ payment_id: paid.payment.id, language: 'ur' })).is_copy).toBe(true);
      expect(lastPage()).toContain('COPY');
      const rows = auditRows('payment_receipt_printed');
      expect(rows.map((r) => [r.table_name, r.row_id])).toEqual([['payments', paid.payment.id], ['payments', paid.payment.id]]);
      expect(rows.map((r) => JSON.parse(r.details).copy)).toEqual([false, true]);
    });

    it('statement prints and payment receipt prints never count each other (separate actions)', async () => {
      const paid = await history();
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect((await h()['print:paymentReceipt']({ payment_id: paid.payment.id })).is_copy).toBe(false);
      await h()['print:paymentReceipt']({ payment_id: paid.payment.id });
      // a payment receipt is kind 'receipt' too; it must not make a fresh A4/80 mm statement of another customer a copy
      expect((await h()['print:statement']({ customer_id: imran(), kind: 'receipt' })).is_copy).toBe(false);
      expect(auditRows('statement_printed')).toHaveLength(3);
      expect(auditRows('payment_receipt_printed')).toHaveLength(2);
    });

    it('an invoice reprint is not affected by statement prints (the invoice_printed log is separate)', async () => {
      const sold = await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
      await h()['print:statement']({ customer_id: rashid(), kind: 'receipt' });
      expect((await h()['print:document']({ invoice_id: sold.invoice.id, kind: 'receipt' })).is_copy).toBe(false);
    });
  });

  describe('the payment receipt', () => {
    it('shows the shop, the receipt number, the method, reference, note, amount and the balance AS OF THAT PAYMENT', async () => {
      await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
      const paid = await h()['payments:receive']({ customer_id: rashid(), amount: 100_000, method: 'bank', reference_no: 'TRX 88213', note: 'Paid at the shop by his son' });
      expect(paid.balance_after).toBe(150_000);
      await h()['print:paymentReceipt']({ payment_id: paid.payment.id });
      const t = text(lastPage());
      for (const part of ['PAYMENT RECEIPT', paid.receipt_no, 'Received from', 'Rashid · Chak 12', 'Bank', 'TRX 88213', 'Paid at the shop by his son', 'Amount received', 'Rs 1,000', 'Balance after', 'He owes Rs 1,500']) expect(t, part).toContain(part);
      expect(printer.state.printed.at(-1)!.page).toEqual({ widthMm: 80, heightMm: null });
    });

    it('the balance is the balance after THAT payment, not today\'s: later sales and payments do not change a reprint', async () => {
      const first = await history(); // owes 1,500 after this payment
      const before = text((await (async () => { await h()['print:paymentReceipt']({ payment_id: first.payment.id }); return lastPage(); })()));
      expect(before).toContain('He owes Rs 1,500');
      // later: a sale on credit and another payment (today's balance is now very different)
      await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 2000 }] });
      const second = await h()['payments:receive']({ customer_id: rashid(), amount: 500_000, method: 'cash', confirm_advance: true });
      expect(second.balance_after).toBeLessThan(0);
      await h()['print:paymentReceipt']({ payment_id: first.payment.id });
      const after = text(lastPage());
      expect(after).toContain('He owes Rs 1,500');
      expect(after).not.toContain('Advance');
      // and the second payment shows ITS balance: an advance, worded as one
      await h()['print:paymentReceipt']({ payment_id: second.payment.id });
      const t2 = text(lastPage());
      expect(t2).toContain('Advance Rs');
      expect(t2).not.toMatch(/Rs -|Owes Rs -/);
    });

    it('only a payment received FROM a live CUSTOMER has a receipt: the party type and the direction guards are each checked on their own', async () => {
      const db = shop.runtime.db;
      const scope = db.prepare('SELECT shop_id, branch_id, device_id FROM payments LIMIT 1').get() as { shop_id: string; branch_id: string; device_id: string } | undefined
        ?? (db.prepare('SELECT s.id AS shop_id, b.id AS branch_id, d.id AS device_id FROM shops s, branches b, devices d LIMIT 1').get() as { shop_id: string; branch_id: string; device_id: string });
      const insert = (id: string, partyType: string, partyId: string, direction: string) =>
        db.prepare("INSERT INTO payments (id, party_type, party_id, method, amount, direction, created_by, shop_id, branch_id, device_id) VALUES (?, ?, ?, 'cash', 500, ?, ?, ?, ?, ?)")
          .run(id, partyType, partyId, direction, shop.ownerId, scope.shop_id, scope.branch_id, scope.device_id);
      // a real supplier payment, the way paying a supplier writes it
      insert('00000000-0000-4000-8000-0000000a0001', 'supplier', shop.demo.supplierId, 'out');
      // only the PARTY TYPE is wrong: ids are unique per table only, so a SUPPLIER can carry a customer's id; money IN, from that "supplier"
      db.prepare('INSERT INTO suppliers (id, name_en, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?)').run(rashid(), 'Same Id Supplier', scope.shop_id, scope.branch_id, scope.device_id);
      insert('00000000-0000-4000-8000-0000000a0002', 'supplier', rashid(), 'in');
      // only the DIRECTION is wrong: money paid OUT to a real customer
      insert('00000000-0000-4000-8000-0000000a0003', 'customer', rashid(), 'out');
      const audits = shop.count('audit_log');
      for (const n of [1, 2, 3]) {
        const reply = await attempt(h()['print:paymentReceipt']({ payment_id: `00000000-0000-4000-8000-0000000a000${n}` }));
        expect(reply, `payment #${n}`).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      }
      expect(printer.state.printed).toHaveLength(0);
      expect(printer.state.pdfs).toHaveLength(0);
      expect(shop.count('audit_log')).toBe(audits);
      // ...and a genuine customer payment still prints
      const real = await h()['payments:receive']({ customer_id: rashid(), amount: 100, method: 'cash' });
      expect((await h()['print:paymentReceipt']({ payment_id: real.payment.id })).status).toBe('printed');
    });

    it('an unknown payment is NOT_FOUND', async () => {
      expect(await attempt(h()['print:paymentReceipt']({ payment_id: randomUUID() }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('a note typed with markup comes out as text', async () => {
      const paid = await h()['payments:receive']({ customer_id: rashid(), amount: 10_000, method: 'cash', note: '<script>alert(1)</script><b>x</b>' });
      await h()['print:paymentReceipt']({ payment_id: paid.payment.id });
      const body = lastPage().slice(lastPage().indexOf('<body>'));
      expect(body).not.toContain('<script');
      expect(body).not.toContain('<b>');
      expect(body).toContain('&lt;script&gt;');
    });
  });

  describe('a soft-deleted customer', () => {
    it('has no statement, no CSV and no payment receipt: NOT_FOUND, nothing printed, no Save box, no file, no audit row', async () => {
      const paid = await history();
      // sanity: before the delete everything works for this customer
      await h()['print:paymentReceipt']({ payment_id: paid.payment.id });
      printer.state.printed.length = 0;
      printer.state.pdfs.length = 0;
      const audits = shop.count('audit_log');
      shop.runtime.db.prepare('UPDATE customers SET deleted_at = ? WHERE id = ?').run('2026-01-02T00:00:00.000Z', rashid());
      const auditsAfterDelete = shop.count('audit_log');
      expect(await attempt(h()['print:statement']({ customer_id: rashid(), kind: 'receipt' }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['print:statement']({ customer_id: rashid(), kind: 'invoice', language: 'ur', output: 'pdf' }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['khata:exportStatement']({ customer_id: rashid() }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await attempt(h()['print:paymentReceipt']({ payment_id: paid.payment.id }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(printer.state.printed).toHaveLength(0);
      expect(printer.state.pdfs).toHaveLength(0);
      expect(saving.state.asked).toHaveLength(0);
      expect(existsSync(csvPath)).toBe(false);
      expect(shop.count('audit_log')).toBe(auditsAfterDelete);
      expect(auditsAfterDelete).toBeGreaterThanOrEqual(audits);
    });
  });

  describe('khata:exportStatement (CSV)', () => {
    it('exporting writes no audit row and changes no table; a cancelled save writes no file anywhere (no CSV, no PDF, nothing in the folder)', async () => {
      await history();
      const tables = ['audit_log', 'ledger_entries', 'payments', 'customers', 'number_sequences', 'change_log'];
      const counts = () => tables.map((t) => shop.count(t));
      const before = counts();
      expect(await h()['khata:exportStatement']({ customer_id: rashid() })).toEqual({ status: 'saved', path: csvPath });
      expect(counts()).toEqual(before);
      expect(readFileSync(csvPath, 'utf8').length).toBeGreaterThan(10);

      // now the person cancels the Save box: no file in the folder they were offered, none in the working folder or the temp folder, no PDF, no rows
      const folder = dirname(csvPath);
      rmSync(csvPath);
      const listings = () => [readdirSync(folder), readdirSync(process.cwd()), readdirSync(tmpdir()).filter((n) => /\.csv$|^Statement/i.test(n))];
      const listedBefore = listings();
      const rowsBefore = counts();
      saving.state.path = null;
      saving.state.asked.length = 0;
      expect(await h()['khata:exportStatement']({ customer_id: rashid() })).toEqual({ status: 'cancelled' });
      expect(saving.state.asked).toHaveLength(1);
      expect(readdirSync(folder)).toEqual([]);
      expect(listings()).toEqual(listedBefore);
      expect(printer.state.pdfs).toHaveLength(0);
      expect(counts()).toEqual(rowsBefore);
    });

    it('asks the Save box first, then the main process writes the file: BOM, header, the shell\'s rows and totals', async () => {
      await history();
      const reply = await h()['khata:exportStatement']({ customer_id: rashid() });
      expect(reply).toEqual({ status: 'saved', path: csvPath });
      expect(saving.state.asked).toHaveLength(1);
      expect(saving.state.asked[0]).toMatchObject({ filterName: 'CSV', extension: 'csv' });
      expect(saving.state.asked[0]!.defaultName).toMatch(/^Statement - Rashid - \d{4}-\d{2}-\d{2}\.csv$/);
      const bytes = readFileSync(csvPath);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const rows = bytes.toString('utf8').slice(1).split('\r\n').filter(Boolean);
      expect(rows[0]).toBe('Date,Type,Reference,Receipt no,Note,Owes more (Rs),Owes less (Rs),Balance (Rs)');
      expect(rows).toHaveLength(1 + 3 + 1);
      expect(rows[1]).toMatch(/^\d{2} \w{3} \d{4},Opening balance,,,,2000,,2000$/);
      expect(rows[2]).toMatch(/,Sale,INV-[^,]+,,,500,,2500$/);
      expect(rows[3]).toMatch(/,Payment · Cash,RCP-[^,]+,,part payment,,1000,1500$/);
      expect(rows[4]).toBe(',Totals,,,,2500,1000,1500');
    });

    it('cancel: the file is not written, and the reply says cancelled', async () => {
      await history();
      saving.state.path = null;
      expect(await h()['khata:exportStatement']({ customer_id: rashid() })).toEqual({ status: 'cancelled' });
      expect(saving.state.asked).toHaveLength(1);
      expect(existsSync(csvPath)).toBe(false);
    });

    it('with no Save box at all (a runtime without a shell) every export is cancelled and nothing is written', async () => {
      const bare = await makeShop();
      await bare.signInAs('owner');
      expect(await bare.runtime.handlers['khata:exportStatement']({ customer_id: bare.demo.customers['rashid']! })).toEqual({ status: 'cancelled' });
      bare.runtime.close();
    });

    it('text typed by staff cannot run as a formula and quotes survive; amounts stay exact', async () => {
      await h()['payments:receive']({ customer_id: rashid(), amount: 12_345, method: 'bank', reference_no: '=HYPERLINK("http://x","y")', note: 'paid, "all"\nthanks' });
      await h()['payments:receive']({ customer_id: rashid(), amount: 5, method: 'cash', note: '@cmd' });
      await h()['khata:exportStatement']({ customer_id: rashid() });
      const csv = readFileSync(csvPath, 'utf8');
      expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
      expect(csv).toContain('"paid, ""all""\nthanks"');
      expect(csv).toContain(",'@cmd,");
      expect(csv).toContain(',,123.45,');
      expect(csv).toContain(',,0.05,');
      expect(csv).not.toMatch(/\d\.\d{3,}/); // no float noise anywhere
    });

    it('a range limits the rows and adds a brought-forward row; an unknown customer is NOT_FOUND and no Save box opens', async () => {
      await history();
      await h()['khata:exportStatement']({ customer_id: rashid(), from: day(1) });
      expect(readFileSync(csvPath, 'utf8')).toContain(',Brought forward,,,,,,1500');
      saving.state.asked.length = 0;
      expect(await attempt(h()['khata:exportStatement']({ customer_id: randomUUID() }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(saving.state.asked).toHaveLength(0);
    });
  });
});
