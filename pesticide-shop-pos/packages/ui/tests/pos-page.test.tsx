// @vitest-environment jsdom
// The POS billing screen, driven the way a cashier drives it, against a fake shell built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { PosPage } from '../src/pages/pos/pos-page.js';

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

function fakeShell(user: SessionUser = STAFF, override: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
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
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of, sales: () => of('sale:create'), approvals: () => of('approval:request') };
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

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('searching and adding', () => {
  it('shows the sizes of a product with price and stock; a size with no good stock is shown but cannot be added', async () => {
    const shell = fakeShell();
    show(shell);
    await typeIn(searchBox(), 'insect');
    await waitFor(() => expect(chip('p250')).toBeTruthy());
    expect(chip('p250').textContent).toContain('Rs 190');
    expect(chip('p250').textContent).toContain('3 left');
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
    await new Promise((r) => setTimeout(r, 200));
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
    expect(screen.getByText(T.approval.actions.credit_override)).toBeTruthy();
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
    await new Promise((r) => setTimeout(r, 200));
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

  it('a loose product is shown in grams and moves in steps of 50', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await addSize('fert', 'f1');
    await priced('Rs 200');
    expect(document.querySelector('[data-line=f1] [data-qty]')!.textContent).toBe('1000');
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(`${T.decrease}: `) }));
    await waitFor(() => expect(document.querySelector('[data-line=f1] [data-qty]')!.textContent).toBe('950'));
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
    expect(JSON.parse(localStorage.getItem('pos.heldBills.v1')!)).toHaveLength(1);
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
      expect(localStorage.getItem('pos.heldBills.v1')).toBe('[]'); // resumed once, then gone
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
      expect(within(note).getByText(T.resumed.removedLine('Insecticide 250 ml'))).toBeTruthy();
      expect(document.querySelector('[data-line=p250]')).toBeNull();
    } finally {
      PRODUCTS.p250!.stock = 750;
    }
  });

  it('holding an empty bill does nothing', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    await userEvent.setup().click(screen.getByRole('button', { name: T.bill.hold }));
    expect(localStorage.getItem('pos.heldBills.v1')).toBeNull();
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
