// @vitest-environment jsdom
// The Returns screen, driven the way a person drives it, against a fake API built with the real client code. The refund numbers come from the fake
// shell on purpose (odd ones): the screen must show what `returns:preview` says and never work out money itself.
import { buildApi, type Channel, type InvoiceForReturnView, type Language, type ReturnDetailView, type ReturnListView, type ReturnPreviewView, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { ReturnsPage } from '../src/pages/returns/returns-page.js';
import { smallUnitsIn, visibleText } from './unit-scan.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };
const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

const LINE_INSECTICIDE = {
  invoice_item_id: 'ii-1', position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', base_unit: 'ml' as const, pack_size: 1000, whole_packs_only: true,
  qty: 2000, qty_returned: 0, qty_returnable: 2000, unit_price: 50_000, line_discount: 0, tax_amount: 9100, line_total: 100_000, batch_expired: false,
};
const LINE_FERT = {
  invoice_item_id: 'ii-2', position: 2, name_en: 'Fertilizer', name_ur: 'کھاد', batch_no: 'F-001', base_unit: 'g' as const, pack_size: 1000, whole_packs_only: false,
  qty: 2500, qty_returned: 0, qty_returnable: 2500, unit_price: 20_000, line_discount: 0, tax_amount: 0, line_total: 50_000, batch_expired: false,
};
const VIEW: InvoiceForReturnView = {
  invoice: {
    id: 'inv-2', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', due_date: null, status: 'active', payment_method: 'cash', price_type: 'retail',
    subtotal: 140_900, tax_total: 9100, total: 150_000, paid_amount: 50_000, on_khata: 100_000, void_reason: null,
  },
  customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12' },
  customer_id: 'c1',
  lines: [LINE_INSECTICIDE, LINE_FERT],
  khata_balance: 305_000,
  has_returns: false,
  refund_paid_part_to_khata: false,
  returns: [],
};

/** Odd numbers on purpose: if the screen worked the refund out itself it would not match these. */
const PREVIEW: ReturnPreviewView = {
  invoice_id: 'inv-2', invoice_no: 'INV-A-000002',
  lines: [{ invoice_item_id: 'ii-1', qty: 1000, refund_amount: 49_999, tax_refund: 4551, condition: 'resellable', restock: true }],
  total: 49_999, tax_total: 4551, cash_amount: 10_001, khata_amount: 39_998, khata_before: 305_000, khata_after: 265_002, restock_lines: 1, write_off_lines: 0, issues: [],
};

const ROW = { id: 'inv-2', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', status: 'active' as const, customer_name_en: 'Rashid', customer_name_ur: 'راشد', total: 150_000, paid_amount: 50_000, on_khata: 100_000, payment_method: 'cash' as const, sold_by: 'Owner', line_count: 2, print_count: 0 };
const MADE = { sales_return: { id: 'ret-1', return_no: 'RET-A-000001' }, items: [] };
const DETAIL: ReturnDetailView = {
  return: { id: 'ret-1', return_no: 'RET-A-000001', return_date: '2026-10-12', created_at: '2026-10-12T06:00:00.000Z', note: null, total: 49_999, tax_total: 4551, cash_amount: 10_001, khata_amount: 39_998, requested_by: 'Salesman', approved_by: 'Owner' },
  invoice: { id: 'inv-2', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', status: 'active', total: 150_000 },
  customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12' }, customer_id: 'c1',
  lines: [{ position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', base_unit: 'ml', pack_size: 1000, qty: 1000, unit_price: 50_000, refund_amount: 49_999, tax_refund: 4551, condition: 'resellable', reason: 'changed_mind' }],
  balance_after: 265_002,
};
const LIST: ReturnListView = {
  rows: [{ id: 'ret-1', return_no: 'RET-A-000001', invoice_id: 'inv-2', invoice_no: 'INV-A-000002', return_date: '2026-10-12', created_at: '2026-10-12T06:00:00.000Z', customer_name_en: 'Rashid', customer_name_ur: 'راشد', total: 49_999, tax_total: 4551, cash_amount: 10_001, khata_amount: 39_998, line_count: 1, requested_by: 'Salesman', approved_by: 'Owner', print_count: 1 }],
  total: 1,
};

type Handler = (input: any) => unknown | Promise<unknown>;
function fakeShell(override: Partial<Record<Channel, Handler>> = {}, view: InvoiceForReturnView = VIEW) {
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'invoices:list': () => ok({ rows: [ROW], total: 1 }),
    'returns:forInvoice': () => ok(view),
    'returns:preview': () => ok(PREVIEW),
    'returns:get': () => ok(DETAIL),
    'returns:list': () => ok(LIST),
    'salesReturn:create': () => ok(MADE),
    'approval:requestReturn': () => ok({ token: 't'.repeat(64), expires_at: '2026-10-12T06:01:00.000Z' }),
    'invoices:void': () => ok({ invoice_id: 'inv-2', invoice_no: 'INV-A-000002', khata_reversed: 100_000, cash_back: 50_000, stock_lines: 2 }),
    'print:returnSlip': (input) => ok({ status: 'printed', pdf_path: null, fallback: null, kind: input.kind, language: 'en', is_copy: false }),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? await h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of };
}
type Shell = ReturnType<typeof fakeShell>;

let T = en.returns;
function show(shell: Shell, user: SessionUser = OWNER, language: Language = 'en', initial = '/returns') {
  T = language === 'ur' ? ur.returns : en.returns;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <MemoryRouter initialEntries={[initial]}>
        <ReturnsPage api={shell.api} user={user} />
      </MemoryRouter>
    </I18nProvider>,
  );
}
const pause = (ms = 220) => new Promise((r) => setTimeout(r, ms));
const lineBox = (n: number) => document.querySelectorAll<HTMLElement>('[data-return-line]')[n]!;
const open = async () => {
  await userEvent.setup().click(await screen.findByRole('button', { name: /INV-A-000002/ }));
  await waitFor(() => expect(document.querySelector('[data-return-lines]')).toBeTruthy());
};
const more = async (n: number) => userEvent.setup().click(within(lineBox(n)).getByRole('button', { name: T.more }));
const reason = (n: number, value: string) => fireEvent.change(lineBox(n).querySelector('select[data-reason]')!, { target: { value } });

afterEach(cleanup);

describe('Returns: finding the sale and the lines', () => {
  it('a sale found by search opens its lines: sold quantity in its own unit (packs, kg), nothing returned yet, the customer and the totals', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    expect(shell.of('returns:forInvoice')[0]!.input).toEqual({ invoice_id: 'inv-2' });
    const text = document.body.textContent!;
    for (const part of ['INV-A-000002', 'Rashid', 'Rs 1,500', 'Rs 91 tax included', T.chipNone]) expect(text, part).toContain(part);
    expect(lineBox(0).querySelector('[data-sold]')!.textContent).toBe('2 packs');
    expect(lineBox(1).querySelector('[data-sold]')!.textContent).toBe('2.5 kg');
    expect(smallUnitsIn(visibleText(document.body))).toEqual([]);
  });

  it('a sale can be opened straight from the invoice screen (?invoice=...)', async () => {
    const shell = fakeShell();
    show(shell, OWNER, 'en', '/returns?invoice=inv-2');
    await waitFor(() => expect(document.querySelector('[data-return-lines]')).toBeTruthy());
    expect(shell.of('returns:forInvoice')).toHaveLength(1);
  });

  it('a lookup that fails says so with a Try again that asks again', async () => {
    let n = 0;
    const shell = fakeShell({ 'returns:forInvoice': () => (++n === 1 ? fail('NOT_FOUND') : ok(VIEW)) });
    show(shell);
    await userEvent.setup().click(await screen.findByRole('button', { name: /INV-A-000002/ }));
    await userEvent.setup().click(await screen.findByRole('button', { name: T.retry }));
    await waitFor(() => expect(document.querySelector('[data-return-lines]')).toBeTruthy());
  });

  it('the stepper moves a sealed size by whole packs and a loose size by its step, never past what can still come back', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    await more(0);
    expect(lineBox(0).querySelector('[data-qty]')!.textContent).toBe('1');
    await more(0);
    await more(0);
    expect(lineBox(0).querySelector('[data-qty]')!.textContent).toBe('2'); // 2 packs sold: no third
    expect(within(lineBox(0)).getByRole('button', { name: T.more }).hasAttribute('disabled')).toBe(true);
    await more(1);
    expect((lineBox(1).querySelector('input[data-qty]') as HTMLInputElement).value).toBe('0.05'); // a loose 1 kg size moves by 50 g
  });

  it('a loose line is typed in kg: 0.5 is 500 base units, 2.6 is refused with the amount left', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    await more(1);
    const input = lineBox(1).querySelector('input[data-qty]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.5' } });
    await pause();
    expect(shell.of('returns:preview').at(-1)!.input.items[0]).toMatchObject({ invoice_item_id: 'ii-2', qty: 500 });
    fireEvent.change(input, { target: { value: '2.6' } });
    expect(await within(lineBox(1)).findByRole('alert')).toBeTruthy();
    fireEvent.change(input, { target: { value: '0,5' } });
    expect(await within(lineBox(1)).findByRole('alert')).toBeTruthy(); // a comma is not a decimal point
  });
});

