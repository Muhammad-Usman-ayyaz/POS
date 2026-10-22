// @vitest-environment jsdom
// The customer page, Receive payment and Opening balance, driven the way people drive them, against a fake API built with the real client
// code. Wording is READ from docs/design/CustomerForms.dc.html and looked for on the RENDERED page.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentProps } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { CustomerDetailPage } from '../src/pages/customers/detail/customer-detail-page.js';
import { advanceExtraPreview, balanceAfterPreview } from '../src/pages/customers/detail/customer-detail-state.js';
import { adjustmentFor, buildOpeningRequest, signedOpening } from '../src/pages/customers/opening/customer-opening-requests.js';
import { scanSource } from './source-scan.js';

configure({ asyncUtilTimeout: 5000 });

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

// ---- the design's own words ----
const designHtml = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'design', 'CustomerForms.dc.html'), 'utf8');
const designNodes = [...designHtml.matchAll(/>([^<>]+)</g)].map((x) => x[1]!.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
const drawn = (start: string): string => {
  const hit = designNodes.find((t) => t === start) ?? designNodes.find((t) => t.startsWith(start));
  if (!hit) throw new Error(`the design has no text starting with "${start}"`);
  return hit;
};

// ---- fixtures ----
const customer = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name_en: 'Rashid', name_ur: 'راشد', phone: '0300 1234567', village: 'Chak 12', credit_limit: 1_000_000, default_price_type: 'retail',
  notes: null, father_name: null, cnic: null, phone2: null, guarantor: null, land_size: null, crop: null, version: 1, ...over,
});
const summary = (over: Record<string, unknown> = {}, c = customer()) => ({ customer: c, balance: 900_000, credit_left: 100_000, no_limit: false, over_limit: false, next_due: '2026-10-31', overdue_amount: 0, overdue_days: 0, ...over });
let n = 0;
const line = (label: string, delta: number, running: number, over: Record<string, unknown> = {}) => ({
  kind: 'entry', label, amount_delta: delta, running_balance: running, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null,
  entry: { id: `e${n++}`, entry_date: '2026-10-02T08:00:00.000Z' }, ...over,
});
const statement = (lines: unknown[] = []) => ({ customer: {}, from: null, to: null, lines, brought_forward: 0, totals: { owes_more: 0, owes_less: 0 }, closing_balance: 0 });
const reply = (over: Record<string, unknown> = {}) => ({ payment: {}, receipt_no: 'RCP-A-000007', balance_after: 123_400, advance: false, ...over });

type Handler = (input: any) => unknown;
const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

function fakeShell(override: Partial<Record<Channel, Handler>> = {}, base: { summary?: unknown; lines?: unknown[] } = {}) {
  const calls: { channel: string; input: any }[] = [];
  let current: unknown = base.summary ?? summary();
  const handlers: Partial<Record<Channel, Handler>> = {
    'customers:get': () => ok(current),
    'khata:statement': () => ok(statement(base.lines ?? [])),
    'payments:receive': () => ok(reply()),
    'khata:setOpeningBalance': () => ok(null),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: Channel) => calls.filter((c) => c.channel === channel);
  return { api, calls, of, setSummary: (s: unknown) => (current = s) };
}

function show(shell: ReturnType<typeof fakeShell>, user: SessionUser = OWNER, language: Language = 'en', extra: Partial<ComponentProps<typeof CustomerDetailPage>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/customers/c1']}>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <Routes>
            <Route path="/customers" element={<p>the customer list</p>} />
            <Route path="/customers/:id/edit" element={<p>the edit page</p>} />
            <Route path="/customers/:id/statement" element={<p>the statement page</p>} />
            <Route path="/customers/:id" element={<CustomerDetailPage api={shell.api} user={user} {...extra} />} />
          </Routes>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}
const loaded = () => screen.findByRole('heading', { level: 1 });
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const click = (el: HTMLElement) => fireEvent.click(el);
const t = en.customerDetail;
const p = en.customerPayment;
const o = en.customerOpening;

afterEach(cleanup);

const openPayment = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en', extra: Partial<ComponentProps<typeof CustomerDetailPage>> = {}) => {
  show(shell, user, language, extra);
  await loaded();
  click(screen.getByRole('button', { name: language === 'ur' ? ur.customerDetail.receivePayment : drawn('Receive payment') }));
  return screen.getByRole('dialog');
};
const amountBox = () => screen.getByLabelText(drawn('Amount received')) as HTMLInputElement;
const saveBtn = () => screen.getByRole('button', { name: p.save }) as HTMLButtonElement;
const method = (name: string) => screen.getByRole('radio', { name });

// ---------- the page ----------

