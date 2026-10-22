// @vitest-environment jsdom
// The POS billing screen, driven the way a cashier drives it, against a fake shell built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { takeSeen } from '../src/pages/pos/held-bills.js';
import { PosPage } from '../src/pages/pos/pos-page.js';
import { errorText } from '../src/i18n/errors.js';
import { smallUnitsIn, UNIT_WORDS, visibleText, withoutMarks } from './unit-scan.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

// ---- the shop ----

interface P {
  id: string;
  group: string;
  groupUr: string;
  label: string;
  pack: number;
  loose: boolean;
  unit: 'ml' | 'g';
  retail: number;
  wholesale: number;
  stock: number;
}
const PRODUCTS: Record<string, P> = {
  p250: { id: 'p250', group: 'Insecticide', groupUr: 'کیڑے مار دوا', label: '250 ml', pack: 250, loose: false, unit: 'ml', retail: 19_000, wholesale: 17_000, stock: 750 },
  p1l: { id: 'p1l', group: 'Insecticide', groupUr: 'کیڑے مار دوا', label: '1 L', pack: 1000, loose: false, unit: 'ml', retail: 50_000, wholesale: 45_000, stock: 12_000 },
  p5l: { id: 'p5l', group: 'Insecticide', groupUr: 'کیڑے مار دوا', label: '5 L', pack: 5000, loose: false, unit: 'ml', retail: 230_000, wholesale: 210_000, stock: 0 },
  f1: { id: 'f1', group: 'Fertilizer', groupUr: 'کھاد', label: '1 kg', pack: 1000, loose: true, unit: 'g', retail: 20_000, wholesale: 18_000, stock: 50_000 },
};
const CUSTOMERS: Record<string, { id: string; name_en: string; name_ur: string; village: string; phone: string; default_price_type: 'retail' | 'wholesale'; credit_limit: number; balance: number }> = {
  c1: { id: 'c1', name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12', phone: '0300', default_price_type: 'retail', credit_limit: 1_000_000, balance: 200_000 },
  c2: { id: 'c2', name_en: 'Rasheed Ahmad', name_ur: 'رشید احمد', village: 'Chak 9', phone: '0301', default_price_type: 'wholesale', credit_limit: 500_000, balance: 0 },
  c3: { id: 'c3', name_en: 'Bashir', name_ur: 'بشیر', village: 'Chak 3', phone: '0302', default_price_type: 'retail', credit_limit: 10_000, balance: 5_000 },
};

const listedSize = (p: P) => ({
  id: p.id,
  group_id: 'g',
  pack_label: p.label,
  pack_size: p.pack,
  allow_loose: p.loose ? 1 : 0,
  base_unit: p.unit,
  is_active: 1,
  retail_price: p.retail,
  wholesale_price: p.wholesale,
  stock_sellable: p.stock,
  flags: { low: p.id === 'p250', near_expiry: false, expired: false },
});
const hit = (group: string, ids: string[]) => ({ group: { id: `g-${group}`, name_en: group, name_ur: PRODUCTS[ids[0]!]!.groupUr }, sizes: ids.map((id) => listedSize(PRODUCTS[id]!)), matched_size_ids: [], rank: 0, summary: {} });

type Line = { product_id: string; qty: number; line_discount?: number; batches?: { batch_id: string; qty: number }[] };
type Handler = (input: any) => unknown;
const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

/** A pretend `sale:quote`, with the same shape as the real one (the real arithmetic is the core's: see sale-quote tests there). */
function quoteOf(input: any, role: 'owner' | 'staff') {
  const lines: any[] = [];
  const issues: any[] = [];
  (input.lines as Line[]).forEach((l, index) => {
    const p = PRODUCTS[l.product_id]!;
    if (l.qty > p.stock) {
      issues.push({ scope: 'line', line_index: index, code: 'INSUFFICIENT_STOCK', message: 'm', params: { available: p.stock, packSize: p.pack, scope: 'stock' } });
      return;
    }
    const price = input.price_type === 'wholesale' ? p.wholesale : p.retail;
    const gross = Math.round((l.qty * price) / p.pack);
    const disc = l.line_discount ?? 0;
    lines.push({
      index,
      product_id: p.id,
      name_en: `${p.group} ${p.label}`,
      name_ur: p.groupUr,
      pack_label: p.label,
      base_unit: p.unit,
      pack_size: p.pack,
      qty: l.qty,
      unit_price: price,
      gross,
      line_discount: disc,
      discount_over_limit: disc * 100 > gross * 5,
      tax_rate_bp: 0,
      tax_amount: 0,
      line_total: gross - disc,
      batches: [{ batch_id: l.batches?.[0]?.batch_id ?? `b-${p.id}`, batch_no: 'B-001', expiry_date: '2027-03-12', qty: l.qty, days_to_expiry: 400, near_expiry: false }],
    });
  });
  const total = lines.reduce((s, l) => s + l.line_total, 0);
  const paid = input.paid_amount ?? total;
  if (paid > total) issues.push({ scope: 'payment', code: 'OVERPAID', message: 'm', params: { paid, total } });
  const c = input.customer_id ? CUSTOMERS[input.customer_id] : undefined;
  if (!c && paid < total) issues.push({ scope: 'payment', code: 'CREDIT_NEEDS_CUSTOMER', message: 'm', params: {} });
  const unpaid = total - paid;
  const over = !!c && c.credit_limit > 0 && unpaid > 0 && c.balance + unpaid > c.credit_limit;
  if (over) issues.push({ scope: 'credit', code: 'CREDIT_LIMIT_EXCEEDED', message: 'm', params: { limit: c!.credit_limit, owed: c!.balance, adds: unpaid } });
  const requires: string[] = [];
  if (role === 'staff' && over) requires.push('credit_override');
  if (role === 'staff' && lines.some((l) => l.discount_over_limit)) requires.push('discount_override');
  return {
    ok: issues.length === 0,
    price_type: input.price_type ?? 'retail',
    lines,
    subtotal: total,
    tax_total: 0,
    total,
    paid_amount: paid,
    unpaid,
    customer: c ? { id: c.id, name_en: c.name_en, name_ur: c.name_ur, village: c.village, default_price_type: c.default_price_type, credit_limit: c.credit_limit, balance: c.balance, unpaid, after_sale: c.balance + Math.max(unpaid, 0), over_limit: over } : null,
    issues,
    today: '2026-10-12',
    near_expiry_days: 30,
    staff_max_discount_percent: 5,
    requires_approval: requires,
  };
}

/** A bill on hold in the pretend database: the request as the screen sent it (choices only), and who held it. */
interface HeldRow {
  id: string;
  by: string;
  at: string;
  input: any;
}

function fakeShell(user: SessionUser = STAFF, override: Partial<Record<Channel, Handler>> = {}, preheld: HeldRow[] = []) {
  const calls: { channel: string; input: any }[] = [];
  const held: HeldRow[] = [...preheld];
  let heldSeq = 0;
  const summary = (h: HeldRow) => ({
    id: h.id,
    held_by_name: h.by,
    held_at: h.at,
    customer: h.input.customer_id ? (({ id, name_en, name_ur, village, default_price_type }) => ({ id, name_en, name_ur, village, default_price_type }))(CUSTOMERS[h.input.customer_id]!) : null,
    price_type: h.input.price_type ?? 'retail',
    line_count: h.input.lines.length,
    note: h.input.note ?? null,
  });
  const handlers: Partial<Record<Channel, Handler>> = {
    'catalogue:list': ({ query }) => {
      const q = String(query ?? '').toLowerCase();
      const hits = q.includes('insect') ? [hit('Insecticide', ['p250', 'p1l', 'p5l'])] : q.includes('fert') ? [hit('Fertilizer', ['f1'])] : q.includes('1000') ? [hit('Insecticide', ['p1l'])] : [];
      return ok({ hits, total: hits.length, counts: { products: 0, low: 0, near_expiry: 0, expired: 0 } });
    },
    'stock:batchesOf': () =>
      ok([
        { batch_id: 'b-1', batch_no: 'B-001', expiry_date: '2027-03-12', stock: 9000, expired: false, sellable: 9000 },
        { batch_id: 'b-2', batch_no: 'B-002', expiry_date: '2028-02-14', stock: 25_000, expired: false, sellable: 25_000 },
      ]),
    'customers:search': ({ query }) => {
      const q = String(query ?? '').toLowerCase();
      return ok(Object.values(CUSTOMERS).filter((c) => q === '' || `${c.name_en} ${c.name_ur} ${c.village} ${c.phone}`.toLowerCase().includes(q)));
    },
    'sale:quote': (input) => ok(quoteOf(input, user.role)),
    'sale:create': (input) => {
      const q = quoteOf(input, user.role);
      return ok({ invoice: { id: 'i1', invoice_no: 'INV-A-000002', total: q.total, paid_amount: input.paid_amount, payment_method: input.payment_method ?? 'cash' }, items: [], payment_id: 'pay1' });
    },
    'approval:request': () => ok({ token: 'token-0123456789abcdef', expires_at: '2026-10-12T10:00:00Z', actions: ['credit_override'] }),
    // held bills, as the real shell does them: the holder is the signed-in user, a bill leaves the list when resumed or discarded, once
    'bills:hold': (input) => {
      const id = `held-${(heldSeq += 1)}`;
      held.push({ id, by: user.name, at: '2026-10-12T09:30:00.000Z', input });
      return ok({ id });
    },
    'bills:list': () => ok(held.map(summary)),
    'bills:resume': ({ id }) => {
      const at = held.findIndex((h) => h.id === id);
      if (at === -1) return fail('HELD_BILL_GONE');
      const [row] = held.splice(at, 1);
      return ok({
        ...summary(row!),
        lines: row!.input.lines.map((l: any) => {
          const p = PRODUCTS[l.product_id]!;
          return { product_id: p.id, qty: l.qty, discount: l.discount?.value ?? 0, batch_id: l.batch_id ?? null, name_en: p.group, name_ur: p.groupUr, pack_label: p.label, pack_size: p.pack, allow_loose: p.loose, base_unit: p.unit };
        }),
      });
    },
    'bills:discard': ({ id }) => {
      const at = held.findIndex((h) => h.id === id);
      if (at === -1) return fail('HELD_BILL_GONE');
      held.splice(at, 1);
      return ok(null);
    },
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of, held, sales: () => of('sale:create'), approvals: () => of('approval:request') };
}

type Shell = ReturnType<typeof fakeShell>;
let T = en.pos;
function show(shell: Shell, user: SessionUser = STAFF, language: Language = 'en') {
  T = language === 'ur' ? ur.pos : en.pos;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <ToastProvider>
        <PosPage api={shell.api} user={user} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const typeIn = async (el: HTMLElement, text: string) => {
  await userEvent.setup().click(el);
  await userEvent.setup().keyboard(text);
};
const searchBox = () => screen.getByRole('searchbox', { name: T.searchLabel });
const chip = (id: string) => document.querySelector<HTMLButtonElement>(`[data-size=${id}]`)!;
const completeButton = () => screen.getByRole('button', { name: new RegExp(T.bill.complete) }) as HTMLButtonElement;
const totalText = () => document.querySelector('[data-total]')!.textContent!.replace(/[⁦⁩]/g, '');

/** Searches, presses a size, and waits until the bill has been priced. */
async function addSize(text: string, id: string) {
  await typeIn(searchBox(), text);
  await waitFor(() => expect(chip(id)).toBeTruthy());
  await userEvent.setup().click(chip(id));
}
async function priced(total: string) {
  await waitFor(() => expect(totalText()).toBe(total));
  await waitFor(() => expect(completeButton().disabled).toBe(false));
}

// The whole suite runs in parallel with very heavy files: a wait on a real condition may need more than the 1 s default on a busy machine.
configure({ asyncUtilTimeout: 5000 });

/** The bill has been priced for what is on the screen now (its total box is no longer greyed out as "checking"). */
const billSettled = () => waitFor(() => expect(document.querySelector('[data-total]')!.closest('[aria-busy]')!.getAttribute('aria-busy')).toBe('false'));
/** Lets everything that is already waiting on a promise run (no timer, no sleep): the handlers of a key press are synchronous or one promise deep. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('searching and adding', () => {
  it('shows the sizes of a product with price and stock; a size with no good stock is shown but cannot be added', async () => {
    const shell = fakeShell();
    show(shell);
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p250')).toBeTruthy());
    expect(chip('p250').textContent).toContain('Rs 190');
    expect(chip('p250').textContent).toContain('3 packs left');
    expect(chip('p5l').disabled).toBe(true);
    expect(chip('p5l').textContent).toContain(T.out);
    await userEvent.setup().click(chip('p5l'));
    expect(screen.queryByRole('row', { name: /./ })).toBeNull();
    expect(document.querySelector('[data-line=p5l]')).toBeNull();
    expect(shell.of('sale:quote')).toHaveLength(0); // nothing was added, so nothing was priced
  });

  it('adds a size as one pack, and a second press adds one more pack to the same line', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(chip('p1l'));
    await priced('Rs 1,000');
    expect(document.querySelectorAll('[data-line=p1l]')).toHaveLength(1);
    expect(document.querySelector('[data-line=p1l] [data-qty]')!.textContent).toBe('2');
  });

  it('waits for typing to pause: six quick letters make one search, not six', async () => {
    const shell = fakeShell();
    show(shell);
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p250')).toBeTruthy());
    expect(shell.of('catalogue:list').filter((c) => c.input.query !== undefined && c.input.query !== '')).toHaveLength(1);
  });

  it('a scanned barcode plus Enter adds the one size that matches, and clears the box', async () => {
    const shell = fakeShell();
    show(shell);
    await typeIn(searchBox(), '1000{Enter}');
    await waitFor(() => expect(document.querySelector('[data-line=p1l]')).toBeTruthy());
    expect((searchBox() as HTMLInputElement).value).toBe('');
  });

  it('shows the wholesale price when Wholesale is chosen', async () => {
    const shell = fakeShell();
    show(shell);
    await userEvent.setup().click(screen.getByRole('radio', { name: T.wholesale }));
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p1l').textContent).toContain('Rs 450'));
    await userEvent.setup().click(chip('p1l'));
    await priced('Rs 450');
    expect(shell.of('sale:quote').at(-1)!.input.price_type).toBe('wholesale');
  });
});

describe('the totals come from the quote', () => {
  it('shows what sale:quote says and never calculates its own', async () => {
    const shell = fakeShell(STAFF, {
      'sale:quote': (input) => {
        const q = quoteOf(input, 'staff');
        return ok({ ...q, total: 123_400, paid_amount: 123_400, tax_total: 9_100 }); // deliberately NOT the sum of the lines
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await waitFor(() => expect(totalText()).toBe('Rs 1,234'));
    expect(document.querySelector('[data-tax]')!.textContent).toBe('Rs 91');
  });

  it('Complete sale stays off while the bill is being priced', async () => {
    let release: (v: unknown) => void = () => undefined;
    const slow = new Promise((r) => (release = r));
    const shell = fakeShell(STAFF, { 'sale:quote': async (input) => (await slow, ok(quoteOf(input, 'staff'))) });
    show(shell);
    await addSize('insect', 'p1l');
    await waitFor(() => expect(shell.of('sale:quote')).toHaveLength(1));
    expect(completeButton().disabled).toBe(true);
    release(null);
    await waitFor(() => expect(completeButton().disabled).toBe(false));
  });
});

describe('out of stock is blocked', () => {
  it('a line with more than the stock shows the problem and Complete sale cannot be pressed', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p250'); // 750 ml in stock = 3 packs
    await priced('Rs 190');
    for (let i = 0; i < 3; i += 1) await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.increase}: `) }));
    await waitFor(() => expect(document.querySelector('[data-line=p250]')!.getAttribute('data-problem')).toBe('INSUFFICIENT_STOCK'));
    expect(completeButton().disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'F12' });
    expect(shell.sales()).toHaveLength(0);
  });
});

describe('completing the sale', () => {
  it('sends the bill with one request_id and shows the change for cash handed over', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow) as HTMLInputElement;
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '800');
    await waitFor(() => expect(document.querySelector('[data-change]')!.textContent).toContain('Rs 300'));
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(document.querySelector('[data-change-due]')!.textContent).toBe('Rs 300'));
    const sale = shell.sales()[0]!.input;
    expect(sale.paid_amount).toBe(50_000); // the bill, not the cash handed over: change is never saved
    expect(sale.payment_method).toBe('cash');
    expect(sale.lines).toEqual([{ product_id: 'p1l', qty: 1000 }]);
    expect(typeof sale.request_id).toBe('string');
    expect(sale.request_id.length).toBeGreaterThanOrEqual(8);
    expect(document.querySelector('[data-done-total]')!.textContent).toBe('Rs 500');
    expect(screen.queryByText(T.done.onKhata)).toBeNull(); // paid in full: nothing on Khata
    // New sale clears the bill.
    await userEvent.setup().click(screen.getByRole('button', { name: T.done.newSale }));
    expect(document.querySelector('[data-line]')).toBeNull();
  });

  it('a double click and an F12 on top of it send ONE sale', async () => {
    let release: (v: unknown) => void = () => undefined;
    const gate = new Promise((r) => (release = r));
    const shell = fakeShell(STAFF, {
      'sale:create': async (input) => {
        await gate;
        return ok({ invoice: { id: 'i1', invoice_no: 'INV-A-000002', total: 50_000, paid_amount: input.paid_amount, payment_method: 'cash' }, items: [], payment_id: 'p' });
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const button = completeButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'F12' });
    release(null);
    await waitFor(() => expect(document.querySelector('[data-done-total]')).toBeTruthy());
    expect(shell.sales()).toHaveLength(1);
  });

  it('a retry after a failed try uses the SAME request_id, and a new bill gets a new one', async () => {
    let tries = 0;
    const shell = fakeShell(STAFF, {
      'sale:create': (input) => {
        tries += 1;
        if (tries === 1) return fail('INTERNAL');
        return ok({ invoice: { id: 'i1', invoice_no: 'INV-A-000002', total: 50_000, paid_amount: input.paid_amount, payment_method: 'cash' }, items: [], payment_id: 'p' });
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(document.querySelector('[data-done-total]')).toBeTruthy());
    const [first, second] = shell.sales();
    expect(second!.input.request_id).toBe(first!.input.request_id);
    // The next bill is a different bill.
    await userEvent.setup().click(screen.getByRole('button', { name: T.done.newSale }));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(shell.sales()).toHaveLength(3));
    expect(shell.sales()[2]!.input.request_id).not.toBe(first!.input.request_id);
  });
});

describe('the owner approves at the counter', () => {
  it('APPROVAL_REQUIRED opens the approval dialog and the sale is NOT sent again without the approval', async () => {
    const shell = fakeShell(STAFF, { 'sale:create': () => fail('APPROVAL_REQUIRED', { actions: 'discount_override' }) });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    expect(await screen.findByRole('dialog', { name: T.approval.title })).toBeTruthy();
    expect(screen.getByText(T.approval.actions.discount_override)).toBeTruthy();
    await billSettled();
    expect(shell.sales()).toHaveLength(1);
    expect(shell.approvals()).toHaveLength(0);
  });

  it('after the owner types the password, the sale is sent again with the approval token and the same request_id', async () => {
    let tries = 0;
    const shell = fakeShell(STAFF, {
      'sale:create': (input) => {
        tries += 1;
        if (!input.approval_token) return fail('APPROVAL_REQUIRED', { actions: 'discount_override' });
        return ok({ invoice: { id: 'i1', invoice_no: 'INV-A-000002', total: 50_000, paid_amount: input.paid_amount, payment_method: 'cash' }, items: [], payment_id: 'p' });
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    const dialog = await screen.findByRole('dialog', { name: T.approval.title });
    await userEvent.setup().type(within(dialog).getByLabelText(T.approval.username), 'owner');
    await userEvent.setup().type(within(dialog).getByLabelText(T.approval.password), 'secret-pass');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.approval.approve }));
    await waitFor(() => expect(document.querySelector('[data-done-total]')).toBeTruthy());
    expect(tries).toBe(2);
    const ask = shell.approvals()[0]!.input;
    expect(ask).toMatchObject({ username: 'owner', password: 'secret-pass', actions: ['discount_override'] });
    expect(ask.sale).toEqual({ price_type: 'retail', paid_amount: 50_000, lines: [{ product_id: 'p1l', qty: 1000 }] }); // exactly the bill
    const [first, second] = shell.sales();
    expect(second!.input.approval_token).toBe('token-0123456789abcdef');
    expect(second!.input.request_id).toBe(first!.input.request_id);
  });

  it('a wrong owner password shows the error and does not sell', async () => {
    const shell = fakeShell(STAFF, { 'sale:create': () => fail('APPROVAL_REQUIRED', { actions: 'discount_override' }), 'approval:request': () => fail('INVALID_CREDENTIALS') });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    const dialog = await screen.findByRole('dialog', { name: T.approval.title });
    await userEvent.setup().type(within(dialog).getByLabelText(T.approval.username), 'owner');
    await userEvent.setup().type(within(dialog).getByLabelText(T.approval.password), 'nope');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.approval.approve }));
    await waitFor(() => expect(within(dialog).getByRole('alert').getAttribute('data-code')).toBe('INVALID_CREDENTIALS'));
    expect((within(dialog).getByLabelText(T.approval.password) as HTMLInputElement).value).toBe(''); // the password is not kept
    expect(shell.sales()).toHaveLength(1); // only the first, refused, try
  });

  it('when the quote already says the owner is needed, the dialog opens before any sale is sent', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=p1l] button[title]')!);
    const dialog = await screen.findByRole('dialog');
    const discount = within(dialog).getByLabelText(T.line.discount) as HTMLInputElement;
    await userEvent.setup().click(within(dialog).getByRole('radio', { name: T.line.rupees }));
    await userEvent.setup().type(discount, '100'); // Rs 100 of Rs 500 is 20%: over the staff limit of 5%
    expect(within(dialog).getByText(T.line.discountOver)).toBeTruthy();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.line.done }));
    await waitFor(() => expect(totalText()).toBe('Rs 400'));
    await userEvent.setup().click(completeButton());
    expect(await screen.findByRole('dialog', { name: T.approval.title })).toBeTruthy();
    expect(shell.sales()).toHaveLength(0);
    expect(shell.of('sale:quote').at(-1)!.input.lines[0].line_discount).toBe(10_000);
  });
});

describe('the credit limit', () => {
  async function creditSale(shell: Shell, user: SessionUser) {
    show(shell, user);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await userEvent.setup().type(within(dialog).getByLabelText(T.customer.searchLabel), 'bash');
    const row = await within(dialog).findByRole('option', { name: /Bashir/ });
    await userEvent.setup().click(row);
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.customer.use('Bashir') }));
    await addSize('insect', 'p1l'); // Rs 500 on a limit of Rs 100 with Rs 50 owed
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(document.querySelector('[data-khata]')).toBeTruthy());
    await waitFor(() => expect(completeButton().disabled).toBe(false));
  }

  it('staff over the limit: the over-the-limit dialog opens, no sale is sent, and Ask owner leads to the approval dialog', async () => {
    const shell = fakeShell(STAFF);
    await creditSale(shell, STAFF);
    await userEvent.setup().click(completeButton());
    const over = await screen.findByRole('dialog', { name: T.over.title });
    expect(within(over).getByText(en.pos.over.lead('Bashir', 'Rs 50', 'Rs 400'))).toBeTruthy();
    expect(over.querySelector('[data-over-by]')!.textContent).toBe('Rs 350');
    expect(shell.sales()).toHaveLength(0);
    await userEvent.setup().click(within(over).getByRole('button', { name: T.over.askOwner }));
    expect(await screen.findByRole('dialog', { name: T.approval.title })).toBeTruthy();
    expect(screen.getByText(T.approval.overChip('Rs 450', 'Rs 100'))).toBeTruthy(); // "Over credit limit · Rs 450 of Rs 100": what the bill leaves, and the limit
    expect(shell.sales()).toHaveLength(0);
  });

  it('CREDIT_LIMIT_EXCEEDED from the shell opens the same dialog and the sale is not retried', async () => {
    const shell = fakeShell(STAFF, {
      'sale:quote': (input) => ok({ ...quoteOf(input, 'staff'), requires_approval: [] }), // the quote did not warn
      'sale:create': () => fail('CREDIT_LIMIT_EXCEEDED', { limit: 10_000, owed: 5_000, adds: 40_000 }),
    });
    await creditSale(shell, STAFF);
    await userEvent.setup().click(completeButton());
    expect(await screen.findByRole('dialog', { name: T.over.title })).toBeTruthy();
    await billSettled();
    expect(shell.sales()).toHaveLength(1);
  });

  it('"Take more" raises the amount paid now by what is needed, and nothing is sent', async () => {
    const shell = fakeShell(STAFF);
    await creditSale(shell, STAFF);
    await userEvent.setup().click(completeButton());
    const over = await screen.findByRole('dialog', { name: T.over.title });
    await userEvent.setup().click(within(over).getByRole('button', { name: T.over.take('Rs 350') }));
    await waitFor(() => expect((screen.getByLabelText(T.bill.paidNow) as HTMLInputElement).value).toBe('450'));
    expect(shell.sales()).toHaveLength(0);
  });

  it('the owner can allow one sale over the limit, which is sent with credit_override', async () => {
    const shell = fakeShell(OWNER);
    await creditSale(shell, OWNER);
    await userEvent.setup().click(completeButton());
    const over = await screen.findByRole('dialog', { name: T.over.title });
    expect(within(over).queryByRole('button', { name: T.over.askOwner })).toBeNull();
    await userEvent.setup().click(within(over).getByRole('button', { name: T.over.allow }));
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
    expect(shell.sales()[0]!.input.credit_override).toBe(true);
    expect(shell.sales()[0]!.input.customer_id).toBe('c3');
    expect(shell.sales()[0]!.input.paid_amount).toBe(10_000);
    expect(shell.sales()[0]!.input.due_date).toBe('2026-11-11'); // 30 days from the shell's today
  });
});

describe('customers', () => {
  it('F4 opens the picker; choosing a wholesale customer switches to wholesale prices', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await userEvent.setup().type(within(dialog).getByLabelText(T.customer.searchLabel), 'ras');
    await within(dialog).findByRole('option', { name: /Rasheed Ahmad/ });
    expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1);
    await userEvent.setup().click(within(dialog).getByRole('option', { name: /Rasheed Ahmad/ }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: /Rasheed Ahmad/ }));
    await waitFor(() => expect(document.querySelector('[data-customer-name]')!.textContent).toBe('Rasheed Ahmad'));
    expect((screen.getByRole('radio', { name: T.wholesale }) as HTMLElement).getAttribute('aria-checked')).toBe('true');
  });

  it('a walk-in customer cannot leave part of the bill unpaid', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(completeButton().disabled).toBe(true));
    await waitFor(() => expect(screen.getByText(T.bill.walkInFull)).toBeTruthy());
    expect(document.querySelector('[data-khata]')).toBeNull(); // nothing can go on Khata without a customer, however much is unpaid
    expect(shell.sales()).toHaveLength(0);
  });

  it('the Khata remainder shows with its pay-by date and both are sent', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(dialog).findByRole('option', { name: /Rashid/ });
    await userEvent.setup().click(within(dialog).getByRole('option', { name: /Rashid/ }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.customer.use('Rashid') }));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(document.querySelector('[data-khata]')!.textContent).toContain('Rs 400'));
    fireEvent.change(document.querySelector('[name=due_date]')!, { target: { value: '2026-11-30' } });
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
    expect(shell.sales()[0]!.input).toMatchObject({ customer_id: 'c1', paid_amount: 10_000, due_date: '2026-11-30', price_type: 'retail' });
  });
});

describe('the line editor', () => {
  it('a batch chosen by hand is sent, and "Auto" sends none', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=p1l] button[title]')!);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('radio', { name: /B-002/ });
    expect(within(dialog).getByRole('radio', { name: new RegExp(T.line.auto) }).getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(within(dialog).getByRole('radio', { name: /B-002/ }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.line.done }));
    await waitFor(() => expect(shell.of('sale:quote').at(-1)!.input.lines[0].batches).toEqual([{ batch_id: 'b-2', qty: 1000 }]));
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
    expect(shell.sales()[0]!.input.lines[0].batches).toEqual([{ batch_id: 'b-2', qty: 1000 }]);
  });

  it('F8 opens the editor for the selected line with the cursor in the discount box; a percent is turned into paisa from the quote', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    fireEvent.keyDown(window, { key: 'F8' });
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByLabelText(T.line.discount) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(box));
    await userEvent.setup().click(within(dialog).getByRole('radio', { name: T.line.percent }));
    await userEvent.setup().type(box, '4');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.line.done }));
    await waitFor(() => expect(totalText()).toBe('Rs 480'));
    expect(shell.of('sale:quote').at(-1)!.input.lines[0].line_discount).toBe(2_000);
  });

  it('a loose product is shown in kg and moves in steps of 0.5 kg', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('fert', 'f1');
    await priced('Rs 200');
    expect(document.querySelector('[data-line=f1] [data-qty]')!.textContent).toBe('1');
    expect(document.querySelector('[data-line=f1]')!.textContent).toContain('kg');
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.increase}: `) }));
    await waitFor(() => expect(document.querySelector('[data-line=f1] [data-qty]')!.textContent).toBe('1.5'));
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.decrease}: `) }));
    await waitFor(() => expect(document.querySelector('[data-line=f1] [data-qty]')!.textContent).toBe('1'));
  });

  it('removing the last line empties the bill', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.removeLine}: `) }));
    expect(document.querySelector('[data-line]')).toBeNull();
    expect(screen.getByText(T.cartEmptyTitle)).toBeTruthy();
  });
});

describe('held bills', () => {
  it('Hold bill puts the bill aside, and Resume brings it back with the prices checked again', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    expect(shell.held).toHaveLength(1); // in the (pretend) database, not in the browser
    expect(localStorage.length).toBe(0);
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    expect(within(dialog).getByText(/held by Salesman/)).toBeTruthy();
    PRODUCTS.p1l!.retail = 52_000; // the price changed while it was held
    try {
      await userEvent.setup().click(within(dialog).getByRole('button', { name: T.held.resume }));
      const note = await screen.findByRole('dialog', { name: T.resumed.title });
      expect(within(note).getByText(T.resumed.priceLine('Insecticide 1 L', 'Rs 500', 'Rs 520'))).toBeTruthy();
      await userEvent.setup().click(within(note).getByRole('button', { name: T.resumed.gotIt }));
      await priced('Rs 520');
      expect(shell.held).toHaveLength(0); // resumed once, then gone
      expect(shell.of('bills:resume')).toHaveLength(1);
      expect(localStorage.length).toBe(0);
    } finally {
      PRODUCTS.p1l!.retail = 50_000;
    }
  });

  it('a held line that can no longer be sold is removed and said so', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p250');
    await priced('Rs 190');
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    PRODUCTS.p250!.stock = 0;
    try {
      fireEvent.keyDown(window, { key: 'F6' });
      const dialog = await screen.findByRole('dialog', { name: T.held.title });
      await userEvent.setup().click(within(dialog).getByRole('button', { name: T.held.resume }));
      const note = await screen.findByRole('dialog', { name: T.resumed.title });
      expect(within(note).getByText(T.resumed.removedLine('Insecticide 0.25 L'))).toBeTruthy();
      expect(document.querySelector('[data-line=p250]')).toBeNull();
    } finally {
      PRODUCTS.p250!.stock = 750;
    }
  });

  it('holding an empty bill does nothing', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    expect(shell.of('bills:hold')).toHaveLength(0);
    expect(shell.held).toHaveLength(0);
  });
});

describe('the amount paid and the money after the sale', () => {
  const typePaid = async (text: string) => {
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, text);
  };
  const pickRashid = async () => {
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(dialog).findByRole('option', { name: /Rashid/ });
    await userEvent.setup().click(within(dialog).getByRole('option', { name: /Rashid/ }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.customer.use('Rashid') }));
  };

  it('paying MORE than the bill by bank is an overpayment, not change: it blocks the sale, shows no change and never asks for the bill as paid in full', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('radio', { name: T.bill.methods.bank }));
    await typePaid('800');
    await waitFor(() => expect(shell.of('sale:quote').at(-1)!.input.paid_amount).toBe(80_000));
    // The bill has been priced for what is on the screen. A follow-up "paid in full" quote, if the screen wrongly sent one, is sent BEFORE that answer is shown:
    // so from the first 800-rupee quote on, every bank quote must still be the 800-rupee one (the quotes for the half-typed "8" and "80" come before it).
    await billSettled();
    const bankQuotes = shell.of('sale:quote').filter((c) => c.input.payment_method === 'bank');
    const firstFull = bankQuotes.findIndex((c) => c.input.paid_amount === 80_000);
    expect(firstFull).toBeGreaterThanOrEqual(0);
    expect(bankQuotes.slice(firstFull).every((c) => c.input.paid_amount === 80_000)).toBe(true);
    expect(document.querySelector('[data-change]')).toBeNull();
    expect(completeButton().disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'F12' });
    expect(shell.sales()).toHaveLength(0);
  });

  it('cash handed over beyond the bill IS change: the bill is priced as paid in full and the sale is allowed', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await typePaid('800');
    await waitFor(() => expect(document.querySelector('[data-change]')).toBeTruthy());
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    expect(shell.of('sale:quote').some((c) => c.input.paid_amount === undefined)).toBe(true);
  });

  it('the change hint goes the moment the method is no longer cash, without waiting for a new quote', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await typePaid('800');
    await waitFor(() => expect(document.querySelector('[data-change]')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: T.bill.methods.bank }));
    expect(document.querySelector('[data-change]')).toBeNull(); // checked straight away: the quote of the cash bill is still on screen
  });

  it('a sale partly on Khata says how much went on Khata, in the saved-sale window, from the total less what was paid', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await pickRashid();
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await typePaid('100');
    await waitFor(() => expect(document.querySelector('[data-khata]')!.textContent).toContain('Rs 400'));
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(completeButton());
    const done = await screen.findByRole('dialog', { name: T.done.title });
    expect(document.querySelector('[data-done-total]')!.textContent).toBe('Rs 500');
    const label = within(done).getByText(T.done.onKhata);
    expect(label.nextElementSibling!.textContent!.replace(/[⁦⁩]/g, '')).toBe('Rs 400'); // 500 less the 100 paid, not the total
    expect(within(done).queryByText(T.done.changeDue)).toBeNull(); // no cash handed over beyond the bill
  });
});

describe('held bills in detail', () => {
  /** What the database holds, as the request that put it there (customer id, price type, lines). */
  const stored = (shell: Shell) => shell.held.map((h) => ({ customer: h.input.customer_id ? { id: h.input.customer_id as string } : null, priceType: h.input.price_type as string, lines: h.input.lines as Record<string, unknown>[] }));
  const hold = async () => userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
  const pick = async (name: RegExp, label: string) => {
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(dialog).findByRole('option', { name });
    await userEvent.setup().click(within(dialog).getByRole('option', { name }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: label }));
  };
  const customerName = () => document.querySelector('[data-customer-name]')!.textContent;
  const resumeFirst = async () => {
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    await userEvent.setup().click(within(dialog).getAllByRole('button', { name: T.held.resume })[0]!);
  };

  it('holds the customer and the price type with the bill, and resume brings both back, priced for that customer and that price type', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await pick(/Rashid/, T.customer.use('Rashid')); // Rashid's usual price type is retail ...
    await userEvent.setup().click(screen.getByRole('radio', { name: T.wholesale })); // ... but this bill is wholesale
    await addSize('insect', 'p1l');
    await priced('Rs 450');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    expect(stored(shell)[0]).toMatchObject({ customer: { id: 'c1' }, priceType: 'wholesale' }); // what was put away
    expect(customerName()).toBe(T.customer.walkIn);
    expect(screen.getByRole('radio', { name: T.retail }).getAttribute('aria-checked')).toBe('true');
    await resumeFirst();
    await waitFor(() => expect(document.querySelector('[data-line=p1l]')).toBeTruthy());
    expect(customerName()).toBe('Rashid');
    expect(screen.getByRole('radio', { name: T.wholesale }).getAttribute('aria-checked')).toBe('true');
    await priced('Rs 450');
    const reprice = shell.of('sale:quote').filter((c) => c.input.customer_id === 'c1' && c.input.price_type === 'wholesale');
    expect(reprice.length).toBeGreaterThanOrEqual(2); // the check on resume, and the quote of the restored bill
    expect(shell.of('sale:quote').at(-1)!.input).toMatchObject({ customer_id: 'c1', price_type: 'wholesale' });
  });

  it('keeps several held bills: holding one does not replace the others', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await pick(/Rashid/, T.customer.use('Rashid'));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    await pick(/Bashir/, T.customer.use('Bashir'));
    await addSize('insect', 'p250');
    await priced('Rs 190');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    expect(stored(shell).map((b) => b.customer?.id)).toEqual(['c1', 'c3']);
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    expect(dialog.querySelectorAll('[data-held]')).toHaveLength(2);
  });

  it('will not resume over a bill that is on the screen: it says so, and nothing is lost on either side', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p250');
    await priced('Rs 190');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const quotesBefore = shell.of('sale:quote').length;
    await resumeFirst();
    expect(await screen.findByText(T.held.replaceTitle)).toBeTruthy();
    expect(document.querySelector('[data-line=p250]')).toBeNull();
    expect(document.querySelector('[data-line=p1l]')).toBeTruthy();
    expect(stored(shell)).toHaveLength(1); // still held
    expect(shell.of('bills:resume')).toHaveLength(0); // the database was not even asked: the bill was not taken off hold
    expect(shell.of('sale:quote')).toHaveLength(quotesBefore); // not even priced
  });

  it('a resumed bill is a new bill: it gets its own request_id, never the one of an earlier try', async () => {
    let tries = 0;
    const shell = fakeShell(STAFF, {
      'sale:create': (input) => {
        tries += 1;
        if (tries === 1) return fail('INTERNAL');
        return ok({ invoice: { id: 'i1', invoice_no: 'INV-A-000002', total: 19_000, paid_amount: input.paid_amount, payment_method: 'cash' }, items: [], payment_id: 'p' });
      },
    });
    show(shell);
    await addSize('insect', 'p250');
    await priced('Rs 190');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton()); // fails: the bill keeps its request_id for the retry
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.removeLine}: `) })); // the screen is empty again, but this is not Clear
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    await resumeFirst();
    await priced('Rs 190');
    await userEvent.setup().click(completeButton());
    await waitFor(() => expect(shell.sales()).toHaveLength(2));
    expect(shell.sales()[1]!.input.request_id).not.toBe(shell.sales()[0]!.input.request_id);
  });

  it('a resumed line keeps the price it was just checked against, not the one from before it was held', async () => {
    let quotes = 0;
    const shell = fakeShell(STAFF, {
      'sale:quote': (input) => {
        quotes += 1;
        return quotes >= 3 ? new Promise(() => undefined) : ok(quoteOf(input, 'staff')); // 1: the bill, 2: the check on resume, 3 on: never answers
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await hold();
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    PRODUCTS.p1l!.retail = 52_000;
    try {
      await resumeFirst();
      const note = await screen.findByRole('dialog', { name: T.resumed.title });
      await userEvent.setup().click(within(note).getByRole('button', { name: T.resumed.gotIt }));
      await hold(); // put it away again before any quote of the restored bill has come back
      await waitFor(() => expect(shell.held).toHaveLength(1));
      // the price it was last checked against (Rs 520) is what is remembered for the session, and it is NOT in what was sent to the database
      expect(takeSeen(shell.held[0]!.id)?.get('p1l')?.price).toBe(52_000);
      expect(JSON.stringify(shell.held[0]!.input)).not.toMatch(/52000|50000|seen|price(?!_type)/);
    } finally {
      PRODUCTS.p1l!.retail = 50_000;
    }
  });

  it('when the bill cannot be saved it stays on the screen and says so', async () => {
    const shell = fakeShell(STAFF, { 'bills:hold': () => fail('INTERNAL') });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await hold();
    await waitFor(() => expect(shell.of('bills:hold')).toHaveLength(1));
    await screen.findByText(errorText('INTERNAL', {}, 'en').title); // the failure has been reported: everything after it has run
    expect(document.querySelector('[data-line=p1l]')).toBeTruthy(); // not cleared
    expect(screen.queryByText(T.held.held)).toBeNull(); // and not reported as held
    expect(localStorage.length).toBe(0);
  });

  it('sends only choices to the database: product, quantity, discount as entered, batch, customer, price type. No price, total or seen price', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await pick(/Rashid/, T.customer.use('Rashid'));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await hold();
    await waitFor(() => expect(shell.held).toHaveLength(1));
    const sent = shell.of('bills:hold')[0]!.input;
    expect(sent).toEqual({ customer_id: 'c1', price_type: 'retail', lines: [{ product_id: 'p1l', qty: 1000 }] });
    expect(JSON.stringify(shell.calls.filter((c) => c.channel.startsWith('bills:')))).not.toMatch(/user|actor|held_by|price(?!_type)|total|cost|seen/);
  });

  it('a discount on a line is held as entered (kind and amount), and comes back on the resumed line', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=p1l] button[title]')!);
    const line = await screen.findByRole('dialog');
    await userEvent.setup().click(within(line).getByRole('radio', { name: T.line.rupees }));
    await userEvent.setup().type(within(line).getByLabelText(T.line.discount), '10'); // Rs 10 of Rs 500: under the staff limit
    await userEvent.setup().click(within(line).getByRole('button', { name: T.line.done }));
    await waitFor(() => expect(totalText()).toBe('Rs 490'));
    await hold();
    await waitFor(() => expect(shell.held).toHaveLength(1));
    expect(shell.held[0]!.input.lines).toEqual([{ product_id: 'p1l', qty: 1000, discount: { kind: 'amount', value: 1000 } }]);
    await resumeFirst();
    await waitFor(() => expect(document.querySelector('[data-line=p1l]')).toBeTruthy());
    await priced('Rs 490');
  });

  it('lists who held each bill, from the database: a bill held by the owner shows "held by Owner" to staff, who may resume it', async () => {
    const preheld: HeldRow[] = [{ id: 'h-owner', by: 'Owner', at: '2026-10-12T08:05:00.000Z', input: { customer_id: 'c2', price_type: 'wholesale', lines: [{ product_id: 'p1l', qty: 2000 }] } }];
    const shell = fakeShell(STAFF, {}, preheld);
    show(shell);
    const button = await screen.findByRole('button', { name: new RegExp(T.shortcuts.held) });
    await waitFor(() => expect(button.textContent).toContain('1')); // the F6 count comes from the database
    expect(button.getAttribute('title')).toBe('Owner'); // and says whose they are
    await userEvent.setup().click(button);
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    expect(within(dialog).getByText(/held by Owner/)).toBeTruthy();
    expect(within(dialog).getByText('Rasheed Ahmad')).toBeTruthy();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.held.resume }));
    await waitFor(() => expect(document.querySelector('[data-line=p1l]')).toBeTruthy());
    expect(shell.of('bills:resume')[0]!.input).toEqual({ id: 'h-owner' }); // the screen only names the bill, never a user
    expect(customerName()).toBe('Rasheed Ahmad');
  });

  it('a bill held before the app was restarted resumes without a remembered price: no "price changed" note, but a line that cannot be sold is still removed', async () => {
    const preheld: HeldRow[] = [{ id: 'h-old', by: 'Owner', at: '2026-10-11T08:05:00.000Z', input: { lines: [{ product_id: 'p1l', qty: 1000 }, { product_id: 'p250', qty: 250 }] } }];
    const shell = fakeShell(STAFF, {}, preheld);
    show(shell);
    PRODUCTS.p250!.stock = 0;
    try {
      await resumeFirst();
      const note = await screen.findByRole('dialog', { name: T.resumed.title });
      expect(within(note).getByText(T.resumed.removedLine('Insecticide 0.25 L'))).toBeTruthy();
      expect(note.querySelector('[data-note=price]')).toBeNull();
      expect(document.querySelector('[data-line=p1l]')).toBeTruthy();
      expect(document.querySelector('[data-line=p250]')).toBeNull();
    } finally {
      PRODUCTS.p250!.stock = 750;
    }
  });

  it('someone else got there first: the screen says the bill is gone, puts nothing on the bill, and refreshes the list', async () => {
    const preheld: HeldRow[] = [{ id: 'h-1', by: 'Owner', at: '2026-10-12T08:05:00.000Z', input: { lines: [{ product_id: 'p1l', qty: 1000 }] } }];
    const shell = fakeShell(STAFF, {}, preheld);
    show(shell);
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    await within(dialog).findByRole('button', { name: T.held.resume });
    shell.held.length = 0; // the other counter resumed it a moment ago
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.held.resume }));
    expect(await screen.findByText(errorText('HELD_BILL_GONE', {}, 'en').title)).toBeTruthy();
    expect(document.querySelector('[data-line]')).toBeNull();
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: T.held.title })).queryByRole('button', { name: T.held.resume })).toBeNull());
  });

  it('the bill is on the screen even if the check after resume fails (it already left the list, so it must not be lost)', async () => {
    const preheld: HeldRow[] = [{ id: 'h-1', by: 'Salesman', at: '2026-10-12T08:05:00.000Z', input: { lines: [{ product_id: 'p1l', qty: 1000 }] } }];
    const shell = fakeShell(STAFF, { 'sale:quote': () => fail('INTERNAL') }, preheld);
    show(shell);
    await resumeFirst();
    await waitFor(() => expect(document.querySelector('[data-line=p1l]')).toBeTruthy());
    expect(shell.held).toHaveLength(0);
  });

  it('Discard asks the database to discard that bill, and it leaves the list', async () => {
    const preheld: HeldRow[] = [
      { id: 'h-1', by: 'Salesman', at: '2026-10-12T08:05:00.000Z', input: { lines: [{ product_id: 'p1l', qty: 1000 }] } },
      { id: 'h-2', by: 'Owner', at: '2026-10-12T08:10:00.000Z', input: { lines: [{ product_id: 'p250', qty: 250 }] } },
    ];
    const shell = fakeShell(STAFF, {}, preheld);
    show(shell);
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    await waitFor(() => expect(dialog.querySelectorAll('[data-held]')).toHaveLength(2));
    await userEvent.setup().click(dialog.querySelector('[data-held=h-1] button[aria-label]')!);
    await waitFor(() => expect(dialog.querySelectorAll('[data-held]')).toHaveLength(1));
    expect(shell.of('bills:discard').map((c) => c.input)).toEqual([{ id: 'h-1' }]);
    expect(shell.held.map((h) => h.id)).toEqual(['h-2']);
    expect(document.querySelector('[data-line]')).toBeNull(); // discarding does not bring it to the screen
  });
});

describe('the shortcut keys', () => {
  it.each(['F2', 'F4', 'F6', 'F8', 'F12'])('%s is taken by the screen: the browser does not also act on it', async (key) => {
    const shell = fakeShell(STAFF);
    show(shell);
    expect(fireEvent.keyDown(window, { key })).toBe(false); // false = preventDefault was called
  });

  it('while a dialog is open the keys are left alone', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    expect(fireEvent.keyDown(window, { key: 'F4' })).toBe(false);
    await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    expect(fireEvent.keyDown(window, { key: 'F2' })).toBe(true);
  });
});

describe('keyboard', () => {
  it('F2 focuses the search box; F4 and F6 open their dialogs; shortcuts do nothing while a dialog is open', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(document.activeElement).toBe(searchBox());
    fireEvent.keyDown(window, { key: 'F4' });
    expect(await screen.findByRole('dialog', { name: T.customer.dialogTitle })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'F6' });
    expect(screen.queryByRole('dialog', { name: T.held.title })).toBeNull();
  });

  it('F12 completes the sale', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    fireEvent.keyDown(window, { key: 'F12' });
    await waitFor(() => expect(shell.sales()).toHaveLength(1));
  });
});

describe('what staff may see', () => {
  it('no request asks for cost, and nothing on the screen says cost', async () => {
    const shell = fakeShell(STAFF);
    const view = show(shell, STAFF);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=p1l] button[title]')!);
    await within(await screen.findByRole('dialog')).findByRole('radio', { name: /B-002/ });
    const sent = JSON.stringify(shell.calls.map((c) => c.input));
    expect(sent).not.toMatch(/include_?cost|includeCost|cost_price/i);
    expect(view.container.textContent!.toLowerCase()).not.toContain('cost');
    expect(document.body.textContent!.toLowerCase()).not.toContain('cost');
  });
});

describe('Urdu, right to left', () => {
  it('the screen is right to left with Urdu words, Urdu product names and numbers kept left to right', async () => {
    const shell = fakeShell(STAFF);
    show(shell, STAFF, 'ur');
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('searchbox', { name: ur.pos.searchLabel })).toBeTruthy();
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p1l')).toBeTruthy());
    expect(document.querySelector('[data-group] h3')!.textContent).toBe('کیڑے مار دوا');
    expect(chip('p5l').textContent).toContain(ur.pos.out);
    await userEvent.setup().click(chip('p1l'));
    await priced('Rs 500');
    expect(document.querySelector('[data-total]')!.getAttribute('class')).toContain('num'); // amounts stay left to right
    expect(completeButton().textContent).toContain('بل مکمل کریں');
    expect(screen.getByRole('button', { name: ur.pos.bill.hold })).toBeTruthy();
  });

  it('an element that is placed with start-/end- never carries .num (it forces direction: ltr, which flips what "end" means: the F2 badge sat on the icon in Urdu)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..', 'src', 'pages', 'pos');
    const placedAndNum = /className="[^"]*(?:\bnum\b[^"]*\b(?:absolute|fixed)\b|\b(?:absolute|fixed)\b[^"]*\bnum\b)[^"]*\b(?:start|end)-[\d[]/;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      readFileSync(join(dir, file), 'utf8').split('\n').forEach((line, i) => expect(placedAndNum.test(line), `${file}:${i + 1}: ${line.trim()}`).toBe(false));
    }
  });

  it('the F2 badge is a flex item after the search input (as in docs/design/Main.dc.html), not a placed element: in Urdu it sits at the far end, away from the magnifier', async () => {
    show(fakeShell(STAFF), STAFF, 'ur');
    const badge = [...document.querySelectorAll('kbd')].find((k) => k.textContent === 'F2' && k.className.includes('num'))!;
    expect(badge).toBeTruthy();
    expect(badge.className).not.toMatch(/\b(absolute|fixed)\b|\b(start|end)-[\d[]/);
    expect(badge.previousElementSibling!.tagName).toBe('INPUT'); // icon, input, badge: in a right-to-left row the icon is at the right and the badge at the left
    expect(badge.parentElement!.firstElementChild!.tagName.toLowerCase()).toBe('svg');
    // the row is one flex line: icon, input, badge as direct children of one flex box, so the browser (not a number) keeps them apart
    const row = badge.parentElement!;
    expect(row.className).toMatch(/(^|\s)flex(\s|$)/);
    expect([...row.children].map((c) => c.tagName.toLowerCase())).toEqual(['svg', 'input', 'kbd']);
    expect(badge.nextElementSibling).toBeNull();
    expect(row.getAttribute('dir')).toBeNull(); // the row follows the page direction; nothing forces it left to right
    expect(badge.getAttribute('dir')).toBeNull();
    // the icon and the badge never take the pointer or the screen reader; the input has no side classes of its own
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(row.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    expect(row.firstElementChild!.getAttribute('class')).toContain('pointer-events-none');
    expect(row.querySelector('input')!.className).not.toMatch(/(^|\s)(-?(ml|mr|pl|pr|ms|me|ps|pe|left|right|start|end)-|text-(left|right|start|end)b)/);
    expect(row.querySelector('input')!.className).not.toMatch(/b(absolute|fixed)b/);
  });

  it('the pos screen never uses left or right (only start and end), so it flips by itself', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..', 'src', 'pages', 'pos');
    const bad = /(?:^|[\s"'`:])(?:-?(?:ml|mr|pl|pr|left|right)-(?:\d|\[|px|auto)|text-(?:left|right)|float-(?:left|right)|rounded-[lr]-)/;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      lines.forEach((line, i) => expect(bad.test(line), `${file}:${i + 1}: ${line.trim()}`).toBe(false));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The build against docs/design/Main.dc.html, PosUrdu.dc.html and PosDialogs.dc.html
// ---------------------------------------------------------------------------------------------------------------------------------

describe('design: the Paid now field', () => {
  const paidBox = () => screen.getByLabelText(T.bill.paidNow) as HTMLInputElement;

  it('shows the amount with thousands separators like the design ("1,000"), not "1000"', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p1l');
    await userEvent.setup().click(chip('p1l')); // two packs: Rs 1,000
    await priced('Rs 1,000');
    expect(paidBox().value).toBe('1,000');
  });

  it('puts the separators in as the amount is typed, leaves half-typed paisa alone, and tidies them when the field is left', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const user = userEvent.setup();
    await user.clear(paidBox());
    await user.type(paidBox(), '2500');
    expect(paidBox().value).toBe('2,500');
    await user.type(paidBox(), '.5');
    expect(paidBox().value).toBe('2,500.5'); // not rewritten to .50 under the cursor
    await user.tab(); // leaving the field
    expect(paidBox().value).toBe('2,500.50');
    await user.clear(paidBox());
    await user.type(paidBox(), '12ab');
    expect(paidBox().value).toBe('12ab'); // text that is not an amount is left as typed, and says so
    expect(screen.getByRole('alert').textContent).toBe(T.bill.paidInvalid);
  });

  it('tidying the text does not ask for a new quote (1000 and 1,000 are the same bill)', async () => {
    const shell = fakeShell();
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().clear(paidBox());
    await userEvent.setup().type(paidBox(), '800');
    await waitFor(() => expect(document.querySelector('[data-change]')).toBeTruthy());
    await priced('Rs 500');
    const before = shell.of('sale:quote').length;
    paidBox().focus();
    paidBox().blur();
    // Quotes are sent in order: type a digit (a real change, so a real quote) and see that the first quote after the blur is THAT one, not a quote for the tidied text.
    await userEvent.setup().type(paidBox(), '0');
    await waitFor(() => expect(shell.of('sale:quote').length).toBeGreaterThan(before));
    await billSettled();
    expect(shell.of('sale:quote')[before]!.input.paid_amount).toBe(0); // the quote for the typed 0, not one for the tidied 800
  });

  it('in Urdu the field is still left to right: "Rs" first, then the amount, so it is never "1,000Rs"', async () => {
    const shell = fakeShell();
    show(shell, STAFF, 'ur');
    const box = paidBox().parentElement!;
    expect(box.getAttribute('dir')).toBe('ltr');
    expect(box.firstElementChild!.textContent).toBe('Rs');
    expect(box.firstElementChild!.nextElementSibling).toBe(paidBox());
  });

  it('the shown text of an ordinary bill in Urdu is the same "1,000"', async () => {
    const shell = fakeShell();
    show(shell, STAFF, 'ur');
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p1l')).toBeTruthy());
    await userEvent.setup().click(chip('p1l'));
    await userEvent.setup().click(chip('p1l'));
    await priced('Rs 1,000');
    expect(paidBox().value).toBe('1,000');
  });
});