describe('Returns: the refund is the core\'s', () => {
  it('the refund, the tax, the cash / Khata split and the Khata before and after are the preview\'s, shown as they came', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    await more(0);
    reason(0, 'changed_mind');
    await waitFor(() => expect(document.querySelector('[data-refund-total]')!.textContent).toBe('Rs 499.99'));
    expect(document.querySelector('[data-refund-tax]')!.textContent).toBe('includes tax Rs 45.51');
    expect(document.querySelector('[data-cash]')!.textContent).toBe('Hand Rs 100.01 to the customer');
    expect(document.querySelector('[data-khata]')!.textContent).toContain('Rs 399.98');
    expect(document.querySelector('[data-khata-before]')!.textContent).toBe('Rs 3,050');
    expect(document.querySelector('[data-khata-after]')!.textContent).toBe('Rs 2,650.02');
    expect(shell.of('returns:preview').at(-1)!.input).toEqual({ invoice_id: 'inv-2', items: [{ invoice_item_id: 'ii-1', qty: 1000, condition: 'resellable', reason: 'changed_mind' }] });
  });

  it('a wrong word from the preview (an issue) keeps Complete off and says what to fix', async () => {
    const shell = fakeShell({ 'returns:preview': () => ok({ ...PREVIEW, issues: [{ code: 'EXPIRED_NOT_RESELLABLE', invoice_item_id: 'ii-1' }] }) });
    show(shell);
    await open();
    await more(0);
    reason(0, 'other');
    await screen.findByText(T.issues.EXPIRED_NOT_RESELLABLE);
    expect(document.querySelector<HTMLButtonElement>('[data-complete]')!.disabled).toBe(true);
  });

  it('Complete is off until every chosen line has a reason', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    await more(0);
    await waitFor(() => expect(document.querySelector('[data-refund-total]')).toBeTruthy());
    expect(document.querySelector<HTMLButtonElement>('[data-complete]')!.disabled).toBe(true);
    reason(0, 'wrong_item');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-complete]')!.disabled).toBe(false));
  });
});