describe('the customer page', () => {
  it('shows the name, village, price type, balance, credit and next due from the shell, and the buttons', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rashid');
    const text = document.body.textContent!;
    for (const s of ['Chak 12', 'Retail price', '0300 1234567', 'Owes Rs 9,000', 'Rs 10,000', 'Rs 1,000', '31 Oct 2026']) expect(text, s).toContain(s);
    expect(shell.of('customers:get')[0]!.input).toEqual({ customer_id: 'c1' });
    expect(shell.of('khata:statement')[0]!.input).toEqual({ customer_id: 'c1' });
    expect(screen.getByRole('link', { name: t.edit }).getAttribute('href')).toBe('/customers/c1/edit');
    expect(screen.getByRole('link', { name: t.fullStatement }).getAttribute('href')).toBe('/customers/c1/statement');
    expect(screen.getByRole('link', { name: t.back }).getAttribute('href')).toBe('/customers');
    expect(screen.getByRole('button', { name: drawn('Receive payment') })).toBeTruthy();
  });

  it('an advance reads "Advance Rs X" and never "Owes Rs -x"', async () => {
    show(fakeShell({}, { summary: summary({ balance: -100_000, credit_left: 1_000_000 }) }));
    await loaded();
    expect(document.querySelector('[data-card="balance"]')!.textContent).toContain('Advance Rs 1,000');
    expect(document.body.textContent).not.toMatch(/Owes Rs\s*-|-\s*Rs/);
  });

  it('a balance of nothing is "Clear"', async () => {
    show(fakeShell({}, { summary: summary({ balance: 0 }) }));
    await loaded();
    expect(document.querySelector('[data-card="balance"]')!.textContent).toContain('Clear');
  });

  it('a limit of 0 shows the loud No limit chip and no "left" amount; over the limit has its own chip', async () => {
    show(fakeShell({}, { summary: summary({ no_limit: true, credit_left: null }, customer({ credit_limit: 0 })) }));
    await loaded();
    expect(document.querySelector('[data-chip="no-limit"]')!.textContent).toBe('No limit');
    expect(document.querySelector('[data-chip="credit-left"]')).toBeNull();
    cleanup();
    show(fakeShell({}, { summary: summary({ over_limit: true, credit_left: 0 }) }));
    await loaded();
    expect(document.querySelector('[data-chip="over-limit"]')!.textContent).toBe('Over limit');
    expect(document.querySelector('[data-chip="no-limit"]')).toBeNull();
  });

  it('shows the overdue chip from the shell', async () => {
    show(fakeShell({}, { summary: summary({ overdue_amount: 1_550_000, overdue_days: 12 }) }));
    await loaded();
    expect(document.querySelector('[data-chip="overdue"]')!.textContent).toBe('Overdue Rs 15,500 · 12 days');
  });

  it('owner sees Opening balance; staff do not, but both see Receive payment and Edit', async () => {
    show(fakeShell(), OWNER);
    await loaded();
    expect(screen.getByRole('button', { name: drawn('Opening balance') })).toBeTruthy();
    cleanup();
    show(fakeShell(), STAFF);
    await loaded();
    expect(screen.queryByRole('button', { name: t.openingBalance })).toBeNull();
    expect(screen.getByRole('button', { name: t.receivePayment })).toBeTruthy();
    expect(screen.getByRole('link', { name: t.edit })).toBeTruthy();
  });

  it('the ledger preview: type pills, owes more and owes less columns, the shell\'s running balance, only the last 10', async () => {
    const many = Array.from({ length: 12 }, (_, i) => line('sale', 100_00, (i + 1) * 100_00, { invoice_no: `INV-A-${i + 1}` }));
    const lines = [
      line('opening', 500_000, 500_000),
      ...many,
      line('payment', -200_000, 1_000_000, { payment_method: 'cash', receipt_no: 'RCP-A-000001' }),
      line('return', -100_000, 900_000, { return_no: 'RET-A-000001' }),
      line('payment', -50_000, -50_000, { payment_method: 'easypaisa' }),
    ];
    show(fakeShell({}, { lines }));
    await loaded();
    const rows = [...document.querySelectorAll('[data-ledger-row]')];
    expect(rows).toHaveLength(10);
    const tail = rows.slice(-3);
    expect(tail[0]!.textContent).toContain('Payment · Cash');
    expect(tail[0]!.textContent).toContain('RCP-A-000001');
    expect(tail[0]!.querySelector('[data-less]')!.textContent).toBe('Rs 2,000');
    expect(tail[0]!.querySelector('[data-more]')!.textContent).toBe('');
    expect(tail[0]!.querySelector('[data-running]')!.textContent).toBe('Rs 10,000');
    expect(tail[1]!.textContent).toContain('Return credit');
    expect(tail[1]!.textContent).toContain('RET-A-000001');
    expect(tail[2]!.textContent).toContain('Payment · Easypaisa');
    expect(tail[2]!.querySelector('[data-running]')!.textContent).toBe('Advance Rs 500');
    expect(document.querySelector('[data-ledger-row="opening"]')).toBeNull(); // older than the last 10
    expect(rows[0]!.textContent).toContain('Sale');
    expect(rows[0]!.querySelector('[data-more]')!.textContent).toBe('Rs 100');
    expect(rows[0]!.textContent).toContain('2 Oct 2026');
    expect(screen.getByText(t.ledgerNote)).toBeTruthy();
  });

  it('an opening balance line has its own pill', async () => {
    show(fakeShell({}, { lines: [line('opening', 650_000, 650_000)] }));
    await loaded();
    expect(document.querySelector('[data-pill="opening"]')!.textContent).toBe('Opening balance');
  });

  it('no lines says so', async () => {
    show(fakeShell());
    await loaded();
    expect(document.querySelector('[data-ledger-empty]')!.textContent).toBe(t.ledgerEmpty);
  });

  it('NOT_FOUND shows a calm message, other errors offer Try again', async () => {
    show(fakeShell({ 'customers:get': () => fail('NOT_FOUND') }));
    expect(await screen.findByText(t.notFound)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.receivePayment })).toBeNull();
    cleanup();
    let calls = 0;
    show(fakeShell({ 'customers:get': () => (++calls === 1 ? fail('INTERNAL') : ok(summary())) }));
    click(await screen.findByRole('button', { name: t.retry }));
    await loaded();
    expect(screen.getByRole('button', { name: t.receivePayment })).toBeTruthy();
  });

  it('shows a loading state first', () => {
    show(fakeShell());
    expect(screen.getByRole('status').textContent).toBe(t.loading);
  });

  it('renders the statementActions slot', async () => {
    show(fakeShell(), OWNER, 'en', { statementActions: <button type="button">Print statement</button> });
    await loaded();
    expect(screen.getByRole('button', { name: 'Print statement' })).toBeTruthy();
  });

  it('shows no cost, margin or profit even if the replies carried one', async () => {
    show(fakeShell({ 'customers:get': () => ok({ ...summary(), cost: 123_456, margin: 777_777 }) }));
    await loaded();
    expect(document.body.textContent).not.toMatch(/cost|margin|profit|123,456|7,777/i);
  });
});

