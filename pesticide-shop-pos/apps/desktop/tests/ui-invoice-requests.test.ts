// The invoice history and the print buttons, against the REAL handlers on a real in-memory database: the requests the screens build
// (`invoiceRules`, shared with the page) are accepted by the strict contract, do what the screen means, and a PDF fallback comes back
// as a normal reply the screen shows as a notice. (A separate file from ui-requests.test.ts because that one builds its shop without a
// printing driver; here the printer and the PDF maker are the recording fake.)
import { invoiceRules as I } from '@pos/ui/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { fakePrinting, makeShop, type Shop } from './support.js';

let shop: Shop;
const call = (channel: string, input: unknown = {}): Promise<any> => (shop.runtime.handlers as unknown as Record<string, (input: unknown) => Promise<any>>)[channel]!(input);
afterEach(() => shop.runtime.close());

async function setup(printing?: ReturnType<typeof fakePrinting>) {
  shop = await makeShop(printing ? { printing: printing.driver } : {});
  await shop.signInAs('owner');
}

/** A walk-in sale paid in full, and one for Rashid on Khata. */
async function twoSales() {
  const product = shop.demo.products['insecticide1l']!;
  const quote = await call('sale:quote', { lines: [{ product_id: product, qty: 1000 }] });
  const walkIn = await call('sale:create', { paid_amount: quote.total, lines: [{ product_id: product, qty: 1000 }] });
  const khata = await call('sale:create', { customer_id: shop.demo.customers['rashid'], paid_amount: 0, due_date: '2026-11-30', lines: [{ product_id: product, qty: 1000 }] });
  return { walkIn, khata };
}

const filters = (over: Partial<I.ListFilters> = {}): I.ListFilters => ({ query: '', status: 'all', from: '', to: '', offset: 0, ...over });

describe('the invoice history against the real shell', () => {
  it('every request the screen builds is accepted: no filter, search, status, dates and paging', async () => {
    await setup();
    const { walkIn, khata } = await twoSales();
    const all = await call('invoices:list', I.buildListRequest(filters()));
    expect(all.total).toBe(2);
    expect(all.rows.map((r: any) => r.id)).toEqual([khata.invoice.id, walkIn.invoice.id]); // newest first
    expect((await call('invoices:list', I.buildListRequest(filters({ query: `  ${walkIn.invoice.invoice_no.toLowerCase()} ` })))).rows.map((r: any) => r.id)).toEqual([walkIn.invoice.id]);
    expect((await call('invoices:list', I.buildListRequest(filters({ query: 'rash' })))).rows.map((r: any) => r.id)).toEqual([khata.invoice.id]);
    expect((await call('invoices:list', I.buildListRequest(filters({ query: 'راشد' })))).total).toBe(1);
    expect((await call('invoices:list', I.buildListRequest(filters({ status: 'voided' })))).total).toBe(0);
    expect((await call('invoices:list', I.buildListRequest(filters({ status: 'active' })))).total).toBe(2);
    expect((await call('invoices:list', I.buildListRequest(filters({ from: shop.today, to: shop.today })))).total).toBe(2);
    expect((await call('invoices:list', I.buildListRequest(filters({ from: '2099-01-01' })))).total).toBe(0);
    const page2 = await call('invoices:list', I.buildListRequest(filters({ offset: 1 })));
    expect(page2.rows.map((r: any) => r.id)).toEqual([walkIn.invoice.id]);
    expect(page2.total).toBe(2);
  });

  it('the active and voided filters really separate the invoices (the request carries status active as well as voided)', async () => {
    await setup();
    const { walkIn, khata } = await twoSales();
    shop.runtime.db.prepare("UPDATE invoices SET status = 'voided', void_reason = 'test', voided_by = ? WHERE id = ?").run(shop.ownerId, khata.invoice.id);
    const ids = async (status: I.StatusFilter) => (await call('invoices:list', I.buildListRequest(filters({ status })))).rows.map((r: any) => r.id);
    expect(await ids('active')).toEqual([walkIn.invoice.id]);
    expect(await ids('voided')).toEqual([khata.invoice.id]);
    expect(await ids('all')).toHaveLength(2);
  });

  it('the row has what the screen shows, and the detail has the lines as sold; staff get the same', async () => {
    await setup();
    const { khata } = await twoSales();
    await shop.signOut();
    await shop.signInAs('staff');
    const rows = (await call('invoices:list', I.buildListRequest(filters()))).rows;
    expect(rows[0]).toMatchObject({ id: khata.invoice.id, customer_name_en: 'Rashid', on_khata: khata.invoice.total, print_count: 0 });
    const detail = await call('invoices:get', { invoice_id: khata.invoice.id });
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({ qty: 1000, pack_size: 1000 });
    expect(JSON.stringify([rows, detail])).not.toMatch(/cost/i);
  });
});