describe('Returns: completing as the owner', () => {
  it('sends the exact request (no approver, no amounts), then shows the credit note, the facts and the print buttons', async () => {
    const shell = fakeShell();
    show(shell);
    await open();
    await more(0);
    reason(0, 'changed_mind');
    await userEvent.setup().type(screen.getByLabelText(T.noteLabel), 'came back clean');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-complete]')!.disabled).toBe(false));
    await userEvent.setup().click(document.querySelector('[data-complete]')!);
    await waitFor(() => expect(document.querySelector('[data-return-complete]')).toBeTruthy());
    expect(shell.of('salesReturn:create')[0]!.input).toEqual({ invoice_id: 'inv-2', note: 'came back clean', items: [{ invoice_item_id: 'ii-1', qty: 1000, condition: 'resellable', reason: 'changed_mind' }] });
    await waitFor(() => expect(document.querySelector('[data-done-total]')!.textContent).toBe('Rs 499.99'));
    const text = document.querySelector('[data-return-complete]')!.textContent!;
    for (const part of ['RET-A-000001', 'INV-A-000002', 'Rs 45.51', 'Cash and Khata', 'Rashid owes now', 'Rs 2,650.02', 'Invoice INV-A-000002 is unchanged.']) expect(text, part).toContain(part);
    await userEvent.setup().click(document.querySelector('[data-return-print="receipt:printer"]')!);
    await waitFor(() => expect(shell.of('print:returnSlip')).toHaveLength(1));
    expect(shell.of('print:returnSlip')[0]!.input).toEqual({ return_id: 'ret-1', kind: 'receipt', output: 'printer' });
    await userEvent.setup().click(document.querySelector('[data-return-print="invoice:printer"]')!);
    await waitFor(() => expect(shell.of('print:returnSlip')).toHaveLength(2));
    expect(shell.of('print:returnSlip')[1]!.input).toEqual({ return_id: 'ret-1', kind: 'invoice', output: 'printer' });
  });

  it('an error from the shell is shown next to the button and nothing is shown as done', async () => {
    const shell = fakeShell({ 'salesReturn:create': () => fail('RETURN_EXCEEDS_SOLD', { returnable: 0, requested: 1000, packSize: 1000, unit: 'ml' }) });
    show(shell);
    await open();
    await more(0);
    reason(0, 'other');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-complete]')!.disabled).toBe(false));
    await userEvent.setup().click(document.querySelector('[data-complete]')!);
    await screen.findByRole('alert');
    expect(document.querySelector('[data-return-complete]')).toBeNull();
  });

  it('a line from an expired batch cannot be resellable; it starts as written off and says why', async () => {
    const view = { ...VIEW, lines: [{ ...LINE_INSECTICIDE, batch_expired: true }] };
    const shell = fakeShell({}, view);
    show(shell);
    await open();
    await more(0);
    reason(0, 'expired');
    const resellable = within(lineBox(0)).getByRole('button', { name: new RegExp(T.resellable) });
    expect(resellable.hasAttribute('disabled')).toBe(true);
    expect(lineBox(0).textContent).toContain(T.expiredBatch);
    await waitFor(() => expect(shell.of('returns:preview').at(-1)!.input.items[0].condition).toBe('expired'));
  });
});

