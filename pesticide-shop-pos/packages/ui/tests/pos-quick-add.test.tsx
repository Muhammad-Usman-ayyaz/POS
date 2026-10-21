// @vitest-environment jsdom
// "New customer" inside the F4 picker (Phase 6 M7), driven the way a cashier does it, against a fake shell built with the real client code.
// There is no design file for this; the wording is asserted on the RENDERED page, read from the same messages the page uses.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { errorText } from '../src/i18n/errors.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { PosPage } from '../src/pages/pos/pos-page.js';
import { buildQuickAddRequest, hasUrduScript, startForm } from '../src/pages/pos/customer-quick-add-request.js';
import { scanSource } from './source-scan.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

type Handler = (input: any) => unknown;
const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

const RASHID = { id: 'c1', name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12', phone: '0300 1112223', default_price_type: 'retail' as const, credit_limit: 1_000_000, balance: 200_000 };
const ADVANCE = { id: 'c9', name_en: 'Rashid Ali', name_ur: null, village: 'Chak 3', phone: null, default_price_type: 'wholesale' as const, credit_limit: 0, balance: -50_000 };

interface Options {
  defaultLimit?: number;
  /** The price type the shell gives the new customer (the real one gives retail). */
  createdPriceType?: 'retail' | 'wholesale';
  /** Customers the fake database holds; a create of the same name_en answers DUPLICATE_CUSTOMER unless confirm_duplicate. */
  existing?: (typeof RASHID | typeof ADVANCE)[];
  /** Answers each create in turn instead of the normal one. */
  createReplies?: (() => Promise<unknown> | unknown)[];
}

function fakeShell(user: SessionUser = STAFF, opts: Options = {}, override: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
  const known = opts.existing ?? [RASHID];
  let created = 0;
  const handlers: Partial<Record<Channel, Handler>> = {
    'customers:search': ({ query }) => {
      const q = String(query ?? '').toLowerCase();
      return ok(known.filter((c) => q === '' || `${c.name_en} ${c.name_ur ?? ''} ${c.village} ${c.phone ?? ''}`.toLowerCase().includes(q)));
    },
    'customers:getSettings': () => ok({ default_credit_limit: opts.defaultLimit ?? 0, show_farmer_fields: false }),
    'customers:create': async (input) => {
      const scripted = opts.createReplies?.shift();
      if (scripted) return scripted();
      const f = input.fields;
      const same = known.find((c) => f.name_en && c.name_en.toLowerCase() === String(f.name_en).toLowerCase());
      if (same && !input.confirm_duplicate) return fail('DUPLICATE_CUSTOMER');
      created += 1;
      return ok({
        customer: { id: `new${created}`, name_en: f.name_en ?? null, name_ur: f.name_ur ?? null, phone: f.phone ?? null, village: f.village ?? null, default_price_type: opts.createdPriceType ?? 'retail', credit_limit: opts.defaultLimit ?? 0, version: 1 },
        balance: 0,
        no_limit: (opts.defaultLimit ?? 0) === 0,
      });
    },
    'customers:findDuplicates': () => ok(known.map((c) => ({ customer_id: c.id, name_en: c.name_en, name_ur: c.name_ur, village: c.village, phone: c.phone, balance: c.balance, same_name: true, same_phone: false }))),
    'customers:get': ({ customer_id }) => {
      const c = known.find((x) => x.id === customer_id)!;
      return ok({ customer: { ...c, version: 1 }, balance: c.balance });
    },
    'catalogue:list': () =>
      ok({
        hits: [{ group: { id: 'g', name_en: 'Insecticide', name_ur: 'کیڑے مار دوا' }, sizes: [{ id: 'p1l', group_id: 'g', pack_label: '1 L', pack_size: 1000, allow_loose: 0, base_unit: 'ml', is_active: 1, retail_price: 50_000, wholesale_price: 45_000, stock_sellable: 12_000, flags: { low: false, near_expiry: false, expired: false } }], matched_size_ids: [], rank: 0, summary: {} }],
        total: 1,
        counts: { products: 0, low: 0, near_expiry: 0, expired: 0 },
      }),
    'stock:batchesOf': () => ok([]),
    'sale:quote': (input) => {
      const price = input.price_type === 'wholesale' ? 45_000 : 50_000;
      const lines = (input.lines as { product_id: string; qty: number }[]).map((l, index) => ({
        index,
        product_id: l.product_id,
        name_en: 'Insecticide 1 L',
        name_ur: 'کیڑے مار دوا',
        pack_label: '1 L',
        base_unit: 'ml',
        pack_size: 1000,
        qty: l.qty,
        unit_price: price,
        gross: price,
        line_discount: 0,
        discount_over_limit: false,
        tax_rate_bp: 0,
        tax_amount: 0,
        line_total: price,
        batches: [{ batch_id: 'b1', batch_no: 'B-001', expiry_date: '2027-03-12', qty: l.qty, days_to_expiry: 400, near_expiry: false }],
      }));
      const total = lines.length * price;
      return ok({ ok: true, price_type: input.price_type ?? 'retail', lines, subtotal: total, tax_total: 0, total, paid_amount: total, unpaid: 0, customer: null, issues: [], today: '2026-10-12', near_expiry_days: 30, staff_max_discount_percent: 5, requires_approval: [] });
    },
    'bills:list': () => ok([]),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of, creates: () => of('customers:create') };
}
type Shell = ReturnType<typeof fakeShell>;

let T = en.pos;
let Q = en.quickAdd;
function show(shell: Shell, user: SessionUser = STAFF, language: Language = 'en') {
  T = language === 'ur' ? ur.pos : en.pos;
  Q = language === 'ur' ? ur.quickAdd : en.quickAdd;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <ToastProvider>
        <PosPage api={shell.api} user={user} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const picker = () => screen.findByRole('dialog', { name: T.customer.dialogTitle });
const form = () => screen.findByRole('dialog', { name: Q.title });
const customerName = () => document.querySelector('[data-customer-name]')!.textContent;
const clean = (t: string | null) => (t ?? '').replace(/[⁦-⁩]/g, '');
const alerts = () => [...document.querySelectorAll('[role=alert][data-code]')];

/** F4, then "New customer" with the text typed in the search box (if any). */
async function openForm(typed = '') {
  const user = userEvent.setup();
  fireEvent.keyDown(window, { key: 'F4' });
  const dialog = await picker();
  if (typed) await user.type(within(dialog).getByLabelText(T.customer.searchLabel), typed);
  await user.click(within(dialog).getByRole('button', { name: Q.newCustomer }));
  return form();
}
const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label) as HTMLInputElement;
const saveButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: new RegExp(`^(${Q.save}|${Q.saving})$`) }) as HTMLButtonElement;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('opening it', () => {
  it('F4 opens the picker; New customer is a button in it; the typed search text pre-fills the name', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Imran');
    expect(field(dialog, Q.name).value).toBe('Imran');
    expect(within(dialog).getByText(Q.lead)).toBeTruthy();
  });

  it('Enter with no match offers Add "<text>"; pressing Enter opens the form with that text as the name', async () => {
    const shell = fakeShell();
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await picker();
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText(T.customer.searchLabel), 'Zubair');
    expect(await within(dialog).findByRole('button', { name: Q.addText('Zubair') })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(field(await form(), Q.name).value).toBe('Zubair');
  });

  it('Enter does nothing while there are matches (it never adds a second Rashid by accident)', async () => {
    const shell = fakeShell();
    show(shell);
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await picker();
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText(T.customer.searchLabel), 'Rash');
    await within(dialog).findByRole('option', { name: /Rashid/ });
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: Q.title })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: Q.addText('Rash') })).toBeNull();
  });

  it('a phone number typed in the search box pre-fills the phone, not the name', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('0345 1234567');
    expect(field(dialog, Q.name).value).toBe('');
    expect(field(dialog, Q.phone).value).toBe('0345 1234567');
  });

  it('Back returns to the search, and Escape closes the whole picker; F4 opens it again', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: Q.back }));
    expect(await picker()).toBeTruthy();
    await userEvent.setup().click(within(await picker()).getByRole('button', { name: Q.newCustomer }));
    fireEvent.keyDown(await form(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'F4' });
    expect(await picker()).toBeTruthy();
  });

  it('buttons and fields are at least 44px tall by class (48px in the dialog)', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Imran');
    for (const el of [...dialog.querySelectorAll('input'), saveButton(dialog), within(dialog).getByRole('button', { name: Q.back })]) expect(el.className).toMatch(/\bh-12\b/);
  });
});