describe('design: the pay-by date reads "30 Nov 2026", in both languages, never the browser format', () => {
  async function khataBill(language: Language) {
    const shell = fakeShell(STAFF);
    show(shell, STAFF, language);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(dialog).findByRole('option', { name: /Rashid|راشد/ });
    await userEvent.setup().click(within(dialog).getByRole('option', { name: /Rashid|راشد/ }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: new RegExp(language === 'ur' ? 'چنیں' : 'Use') }));
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p1l')).toBeTruthy());
    await userEvent.setup().click(chip('p1l'));
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(document.querySelector('[data-khata]')).toBeTruthy());
    return shell;
  }

  it.each(['en', 'ur'] as const)('%s: the box shows the date 30 days from today as "11 Nov 2026" and a chosen date as "30 Nov 2026"', async (language) => {
    const shell = await khataBill(language);
    const box = document.querySelector<HTMLInputElement>('[data-khata] [name=due_date]')!;
    expect(box.value).toBe('11 Nov 2026'); // today (2026-10-12 in the quote) + 30 days
    expect(box.value).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    fireEvent.change(box, { target: { value: '30 Nov 2026' } });
    await waitFor(() => expect(box.value).toBe('30 Nov 2026'));
    await waitFor(() => expect(shell.of('sale:quote').at(-1)!.input.due_date).toBe('2026-11-30')); // the request still carries YYYY-MM-DD
  });
});

