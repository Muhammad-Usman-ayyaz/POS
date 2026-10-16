// @vitest-environment jsdom
// The sale-saved box as the REAL app wires it (app.tsx hands PosPage its `receiptActions`): the whole App is rendered with a fake shell, signed in as the
// owner or as staff, a sale is made on /pos, and the box that comes up is checked. Nothing here builds its own copy of the wiring, so removing the New sale
// button from the wiring, or dropping `counter` from PrintActions there, fails these tests.
import { buildApi, type AppState, type Channel, type Language, type PrintResult, type SessionUser } from '@pos/api-contract';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string) => ({ ok: false as const, error: { code, message: 'm', params: {} } });
const printed = (over: Partial<PrintResult> = {}): PrintResult => ({ status: 'printed', pdf_path: null, fallback: null, kind: 'receipt', language: 'en', is_copy: false, ...over });

const SIZE = {
  id: 'p1l', group_id: 'g', pack_label: '1 L', pack_size: 1000, allow_loose: 0, base_unit: 'ml', is_active: 1, retail_price: 50_000, wholesale_price: 45_000, stock_sellable: 12_000,
  flags: { low: false, near_expiry: false, expired: false },
};
const quoteOf = (input: any) => {
  const lines = (input.lines as { product_id: string; qty: number }[]).map((l, index) => {
    const gross = Math.round((l.qty * 50_000) / 1000);
    return {
      index, product_id: 'p1l', name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا', pack_label: '1 L', base_unit: 'ml', pack_size: 1000, qty: l.qty, unit_price: 50_000, gross, line_discount: 0,
      discount_over_limit: false, tax_rate_bp: 0, tax_amount: 0, line_total: gross,
      batches: [{ batch_id: 'b-1', batch_no: 'B-001', expiry_date: '2027-03-12', qty: l.qty, days_to_expiry: 400, near_expiry: false }],
    };
  });
  const total = lines.reduce((s, l) => s + l.line_total, 0);
  return {
    ok: true, price_type: 'retail', lines, subtotal: total, tax_total: 0, total, paid_amount: input.paid_amount ?? total, unpaid: 0, customer: null, issues: [], today: '2026-10-12',
    near_expiry_days: 30, staff_max_discount_percent: 5, requires_approval: [],
  };
};

type Handler = (input: any) => unknown;
function fakeShell(user: SessionUser, language: Language, override: Partial<Record<Channel, Handler>> = {}) {
  const state: AppState = { phase: 'ready', language, shop: { name: 'Pesticide Club Shop' }, device: { name: 'Counter PC', code: 'A1' }, user };
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'app:getState': () => ok(state),
    'catalogue:list': () => ok({ hits: [{ group: { id: 'g-i', name_en: 'Insecticide', name_ur: 'کیڑے مار دوا' }, sizes: [SIZE], matched_size_ids: [], rank: 0, summary: {} }], total: 1, counts: { products: 0, low: 0, near_expiry: 0, expired: 0 } }),
    'categories:list': () => ok([]),
    'customers:search': () => ok([]),
    'sale:quote': (input) => ok(quoteOf(input)),
    'sale:create': (input) => ok({ invoice: { id: 'inv-9', invoice_no: 'INV-A-000009', total: 50_000, paid_amount: input.paid_amount ?? 50_000, payment_method: 'cash' }, items: [], payment_id: 'pay1' }),
    'print:document': (input) => ok(printed({ kind: input.kind })),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, prints: () => of('print:document'), sales: () => of('sale:create') };
}

/** Renders the real App, goes to the counter, sells one 1 L, and returns the sale-saved box. */
async function makeSale(shell: ReturnType<typeof fakeShell>, language: Language) {
  const T = language === 'ur' ? ur.pos : en.pos;
  render(<App api={shell.api} />);
  const search = await screen.findByRole('searchbox', { name: T.searchLabel });
  await userEvent.setup().click(search);
  await userEvent.setup().keyboard('insect');
  await waitFor(() => expect(document.querySelector('[data-size=p1l]')).toBeTruthy());
  await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-size=p1l]')!);
  const complete = () => screen.getByRole('button', { name: new RegExp(T.bill.complete) }) as HTMLButtonElement;
  await waitFor(() => expect(complete().disabled).toBe(false));
  await userEvent.setup().click(complete());
  return screen.findByRole('dialog', { name: T.done.title });
}

beforeEach(() => {
  location.hash = '';
  localStorage.clear();
});
afterEach(cleanup);