describe.each([
  ['staff', STAFF],
  ['owner', OWNER],
])('the request, as %s', (_name, user) => {
  it('is contact fields only: no credit_limit, price type, created_by, role or privileged; the same for staff and owner', async () => {
    const shell = fakeShell(user);
    show(shell, user);
    const dialog = await openForm('Imran Khan');
    const u = userEvent.setup();
    await u.type(field(dialog, Q.phone), '0321 7654321');
    await u.type(field(dialog, Q.village), 'Chak 45');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
    expect(shell.creates()[0]!.input).toEqual({ fields: { name_en: 'Imran Khan', phone: '0321 7654321', village: 'Chak 45' } });
    const text = JSON.stringify(shell.creates()[0]!.input);
    for (const word of ['credit_limit', 'default_price_type', 'created_by', 'actor', 'privileged', 'role', 'confirm_duplicate', 'father_name']) expect(text).not.toContain(word);
  });

  it('shows no credit field at all', async () => {
    const shell = fakeShell(user);
    show(shell, user);
    const dialog = await openForm('Imran');
    expect(dialog.querySelectorAll('input')).toHaveLength(3); // name, phone, village
    expect(within(dialog).queryByLabelText(/credit limit|price type/i)).toBeNull();
  });
});

describe('which name it is', () => {
  it('Latin text goes to name_en only', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
    expect(shell.creates()[0]!.input.fields).toEqual({ name_en: 'Imran' });
  });

  it('Urdu text goes to name_ur only', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm();
    const u = userEvent.setup();
    await u.type(field(dialog, Q.name), 'عمران خان');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
    expect(shell.creates()[0]!.input.fields).toEqual({ name_ur: 'عمران خان' });
  });

  it('script detection: Arabic-script letters mean Urdu, mixed text with any Urdu letter is Urdu, digits and Latin are English', () => {
    expect(hasUrduScript('راشد')).toBe(true);
    expect(hasUrduScript('Ali علی')).toBe(true);
    expect(hasUrduScript('Ali Raza 2')).toBe(false);
    expect(startForm('  راشد ')).toEqual({ name: 'راشد', phone: '', village: '' });
    expect(buildQuickAddRequest({ name: 'Ali', phone: '', village: '' }, true)).toEqual({ fields: { name_en: 'Ali' }, confirm_duplicate: true });
  });

  it('a missing name is asked for and nothing is sent', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm();
    await userEvent.setup().click(saveButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(Q.nameRequired);
    expect(shell.creates()).toHaveLength(0);
  });
});