describe('design: the counter dialogs (docs/design/PosDialogs.dc.html)', () => {
  it('the over-the-limit box has the design buttons only (Take Rs X more, Ask owner), the amount in bold, and the owner variant says Allow over the limit', async () => {
    const shell = fakeShell(STAFF);
    show(shell, STAFF);
    fireEvent.keyDown(window, { key: 'F4' });
    const picker = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await userEvent.setup().type(within(picker).getByLabelText(T.customer.searchLabel), 'bash');
    await userEvent.setup().click(await within(picker).findByRole('option', { name: /Bashir/ }));
    await userEvent.setup().click(within(picker).getByRole('button', { name: T.customer.use('Bashir') }));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(completeButton());
    const over = await screen.findByRole('dialog', { name: T.over.title });
    expect(within(over).getAllByRole('button').map((b) => b.textContent)).toEqual(['Take Rs 350 more', T.over.askOwner]);
    expect(within(over).getByText('Rs 350', { selector: 'b' })).toBeTruthy(); // "Take at least <b>Rs 350</b> more now, or ask the owner to approve."
    expect(over.textContent).toContain(T.over.eyebrow);
  });

  it('the dialogs use the counter look: a grey chip, a 20px title, a 14px lead, 16px corners', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F6' });
    const held = await screen.findByRole('dialog', { name: T.held.title });
    expect(held.hasAttribute('data-counter-dialog')).toBe(true);
    expect(held.className).toContain('rounded-2xl');
    expect(held.querySelector('h2')!.className).toContain('text-xl');
    expect(held.textContent).toContain('F6');
    expect(held.textContent).toContain(T.held.lead);
  });

  it('a held bill with one item says "1 item", not "1 items"', () => {
    expect(en.pos.held.items(1)).toBe('1 item');
    expect(en.pos.held.items(3)).toBe('3 items');
    expect(en.pos.bill.invoice(1)).toBe('New bill · 1 line');
    expect(en.pos.bill.invoice(3)).toBe('New bill · 3 lines');
  });

  it('the line editor: Auto is a chip on the batch that expires first, stock reads "9 kg", a new discount is a percent, and the cursor is in the quantity', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('fert', 'f1');
    await priced('Rs 200');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=f1] button[title]')!);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('radio', { name: /B-002/ });
    const first = within(dialog).getAllByRole('radio').find((r) => r.textContent!.includes('B-001'))!;
    expect(first.getAttribute('aria-checked')).toBe('true');
    expect(first.textContent).toContain(T.line.auto);
    expect(first.textContent).toContain('Exp 12 Mar 2027 · 9 kg');
    expect(within(dialog).getAllByRole('radio').find((r) => r.textContent!.includes('B-002'))!.textContent).not.toContain(T.line.auto);
    expect(within(dialog).getByRole('radio', { name: T.line.percent }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByLabelText(T.line.quantityUnit('kg')));
    expect(dialog.textContent).toContain('Per kg Rs 200'); // a 1 kg loose pack is priced per kg, not "Per g pack"
    expect(dialog.textContent).toContain('Fertilizer · 1 kg');
  });

  it('picking the batch that expires first is "Auto" (no batch is sent), picking the other one sends it', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=p1l] button[title]')!);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('radio', { name: /B-002/ });
    await userEvent.setup().click(within(dialog).getByRole('radio', { name: /B-002/ }));
    await userEvent.setup().click(within(dialog).getByRole('radio', { name: /B-001/ })); // back to the first: Auto again
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.line.done }));
    await priced('Rs 500');
    expect(shell.of('sale:quote').at(-1)!.input.lines[0].batches).toBeUndefined();
  });

  it('the approval box names the limit with numbers ("Over credit limit · Rs 450 of Rs 100") and its fields use the 48px dialog input', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const picker = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await userEvent.setup().type(within(picker).getByLabelText(T.customer.searchLabel), 'bash');
    await userEvent.setup().click(await within(picker).findByRole('option', { name: /Bashir/ }));
    await userEvent.setup().click(within(picker).getByRole('button', { name: T.customer.use('Bashir') }));
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(completeButton().disabled).toBe(false));
    await userEvent.setup().click(completeButton());
    await userEvent.setup().click(within(await screen.findByRole('dialog', { name: T.over.title })).getByRole('button', { name: T.over.askOwner }));
    const approval = await screen.findByRole('dialog', { name: T.approval.title });
    expect(approval.textContent).toContain(T.approval.overChip('Rs 450', 'Rs 100'));
    expect(within(approval).getByLabelText(T.approval.username).className).toContain('h-12');
    expect(within(approval).getByLabelText(T.approval.password).getAttribute('aria-describedby')).toBe('approval-password-hint');
  });
});