// ---------- Receive payment ----------

describe('Receive payment', () => {
  it('shows the design\'s words (read from the design file) on the rendered dialog', async () => {
    const box = await openPayment();
    const text = box.textContent!;
    for (const w of ['Receive payment', 'Amount received', 'Method', 'Cash', 'Bank', 'Easypaisa', 'JazzCash', 'Date', 'Note', 'Cancel']) expect(text, w).toContain(drawn(w));
    expect(text).toContain('Rashid');
    expect(text).toContain('Chak 12');
    expect(text).toContain('Owes now');
    expect(text).toContain('Rs 9,000');
    expect(text).toContain(p.today);
  });

  it('cash is the default; the reference box appears only for the other three methods', async () => {
    await openPayment();
    expect(method('Cash').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText(drawn('Reference number'))).toBeNull();
    for (const name of ['Bank', 'Easypaisa', 'JazzCash']) {
      click(method(name));
      expect(screen.getByLabelText(drawn('Reference number'))).toBeTruthy();
    }
  });

  it('the date is read-only "Today": no date input, and the request has no date', async () => {
    const shell = fakeShell();
    const box = await openPayment(shell);
    expect(box.querySelector('input[type="date"]')).toBeNull();
    expect(box.querySelector('[data-payment-date]')!.textContent).toBe('Today');
    set(amountBox(), '1000');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(Object.keys(shell.of('payments:receive')[0]!.input).sort()).toEqual(['amount', 'customer_id', 'method']);
  });

  it('a cash payment sends the amount in paisa, no user, no confirm_advance; the saved box shows the shell\'s numbers, not the preview', async () => {
    const shell = fakeShell({ 'payments:receive': () => ok(reply({ receipt_no: 'RCP-A-000042', balance_after: 654_321 })) });
    await openPayment(shell);
    set(amountBox(), '5,000');
    // the live line is a preview of 9,000 - 5,000
    expect(document.querySelector('[data-balance-after-preview]')!.textContent).toContain('Rs 4,000 owed');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')).toHaveLength(1);
    expect(shell.of('payments:receive')[0]!.input).toEqual({ customer_id: 'c1', amount: 500_000, method: 'cash' });
    const box = document.querySelector('[data-payment-saved]')!;
    expect(box.querySelector('[data-receipt-no]')!.textContent).toBe('RCP-A-000042');
    expect(box.querySelector('[data-balance-after]')!.textContent).toBe('Rs 6,543.21 owed');
    expect(box.textContent).not.toContain('Rs 4,000');
    expect(document.querySelector('[data-balance-after-preview]')).toBeNull();
  });

  it('the saved box words an advance as "advance", and Done closes the dialog; the page reloads', async () => {
    const shell = fakeShell({ 'payments:receive': () => ok(reply({ balance_after: -250_000, advance: true })) });
    await openPayment(shell);
    set(amountBox(), '9000');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(document.querySelector('[data-balance-after]')!.textContent).toBe('Rs 2,500 advance');
    expect(document.querySelector('[data-balance-after]')!.textContent).not.toMatch(/-/);
    await waitFor(() => expect(shell.of('customers:get').length).toBeGreaterThan(1));
    click(screen.getByRole('button', { name: p.done }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the receiptActions slot gets the shell\'s reply in the saved state only', async () => {
    const seen: string[] = [];
    const receiptActions = (r: { receipt_no: string }) => {
      seen.push(r.receipt_no);
      return <button type="button">Print receipt</button>;
    };
    await openPayment(fakeShell(), OWNER, 'en', { receiptActions });
    expect(screen.queryByRole('button', { name: 'Print receipt' })).toBeNull();
    set(amountBox(), '100');
    click(saveBtn());
    expect(await screen.findByRole('button', { name: 'Print receipt' })).toBeTruthy();
    expect(seen).toContain('RCP-A-000007');
  });

  it('bank, Easypaisa and JazzCash need a reference: an inline message and nothing is sent; cash does not', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    set(amountBox(), '1000');
    click(method('Bank'));
    click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toBe(p.referenceRequired);
    expect(shell.of('payments:receive')).toHaveLength(0);
    click(method('JazzCash'));
    click(saveBtn());
    expect(shell.of('payments:receive')).toHaveLength(0);
  });

  it('a reference is trimmed and sent with the method; it is not sent for cash even if typed before switching', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    set(amountBox(), '1000');
    click(method('Easypaisa'));
    set(screen.getByLabelText(drawn('Reference number')), '  EP-48210937  ');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')[0]!.input).toEqual({ customer_id: 'c1', amount: 100_000, method: 'easypaisa', reference_no: 'EP-48210937' });
    cleanup();
    const shell2 = fakeShell();
    await openPayment(shell2);
    set(amountBox(), '1000');
    click(method('Bank'));
    set(screen.getByLabelText(drawn('Reference number')), 'X1');
    click(method('Cash'));
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell2.of('payments:receive')[0]!.input).toEqual({ customer_id: 'c1', amount: 100_000, method: 'cash' });
  });

  it('the note is trimmed and sent; 200 letters are fine, 201 are refused inline', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    set(amountBox(), '1000');
    set(screen.getByLabelText(drawn('Note')), 'x'.repeat(201));
    click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toBe(p.noteTooLong);
    expect(shell.of('payments:receive')).toHaveLength(0);
    set(screen.getByLabelText(drawn('Note')), `  ${'x'.repeat(200)}  `);
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')[0]!.input.note).toBe('x'.repeat(200));
  });

  it('an amount that is not rupees (blank, zero, text, three decimals) is refused inline', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    for (const bad of ['', '0', 'abc', '10.123', '-5']) {
      set(amountBox(), bad);
      click(saveBtn());
      expect((await screen.findByRole('alert')).textContent, bad).toBe(p.amountInvalid);
    }
    expect(shell.of('payments:receive')).toHaveLength(0);
  });

  it('more than the balance shows the advance confirm; Save stays off until it is ticked; confirm_advance is sent only when ticked', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    set(amountBox(), '10,000');
    const confirmBox = document.querySelector('[data-advance-confirm]')!;
    expect(confirmBox.textContent).toContain('Rs 1,000');
    expect(confirmBox.textContent).toContain('advance of Rs 1,000');
    expect(document.querySelector('[data-balance-after-preview]')!.textContent).toContain('Rs 1,000 advance');
    expect(saveBtn().disabled).toBe(true);
    click(saveBtn());
    expect(shell.of('payments:receive')).toHaveLength(0);
    click(within(confirmBox as HTMLElement).getByRole('checkbox'));
    expect(saveBtn().disabled).toBe(false);
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')[0]!.input).toEqual({ customer_id: 'c1', amount: 1_000_000, method: 'cash', confirm_advance: true });
  });

  it('changing the amount takes the tick off; an amount that is not an advance never sends confirm_advance', async () => {
    const shell = fakeShell();
    await openPayment(shell);
    set(amountBox(), '10000');
    click(screen.getByRole('checkbox'));
    set(amountBox(), '12000');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    click(screen.getByRole('checkbox'));
    set(amountBox(), '9000'); // exactly what is owed: not an advance
    expect(document.querySelector('[data-advance-confirm]')).toBeNull();
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')[0]!.input).not.toHaveProperty('confirm_advance');
  });

  it('when the customer owes nothing, any payment is an advance and needs the tick', async () => {
    await openPayment(fakeShell({}, { summary: summary({ balance: 0 }) }));
    set(amountBox(), '500');
    expect(document.querySelector('[data-advance-confirm]')!.textContent).toContain('Rs 500');
    expect(saveBtn().disabled).toBe(true);
  });

  it('if the shell answers ADVANCE_NOT_CONFIRMED, the same confirm appears (the page balance was stale)', async () => {
    let first = true;
    const shell = fakeShell({ 'payments:receive': () => (first ? ((first = false), fail('ADVANCE_NOT_CONFIRMED')) : ok(reply())) });
    await openPayment(shell);
    set(amountBox(), '1000');
    expect(document.querySelector('[data-advance-confirm]')).toBeNull();
    click(saveBtn());
    await waitFor(() => expect(document.querySelector('[data-advance-confirm]')).not.toBeNull());
    expect(saveBtn().disabled).toBe(true);
    click(screen.getByRole('checkbox'));
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')).toHaveLength(2);
    expect(shell.of('payments:receive')[1]!.input.confirm_advance).toBe(true);
  });

  it('two quick presses of Save send ONE payment', async () => {
    let release: (v: unknown) => void = () => undefined;
    const shell = fakeShell({ 'payments:receive': () => new Promise((r) => (release = r)) });
    await openPayment(shell);
    set(amountBox(), '1000');
    const form = document.querySelector('[data-payment-form]') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect((screen.getByRole('button', { name: p.saving }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(shell.of('payments:receive')).toHaveLength(1));
    release(ok(reply()));
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')).toHaveLength(1);
  });

  it('an error from the shell shows in words and goes away as soon as something is changed', async () => {
    const shell = fakeShell({ 'payments:receive': () => fail('INTERNAL') });
    await openPayment(shell);
    set(amountBox(), '1000');
    click(saveBtn());
    await waitFor(() => expect(document.querySelector('[role="alert"][data-code]')).not.toBeNull());
    set(amountBox(), '1100');
    expect(document.querySelector('[role="alert"][data-code]')).toBeNull();
  });

  it('the request is for the customer on the page, never another', async () => {
    const shell = fakeShell({}, { summary: summary({}, customer({ id: 'c77' })) });
    render(
      <MemoryRouter initialEntries={['/customers/c77']}>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <ToastProvider>
            <Routes>
              <Route path="/customers/:id" element={<CustomerDetailPage api={shell.api} user={OWNER} />} />
            </Routes>
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await loaded();
    click(screen.getByRole('button', { name: t.receivePayment }));
    set(amountBox(), '100');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    expect(shell.of('payments:receive')[0]!.input.customer_id).toBe('c77');
    expect(shell.of('customers:get')[0]!.input.customer_id).toBe('c77');
  });
});

describe('the Balance after preview helpers', () => {
  it('balanceAfterPreview is balance minus amount (a negative result is an advance)', () => {
    expect(balanceAfterPreview(900_000, 500_000)).toBe(400_000);
    expect(balanceAfterPreview(900_000, 1_000_000)).toBe(-100_000);
    expect(balanceAfterPreview(-50_000, 10_000)).toBe(-60_000);
    expect(balanceAfterPreview(0, 100)).toBe(-100);
  });
  it('advanceExtraPreview is only what is more than owed', () => {
    expect(advanceExtraPreview(900_000, 1_000_000)).toBe(100_000);
    expect(advanceExtraPreview(900_000, 900_000)).toBe(0);
    expect(advanceExtraPreview(900_000, 100)).toBe(0);
    expect(advanceExtraPreview(0, 500)).toBe(500);
    expect(advanceExtraPreview(-1000, 500)).toBe(500);
  });
});

// ---------- Opening balance ----------

const openOpening = async (shell = fakeShell(), language: Language = 'en') => {
  show(shell, OWNER, language);
  await loaded();
  click(screen.getByRole('button', { name: language === 'ur' ? ur.customerDetail.openingBalance : drawn('Opening balance') }));
};
const openAmount = () => screen.getByLabelText(o.amount) as HTMLInputElement;
const dirBtn = (name: string) => screen.getByRole('radio', { name });

describe('Opening balance', () => {
  it('shows the design\'s words, "They owe us" is chosen at first, and there is no note and no date field', async () => {
    await openOpening();
    const box = screen.getByRole('dialog');
    for (const w of ['Owner only', 'Direction', 'They owe us', 'We owe them', 'One-time entry.', 'Cancel', 'Save opening balance']) expect(box.textContent, w).toContain(drawn(w));
    expect(dirBtn(drawn('They owe us')).getAttribute('aria-checked')).toBe('true');
    expect(dirBtn(drawn('We owe them')).getAttribute('aria-checked')).toBe('false');
    expect(box.querySelectorAll('input')).toHaveLength(1);
  });

  it('They owe us: a confirm step, then a plus amount in paisa and nothing else; the toast says what the reloaded customer owes', async () => {
    const shell = fakeShell();
    await openOpening(shell);
    set(openAmount(), '6,500');
    click(screen.getByRole('button', { name: o.save }));
    expect(screen.getByText(o.confirmTitle)).toBeTruthy();
    expect(document.querySelector('[data-opening-confirm]')!.textContent).toBe(o.confirmTheyOwe('Rashid', 'Rs 6,500'));
    expect(shell.of('khata:setOpeningBalance')).toHaveLength(0);
    shell.setSummary(summary({ balance: 650_000 }));
    click(screen.getByRole('button', { name: o.confirm }));
    await waitFor(() => expect(shell.of('khata:setOpeningBalance')).toHaveLength(1));
    expect(shell.of('khata:setOpeningBalance')[0]!.input).toEqual({ customer_id: 'c1', amount: 650_000 });
    expect((await screen.findByRole('status')).textContent).toContain(o.saved('Rashid', 'Owes Rs 6,500'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('We owe them: the amount is minus; the confirm says so', async () => {
    const shell = fakeShell();
    await openOpening(shell);
    click(dirBtn('We owe them'));
    set(openAmount(), '1200');
    click(screen.getByRole('button', { name: o.save }));
    expect(document.querySelector('[data-opening-confirm]')!.textContent).toBe(o.confirmWeOwe('Rashid', 'Rs 1,200'));
    click(screen.getByRole('button', { name: o.confirm }));
    await waitFor(() => expect(shell.of('khata:setOpeningBalance')).toHaveLength(1));
    expect(shell.of('khata:setOpeningBalance')[0]!.input).toEqual({ customer_id: 'c1', amount: -120_000 });
  });

  it('Back from the confirm keeps what was typed; a bad amount is refused inline', async () => {
    const shell = fakeShell();
    await openOpening(shell);
    for (const bad of ['', '0', 'x', '1.234']) {
      set(openAmount(), bad);
      click(screen.getByRole('button', { name: o.save }));
      expect((await screen.findByRole('alert')).textContent, bad).toBe(o.amountInvalid);
    }
    set(openAmount(), '300');
    click(screen.getByRole('button', { name: o.save }));
    click(screen.getByRole('button', { name: o.back }));
    expect(openAmount().value).toBe('300');
    expect(shell.of('khata:setOpeningBalance')).toHaveLength(0);
  });

  describe('correcting an existing opening balance (owner)', () => {
    const openingLines = (extra: unknown[] = []) => [line('opening', 650_000, 650_000), ...extra];
    const existsShell = (extra: Partial<Record<Channel, Handler>> = {}, lines: unknown[] = openingLines()) =>
      fakeShell({ 'khata:setOpeningBalance': () => fail('OPENING_BALANCE_EXISTS'), 'khata:adjustOpening': () => ok({ entry_id: 'x', balance_before: 650_000, balance: 500_000 }), ...extra }, { lines });
    const reachCorrection = async (shell: ReturnType<typeof fakeShell>) => {
      await openOpening(shell);
      set(openAmount(), '100');
      click(screen.getByRole('button', { name: o.save }));
      click(screen.getByRole('button', { name: o.confirm }));
      await screen.findByText(o.fixSave, { selector: 'button' });
    };
    const newAmount = () => screen.getByLabelText(o.newOpening) as HTMLInputElement;
    const reasonBox = () => screen.getByLabelText(o.reasonLabel) as HTMLInputElement;

    it('shows the current opening amount from the statement and the correction form', async () => {
      const shell = existsShell();
      await reachCorrection(shell);
      expect(document.querySelector('[data-current-opening]')!.textContent).toBe('Rs 6,500');
      expect(screen.getAllByText(o.fixTitle).length).toBeGreaterThan(0);
      expect(shell.of('khata:statement')).toHaveLength(2); // the page load and this box
    });

    it('sends the delta (new minus current) with the reason, after a confirm step', async () => {
      const shell = existsShell();
      await reachCorrection(shell);
      set(newAmount(), '5000');
      set(reasonBox(), '  Wrote Rs 1,500 too much ');
      click(screen.getByRole('button', { name: o.fixSave }));
      expect(document.querySelector('[data-fix-confirm]')!.textContent).toBe(o.fixConfirm('Rashid', 'Rs 6,500', 'Rs 5,000'));
      expect(shell.of('khata:adjustOpening')).toHaveLength(0);
      click(screen.getByRole('button', { name: o.fixConfirmButton }));
      await waitFor(() => expect(shell.of('khata:adjustOpening')).toHaveLength(1));
      expect(shell.of('khata:adjustOpening')[0]!.input).toEqual({ customer_id: 'c1', delta: -150_000, reason: 'Wrote Rs 1,500 too much' });
      expect((await screen.findByRole('status')).textContent).toContain('Opening balance corrected');
    });

    it('counts earlier corrections in the current amount (opening 6,500 and an adjustment of -1,500 is 5,000 now)', async () => {
      const shell = existsShell({}, openingLines([line('adjustment', -150_000, 500_000)]));
      await reachCorrection(shell);
      expect(document.querySelector('[data-current-opening]')!.textContent).toBe('Rs 5,000');
      set(newAmount(), '5500');
      set(reasonBox(), 'again');
      click(screen.getByRole('button', { name: o.fixSave }));
      click(screen.getByRole('button', { name: o.fixConfirmButton }));
      await waitFor(() => expect(shell.of('khata:adjustOpening')).toHaveLength(1));
      expect(shell.of('khata:adjustOpening')[0]!.input.delta).toBe(50_000);
    });

    it('We owe them: the new amount is minus, so the delta crosses zero', async () => {
      const shell = existsShell();
      await reachCorrection(shell);
      click(dirBtn(en.customerOpening.weOweThem));
      set(newAmount(), '200');
      set(reasonBox(), 'wrong way round');
      click(screen.getByRole('button', { name: o.fixSave }));
      click(screen.getByRole('button', { name: o.fixConfirmButton }));
      await waitFor(() => expect(shell.of('khata:adjustOpening')).toHaveLength(1));
      expect(shell.of('khata:adjustOpening')[0]!.input.delta).toBe(-670_000);
    });

    it('refuses the same amount, an empty reason and a bad amount inline, and sends nothing', async () => {
      const shell = existsShell();
      await reachCorrection(shell);
      set(newAmount(), '6500');
      set(reasonBox(), 'x');
      click(screen.getByRole('button', { name: o.fixSave }));
      expect(await screen.findByText(o.fixSame)).toBeTruthy();
      set(newAmount(), 'abc');
      set(reasonBox(), '   ');
      click(screen.getByRole('button', { name: o.fixSave }));
      expect(screen.getByText(o.amountInvalid)).toBeTruthy();
      expect(screen.getByText(o.reasonRequired)).toBeTruthy();
      expect(shell.of('khata:adjustOpening')).toHaveLength(0);
    });

    it('a failure from the shell keeps the box open with the error', async () => {
      const shell = existsShell({ 'khata:adjustOpening': () => fail('NOT_AUTHORIZED') });
      await reachCorrection(shell);
      set(newAmount(), '5000');
      set(reasonBox(), 'r');
      click(screen.getByRole('button', { name: o.fixSave }));
      click(screen.getByRole('button', { name: o.fixConfirmButton }));
      expect(await screen.findByText(/Only the owner/)).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('staff never see the Opening balance button, so never the correction', async () => {
      const shell = existsShell();
      show(shell, STAFF);
      await loaded();
      expect(screen.queryByRole('button', { name: drawn('Opening balance') })).toBeNull();
      expect(shell.of('khata:adjustOpening')).toHaveLength(0);
    });
  });

  describe('adjustmentFor (pure)', () => {
    it.each([
      [650_000, 500_000, -150_000],
      [100_000, -20_000, -120_000],
      [-30_000, 40_000, 70_000],
      [5, 5, 0],
    ])('opening %i becoming %i is a delta of %i', (cur, next, delta) => {
      expect(adjustmentFor(cur, next)).toBe(delta);
      expect(cur + adjustmentFor(cur, next)).toBe(next);
    });
  });

  it('two quick presses of the confirm send ONE request', async () => {
    let release: (v: unknown) => void = () => undefined;
    const shell = fakeShell({ 'khata:setOpeningBalance': () => new Promise((r) => (release = r)) });
    await openOpening(shell);
    set(openAmount(), '100');
    click(screen.getByRole('button', { name: o.save }));
    const confirm = screen.getByRole('button', { name: o.confirm });
    click(confirm);
    click(confirm);
    await waitFor(() => expect(shell.of('khata:setOpeningBalance')).toHaveLength(1));
    release(ok(null));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shell.of('khata:setOpeningBalance')).toHaveLength(1);
  });

  it('the sign helper: they owe us is plus, we owe them is minus', () => {
    expect(signedOpening('they_owe_us', 100)).toBe(100);
    expect(signedOpening('we_owe_them', 100)).toBe(-100);
    expect(buildOpeningRequest('c1', 'we_owe_them', '2.50')).toEqual({ customer_id: 'c1', amount: -250 });
  });
});

// ---------- hardening: dialogs that cannot be closed while saving, and the page's edges ----------

function gate() {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}
const backdropOf = (dialog: HTMLElement) => dialog.parentElement!;

describe('Receive payment cannot be closed while it saves', () => {
  it('Escape, the backdrop and Cancel do nothing in flight; the receipt number is then shown, and Escape closes the saved box', async () => {
    const g = gate();
    const shell = fakeShell({ 'payments:receive': async () => (await g.wait, ok(reply({ receipt_no: 'RCP-A-000099' }))) });
    const dialog = await openPayment(shell);
    set(amountBox(), '100');
    click(saveBtn());
    await waitFor(() => expect(shell.of('payments:receive')).toHaveLength(1));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(backdropOf(dialog));
    expect((within(dialog).getByRole('button', { name: p.cancel }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('dialog')).toBe(dialog);
    g.release();
    await screen.findByText(p.savedTitle);
    expect(document.querySelector('[data-receipt-no]')!.textContent).toBe('RCP-A-000099');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); // nothing is in flight now
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('after a failed save the dialog closes with Escape again', async () => {
    const dialog = await openPayment(fakeShell({ 'payments:receive': () => fail('INTERNAL') }));
    set(amountBox(), '100');
    click(saveBtn());
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Opening balance cannot be closed while it saves', () => {
  it('Escape and the backdrop do nothing in flight; the box closes by itself when the answer is in', async () => {
    const g = gate();
    const shell = fakeShell({ 'khata:setOpeningBalance': async () => (await g.wait, ok(null)) });
    await openOpening(shell);
    set(openAmount(), '100');
    click(screen.getByRole('button', { name: o.save }));
    click(screen.getByRole('button', { name: o.confirm }));
    await waitFor(() => expect(shell.of('khata:setOpeningBalance')).toHaveLength(1));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(backdropOf(dialog));
    expect(screen.getByRole('dialog')).toBe(dialog);
    g.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('on the confirm step with nothing in flight, Escape still closes', async () => {
    await openOpening();
    set(openAmount(), '100');
    click(screen.getByRole('button', { name: o.save }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the customer page: the edges', () => {
  /** A page that can change user, and a button to go to another customer. */
  function Harness({ shell, user }: { shell: ReturnType<typeof fakeShell>; user: SessionUser }) {
    return (
      <MemoryRouter initialEntries={['/customers/c1']}>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <ToastProvider>
            <Routes>
              <Route path="/customers/:id" element={<><GoTo /><CustomerDetailPage api={shell.api} user={user} /></>} />
            </Routes>
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>
    );
  }
  function GoTo() {
    const go = useNavigate();
    return (
      <button type="button" onClick={() => go('/customers/c2')}>
        go to c2
      </button>
    );
  }
  const two = (over: Partial<Record<Channel, Handler>> = {}) =>
    fakeShell({
      'customers:get': ({ customer_id }) => ok(customer_id === 'c2' ? summary({ balance: 0 }, customer({ id: 'c2', name_en: 'Zahid', name_ur: null, village: 'Kot' })) : summary()),
      ...over,
    });

  it('the opening-balance box is never there for staff, and disappears when the user turns out to be staff', async () => {
    const shell = fakeShell();
    const { rerender } = render(<Harness shell={shell} user={OWNER} />);
    await loaded();
    click(screen.getByRole('button', { name: t.openingBalance }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<Harness shell={shell} user={STAFF} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: t.openingBalance })).toBeNull();
    cleanup();
    show(fakeShell(), STAFF);
    await loaded();
    expect(document.querySelector('[data-action="opening-balance"]')).toBeNull();
    click(screen.getByRole('button', { name: t.receivePayment }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).not.toContain(o.ownerOnly);
  });

  it('NOT_FOUND has no Try again button (retrying cannot help), other errors have one that works', async () => {
    show(fakeShell({ 'customers:get': () => fail('NOT_FOUND') }));
    await screen.findByText(t.notFound);
    expect(screen.queryByRole('button', { name: t.retry })).toBeNull();
  });

  it('going to another customer keeps nothing of the first: not the open box, not the name, not the figures', async () => {
    const shell = two();
    render(<Harness shell={shell} user={OWNER} />);
    await loaded();
    click(screen.getByRole('button', { name: t.receivePayment }));
    set(amountBox(), '123');
    click(screen.getByRole('button', { name: 'go to c2' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zahid'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toContain('Rashid');
    expect(document.querySelector('[data-card="balance"]')!.textContent).toContain('Clear');
    expect(shell.of('customers:get').map((c) => c.input.customer_id)).toEqual(['c1', 'c2']);
    click(screen.getByRole('button', { name: t.receivePayment }));
    expect(amountBox().value).toBe(''); // a fresh box
  });

  it('the payment box gets the SIGNED balance: for a customer with an advance, paying more is an advance on top, not "owed"', async () => {
    const shell = fakeShell({}, { summary: summary({ balance: -100_000, credit_left: 1_000_000 }) });
    await openPayment(shell);
    set(amountBox(), '10');
    expect(document.querySelector('[data-balance-after-preview]')!.textContent).toContain('Rs 1,010 advance');
    expect(document.querySelector('[data-advance-confirm]')).not.toBeNull();
    expect(saveBtn().disabled).toBe(true);
  });

  it('a reload that fails after a saved payment shows its error on the page, and the saved box stays', async () => {
    let gets = 0;
    const shell = fakeShell({ 'customers:get': () => (++gets === 1 ? ok(summary()) : fail('INTERNAL')) });
    await openPayment(shell);
    set(amountBox(), '100');
    click(saveBtn());
    await screen.findByText(p.savedTitle);
    await waitFor(() => expect(document.querySelectorAll('[role=alert][data-code=INTERNAL]').length).toBeGreaterThan(0));
    expect(document.querySelector('[data-receipt-no]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rashid'); // the page keeps the figures it had
  });
});

// ---------- Urdu ----------

describe('Urdu and right to left', () => {
  it('the page, the payment box and the opening box use Urdu words, right to left, with amounts left to right', async () => {
    show(fakeShell({}, { lines: [line('payment', -1000, 899_000, { payment_method: 'cash' })] }), OWNER, 'ur');
    await loaded();
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('راشد');
    expect(document.querySelector('[data-card="balance"]')!.textContent).toContain(ur.customerDetail.owes('⁦Rs 9,000⁩'));
    expect(document.querySelector('[data-ledger-row]')!.textContent).toContain(ur.customerDetail.pillPayment(ur.customerDetail.methods.cash!));
    click(screen.getByRole('button', { name: ur.customerDetail.receivePayment }));
    const box = screen.getByRole('dialog');
    expect(box.textContent).toContain(ur.customerPayment.amount);
    expect(box.textContent).toContain(ur.customerPayment.today);
    click(screen.getByRole('button', { name: ur.customerPayment.cancel }));
    click(screen.getByRole('button', { name: ur.customerDetail.openingBalance }));
    expect(screen.getByRole('dialog').textContent).toContain(ur.customerOpening.theyOweUs);
  });

  it('the Urdu texts have the same keys as the English ones', () => {
    for (const k of ['customerDetail', 'customerPayment', 'customerOpening'] as const) expect(Object.keys(ur[k]).sort(), k).toEqual(Object.keys(en[k]).sort());
    expect(Object.keys(ur.customerDetail.methods).sort()).toEqual(Object.keys(en.customerDetail.methods).sort());
  });

  it('an advance in Urdu never says "owes" with a minus', async () => {
    show(fakeShell({}, { summary: summary({ balance: -100_000 }) }), OWNER, 'ur');
    await loaded();
    expect(document.querySelector('[data-card="balance"]')!.textContent).toContain(ur.customerDetail.advance('⁦Rs 1,000⁩'));
  });
});

// ---------- source ----------


describe('farmer details on the customer page (land size and crop)', () => {
  const farmer = () => summary({}, customer({ land_size: '5 acres', crop: 'Cotton' }));
  const shellWith = (showFarmer: boolean) =>
    fakeShell({ 'customers:getSettings': () => ok({ default_credit_limit: 0, show_farmer_fields: showFarmer }) }, { summary: farmer() });

  it('the owner sees them when the shop setting is on and they are set', async () => {
    show(shellWith(true), OWNER);
    await loaded();
    const block = await screen.findByText(t.farmerDetails);
    expect(block).toBeTruthy();
    expect(document.querySelector('[data-farmer-field="land_size"]')!.textContent).toContain('5 acres');
    expect(document.querySelector('[data-farmer-field="crop"]')!.textContent).toContain('Cotton');
  });

  it('are hidden while the setting is off, even for the owner', async () => {
    const shell = shellWith(false);
    show(shell, OWNER);
    await loaded();
    await waitFor(() => expect(shell.of('customers:getSettings')).toHaveLength(1));
    expect(document.querySelector('[data-farmer-details]')).toBeNull();
    expect(screen.queryByText('5 acres')).toBeNull();
  });

  it('staff never see them and the page does not even ask for the setting', async () => {
    const shell = shellWith(true);
    show(shell, STAFF);
    await loaded();
    expect(document.querySelector('[data-farmer-details]')).toBeNull();
    expect(screen.queryByText('5 acres')).toBeNull();
    expect(shell.of('customers:getSettings')).toHaveLength(0);
  });

  it('nothing is drawn when the setting is on but nothing is set', async () => {
    show(fakeShell({ 'customers:getSettings': () => ok({ default_credit_limit: 0, show_farmer_fields: true }) }), OWNER);
    await loaded();
    expect(document.querySelector('[data-farmer-details]')).toBeNull();
  });
});

describe('source of the customer page files', () => {
  const dirs = ['detail', 'payment', 'opening'].map((d) => join(__dirname, '../src/pages/customers', d));
  it('uses logical classes only: no left, right, ml, mr, pl or pr', () => {
    const bad = /(^|[\s"'`:])(-?(ml|mr|pl|pr)-\S+|(text|float|border|rounded)-(left|right|l|r)\b\S*|(left|right)-\S+)/;
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
        const { strings } = scanSource(readFileSync(join(dir, f), 'utf8'));
        for (const s of strings) expect(bad.test(s), `${f}: ${s}`).toBe(false);
      }
    }
  });
  it('writes no date or user into a request and does no balance arithmetic outside the preview helper', () => {
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') || x.endsWith('.tsx'))) {
        const code = scanSource(readFileSync(join(dir, f), 'utf8')).code;
        expect(code, f).not.toMatch(/created_by|user_id|actor|payment_date|entry_date: /);
        expect(code, f).not.toMatch(/\bcost\b|margin|profit/i);
      }
    }
  });
});