describe('the shop default credit limit line', () => {
  it('says "No limit (set by the owner)" when the default is 0, and never "Rs 0"', async () => {
    const shell = fakeShell(STAFF, { defaultLimit: 0 });
    show(shell);
    const dialog = await openForm('Imran');
    const line = await waitFor(() => {
      const el = dialog.querySelector('[data-default-limit]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(line.textContent).toBe('Credit limit: No limit (set by the owner)');
    expect(line.textContent).toBe(Q.limitNone);
    expect(dialog.textContent).not.toMatch(/Rs\s?0\b/);
  });

  it('shows the limit with formatMoney when the default is above 0', async () => {
    const shell = fakeShell(OWNER, { defaultLimit: 500_000 });
    show(shell, OWNER);
    const dialog = await openForm('Imran');
    const line = await waitFor(() => {
      const el = dialog.querySelector('[data-default-limit]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(line.textContent).toBe('Credit limit: Rs 5,000 (set by the owner)');
    expect(line.textContent).not.toContain('No limit');
  });

  it('is a plain line, not an input, and is in Urdu in Urdu', async () => {
    const shell = fakeShell(STAFF, { defaultLimit: 0 });
    show(shell, STAFF, 'ur');
    fireEvent.keyDown(window, { key: 'F4' });
    await userEvent.setup().click(within(await picker()).getByRole('button', { name: Q.newCustomer }));
    const dialog = await form();
    await waitFor(() => expect(dialog.querySelector('[data-default-limit]')!.textContent).toBe(ur.quickAdd.limitNone));
    expect(dialog.querySelector('[data-default-limit]')!.tagName).toBe('P');
  });
});

describe('after saving', () => {
  it('the new customer is on the bill at once with the price type from the reply, and the dialog closes', async () => {
    const shell = fakeShell(STAFF, { createdPriceType: 'wholesale' });
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Imran');
    expect(screen.getByRole('radio', { name: T.wholesale }).getAttribute('aria-checked')).toBe('true');
  });

  it('a retail reply keeps retail prices', async () => {
    const shell = fakeShell(STAFF, { createdPriceType: 'retail' });
    show(shell);
    await userEvent.setup().click(screen.getByRole('radio', { name: T.wholesale }));
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('radio', { name: T.retail }).getAttribute('aria-checked')).toBe('true');
  });

  it('a bill that already has lines keeps them, priced at the new customer\'s price type', async () => {
    const shell = fakeShell(STAFF, { createdPriceType: 'wholesale' });
    show(shell);
    const u = userEvent.setup();
    await u.click(screen.getByRole('searchbox', { name: T.searchLabel }));
    await u.keyboard('insect');
    const chip = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-size=p1l]');
      expect(el).toBeTruthy();
      return el!;
    });
    await u.click(chip);
    await waitFor(() => expect(document.querySelector('[data-total]')!.textContent!.replace(/[⁦⁩]/g, '')).toBe('Rs 500'));
    const dialog = await openForm('Imran');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelectorAll('[data-line=p1l]')).toHaveLength(1);
    await waitFor(() => expect(document.querySelector('[data-total]')!.textContent!.replace(/[⁦⁩]/g, '')).toBe('Rs 450'));
    expect(shell.of('sale:quote').at(-1)!.input).toMatchObject({ price_type: 'wholesale', lines: [{ product_id: 'p1l' }] });
  });
});

describe('a customer who already exists', () => {
  const typeDuplicate = async (shell: Shell) => {
    const dialog = await openForm('Rashid');
    await userEvent.setup().click(saveButton(dialog));
    return screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
  };

  it('lists the matches; Use existing selects that customer (with their own price type) and creates nothing', async () => {
    const shell = fakeShell(STAFF, { existing: [RASHID, ADVANCE] });
    show(shell);
    const dup = await typeDuplicate(shell);
    expect(shell.creates()).toHaveLength(1);
    expect(shell.creates()[0]!.input).not.toHaveProperty('confirm_duplicate');
    expect(shell.of('customers:findDuplicates')).toHaveLength(1);
    expect(dup.querySelectorAll('[data-duplicate-row]')).toHaveLength(2);
    await userEvent.setup().click(within(dup).getByRole('button', { name: Q.useExisting('Rashid Ali') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Rashid Ali');
    expect(screen.getByRole('radio', { name: T.wholesale }).getAttribute('aria-checked')).toBe('true'); // from customers:get
    expect(shell.creates()).toHaveLength(1);
    expect(shell.of('customers:get')[0]!.input).toEqual({ customer_id: 'c9' });
  });

  it('Save as new sends the same request again with confirm_duplicate: true, then selects the new customer', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    const dup = await typeDuplicate(shell);
    await userEvent.setup().click(within(dup).getByRole('button', { name: en.customerForm.dupSaveNew }));
    await waitFor(() => expect(shell.creates()).toHaveLength(2));
    expect(shell.creates()[1]!.input).toEqual({ ...shell.creates()[0]!.input, confirm_duplicate: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Rashid');
    expect(document.body.textContent).not.toContain('Rashid Ali');
  });

  it('Cancel goes back to the form, with what was typed', async () => {
    const shell = fakeShell(STAFF);
    show(shell);
    const dup = await typeDuplicate(shell);
    await userEvent.setup().click(within(dup).getByRole('button', { name: en.customerForm.dupCancel }));
    expect(field(await form(), Q.name).value).toBe('Rashid');
    expect(shell.creates()).toHaveLength(1);
  });

  it('an advance reads "Advance Rs 500", an owing balance "Owes Rs 2,000"; never "Owes Rs -500" or a minus', async () => {
    const shell = fakeShell(STAFF, { existing: [RASHID, ADVANCE] });
    show(shell);
    const dup = await typeDuplicate(shell);
    const balances = [...dup.querySelectorAll('[data-balance]')].map((b) => clean(b.textContent));
    expect(balances).toEqual([en.customerForm.owes('Rs 2,000'), en.customerForm.advance('Rs 500')]);
    expect(dup.textContent).not.toMatch(/Owes Rs\s?-|-\s?Rs/);
  });

  it('the duplicate list is in Urdu in Urdu', async () => {
    const shell = fakeShell(STAFF, { existing: [RASHID, ADVANCE] });
    show(shell, STAFF, 'ur');
    fireEvent.keyDown(window, { key: 'F4' });
    await userEvent.setup().click(within(await picker()).getByRole('button', { name: Q.newCustomer }));
    const dialog = await form();
    await userEvent.setup().type(field(dialog, Q.name), 'Rashid');
    await userEvent.setup().click(saveButton(dialog));
    const dup = await screen.findByRole('dialog', { name: ur.customerForm.dupTitle('Rashid') });
    expect([...dup.querySelectorAll('[data-balance]')].map((b) => clean(b.textContent))).toEqual([ur.customerForm.owes('Rs 2,000'), ur.customerForm.advance('Rs 500')]);
    expect(within(dup).getByRole('button', { name: Q.useExisting('راشد') })).toBeTruthy();
  });
});

describe('saving safely', () => {
  it('a double submit creates one customer', async () => {
    let release: (v: unknown) => void = () => undefined;
    const slow = new Promise((r) => (release = r));
    const shell = fakeShell(STAFF, { createReplies: [async () => (await slow, ok({ customer: { id: 'new1', name_en: 'Imran', name_ur: null, village: null, phone: null, default_price_type: 'retail', credit_limit: 0, version: 1 }, balance: 0, no_limit: true }))] });
    show(shell);
    const dialog = await openForm('Imran');
    fireEvent.submit(dialog.querySelector('form')!);
    fireEvent.submit(dialog.querySelector('form')!);
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(saveButton(dialog).disabled).toBe(true));
    release(null);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shell.creates()).toHaveLength(1);
  });

  it('Enter in the name box saves (keyboard only)', async () => {
    const shell = fakeShell();
    show(shell);
    await openForm('Imran');
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
  });

  it('a failure shows the notice and keeps what was typed; a later attempt clears the old notice', async () => {
    const shell = fakeShell(STAFF, { createReplies: [() => fail('INTERNAL')] });
    show(shell);
    const dialog = await openForm('Rashid');
    const u = userEvent.setup();
    await u.type(field(dialog, Q.village), 'Chak 1');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(alerts()).toHaveLength(1));
    expect(alerts()[0]!.textContent).toContain(errorText('INTERNAL', {}, 'en').title);
    expect(field(dialog, Q.village).value).toBe('Chak 1');
    expect(saveButton(dialog).disabled).toBe(false);
    await u.click(saveButton(dialog)); // the second attempt answers "already exists": the old failure must not stay on screen
    await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    expect(alerts()).toHaveLength(0);
  });

  it('a failure that cannot be listed as duplicates falls back to the plain message', async () => {
    const shell = fakeShell(STAFF, {}, { 'customers:findDuplicates': () => ok([]) });
    show(shell);
    const dialog = await openForm('Rashid');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(alerts().map((a) => a.getAttribute('data-code'))).toEqual(['DUPLICATE_CUSTOMER']));
  });
});

describe('Urdu, right to left', () => {
  it('shows Urdu words in the picker button, the form and the buttons, inside a right-to-left page', async () => {
    const shell = fakeShell(STAFF, { defaultLimit: 500_000 });
    show(shell, STAFF, 'ur');
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    fireEvent.keyDown(window, { key: 'F4' });
    const pick = await picker();
    expect(within(pick).getByRole('button', { name: ur.quickAdd.newCustomer })).toBeTruthy();
    await userEvent.setup().click(within(pick).getByRole('button', { name: ur.quickAdd.newCustomer }));
    const dialog = await form();
    expect(within(dialog).getByLabelText(ur.quickAdd.name)).toBeTruthy();
    expect(within(dialog).getByLabelText(ur.quickAdd.phone)).toBeTruthy();
    expect(within(dialog).getByLabelText(ur.quickAdd.village)).toBeTruthy();
    expect(saveButton(dialog).textContent).toBe(ur.quickAdd.save);
    await waitFor(() => expect(clean(dialog.querySelector('[data-default-limit]')!.textContent)).toBe(ur.quickAdd.limitIs('Rs 5,000')));
    expect(field(dialog, ur.quickAdd.phone).getAttribute('dir')).toBe('ltr'); // a phone number is read left to right
  });

  it('Urdu typed in the name box is set right to left', async () => {
    const shell = fakeShell(STAFF);
    show(shell, STAFF, 'ur');
    fireEvent.keyDown(window, { key: 'F4' });
    await userEvent.setup().click(within(await picker()).getByRole('button', { name: ur.quickAdd.newCustomer }));
    const name = field(await form(), ur.quickAdd.name);
    await userEvent.setup().type(name, 'عمران');
    expect(name.getAttribute('dir')).toBe('rtl');
  });

  it('every quickAdd text exists in both languages', () => {
    expect(Object.keys(ur.quickAdd).sort()).toEqual(Object.keys(en.quickAdd).sort());
    for (const [key, value] of Object.entries(ur.quickAdd)) expect(typeof value, key).toBe(typeof (en.quickAdd as Record<string, unknown>)[key]);
  });
});

const NEW_CUSTOMER = (name: string) => ok({ customer: { id: 'new1', name_en: name, name_ur: null, village: null, phone: null, default_price_type: 'retail', credit_limit: 0, version: 1 }, balance: 0, no_limit: true });
/** A promise the test settles by hand, to hold a request in flight. */
function gate() {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}
const backdropOf = (dialog: HTMLElement) => dialog.parentElement!;

describe('the credit-limit line when the shop settings cannot be read', () => {
  it('says the limit is unknown, never "No limit", and still saves (the shop applies its default)', async () => {
    const shell = fakeShell(STAFF, {}, { 'customers:getSettings': () => fail('INTERNAL') });
    show(shell);
    const dialog = await openForm('Imran');
    const notice = await within(dialog).findByText(Q.limitUnknown);
    expect(notice.textContent).toBe("Could not read the shop's credit limit");
    expect(dialog.querySelector('[data-default-limit]')).toBeNull();
    expect(dialog.textContent).not.toMatch(/No limit/i);
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
    expect(shell.creates()[0]!.input).toEqual({ fields: { name_en: 'Imran' } });
  });

  it('is in Urdu in Urdu', async () => {
    const shell = fakeShell(STAFF, {}, { 'customers:getSettings': () => fail('INTERNAL') });
    show(shell, STAFF, 'ur');
    fireEvent.keyDown(window, { key: 'F4' });
    await userEvent.setup().click(within(await picker()).getByRole('button', { name: Q.newCustomer }));
    expect(await within(await form()).findByText(ur.quickAdd.limitUnknown)).toBeTruthy();
  });

  it('a failed customers:get on "Use existing" keeps the warning open, shows the error in it and puts nobody on the bill', async () => {
    const shell = fakeShell(STAFF, { existing: [RASHID, ADVANCE] }, { 'customers:get': () => fail('INTERNAL') });
    show(shell);
    const dialog = await openForm('Rashid');
    await userEvent.setup().click(saveButton(dialog));
    const dup = await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    await userEvent.setup().click(within(dup).getByRole('button', { name: Q.useExisting('Rashid Ali') }));
    await waitFor(() => expect(within(dup).getByRole('alert').getAttribute('data-code')).toBe('INTERNAL'));
    expect(screen.getByRole('dialog', { name: en.customerForm.dupTitle('Rashid') })).toBe(dup); // still open
    expect(within(dup).getByRole('button', { name: en.customerForm.dupCancel }).hasAttribute('disabled')).toBe(false); // free again
    expect(document.querySelector('[data-customer-name]')!.textContent).not.toContain('Rashid');
  });
});

describe('a name with nothing in it', () => {
  it.each([
    ['spaces', '   '],
    ['a tab and a line break', '\t\n'],
    ['a no-break space', '  '],
    ['a zero-width space', '​'],
  ])('%s is no name: the name is asked for and nothing is sent', async (_label, text) => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm();
    fireEvent.change(field(dialog, Q.name), { target: { value: text } });
    await userEvent.setup().click(saveButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(Q.nameRequired);
    expect(shell.creates()).toHaveLength(0);
  });

  it('a phone without a name is still refused', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('0345 1234567'); // a phone-like search text fills only the phone
    expect(field(dialog, Q.name).value).toBe('');
    await userEvent.setup().click(saveButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(Q.nameRequired);
    expect(shell.creates()).toHaveLength(0);
  });

  it('the request builder never makes a name out of whitespace', () => {
    expect(buildQuickAddRequest({ name: '  ', phone: '0300', village: '' }).fields).not.toHaveProperty('name_en');
    expect(buildQuickAddRequest({ name: '  ', phone: '0300', village: '' }).fields).not.toHaveProperty('name_ur');
  });
});

describe('the dialog cannot be closed while it saves', () => {
  const heldCreate = () => {
    const g = gate();
    const shell = fakeShell(STAFF, { createReplies: [async () => (await g.wait, NEW_CUSTOMER('Imran'))] });
    return { g, shell };
  };

  it('Escape and a click on the backdrop do nothing; once the answer is in the customer is on the bill', async () => {
    const { g, shell } = heldCreate();
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(saveButton(dialog).textContent).toBe(Q.saving));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(backdropOf(dialog));
    expect(screen.queryByRole('dialog', { name: Q.title })).toBe(dialog);
    g.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Imran');
  });

  it('Back is disabled while saving and the button says "Saving…"', async () => {
    const { g, shell } = heldCreate();
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(saveButton(dialog).textContent).toBe('Saving…'));
    expect((within(dialog).getByRole('button', { name: Q.back }) as HTMLButtonElement).disabled).toBe(true);
    expect(saveButton(dialog).disabled).toBe(true);
    g.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('after a failed save the dialog closes with Escape again', async () => {
    const shell = fakeShell(STAFF, { createReplies: [() => fail('INTERNAL')] });
    show(shell);
    const dialog = await openForm('Imran');
    await userEvent.setup().click(saveButton(dialog));
    await waitFor(() => expect(alerts()).toHaveLength(1));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the duplicate warning ignores Escape and the backdrop while "Use existing" is reading the customer', async () => {
    const g = gate();
    const shell = fakeShell(STAFF, { existing: [RASHID, ADVANCE] }, { 'customers:get': async () => (await g.wait, ok({ customer: { ...ADVANCE, version: 1 }, balance: ADVANCE.balance })) });
    show(shell);
    const dialog = await openForm('Rashid');
    await userEvent.setup().click(saveButton(dialog));
    const dup = await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    await userEvent.setup().click(within(dup).getByRole('button', { name: Q.useExisting('Rashid Ali') }));
    await waitFor(() => expect(shell.of('customers:get')).toHaveLength(1));
    fireEvent.keyDown(dup, { key: 'Escape' });
    fireEvent.mouseDown(backdropOf(dup));
    expect(within(dup).getByRole('button', { name: en.customerForm.dupCancel }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('dialog', { name: en.customerForm.dupTitle('Rashid') })).toBe(dup);
    g.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Rashid Ali');
  });

  it('while "Save as new" is saving, the picker cannot be closed either', async () => {
    const g = gate();
    const shell = fakeShell(STAFF);
    const original = shell.api.customers.create;
    let calls = 0;
    shell.api.customers.create = async (input) => {
      calls += 1;
      if (calls === 2) await g.wait;
      return original(input);
    };
    show(shell);
    const dialog = await openForm('Rashid');
    await userEvent.setup().click(saveButton(dialog));
    const dup = await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    await userEvent.setup().click(within(dup).getByRole('button', { name: en.customerForm.dupSaveNew }));
    await waitFor(() => expect(saveButton(dialog).textContent).toBe(Q.saving));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    g.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Rashid');
  });
});

describe('what counts as a name, a phone and Urdu', () => {
  it('detects Urdu in the Arabic Supplement range and in the presentation forms', () => {
    expect(hasUrduScript('ݐ')).toBe(true); // Arabic Supplement, first letter
    expect(hasUrduScript('ݿ')).toBe(true); // Arabic Supplement, last
    expect(hasUrduScript('ﭖ')).toBe(true); // Presentation Forms-A (peh)
    expect(hasUrduScript('ﺍ')).toBe(true); // Presentation Forms-B (alef)
    expect(hasUrduScript('ﻼ')).toBe(true); // Presentation Forms-B (lam-alef)
    expect(hasUrduScript('ࢠ')).toBe(true); // Arabic Extended-A
    expect(hasUrduScript('Ali Raza')).toBe(false);
    expect(buildQuickAddRequest({ name: 'ﺍﻟﻑ', phone: '', village: '' }).fields).toEqual({ name_ur: 'ﺍﻟﻑ' });
    expect(buildQuickAddRequest({ name: 'ݐ', phone: '', village: '' }).fields).toEqual({ name_ur: 'ݐ' });
  });

  it('phone-like text fills the phone: "+92 300" does; "Ali 12345" is a name; a single digit is a name', () => {
    expect(startForm('+92 300')).toEqual({ name: '', phone: '+92 300', village: '' });
    expect(startForm('0300-1234567')).toEqual({ name: '', phone: '0300-1234567', village: '' });
    expect(startForm('Ali 12345')).toEqual({ name: 'Ali 12345', phone: '', village: '' });
    expect(startForm('7')).toEqual({ name: '7', phone: '', village: '' });
    expect(startForm('1234')).toEqual({ name: '1234', phone: '', village: '' }); // under 5 characters: not a phone
  });

  it('the typed phone is trimmed in the request', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Imran');
    const u = userEvent.setup();
    await u.type(field(dialog, Q.phone), '  0321 7654321  ');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(shell.creates()).toHaveLength(1));
    expect(shell.creates()[0]!.input).toEqual({ fields: { name_en: 'Imran', phone: '0321 7654321' } });
  });

  it('the duplicate check is asked with the typed name AND phone', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Rashid');
    await userEvent.setup().type(field(dialog, Q.phone), '0300 1112223');
    await userEvent.setup().click(saveButton(dialog));
    await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    expect(shell.of('customers:findDuplicates')[0]!.input).toEqual({ name_en: 'Rashid', phone: '0300 1112223' });
  });
});