describe('design: a held bill resumed says when the batch changed ("FG-014 expired, now FG-020")', () => {
  async function holdThenResume(first: { no: string; expiry: string }, later: { no: string; expiry: string }) {
    let now = first;
    const shell = fakeShell(STAFF, {
      'sale:quote': (input) => {
        const q = quoteOf(input, 'staff');
        q.lines.forEach((l) => {
          l.batches[0].batch_no = now.no;
          l.batches[0].expiry_date = now.expiry;
        });
        return ok(q);
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    expect(JSON.stringify(shell.of('bills:hold')[0]!.input)).not.toMatch(/seen|batch_no|expiry|FG-|B-00/); // the batch the cashier saw is not stored
    now = later;
    fireEvent.keyDown(window, { key: 'F6' });
    const dialog = await screen.findByRole('dialog', { name: T.held.title });
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.held.resume }));
    return screen.findByRole('dialog', { name: T.resumed.title });
  }

  it('the old batch is past its date: "expired, now ..."', async () => {
    const note = await holdThenResume({ no: 'FG-014', expiry: '2026-10-01' }, { no: 'FG-020', expiry: '2027-08-01' });
    expect(within(note).getByText(T.resumed.batchLine('Insecticide 1 L', 'FG-014', 'FG-020', true))).toBeTruthy();
    expect(note.querySelector('[data-note=batch]')!.textContent).toContain(T.resumed.batchChanged);
    expect(note.textContent).toContain('FG-014 expired, now FG-020');
  });

  it('the old batch is simply used up: "is used up, now ..."', async () => {
    const note = await holdThenResume({ no: 'B-001', expiry: '2027-03-12' }, { no: 'B-002', expiry: '2028-02-14' });
    expect(note.textContent).toContain('B-001 is used up, now B-002');
  });

  it('the same batch says nothing', async () => {
    let now = 'B-001';
    const shell = fakeShell(STAFF, {
      'sale:quote': (input) => {
        const q = quoteOf(input, 'staff');
        q.lines.forEach((l) => (l.batches[0].batch_no = now));
        return ok(q);
      },
    });
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    now = 'B-001';
    fireEvent.keyDown(window, { key: 'F6' });
    await userEvent.setup().click(within(await screen.findByRole('dialog', { name: T.held.title })).getByRole('button', { name: T.held.resume }));
    await priced('Rs 500');
    expect(screen.queryByRole('dialog', { name: T.resumed.title })).toBeNull();
  });
});

