// @vitest-environment jsdom
// The customer screens as the REAL app wires them (the Phase 5 lesson: a page can be right on its own and still be wired wrong). The whole App is
// rendered with a fake shell, signed in, and taken to the real routes. Nothing here builds its own copy of the wiring, so removing the receipt slot or
// the statement slot from CustomerDetailRoute in app.tsx, or a route from the router, fails these tests.
import { buildApi, type AppState, type Channel, type Language, type PrintResult, type SessionUser } from '@pos/api-contract';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';

configure({ asyncUtilTimeout: 5000 });

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string) => ({ ok: false as const, error: { code, message: 'm', params: {} } });
const printed = (over: Partial<PrintResult> = {}): PrintResult => ({ status: 'printed', pdf_path: null, fallback: null, kind: 'receipt', language: 'en', is_copy: false, ...over });

const CUSTOMER = {
  id: 'c1', name_en: 'Rashid', name_ur: 'راشد', phone: '0300 1234567', village: 'Chak 12', credit_limit: 1_000_000, default_price_type: 'retail',
  notes: null, father_name: null, cnic: null, phone2: null, guarantor: null, version: 1,
};
const SUMMARY = { customer: CUSTOMER, balance: 900_000, credit_left: 100_000, no_limit: false, over_limit: false, next_due: null, overdue_amount: 0, overdue_days: 0 };
const STATEMENT = { customer: CUSTOMER, from: null, to: null, lines: [], brought_forward: 0, totals: { owes_more: 0, owes_less: 0 }, closing_balance: 900_000 };

type Handler = (input: any) => unknown;
function fakeShell(user: SessionUser, language: Language = 'en', override: Partial<Record<Channel, Handler>> = {}) {
  const state: AppState = { phase: 'ready', language, shop: { name: 'Pesticide Club Shop' }, device: { name: 'Counter PC', code: 'A1' }, user };
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'app:getState': () => ok(state),
    'customers:get': () => ok(SUMMARY),
    'customers:getSettings': () => ok({ default_credit_limit: 0, show_farmer_fields: false }),
    'customers:list': () => ok({ rows: [], totals: { total_outstanding: 0, overdue_total: 0, count: 0 } }),
    'khata:statement': () => ok(STATEMENT),
    'payments:receive': () => ok({ payment: { id: 'pay-77' }, receipt_no: 'RCP-A-000077', balance_after: 800_000, advance: false }),
    'print:getConfig': () => ok({ print_format: '80mm' }),
    'print:paymentReceipt': () => ok(printed({ kind: 'receipt' })),
    'print:statement': () => ok(printed({ kind: 'receipt' })),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of };
}

const open = (shell: ReturnType<typeof fakeShell>, hash: string) => {
  location.hash = hash;
  render(<App api={shell.api} />);
};

beforeEach(() => {
  location.hash = '';
  localStorage.clear();
});
afterEach(cleanup);