describe.each([
  ['the owner', OWNER],
  ['staff', STAFF],
] as const)('the sale-saved box in the real app, signed in as %s', (_who, user) => {
  it('is the counter dialog with Save PDF, New sale and Print receipt in that order, Print receipt being the main (green) one', async () => {
    const shell = fakeShell(user, 'en');
    const dialog = await makeSale(shell, 'en');
    expect(shell.sales()).toHaveLength(1);
    expect(dialog.hasAttribute('data-counter-dialog')).toBe(true);
    expect(dialog.textContent).toContain('INV-A-000009');
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([en.invoices.print.savePdf, en.pos.done.newSale, en.invoices.print.receipt]);
    expect(within(dialog).getByRole('button', { name: en.invoices.print.receipt }).className).toContain('bg-accent');
    expect(within(dialog).getByRole('button', { name: en.pos.done.newSale }).className).not.toContain('bg-accent');
    // the counter layout: the receipt only (no invoice buttons), each button tagged for the receipt
    expect([...dialog.querySelectorAll('[data-print]')].map((b) => b.getAttribute('data-print'))).toEqual(['receipt:pdf', 'receipt:printer']);
  });

  it('Print receipt and Save PDF send print:document for the saved invoice; New sale closes the box and empties the bill', async () => {
    const shell = fakeShell(user, 'en');
    const dialog = await makeSale(shell, 'en');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: en.invoices.print.receipt }));
    await waitFor(() => expect(shell.prints()).toHaveLength(1));
    expect(shell.prints()[0]!.input).toEqual({ invoice_id: 'inv-9', kind: 'receipt', output: 'printer' });
    await userEvent.setup().click(within(screen.getByRole('dialog')).getByRole('button', { name: en.invoices.print.savePdf }));
    await waitFor(() => expect(shell.prints()).toHaveLength(2));
    expect(shell.prints()[1]!.input).toEqual({ invoice_id: 'inv-9', kind: 'receipt', output: 'pdf' });
    await userEvent.setup().click(within(screen.getByRole('dialog')).getByRole('button', { name: en.pos.done.newSale }));
    expect(screen.queryByRole('dialog', { name: en.pos.done.title })).toBeNull();
  });

  it('Urdu: the same three buttons in the same order, written in Urdu', async () => {
    const shell = fakeShell(user, 'ur');
    const dialog = await makeSale(shell, 'ur');
    expect(dialog.hasAttribute('data-counter-dialog')).toBe(true);
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([ur.invoices.print.savePdf, ur.pos.done.newSale, ur.invoices.print.receipt]);
  });
});

describe('Printing from the sale-saved box in the real app: the "Could not print" box (docs/design/PosDialogs.dc.html)', () => {
  it('when not even a PDF could be made, a counter box says so with Skip, Save PDF and Try again; Try again asks for the same thing, Skip closes it, the sale stays saved', async () => {
    const shell = fakeShell(OWNER, 'en', { 'print:document': () => fail('INTERNAL') });
    const dialog = await makeSale(shell, 'en');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: en.invoices.print.receipt }));
    const failed = await screen.findByRole('dialog', { name: en.invoices.print.failedTitle });
    expect(failed.hasAttribute('data-counter-dialog')).toBe(true);
    expect(failed.textContent).toContain(en.invoices.print.failedLead);
    expect(failed.querySelector('[data-print-failed]')).toBeTruthy();
    expect(within(failed).getAllByRole('button').map((b) => b.textContent)).toEqual([en.invoices.print.skip, en.invoices.print.savePdf, en.invoices.print.tryAgain]);
    await userEvent.setup().click(within(failed).getByRole('button', { name: en.invoices.print.tryAgain }));
    await waitFor(() => expect(shell.prints()).toHaveLength(2));
    expect(shell.prints()[1]!.input).toEqual(shell.prints()[0]!.input); // the same request again
    const again = await screen.findByRole('dialog', { name: en.invoices.print.failedTitle });
    await userEvent.setup().click(within(again).getByRole('button', { name: en.invoices.print.savePdf }));
    await waitFor(() => expect(shell.prints()).toHaveLength(3));
    expect(shell.prints()[2]!.input).toEqual({ invoice_id: 'inv-9', kind: 'receipt', output: 'pdf' });
    const third = await screen.findByRole('dialog', { name: en.invoices.print.failedTitle });
    await userEvent.setup().click(within(third).getByRole('button', { name: en.invoices.print.skip }));
    expect(screen.queryByRole('dialog', { name: en.invoices.print.failedTitle })).toBeNull();
    expect(screen.getByRole('dialog', { name: en.pos.done.title })).toBeTruthy(); // the saved sale is still there
  });
});