describe('design: the exact wording of docs/design/Main.dc.html and PosUrdu.dc.html', () => {
  const read = (name: string) => readFileSync(join(__dirname, '..', '..', '..', 'docs', 'design', name), 'utf8');
  const MAIN = read('Main.dc.html');
  const URDU = read('PosUrdu.dc.html');

  const english: [string, string][] = [
    ['search placeholder', en.pos.searchPlaceholder],
    ['Retail', en.pos.retail],
    ['Wholesale', en.pos.wholesale],
    ['Product', en.pos.cols.product],
    ['Qty', en.pos.cols.qty],
    ['Price', en.pos.cols.price],
    ['Total', en.pos.cols.total],
    ['Search', en.pos.shortcuts.search],
    ['Customer', en.pos.shortcuts.customer],
    ['Discount', en.pos.shortcuts.discount],
    ['Complete sale', en.pos.shortcuts.complete],
    ['Change', en.pos.customer.change],
    ['Owes now', en.pos.customer.owesNow],
    ['After this sale', en.pos.customer.afterSale],
    ['Includes tax', en.pos.bill.includesTax],
    ['Paid now', en.pos.bill.paidNow],
    ['Cash', en.pos.bill.methods.cash],
    ['Bank', en.pos.bill.methods.bank],
    ['Easypaisa', en.pos.bill.methods.easypaisa],
    ['JazzCash', en.pos.bill.methods.jazzcash],
    ['Goes on Khata', en.pos.bill.goesOnKhata],
    ['Pay by', en.pos.bill.payBy],
    ['Hold bill', en.pos.bill.hold],
    ['Clear', en.pos.bill.clear],
    ['Out', en.pos.out],
    ['packs', en.pos.packs],
    ['Loose · per kg', en.pos.looseBadge('kg')],
    ['Disc. Rs 50', en.pos.discBadge('Rs 50')],
    ['Near expiry · 24 days', en.pos.nearExpiry(24)],
    ['Chak 12 · Retail price', `Chak 12 · ${en.pos.customer.retailPrice}`],
    // The design says "3 left"; the standard-units change says what is left in packs ("3 packs left"), so only the word is compared.
    ['left', en.pos.left('').trim()],
  ];
  const urdu: [string, string][] = [
    ['search placeholder', ur.pos.searchPlaceholder],
    ['پرچون', ur.pos.retail],
    ['تھوک', ur.pos.wholesale],
    ['پراڈکٹ', ur.pos.cols.product],
    ['مقدار', ur.pos.cols.qty],
    ['قیمت', ur.pos.cols.price],
    ['کل', ur.pos.cols.total],
    ['تلاش', ur.pos.shortcuts.search],
    ['گاہک', ur.pos.shortcuts.customer],
    ['رعایت', ur.pos.shortcuts.discount],
    ['مکمل', ur.pos.shortcuts.complete],
    ['تبدیل کریں', ur.pos.customer.change],
    ['ابھی بقایا', ur.pos.customer.owesNow],
    ['اس بل کے بعد', ur.pos.customer.afterSale],
    ['ٹیکس سمیت', ur.pos.bill.includesTax],
    ['کل رقم', ur.pos.bill.total],
    ['ابھی ادا', ur.pos.bill.paidNow],
    ['نقد', ur.pos.bill.methods.cash],
    ['بینک', ur.pos.bill.methods.bank],
    ['ایزی پیسہ', ur.pos.bill.methods.easypaisa],
    ['جاز کیش', ur.pos.bill.methods.jazzcash],
    ['کھاتے میں جائے گا', ur.pos.bill.goesOnKhata],
    ['ادائیگی کی تاریخ', ur.pos.bill.payBy],
    ['بل مکمل کریں', ur.pos.bill.complete],
    ['بل روکیں', ur.pos.bill.hold],
    ['صاف کریں', ur.pos.bill.clear],
    ['ختم', ur.pos.out],
    ['پیک', ur.pos.packs],
    ['کھلی · فی کلو', ur.pos.looseBadge('کلو')],
    ['رعایت Rs 50', ur.pos.discBadge('Rs 50')],
    ['ایکسپائری قریب · 24 دن', ur.pos.nearExpiry(24)],
    ['چک 12 · پرچون قیمت', `چک 12 · ${ur.pos.customer.retailPrice}`],
    ['باقی', ur.pos.left('').trim()],
  ];

  it.each(english)('English: "%s" is written in Main.dc.html exactly as the build says it', (_label, text) => {
    expect(MAIN, text).toContain(text);
  });
  it.each(urdu)('Urdu: "%s" is written in PosUrdu.dc.html exactly as the build says it', (_label, text) => {
    expect(URDU, text).toContain(text);
  });
});