describe('the list request the screen builds', () => {
  it('trims the search text, and sends nothing for blank text or unset filters', () => {
    expect(I.buildListRequest(filters({ query: '  rashid ' }))).toEqual({ query: 'rashid', limit: I.PAGE_SIZE, offset: 0 });
    expect(I.buildListRequest(filters({ query: '   ' }))).toEqual({ limit: I.PAGE_SIZE, offset: 0 });
    expect(I.buildListRequest(filters({ status: 'active' }))).toEqual({ status: 'active', limit: I.PAGE_SIZE, offset: 0 });
    expect(I.buildListRequest(filters({ status: 'voided', from: '2026-10-01', to: '2026-10-31', offset: 25 }))).toEqual({ status: 'voided', from: '2026-10-01', to: '2026-10-31', limit: I.PAGE_SIZE, offset: 25 });
  });
});

describe('the print buttons against the real shell', () => {
  it('each button\'s request is accepted and prints the right document; the list counts the prints', async () => {
    const printing = fakePrinting();
    await setup(printing);
    const { walkIn } = await twoSales();
    const id = walkIn.invoice.id;
    const receipt = await call('print:document', I.buildPrintRequest(id, 'receipt', 'printer'));
    expect(receipt).toMatchObject({ status: 'printed', kind: 'receipt', fallback: null, is_copy: false });
    const a4 = await call('print:document', I.buildPrintRequest(id, 'invoice', 'printer'));
    expect(a4).toMatchObject({ status: 'printed', kind: 'invoice', is_copy: false });
    expect(printing.state.printed.map((p) => p.page)).toHaveLength(2);
    const pdf = await call('print:document', I.buildPrintRequest(id, 'receipt', 'pdf'));
    expect(pdf).toMatchObject({ status: 'pdf_saved', kind: 'receipt', fallback: null, is_copy: true });
    expect(pdf.pdf_path).toContain('.pdf');
    expect((await call('invoices:list', I.buildListRequest(filters()))).rows.find((r: any) => r.id === id).print_count).toBe(3);
  });

  it('no printer, or a printer that fails: a normal reply with a PDF path and the reason, which the screen shows as a notice', async () => {
    const none = fakePrinting({ printers: [] });
    await setup(none);
    const { walkIn } = await twoSales();
    const reply = await call('print:document', I.buildPrintRequest(walkIn.invoice.id, 'receipt', 'printer'));
    expect(reply).toMatchObject({ status: 'pdf_saved', fallback: 'no_printer' });
    expect(typeof reply.pdf_path).toBe('string');
    shop.runtime.close();

    const broken = fakePrinting({ failPrint: true });
    await setup(broken);
    const sold = await twoSales();
    expect(await call('print:document', I.buildPrintRequest(sold.walkIn.invoice.id, 'invoice', 'printer'))).toMatchObject({ status: 'pdf_saved', fallback: 'print_failed' });
  });

  it('staff may print too, and the request carries no language or user', async () => {
    const printing = fakePrinting();
    await setup(printing);
    const { walkIn } = await twoSales();
    await shop.signOut();
    await shop.signInAs('staff');
    const request = I.buildPrintRequest(walkIn.invoice.id, 'receipt', 'printer');
    expect(Object.keys(request).sort()).toEqual(['invoice_id', 'kind', 'output']);
    expect((await call('print:document', request)).status).toBe('printed');
  });
});