describe('Returns: staff start it, the owner approves it', () => {
  it('staff see Owner approval instead of Complete, and the stock decision is the owner\'s to confirm in the box', async () => {
    const shell = fakeShell();
    show(shell, STAFF);
    await open();
    await more(0);
    reason(0, 'changed_mind');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-ask-owner]')!.disabled).toBe(false));
    expect(document.querySelector('[data-complete]')).toBeNull();
    expect(document.querySelector('[data-void-card]')).toBeNull(); // voiding is the owner's
    expect(within(lineBox(0)).getByRole('button', { name: new RegExp(T.resellable) }).hasAttribute('disabled')).toBe(true);
  });

  it('the owner types their own password; the token request names these lines; the owner can turn the line into a write-off; the return is sent with the token and the password is gone', async () => {
    const shell = fakeShell();
    show(shell, STAFF);
    await open();
    await more(0);
    reason(0, 'changed_mind');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-ask-owner]')!.disabled).toBe(false));
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-ask-owner]')!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getAllByRole('button', { name: T.writtenOff })[0]!); // the owner decides: written off
    await user.type(within(dialog).getByLabelText(T.approval.username), 'owner');
    await user.type(within(dialog).getByLabelText(T.approval.password), 'owner-secret');
    await user.click(within(dialog).getByRole('button', { name: T.approval.approve }));
    await waitFor(() => expect(shell.of('salesReturn:create')).toHaveLength(1));
    expect(shell.of('approval:requestReturn')[0]!.input).toEqual({
      username: 'owner', password: 'owner-secret', return: { invoice_id: 'inv-2', items: [{ invoice_item_id: 'ii-1', qty: 1000, condition: 'damaged', reason: 'changed_mind' }] },
    });
    expect(shell.of('salesReturn:create')[0]!.input).toEqual({
      invoice_id: 'inv-2', items: [{ invoice_item_id: 'ii-1', qty: 1000, condition: 'damaged', reason: 'changed_mind' }], approval_token: 't'.repeat(64),
    });
    await waitFor(() => expect(document.querySelector('[data-return-complete]')).toBeTruthy());
    expect(JSON.stringify(shell.calls)).not.toContain('approved_by');
  });

  it('a wrong password shows the error, empties the box and sends no return', async () => {
    const shell = fakeShell({ 'approval:requestReturn': () => fail('INVALID_CREDENTIALS') });
    show(shell, STAFF);
    await open();
    await more(0);
    reason(0, 'other');
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[data-ask-owner]')!.disabled).toBe(false));
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-ask-owner]')!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(T.approval.username), 'owner');
    await user.type(within(dialog).getByLabelText(T.approval.password), 'nope');
    await user.click(within(dialog).getByRole('button', { name: T.approval.approve }));
    await within(dialog).findByRole('alert');
    expect((within(dialog).getByLabelText(T.approval.password) as HTMLInputElement).value).toBe('');
    expect(shell.of('salesReturn:create')).toHaveLength(0);
  });
});