// The tests above only prove that the design FILE holds the build's strings. These read the strings out of the design file and look for them in the
// page the cashier actually sees, in both languages, in the design's order, with the real values of the bill filled in.
describe('design: the RENDERED page says what Main.dc.html and PosUrdu.dc.html say', () => {
  const designPath = (name: string) => join(__dirname, '..', '..', '..', 'docs', 'design', name);
  /** Every text piece of the design's markup (styles, scripts and the logic block dropped), one per element. */
  const pieces = (file: string): string[] => {
    const html = readFileSync(designPath(file), 'utf8').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
    return [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim()).filter((t) => t !== '' && !t.startsWith('class Component'));
  };
  /** The cart rows the design's logic block holds as JSON (`cart: [...]`). */
  const designCart = (file: string): { name: string; pack: string; disc: string; nearText: string }[] => {
    const html = readFileSync(designPath(file), 'utf8');
    const start = html.indexOf('cart: [') + 'cart: '.length;
    let depth = 0;
    let end = start;
    for (; end < html.length; end++) {
      if (html[end] === '[') depth++;
      if (html[end] === ']' && --depth === 0) break;
    }
    return JSON.parse(html.slice(start, end + 1));
  };
  const spec = (language: Language) => {
    const file = language === 'ur' ? 'PosUrdu.dc.html' : 'Main.dc.html';
    const p = pieces(file);
    const at = (text: string, from = 0) => {
      const i = p.indexOf(text, from);
      expect(i, `"${text}" is in ${file}`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const shortcutsAt = p.findIndex((t, i) => t === 'F2' && p[i + 2] === 'F4' && p[i + 4] === 'F8' && p[i + 6] === 'F12');
    expect(shortcutsAt, `the shortcut strip is in ${file}`).toBeGreaterThanOrEqual(0);
    const shortcuts = [0, 2, 4, 6].map((o) => ({ key: p[shortcutsAt + o]!, label: p[shortcutsAt + o + 1]! }));
    const paidNow = at(language === 'ur' ? 'ابھی ادا' : 'Paid now');
    const methods = p.slice(paidNow + 2, paidNow + 6); // after "Paid now" and the "Rs" prefix of the box
    const completeAt = p.lastIndexOf('F12');
    const owes = at(language === 'ur' ? 'ابھی بقایا' : 'Owes now');
    const after = at(language === 'ur' ? 'اس بل کے بعد' : 'After this sale');
    const khata = at(language === 'ur' ? 'کھاتے میں جائے گا' : 'Goes on Khata');
    const cart = designCart(file);
    return {
      placeholder: /placeholder="([^"]+)"/.exec(readFileSync(designPath(file), 'utf8'))![1]!,
      shortcuts,
      methods,
      complete: { text: p[completeAt - 1]!.replace(/\s*·$/, ''), sep: p[completeAt - 1]!.endsWith('·') ? '·' : '' },
      owes: p[owes]!,
      after: p[after]!,
      khata: p[khata]!,
      payBy: p[khata + 2]!,
      loose: cart[1]!.pack,
      disc: cart[2]!.disc,
      near: cart[2]!.nearText,
    };
  };
  const plain = (s: string | null) => (s ?? '').replace(/[⁦⁧⁨⁩‎‏]/g, '').replace(/\s+/g, ' ').trim();

  /** The design's bill: Rashid (owes Rs 2,000), a sealed Insecticide, loose Fertilizer, a discount, a batch about to expire; Rs 100 paid so the rest goes on Khata. */
  async function designBill(language: Language) {
    const shell = fakeShell(OWNER, {
      'sale:quote': (input) => {
        const q = quoteOf(input, 'owner');
        for (const l of q.lines) Object.assign(l.batches[0], { days_to_expiry: 9, near_expiry: true });
        return ok(q);
      },
    });
    show(shell, OWNER, language);
    const customerName = language === 'ur' ? 'راشد' : 'Rashid';
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(dialog).findByRole('option', { name: new RegExp(customerName) });
    await userEvent.setup().click(within(dialog).getByRole('option', { name: new RegExp(customerName) }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.customer.use(customerName) }));
    await addSize('insect', 'p1l');
    await userEvent.setup().clear(searchBox());
    await addSize('fert', 'f1');
    await priced('Rs 700');
    fireEvent.keyDown(window, { key: 'F8' });
    const editor = await screen.findByRole('dialog');
    const box = within(editor).getByLabelText(T.line.discount) as HTMLInputElement;
    await userEvent.setup().type(box, '15'); // 15 % of the Rs 200 loose line is Rs 30
    await userEvent.setup().click(within(editor).getByRole('button', { name: T.line.done }));
    await waitFor(() => expect(totalText()).toBe('Rs 670'));
    const paid = screen.getByLabelText(T.bill.paidNow);
    await userEvent.setup().clear(paid);
    await userEvent.setup().type(paid, '100');
    await waitFor(() => expect(document.querySelector('[data-khata]')!.textContent).toContain('570'));
    await priced('Rs 670');
    return shell;
  }

  it.each(['en', 'ur'] as const)('%s: the search box shows the design placeholder', async (language) => {
    show(fakeShell(STAFF), STAFF, language);
    expect(searchBox().getAttribute('placeholder')).toBe(spec(language).placeholder);
  });

  it.each(['en', 'ur'] as const)('%s: the strip under the cart reads F2 Search, F4 Customer, F8 Discount, F12 Complete sale, in the design order and wording', async (language) => {
    show(fakeShell(STAFF), STAFF, language);
    const { shortcuts } = spec(language);
    const strip = document.querySelector('section footer')!;
    const spans = [...strip.querySelectorAll(':scope > span')].map((s) => plain(s.textContent));
    expect(spans).toEqual(shortcuts.map((s) => `${s.key} ${s.label}`));
    // the labels the design names, spelled out for the English page
    if (language === 'en') expect(spans).toEqual(['F2 Search', 'F4 Customer', 'F8 Discount', 'F12 Complete sale']);
  });

  it.each(['en', 'ur'] as const)('%s: the bill panel shows the design wording with the real values: Owes now / After this sale, the discount, loose and near-expiry badges, the Khata box', async (language) => {
    await designBill(language);
    const s = spec(language);
    const card = plain(document.querySelector('[data-customer-name]')!.closest('section')!.textContent);
    // "Owes now" carries today's balance and "After this sale" the balance after the bill, never the other way round
    expect(card).toContain(`${s.owes} Rs 2,000`);
    expect(card).toContain(`${s.after} Rs 2,570`);
    expect(card.indexOf(s.owes)).toBeLessThan(card.indexOf(s.after));
    // the badges, with the real value in them
    const badges = [...document.querySelectorAll('[data-line] span, [data-line] div')].map((e) => plain(e.textContent));
    expect(badges).toContain(s.disc.replace('Rs 50', 'Rs 30'));
    expect(badges).toContain(s.near.replace('24', '9'));
    const loose = badges.filter((b) => b === s.loose);
    expect(loose.length, `one badge says exactly "${s.loose}"`).toBe(1);
    expect(s.loose).not.toMatch(/ml|ملی/);
    expect(document.querySelector('[data-line=f1]')!.textContent).toContain(s.loose);
    expect(document.querySelector('[data-line=p1l]')!.textContent).not.toContain(s.loose);
    // the Khata box: its title, the amount on Khata and the pay-by label
    const khata = plain(document.querySelector('[data-khata]')!.textContent);
    expect(khata.startsWith(`${s.khata}Rs 570`), khata).toBe(true); // title, then the amount (separate blocks, so no space between the texts)
    expect(plain(document.querySelector('[data-khata] p')!.textContent)).toBe(s.khata);
    expect(khata).toContain(s.payBy);
    expect(khata.indexOf(s.khata)).toBeLessThan(khata.indexOf(s.payBy));
  });

  it.each(['en', 'ur'] as const)('%s: the payment buttons are Cash, Bank, Easypaisa, JazzCash in the design order, and the big button reads "<Complete> · F12"', async (language) => {
    await designBill(language);
    const s = spec(language);
    const group = screen.getByRole('radiogroup', { name: T.bill.method });
    expect(within(group).getAllByRole('radio').map((r) => plain(r.textContent))).toEqual(s.methods);
    if (language === 'en') expect(s.methods).toEqual(['Cash', 'Bank', 'Easypaisa', 'JazzCash']);
    expect(plain(completeButton().textContent)).toBe(`${s.complete.text} ${s.complete.sep} F12`);
    if (language === 'en') expect(plain(completeButton().textContent)).toBe('Complete sale · F12');
  });
});

