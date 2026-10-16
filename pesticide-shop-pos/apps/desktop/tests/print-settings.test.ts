// The owner-only print settings print_format, receipt_footer and shop_name, through the real main-process handlers, a real SQLite database and
// the real documents: what is saved, what is audited (only what changed, one row each, in the same transaction), what is printed, who may change it.
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { day, fakePrinting, makeShop, type Shop } from './support.js';

const attempt = async <T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: DomainError }> => {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
};

const COST = 7_654_321;

describe('print format, receipt footer and shop name', () => {
  let shop: Shop;
  let printer: ReturnType<typeof fakePrinting>;
  const h = () => shop.runtime.handlers;
  const p = (key: string) => shop.demo.products[key]!;

  async function sale() {
    return h()['sale:create']({
      customer_id: shop.demo.customers['rashid']!,
      paid_amount: 100_000,
      due_date: '2026-11-30',
      lines: [
        { product_id: p('insecticide1l'), qty: 2000 },
        { product_id: p('fertilizer1kg'), qty: 250 },
      ],
    });
  }
  const audits = () =>
    (shop.runtime.db.prepare("SELECT user_id, table_name, row_id, details FROM audit_log WHERE action = 'print_config_changed' ORDER BY rowid").all() as {
      user_id: string;
      table_name: string;
      row_id: string | null;
      details: string;
    }[]).map((r) => ({ ...r, details: JSON.parse(r.details) as { field: string; from: string | null; to: string | null } }));
  const counts = () => [shop.count('settings'), shop.count('audit_log')];
  const printed = async (kind: 'receipt' | 'invoice', language: 'en' | 'ur') => {
    const sold = await sale();
    await h()['print:document']({ invoice_id: sold.invoice.id, kind, language });
    return printer.state.printed.at(-1)!.html;
  };

  beforeEach(async () => {
    printer = fakePrinting();
    shop = await makeShop({ printing: printer.driver });
    await shop.signInAs('owner');
    await h()['stock:openingStock']({ product_id: p('insecticide1l'), batch_no: 'B-001', expiry_date: day(5), cost_price: COST, qty: 10_000 });
  });
  afterEach(() => shop.runtime.close());

  describe('defaults and saving', () => {
    it('start as the 80 mm receipt, an empty footer and the name from setup', async () => {
      expect(await h()['print:getConfig']({})).toMatchObject({ print_format: '80mm', receipt_footer: '', shop_name: 'Pesticide Club Shop' });
    });

    it('the owner saves all three and reads them back; the sidebar name (app:getState) follows at once', async () => {
      const config = await h()['print:setConfig']({ print_format: 'a4', receipt_footer: 'Goods once sold are not returned.', shop_name: 'Burewala Agro Centre' });
      expect(config).toMatchObject({ print_format: 'a4', receipt_footer: 'Goods once sold are not returned.', shop_name: 'Burewala Agro Centre' });
      expect(await h()['print:getConfig']({})).toEqual(config);
      expect((await h()['app:getState']({})).shop).toEqual({ name: 'Burewala Agro Centre' });
    });

    it('the shop name can never be emptied, and a refused save changes nothing at all', async () => {
      const before = counts();
      // (the strict schema refuses a blank name before the handler is reached; this is the second line of defence)
      await expect(h()['print:setConfig']({ shop_name: '   ', print_format: 'a4' })).rejects.toThrow(/shop name cannot be empty/);
      expect(counts()).toEqual(before);
      expect((await h()['print:getConfig']({})).print_format).toBe('80mm'); // the whole save rolled back
      expect((await h()['print:getConfig']({})).shop_name).toBe('Pesticide Club Shop');
    });

    it('the footer can be cleared again with an empty text', async () => {
      await h()['print:setConfig']({ receipt_footer: 'Hello' });
      expect((await h()['print:setConfig']({ receipt_footer: '' })).receipt_footer).toBe('');
    });
  });

  describe('audit: only what really changed', () => {
    it('a field sent with the value it already has writes no setting and no audit row; nothing changed writes nothing at all', async () => {
      await h()['print:setConfig']({ receipt_footer: 'Thanks', print_format: 'a4', shop_name: 'Burewala Agro Centre', shop_phone: '0300 1234567' });
      const before = counts();
      const rows = audits().length;
      expect(rows).toBe(4);
      await h()['print:setConfig']({ receipt_footer: 'Thanks', print_format: 'a4', shop_name: 'Burewala Agro Centre', shop_phone: '0300 1234567' });
      await h()['print:setConfig']({ receipt_footer: '  Thanks  ', shop_name: ' Burewala Agro Centre ' }); // spaces only: still the same
      await h()['print:setConfig']({});
      expect(counts()).toEqual(before);
      expect(audits()).toHaveLength(rows);
    });

    it('clearing a field that is already empty is no change either', async () => {
      const before = counts();
      await h()['print:setConfig']({ receipt_footer: '', shop_phone: null, printer_name: null, shop_address: '', shop_name_ur: null });
      expect(counts()).toEqual(before);
    });

    it('of several fields sent, exactly one audit row is written for the one that changed, with its old and new value', async () => {
      await h()['print:setConfig']({ receipt_footer: 'Thanks', print_format: 'a4' });
      const rowsBefore = audits().length;
      await h()['print:setConfig']({ receipt_footer: 'Thanks', print_format: 'a4', shop_phone: '0300 1111111' });
      const added = audits().slice(rowsBefore);
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({ user_id: shop.ownerId, table_name: 'settings', details: { field: 'shop_phone', from: null, to: '0300 1111111' } });
    });

    it('every changed field gets its own row, with the value before and after; the shop name is audited against the shops row', async () => {
      await h()['print:setConfig']({ print_format: 'a4', receipt_footer: 'First', shop_name: 'Burewala Agro Centre' });
      await h()['print:setConfig']({ print_format: '80mm', receipt_footer: 'Second', shop_name: 'Chak 12 Agro' });
      const rows = audits();
      expect(rows).toHaveLength(6);
      const byField = (f: string) => rows.filter((r) => r.details.field === f).map((r) => [r.details.from, r.details.to]);
      expect(byField('print_format')).toEqual([['80mm', 'a4'], ['a4', '80mm']]);
      expect(byField('receipt_footer')).toEqual([[null, 'First'], ['First', 'Second']]);
      expect(byField('shop_name')).toEqual([['Pesticide Club Shop', 'Burewala Agro Centre'], ['Burewala Agro Centre', 'Chak 12 Agro']]);
      const nameRow = rows.find((r) => r.details.field === 'shop_name')!;
      expect(nameRow.table_name).toBe('shops');
      expect(nameRow.row_id).toBe(shop.runtime.db.prepare('SELECT id FROM shops').pluck().get());
    });

    it('settings and audit rows are one transaction: if the audit row cannot be written, the footer, the format and the shop name all stay as they were', async () => {
      shop.runtime.db.exec("CREATE TEMP TRIGGER fail_cfg_audit BEFORE INSERT ON audit_log WHEN NEW.action = 'print_config_changed' AND json_extract(NEW.details, '$.field') = 'shop_name' BEGIN SELECT RAISE(ABORT, 'audit write failed'); END");
      const before = counts();
      await expect(h()['print:setConfig']({ print_format: 'a4', receipt_footer: 'Hello', shop_name: 'Renamed Shop' })).rejects.toThrow(/audit write failed/);
      expect(counts()).toEqual(before);
      expect(await h()['print:getConfig']({})).toMatchObject({ print_format: '80mm', receipt_footer: '', shop_name: 'Pesticide Club Shop' });
      shop.runtime.db.exec('DROP TRIGGER fail_cfg_audit');
    });

    it('renaming changes the one shops row in place: no second shop, nothing deleted, the id is the same', async () => {
      const rows = () => shop.runtime.db.prepare('SELECT id, name, deleted_at FROM shops').all() as { id: string; name: string; deleted_at: string | null }[];
      const before = rows();
      await h()['print:setConfig']({ shop_name: 'Renamed' });
      expect(rows()).toEqual([{ ...before[0]!, name: 'Renamed' }]);
    });
  });

  describe('what is printed', () => {
    it('the footer replaces the thank-you line on the 80 mm receipt and the A4 invoice, in English and in Urdu', async () => {
      const footer = 'Goods once sold are not returned';
      await h()['print:setConfig']({ receipt_footer: footer });
      for (const kind of ['receipt', 'invoice'] as const) {
        const en = await printed(kind, 'en');
        expect(en, `${kind} en`).toContain(`<footer class="thanks">${footer}</footer>`);
        expect(en).not.toContain('Thank you. Please keep this receipt.');
        const ur = await printed(kind, 'ur');
        expect(ur, `${kind} ur`).toContain(footer);
        expect(ur).not.toContain('شکریہ۔ رسید سنبھال کر رکھیں۔');
      }
    });

    it('with no footer the standard thank-you line is printed on both papers (and again after the footer is cleared)', async () => {
      for (const kind of ['receipt', 'invoice'] as const) expect(await printed(kind, 'en')).toContain('Thank you. Please keep this receipt.');
      await h()['print:setConfig']({ receipt_footer: 'Temporary' });
      await h()['print:setConfig']({ receipt_footer: '' });
      for (const kind of ['receipt', 'invoice'] as const) {
        expect(await printed(kind, 'en')).toContain('Thank you. Please keep this receipt.');
        expect(await printed(kind, 'ur')).toContain('شکریہ۔ رسید سنبھال کر رکھیں۔');
      }
    });

    it('the footer is text, never markup: script, style and tag text print as visible characters on both papers', async () => {
      const evil = '</style><script>alert(1)</script><img src=x onerror=alert(2)> & "q"';
      await h()['print:setConfig']({ receipt_footer: evil });
      for (const kind of ['receipt', 'invoice'] as const) {
        for (const language of ['en', 'ur'] as const) {
          // Urdu pages wrap Latin runs in left-to-right spans; take those away to compare the text itself
          const html = (await printed(kind, language)).replace(/<span class="ltr">([^<]*)<\/span>/g, '$1');
          expect(html, `${kind} ${language}`).toContain('&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt; &amp; &quot;q&quot;');
          expect(html).not.toContain('<script');
          expect(html).not.toContain('<img');
          expect((html.match(/<\/style>/g) ?? []).length).toBe(1); // only the page's own style block closes
        }
      }
    });

    it('a changed shop name is printed on both papers in English, and in Urdu too until an Urdu name is given', async () => {
      await h()['print:setConfig']({ shop_name: 'Burewala Agro Centre' });
      for (const kind of ['receipt', 'invoice'] as const) {
        const en = await printed(kind, 'en');
        expect(en).toContain('Burewala Agro Centre');
        expect(en).not.toContain('Pesticide Club Shop');
        expect(await printed(kind, 'ur')).toContain('Burewala Agro Centre');
      }
    });

    it('a shop name with markup is printed as text', async () => {
      await h()['print:setConfig']({ shop_name: 'A <b>&</b> B' });
      const html = await printed('receipt', 'en');
      expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
      expect(html).not.toContain('<b>&</b>');
    });

    it('the document data carries the footer for the screen too (invoices:receipt)', async () => {
      await h()['print:setConfig']({ receipt_footer: 'See you soon' });
      const sold = await sale();
      expect((await h()['invoices:receipt']({ invoice_id: sold.invoice.id, kind: 'invoice' })).shop).toMatchObject({ name: 'Pesticide Club Shop', footer: 'See you soon' });
    });
  });

  describe('who may change it', () => {
    it('staff cannot change any of the three, nothing is written, and they do read the values and print with them (and nothing printed holds a cost)', async () => {
      await h()['print:setConfig']({ receipt_footer: 'Owner footer', print_format: 'a4', shop_name: 'Burewala Agro Centre' });
      const sold = await sale();
      await shop.signOut();
      await shop.signInAs('staff');
      const before = counts();
      for (const input of [{ receipt_footer: 'staff' }, { print_format: '80mm' as const }, { shop_name: 'Staff Shop' }]) {
        const r = await attempt(h()['print:setConfig'](input));
        expect(r).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED', params: { capability: 'print.configure' } } });
      }
      expect(counts()).toEqual(before);
      expect(await h()['print:getConfig']({})).toMatchObject({ receipt_footer: 'Owner footer', print_format: 'a4', shop_name: 'Burewala Agro Centre' });
      for (const kind of ['receipt', 'invoice'] as const) {
        await h()['print:document']({ invoice_id: sold.invoice.id, kind, language: 'en' });
        const html = printer.state.printed.at(-1)!.html;
        expect(html).toContain('Owner footer');
        expect(html).toContain('Burewala Agro Centre');
        expect(html).not.toContain(String(COST));
        expect(html).not.toContain('76,543.21');
      }
    });
  });
});