describe('moving around the picker', () => {
  it('Back keeps the typed search text and the customer that was chosen', async () => {
    const shell = fakeShell();
    show(shell);
    const u = userEvent.setup();
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await picker();
    await u.type(within(dialog).getByLabelText(T.customer.searchLabel), 'Rash');
    await u.click(await within(dialog).findByRole('option', { name: /Rashid/ }));
    await u.click(within(dialog).getByRole('button', { name: Q.newCustomer }));
    await u.click(within(await form()).getByRole('button', { name: Q.back }));
    const again = await picker();
    expect((within(again).getByLabelText(T.customer.searchLabel) as HTMLInputElement).value).toBe('Rash');
    expect((await within(again).findByRole('option', { name: /Rashid/ })).getAttribute('aria-selected')).toBe('true');
  });

  it('the duplicate Cancel keeps every field that was typed', async () => {
    const shell = fakeShell();
    show(shell);
    const dialog = await openForm('Rashid');
    const u = userEvent.setup();
    await u.type(field(dialog, Q.phone), '0300 5551234');
    await u.type(field(dialog, Q.village), 'Chak 77');
    await u.click(saveButton(dialog));
    const dup = await screen.findByRole('dialog', { name: en.customerForm.dupTitle('Rashid') });
    await u.click(within(dup).getByRole('button', { name: en.customerForm.dupCancel }));
    const back = await form();
    expect([field(back, Q.name).value, field(back, Q.phone).value, field(back, Q.village).value]).toEqual(['Rashid', '0300 5551234', 'Chak 77']);
    expect(shell.creates()).toHaveLength(1);
  });

  it("a customer already on the bill is REPLACED by the new one, at the new customer's price type", async () => {
    const shell = fakeShell(STAFF, { createdPriceType: 'wholesale' });
    show(shell);
    const u = userEvent.setup();
    fireEvent.keyDown(window, { key: 'F4' });
    const first = await picker();
    await u.type(within(first).getByLabelText(T.customer.searchLabel), 'Rash');
    await u.click(await within(first).findByRole('option', { name: /Rashid/ }));
    await u.click(within(first).getByRole('button', { name: T.customer.use('Rashid') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Rashid');
    expect(screen.getByRole('radio', { name: T.retail }).getAttribute('aria-checked')).toBe('true');
    const dialog = await openForm('Imran');
    await u.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(customerName()).toBe('Imran');
    expect(document.body.textContent).not.toContain('Rashid');
    expect(screen.getByRole('radio', { name: T.wholesale }).getAttribute('aria-checked')).toBe('true');
  });

  it('opening F4 again starts with an empty search', async () => {
    const shell = fakeShell();
    show(shell);
    const u = userEvent.setup();
    fireEvent.keyDown(window, { key: 'F4' });
    const first = await picker();
    await u.type(within(first).getByLabelText(T.customer.searchLabel), 'Rash');
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'F4' });
    expect((within(await picker()).getByLabelText(T.customer.searchLabel) as HTMLInputElement).value).toBe('');
  });

  it('the Add "text" button opens the form with that text as the name', async () => {
    const shell = fakeShell();
    show(shell);
    const u = userEvent.setup();
    fireEvent.keyDown(window, { key: 'F4' });
    const dialog = await picker();
    await u.type(within(dialog).getByLabelText(T.customer.searchLabel), 'Zubair');
    await u.click(await within(dialog).findByRole('button', { name: Q.addText('Zubair') }));
    expect(field(await form(), Q.name).value).toBe('Zubair');
  });
});

describe('source of the quick-add files', () => {
  const dir = join(__dirname, '../src/pages/pos');
  const files = readdirSync(dir).filter((f) => f.startsWith('customer-quick-add') || f === 'customer-dialog.tsx');
  it('uses logical classes only: no left, right, ml, mr, pl or pr', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    const bad = /(^|[\s"'`:])(-?(ml|mr|pl|pr)-\S+|(text|float|border|rounded)-(left|right|l|r)\b\S*|(left|right)-\S+)/;
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      for (const s of scanSource(readFileSync(join(dir, f), 'utf8')).strings) expect(bad.test(s), `${f}: ${s}`).toBe(false);
    }
  });
  it('writes no credit field, user, role or cost into a request', () => {
    for (const f of files.filter((x) => x.startsWith('customer-quick-add'))) {
      const code = scanSource(readFileSync(join(dir, f), 'utf8')).code;
      expect(code, f).not.toMatch(/\bcredit_limit|default_price_type: |created_by|actor|privileged|\bcost\b|margin|profit/);
    }
  });
});