describe('design: the sizes and spacing of Main.dc.html that a test can read', () => {
  it('the cart columns are 132 / 92 / 104 px, the aside is 340px, the page has the design padding, the Complete sale button is 58px', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    const header = document.querySelector('[role=columnheader]')!.parentElement!;
    expect(header.className).toContain('grid-cols-[minmax(0,1fr)_132px_92px_104px_44px]');
    expect(document.querySelector('aside')!.className).toContain('w-[340px]');
    expect(completeButton().className).toContain('h-[58px]');
    expect(completeButton().className).toContain('text-[19px]');
    expect(document.querySelector('[data-total]')!.className).toContain('text-[34px]');
    const search = searchBox().parentElement!;
    expect(search.className).toContain('h-[52px]');
    expect(search.className).toContain('border-2');
    expect(searchBox().className).toContain('text-[17px]');
  });

  it('every button and field on the screen is at least 44px tall (the design file itself says "Targets are 44 px or larger")', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    for (const el of document.querySelectorAll<HTMLElement>('button, input')) {
      const cls = el.className;
      // jsdom has no layout: read the size classes. A button with no height class falls back to the button's min-h-11.
      const small = /\b(?:h|min-h|size)-(?:[1-9]|10)\b/.test(cls) && !/\bmin-h-11\b|\bh-1[1-9]\b|\bsize-11\b/.test(cls);
      expect(small, `${el.tagName} "${el.textContent?.trim().slice(0, 30)}" has class ${cls}`).toBe(false);
    }
  });
});