describe('Returns: void a whole invoice', () => {
  it('the owner sees the card; the button waits for a reason; the request is exactly the invoice and the reason; the result is said in words', async () => {
    const shell = fakeShell();
    show(shell, OWNER);
    await open();
    const card = document.querySelector('[data-void-card]') as HTMLElement;
    expect(card.textContent).toContain(T.void.warnTitle);
    const confirm = card.querySelector<HTMLButtonElement>('[data-void-confirm]')!;
    expect(confirm.disabled).toBe(true);
    await userEvent.setup().type(within(card).getByLabelText(T.void.reasonAria), 'Entered for the wrong customer');
    expect(confirm.disabled).toBe(false);
    await userEvent.setup().click(confirm);
    await waitFor(() => expect(card.querySelector('[data-void-done]')).toBeTruthy());
    expect(shell.of('invoices:void')[0]!.input).toEqual({ invoice_id: 'inv-2', reason: 'Entered for the wrong customer' });
    expect(card.textContent).toContain('Rs 1,000 was taken off the Khata');
    expect(card.textContent).toContain('Hand back Rs 500 in cash');
  });

  it('an invoice with returns cannot be voided: the card says so and offers no button', async () => {
    const shell = fakeShell({}, { ...VIEW, has_returns: true });
    show(shell, OWNER);
    await open();
    const card = document.querySelector('[data-void-card]') as HTMLElement;
    expect(card.querySelector('[data-void-blocked]')!.textContent).toContain(T.void.hasReturns);
    expect(card.querySelector('[data-void-confirm]')).toBeNull();
  });

  it('a voided invoice shows the VOIDED chip and why, and no way to return against it', async () => {
    const view = { ...VIEW, invoice: { ...VIEW.invoice, status: 'voided' as const, void_reason: 'wrong customer' } };
    const shell = fakeShell({}, view);
    show(shell, OWNER, 'en', '/returns?invoice=inv-2');
    await waitFor(() => expect(document.querySelector('[data-status-chip="voided"]')).toBeTruthy());
    expect(document.querySelector('[data-status-chip]')!.textContent).toBe('VOIDED');
    expect(document.querySelector('[data-voided-banner]')!.textContent).toContain('wrong customer');
    expect(document.querySelector('[data-refund-summary]')).toBeNull();
    expect(document.querySelector('[data-void-blocked]')!.textContent).toContain(T.void.alreadyVoided);
  });
});

describe('Returns: the list', () => {
  it('shows past returns with how they were paid and opens one with its lines in their own units', async () => {
    const shell = fakeShell();
    show(shell);
    await userEvent.setup().click(screen.getByRole('tab', { name: T.tabList }));
    const row = await waitFor(() => {
      const r = document.querySelector('[data-return-row="RET-A-000001"]') as HTMLElement;
      expect(r).toBeTruthy();
      return r;
    });
    for (const part of ['INV-A-000002', 'Rashid', 'Rs 499.99', 'Cash Rs 100.01', 'Khata Rs 399.98', 'Salesman', 'Printed once']) expect(row.textContent, part).toContain(part);
    await userEvent.setup().click(within(row).getByRole('button', { name: T.list.open('RET-A-000001') }));
    const detail = await waitFor(() => {
      const d = document.querySelector('[data-return-detail]') as HTMLElement;
      expect(d).toBeTruthy();
      return d;
    });
    expect(detail.textContent).toContain('1 pack');
    expect(smallUnitsIn(visibleText(document.body))).toEqual([]);
  });

  it('an empty list says so', async () => {
    const shell = fakeShell({ 'returns:list': () => ok({ rows: [], total: 0 }) });
    show(shell);
    await userEvent.setup().click(screen.getByRole('tab', { name: T.tabList }));
    expect(await screen.findByText(T.list.empty)).toBeTruthy();
  });
});

describe('Returns: Urdu', () => {
  it('has the same texts in both languages (every key of the returns texts exists in both)', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v !== null && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(ur.returns).sort()).toEqual(keys(en.returns).sort());
  });

  it('the screen is right to left in Urdu words, shows kg / L / pack words only, and no g or ml', async () => {
    const shell = fakeShell();
    show(shell, OWNER, 'ur');
    await userEvent.setup().click(await screen.findByRole('button', { name: /INV-A-000002/ }));
    await waitFor(() => expect(document.querySelector('[data-return-lines]')).toBeTruthy());
    await more(0);
    await more(1);
    reason(0, 'changed_mind');
    await waitFor(() => expect(document.querySelector('[data-refund-total]')).toBeTruthy());
    const text = visibleText(document.body);
    expect(smallUnitsIn(text)).toEqual([]);
    expect(text).toContain('کلو');
    expect(text).toContain(ur.returns.chipNone);
    expect(lineBox(0).querySelector('[data-sold]')!.textContent).toContain('پیک');
  });
});