describe('the real customer routes', () => {
  it('/customers/:id renders the customer page for that customer', async () => {
    const shell = fakeShell(OWNER);
    open(shell, '#/customers/c1');
    await waitFor(() => expect(document.querySelector('[data-page="customer-detail"]')).toBeTruthy());
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Rashid');
    expect(shell.of('customers:get')[0]!.input).toEqual({ customer_id: 'c1' });
  });

  it('/customers/:id/edit renders the edit form for that customer', async () => {
    const shell = fakeShell(OWNER);
    open(shell, '#/customers/c1/edit');
    await waitFor(() => expect(document.querySelector('[data-page="customer-form"]')).toBeTruthy());
    expect(await screen.findByDisplayValue('Rashid')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.customerForm.editTitle('Rashid'));
    expect(shell.of('customers:get')[0]!.input).toEqual({ customer_id: 'c1' });
  });

  it('/customers/:id/statement renders the statement page, not the customer page', async () => {
    const shell = fakeShell(OWNER);
    open(shell, '#/customers/c1/statement');
    await waitFor(() => expect(document.querySelector('[data-page="statement"]')).toBeTruthy());
    expect(document.querySelector('[data-page="customer-detail"]')).toBeNull();
    await waitFor(() => expect(shell.of('khata:statement')[0]!.input).toEqual({ customer_id: 'c1' }));
  });

  it('/customers/new renders the add form and /customers the list', async () => {
    open(fakeShell(OWNER), '#/customers/new');
    await waitFor(() => expect(document.querySelector('[data-page="customer-form"]')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.customerForm.addTitle);
    cleanup();
    open(fakeShell(OWNER), '#/customers');
    await waitFor(() => expect(document.querySelector('[data-page="customers"]')).toBeTruthy());
  });
});

describe.each([
  ['the owner', OWNER],
  ['staff', STAFF],
] as const)('the customer page in the real app, signed in as %s', (_who, user) => {
  it('shows the statement print buttons for THIS customer and they send that customer\'s id', async () => {
    const shell = fakeShell(user);
    open(shell, '#/customers/c1');
    await screen.findByRole('heading', { level: 1 });
    const actions = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-page="customer-detail"] [data-statement-actions]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect([...actions.querySelectorAll('button')].map((b) => b.getAttribute('data-statement-print') ?? (b.hasAttribute('data-statement-export') ? 'export' : null))).toEqual(['80', 'a4', 'pdf', 'export']);
    await userEvent.setup().click(actions.querySelector<HTMLElement>('[data-statement-print="80"]')!);
    await waitFor(() => expect(shell.of('print:statement')).toHaveLength(1));
    expect(shell.of('print:statement')[0]!.input).toEqual({ customer_id: 'c1', kind: 'receipt', output: 'printer' });
    await userEvent.setup().click(actions.querySelector<HTMLElement>('[data-statement-print="pdf"]')!);
    await waitFor(() => expect(shell.of('print:statement')).toHaveLength(2));
    expect(shell.of('print:statement')[1]!.input).toEqual({ customer_id: 'c1', kind: 'invoice', output: 'pdf' });
  });

  it('after a payment is recorded the saved box has the receipt print buttons for the saved payment', async () => {
    const shell = fakeShell(user);
    open(shell, '#/customers/c1');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.setup().click(screen.getByRole('button', { name: en.customerDetail.receivePayment }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(en.customerPayment.amount) as HTMLInputElement;
    await userEvent.setup().type(amount, '1000');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: en.customerPayment.save }));
    const saved = await screen.findByRole('dialog', { name: en.customerPayment.savedTitle });
    expect(saved.querySelector('[data-receipt-no]')!.textContent).toBe('RCP-A-000077');
    const actions = saved.querySelector<HTMLElement>('[data-payment-receipt-actions]');
    expect(actions, 'the saved box has the payment receipt buttons').toBeTruthy();
    expect([...actions!.querySelectorAll('button')].map((b) => b.getAttribute('data-receipt-print'))).toEqual(['printer', 'pdf']);
    await userEvent.setup().click(within(actions!).getByRole('button', { name: en.paymentReceipt.print }));
    await waitFor(() => expect(shell.of('print:paymentReceipt')).toHaveLength(1));
    expect(shell.of('print:paymentReceipt')[0]!.input).toEqual({ payment_id: 'pay-77', output: 'printer' });
    await userEvent.setup().click(within(actions!).getByRole('button', { name: en.paymentReceipt.savePdf }));
    await waitFor(() => expect(shell.of('print:paymentReceipt')).toHaveLength(2));
    expect(shell.of('print:paymentReceipt')[1]!.input).toEqual({ payment_id: 'pay-77', output: 'pdf' });
    expect(shell.of('payments:receive')[0]!.input).toEqual({ customer_id: 'c1', amount: 100_000, method: 'cash' });
  });
});

describe('the customer page in the real app, in Urdu', () => {
  it('the saved payment box has the Urdu receipt buttons', async () => {
    const shell = fakeShell(OWNER, 'ur');
    open(shell, '#/customers/c1');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.setup().click(screen.getByRole('button', { name: ur.customerDetail.receivePayment }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.setup().type(within(dialog).getByLabelText(ur.customerPayment.amount), '500');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: ur.customerPayment.save }));
    const saved = await screen.findByRole('dialog', { name: ur.customerPayment.savedTitle });
    expect(within(saved).getByRole('button', { name: ur.paymentReceipt.print })).toBeTruthy();
  });
});