describe('gaps found by the test review', () => {
  it('the saved-sale window calls the money "Cash received" for a cash sale (the wording of docs/design/PosDialogs.dc.html) and "Paid now" for any other method', async () => {
    const design = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'design', 'PosDialogs.dc.html'), 'utf8');
    expect(design).toContain('Cash received');
    expect(T.done.received).toBe('Cash received');
    const label = (done: HTMLElement) => [...done.querySelectorAll('dt')].map((d) => d.textContent);

    const cash = fakeShell(STAFF);
    show(cash);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    let done = await screen.findByRole('dialog', { name: T.done.title });
    expect(label(done)).toContain('Cash received');
    expect(label(done)).not.toContain(T.done.paid);
    cleanup();

    const bank = fakeShell(STAFF);
    show(bank);
    await addSize('insect', 'p1l');
    await priced('Rs 500');
    await userEvent.setup().click(screen.getByRole('radio', { name: T.bill.methods.bank }));
    await priced('Rs 500');
    await userEvent.setup().click(completeButton());
    done = await screen.findByRole('dialog', { name: T.done.title });
    expect(bank.sales()[0]!.input.payment_method).toBe('bank');
    expect(label(done)).toContain(T.done.paid);
    expect(label(done)).not.toContain(T.done.received);
  });

  it('resuming a held bill asks for the new prices with THAT bill\'s price type and customer (the first quote after Resume, not a later one)', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const pickDialog = await screen.findByRole('dialog', { name: T.customer.dialogTitle });
    await within(pickDialog).findByRole('option', { name: /Rashid/ });
    await userEvent.setup().click(within(pickDialog).getByRole('option', { name: /Rashid/ }));
    await userEvent.setup().click(within(pickDialog).getByRole('button', { name: T.customer.use('Rashid') }));
    await userEvent.setup().click(screen.getByRole('radio', { name: T.wholesale })); // Rashid's usual type is retail
    await addSize('insect', 'p1l');
    await priced('Rs 450');
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    await waitFor(() => expect(document.querySelector('[data-line]')).toBeNull());
    await screen.findByText(T.held.held); // the bill is held and the screen is empty: nothing else is going to be priced
    const before = shell.of('sale:quote').length;
    fireEvent.keyDown(window, { key: 'F6' });
    const held = await screen.findByRole('dialog', { name: T.held.title });
    await userEvent.setup().click(within(held).getByRole('button', { name: T.held.resume }));
    await waitFor(() => expect(shell.of('sale:quote').length).toBeGreaterThan(before));
    const first = shell.of('sale:quote')[before]!.input;
    expect(first.customer_id).toBe('c1');
    expect(first.price_type).toBe('wholesale');
    expect(first.lines).toEqual([{ product_id: 'p1l', qty: 1000 }]);
  });

  describe('while a dialog is open the F-keys do nothing', () => {
    it('F12 does not complete the sale', async () => {
      const shell = fakeShell(STAFF);
      show(shell);
      await addSize('insect', 'p1l');
      await priced('Rs 500');
      fireEvent.keyDown(window, { key: 'F4' });
      await screen.findByRole('dialog', { name: T.customer.dialogTitle });
      expect(fireEvent.keyDown(window, { key: 'F12' })).toBe(true); // left alone
      await flush();
      expect(shell.sales()).toHaveLength(0);
      expect(screen.queryByRole('dialog', { name: T.done.title })).toBeNull();
      expect(screen.getByRole('dialog', { name: T.customer.dialogTitle })).toBeTruthy();
    });

    it('F8 does not open the line editor over (or instead of) the open dialog', async () => {
      const shell = fakeShell(STAFF);
      show(shell);
      await addSize('insect', 'p1l');
      await priced('Rs 500');
      fireEvent.keyDown(window, { key: 'F4' });
      await screen.findByRole('dialog', { name: T.customer.dialogTitle });
      expect(fireEvent.keyDown(window, { key: 'F8' })).toBe(true);
      await flush();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: T.customer.dialogTitle })).toBeTruthy();
      expect(screen.queryByLabelText(T.line.discount)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The standard-units rule on the rendered counter screen: kg, L and pieces are shown, g and ml never are (see unit-scan.ts).
// ---------------------------------------------------------------------------------------------------------------------------
describe('standard units on the counter screen (English and Urdu)', () => {
  for (const language of ['en', 'ur'] as const) {
    it(`${language}: search cards, a sealed line, a loose line and the line editor show kg / L, never g or ml`, async () => {
      const shell = fakeShell(STAFF);
      show(shell, STAFF, language);
      await typeIn(searchBox(), 'insect');
      await waitFor(() => expect(chip('p250')).toBeTruthy());
      expect(smallUnitsIn(visibleText(document.body))).toEqual([]);
      expect(UNIT_WORDS[language].test(withoutMarks(chip('p250').textContent!))).toBe(true);
      await userEvent.setup().click(chip('p1l'));
      await priced('Rs 500');
      await userEvent.setup().clear(searchBox());
      await addSize('fert', 'f1');
      await priced('Rs 700');
      const loose = document.querySelector('[data-line=f1]')!;
      expect(withoutMarks(loose.textContent!)).toContain(language === 'ur' ? 'کلو' : 'kg');
      expect(withoutMarks(document.querySelector('[data-line=p1l]')!.textContent!)).toMatch(language === 'ur' ? /1 لیٹر/ : /1 L/);
      expect(smallUnitsIn(visibleText(document.body))).toEqual([]);
      await userEvent.setup().click(loose.querySelector<HTMLButtonElement>('button[title]')!);
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByRole('radio', { name: /B-002/ });
      expect(smallUnitsIn(visibleText(dialog))).toEqual([]);
      expect((within(dialog).getByLabelText(T.line.quantityUnit(language === 'ur' ? 'کلو' : 'kg')) as HTMLInputElement).value).toBe('1');
      expect(withoutMarks(dialog.textContent!)).toContain('0.5');
    }, 20_000);
  }
});

describe('the line editor reads the loose quantity strictly', () => {
  it('"2,5", "2..5", zero and four decimals are refused with a sentence and Done stays off; "2.5" is accepted and sent as 2500', async () => {
    const shell = fakeShell(STAFF);
    show(shell, STAFF, 'en');
    await addSize('fert', 'f1');
    await priced('Rs 200');
    await userEvent.setup().click(document.querySelector<HTMLButtonElement>('[data-line=f1] button[title]')!);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('radio', { name: /B-002/ });
    const box = within(dialog).getByLabelText(T.line.quantityUnit('kg')) as HTMLInputElement;
    const done = within(dialog).getByRole('button', { name: T.line.done }) as HTMLButtonElement;
    for (const bad of ['2,5', '2..5', '0', '1.2345', 'abc']) {
      fireEvent.change(box, { target: { value: bad } });
      expect(dialog.querySelector('[data-qty-error]'), bad).toBeTruthy();
      expect(done.disabled, bad).toBe(true);
    }
    fireEvent.change(box, { target: { value: '2.5' } });
    expect(dialog.querySelector('[data-qty-error]')).toBeNull();
    expect(done.disabled).toBe(false);
    await userEvent.setup().click(done);
    await waitFor(() => expect(shell.of('sale:quote').at(-1)!.input.lines[0].qty).toBe(2500));
  }, 20_000);
});
