// @vitest-environment jsdom
// The customer form (add and edit), the duplicate warning and the Customers settings section, driven the way people drive them,
// against a fake API built with the real client code. The wording is READ from docs/design/CustomerForms.dc.html and looked for on the
// RENDERED page (not just checked to exist in the design file).
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { formatMoney } from '../src/i18n/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { CustomerFormPage } from '../src/pages/customers/form/customer-form-page.js';
import { SettingsPage } from '../src/pages/settings/settings-page.js';

// The whole suite runs in parallel with very heavy files: give each wait longer than the 1 s default so a busy machine is not a failure.
configure({ asyncUtilTimeout: 5000 });

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

// ---- the design's own words ----

const designHtml = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'design', 'CustomerForms.dc.html'), 'utf8');
const designNodes = [...designHtml.matchAll(/>([^<>]+)</g)].map((x) => x[1]!.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
/** The design's text node that starts with `start` (exactly as drawn), so the test never types the wording itself. */
const drawn = (start: string): string => {
  const hit = designNodes.find((t) => t === start || t.startsWith(start));
  if (!hit) throw new Error(`the design has no text starting with "${start}"`);
  return hit;
};

// ---- fixtures ----

const customer = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name_en: 'Rashid Ali',
  name_ur: 'راشد علی',
  phone: '0300 1234567',
  village: 'Chak 12',
  credit_limit: 1_000_000,
  default_price_type: 'wholesale',
  notes: 'Pays after harvest',
  father_name: null,
  cnic: null,
  phone2: null,
  guarantor: null,
  version: 3,
  ...over,
});
const summary = (c = customer(), over: Record<string, unknown> = {}) => ({ customer: c, balance: 200_000, credit_left: 800_000, no_limit: false, over_limit: false, next_due: null, overdue_amount: 0, overdue_days: 0, ...over });
const dup = (over: Record<string, unknown> = {}) => ({ customer_id: 'cOld', name_en: 'Rashid Ali', name_ur: null, village: 'Chak 12', phone: '0300 1234567', balance: 900_000, same_name: true, same_phone: true, ...over });

type Handler = (input: any) => unknown;
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

function fakeShell(options: { settings?: Record<string, unknown>; stored?: Record<string, unknown>; override?: Partial<Record<Channel, Handler>> } = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { settings: { default_credit_limit: 0, show_farmer_fields: false, ...options.settings }, stored: customer(options.stored) };
  const handlers: Partial<Record<Channel, Handler>> = {
    'customers:getSettings': () => ({ ok: true, data: state.settings }),
    'customers:setSettings': (input) => {
      state.settings = { ...state.settings, ...input };
      return { ok: true, data: state.settings };
    },
    'customers:get': () => ({ ok: true, data: summary(state.stored as ReturnType<typeof customer>) }),
    'customers:create': () => ({ ok: true, data: summary(customer({ id: 'cNew' })) }),
    'customers:update': (input) => {
      state.stored = { ...state.stored, ...input.fields, version: (state.stored.version as number) + 1 };
      return { ok: true, data: summary(state.stored as ReturnType<typeof customer>) };
    },
    'customers:setTerms': (input) => {
      const { customer_id: _id, expected_version: _v, ...rest } = input;
      state.stored = { ...state.stored, ...rest, version: (state.stored.version as number) + 1 };
      return { ok: true, data: { customer: summary(state.stored as ReturnType<typeof customer>), changed: ['credit_limit'], below_balance: false } };
    },
    'customers:findDuplicates': () => ({ ok: true, data: [dup()] }),
    ...options.override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : fail('INTERNAL');
  });
  const of = (channel: Channel) => calls.filter((c) => c.channel === channel);
  return { api, calls, state, of };
}

function CustomerPage() {
  const { id } = useParams();
  return <p>the customer page {id}</p>;
}

function show(shell: ReturnType<typeof fakeShell>, path: string, user: SessionUser = OWNER, language: Language = 'en') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <Routes>
            <Route path="/customers" element={<p>the customer list</p>} />
            <Route path="/customers/new" element={<CustomerFormPage api={shell.api} user={user} />} />
            <Route path="/customers/:id/edit" element={<CustomerFormPage api={shell.api} user={user} />} />
            <Route path="/customers/:id" element={<CustomerPage />} />
            <Route path="/settings" element={<SettingsPage api={shell.api} user={user} />} />
          </Routes>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const f = en.customerForm;
const newForm = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en') => {
  show(shell, '/customers/new', user, language);
  await screen.findByLabelText(drawn('Name (English)').replace('Name (English)', language === 'ur' ? ur.customerForm.nameEn : 'Name (English)'));
  return shell;
};
const editForm = async (shell = fakeShell(), user: SessionUser = OWNER) => {
  show(shell, '/customers/c1/edit', user);
  await screen.findByDisplayValue('Rashid Ali');
  return shell;
};
const nameEn = () => screen.getByLabelText(drawn('Name (English)')) as HTMLInputElement;
const saveBtn = () => screen.getByRole('button', { name: drawn('Save customer') });
const click = (el: HTMLElement) => fireEvent.click(el);

afterEach(cleanup);

// ---------- the words, as drawn ----------

describe('the form shows the design\'s words', () => {
  it('owner: every label and button of section 1, read from the design file, is on the rendered page', async () => {
    const shell = await newForm();
    for (const label of ['Name (English)', 'نام (اردو)', 'Phone', 'Village', 'Credit limit', 'Notes']) expect(screen.getByLabelText(drawn(label)), label).toBeTruthy();
    expect(screen.getByText(drawn('Default price type'))).toBeTruthy();
    expect(screen.getByRole('radio', { name: drawn('Retail') })).toBeTruthy();
    expect(screen.getByRole('radio', { name: drawn('Wholesale') })).toBeTruthy();
    expect(screen.getByText(drawn('0 = no limit'))).toBeTruthy();
    expect(screen.getByRole('button', { name: drawn('Save customer') })).toBeTruthy();
    expect(screen.getAllByText(drawn('Cancel')).length).toBeGreaterThan(0);
    expect(shell.of('customers:getSettings')).toHaveLength(1);
  });

  it('the farmer labels (design: Father\'s name, CNIC, Second phone) are on the page once the block is opened', async () => {
    await newForm(fakeShell({ settings: { show_farmer_fields: true } }));
    click(screen.getByRole('button', { name: f.addFarmer }));
    for (const label of ["Father's name", 'CNIC', 'Second phone']) expect(screen.getByLabelText(drawn(label)), label).toBeTruthy();
  });
});

// ---------- staff and owner ----------

describe('staff and owner see different forms', () => {
  it('staff have no terms inputs, a note says the owner sets the limit, and the shop default is shown read-only', async () => {
    await newForm(fakeShell({ settings: { default_credit_limit: 500_000 } }), STAFF);
    expect(screen.queryByLabelText(f.creditLimit)).toBeNull();
    expect(screen.queryByRole('radio', { name: f.retail })).toBeNull();
    expect(screen.queryByText(f.priceType)).toBeNull();
    const note = document.querySelector('[data-staff-limit-note]')!;
    expect(note.textContent).toContain(f.staffLimitNote);
    expect(note.textContent).toContain(f.staffDefaultLimit('Rs 5,000'));
  });

  it('staff: a default limit of 0 shows the loud "No limit" wording', async () => {
    await newForm(fakeShell({ settings: { default_credit_limit: 0 } }), STAFF);
    expect(document.querySelector('[data-no-limit]')!.textContent).toBe(f.noLimit);
  });

  it('staff create sends contact fields only: no credit_limit, no price type, no farmer field, no user', async () => {
    const shell = await newForm(fakeShell({ settings: { show_farmer_fields: true } }), STAFF);
    set(nameEn(), '  Imran ');
    set(screen.getByLabelText(f.phone), '0321 7654321');
    set(screen.getByLabelText(f.village), 'Chak 45');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input).toEqual({ fields: { name_en: 'Imran', phone: '0321 7654321', village: 'Chak 45' } });
    expect(shell.of('customers:setTerms')).toHaveLength(0);
  });

  it('owner create sends the limit in paisa (typed in rupees), the price type, and no user or role', async () => {
    const shell = await newForm(fakeShell({ settings: { default_credit_limit: 500_000 } }));
    expect((screen.getByLabelText(f.creditLimit) as HTMLInputElement).value).toBe('5,000'); // starts with the shop default
    set(nameEn(), 'Imran');
    set(screen.getByLabelText(f.creditLimit), '10,000');
    click(screen.getByRole('radio', { name: f.wholesale }));
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    const sent = shell.of('customers:create')[0]!.input;
    expect(sent).toEqual({ fields: { name_en: 'Imran', credit_limit: 1_000_000, default_price_type: 'wholesale' } });
    expect(JSON.stringify(sent)).not.toMatch(/created_by|actor|user_id|privileged|role/);
  });

  it('after a save: a toast, and the customer page', async () => {
    await newForm();
    set(nameEn(), 'Imran');
    click(saveBtn());
    expect(await screen.findByText('the customer page cNew')).toBeTruthy(); // the route change is a transition: it can land after the toast
    expect(screen.getByText(f.saved)).toBeTruthy();
  });
});

// ---------- farmer details ----------

describe('farmer details', () => {
  it('are not on the page while the shop setting is off', async () => {
    await newForm(fakeShell({ settings: { show_farmer_fields: false } }));
    expect(screen.queryByRole('button', { name: f.addFarmer })).toBeNull();
    expect(screen.queryByLabelText(f.fatherName)).toBeNull();
  });

  it('are collapsed behind "Add farmer details" while the setting is on, and sent with the create', async () => {
    const shell = await newForm(fakeShell({ settings: { show_farmer_fields: true } }));
    expect(screen.queryByLabelText(f.fatherName)).toBeNull();
    click(screen.getByRole('button', { name: f.addFarmer }));
    set(screen.getByLabelText(f.fatherName), 'Muhammad Ali');
    set(screen.getByLabelText(f.guarantor), 'Imran');
    set(nameEn(), 'Ali');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input.fields).toMatchObject({ father_name: 'Muhammad Ali', guarantor: 'Imran' });
  });

  it('staff never see them, even with the setting on', async () => {
    await newForm(fakeShell({ settings: { show_farmer_fields: true } }), STAFF);
    expect(screen.queryByRole('button', { name: f.addFarmer })).toBeNull();
  });

  it('an edit opens the block by itself when the customer has details saved', async () => {
    await editForm(fakeShell({ settings: { show_farmer_fields: true }, stored: { father_name: 'Muhammad Ali' } }));
    expect((screen.getByLabelText(f.fatherName) as HTMLInputElement).value).toBe('Muhammad Ali');
  });
});

// ---------- duplicate warning ----------

describe('the duplicate warning', () => {
  const duplicateThenOk = () => {
    let first = true;
    return fakeShell({
      override: {
        'customers:create': () => {
          if (first) {
            first = false;
            return fail('DUPLICATE_CUSTOMER', { count: 1 });
          }
          return { ok: true, data: summary(customer({ id: 'cNew' })) };
        },
      },
    });
  };
  const trigger = async (shell: ReturnType<typeof fakeShell>) => {
    await newForm(shell);
    set(nameEn(), 'Rashid Ali');
    set(screen.getByLabelText(f.phone), '0300 1234567');
    click(saveBtn());
    return await screen.findByRole('dialog');
  };

  it('lists the match with the design\'s words and both buttons', async () => {
    const dialog = await trigger(duplicateThenOk());
    const d = within(dialog);
    expect(d.getByText(drawn('A customer named Rashid Ali is already saved.'))).toBeTruthy();
    expect(d.getByText(drawn("If this is another person, add the village or father's name"))).toBeTruthy();
    expect(d.getByRole('button', { name: drawn('Open existing Rashid Ali') + ' (Chak 12 · 0300 1234567)' })).toBeTruthy();
    expect(d.getByRole('button', { name: drawn('Save as new') })).toBeTruthy();
    expect(d.getByRole('button', { name: drawn('Cancel') })).toBeTruthy();
    const row = dialog.querySelector('[data-duplicate-row]')!;
    expect(row.textContent).toContain('Rashid Ali · Chak 12 · 0300 1234567');
    expect(row.querySelector('[data-balance]')!.textContent).toBe(drawn('Owes Rs 9,000'));
  });

  it('Save as new sends the same request again with confirm_duplicate: true', async () => {
    const shell = duplicateThenOk();
    const dialog = await trigger(shell);
    click(within(dialog).getByRole('button', { name: f.dupSaveNew }));
    await screen.findByText('the customer page cNew');
    const sends = shell.of('customers:create').map((c) => c.input);
    expect(sends).toHaveLength(2);
    expect(sends[0]).not.toHaveProperty('confirm_duplicate');
    expect(sends[1]).toEqual({ ...sends[0], confirm_duplicate: true });
  });

  it('Open existing goes to that customer and saves nothing', async () => {
    const shell = duplicateThenOk();
    const dialog = await trigger(shell);
    click(within(dialog).getByRole('button', { name: f.dupOpen('Rashid Ali (Chak 12 · 0300 1234567)') }));
    expect(await screen.findByText('the customer page cOld')).toBeTruthy();
    expect(shell.of('customers:create')).toHaveLength(1);
  });

  it('Cancel goes back to the form with what was typed, and saving stays possible', async () => {
    const shell = duplicateThenOk();
    const dialog = await trigger(shell);
    click(within(dialog).getByRole('button', { name: f.dupCancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nameEn().value).toBe('Rashid Ali');
  });

  it('an advance is "Advance Rs X", never a negative amount', async () => {
    const shell = fakeShell({ override: { 'customers:create': () => fail('DUPLICATE_CUSTOMER'), 'customers:findDuplicates': () => ({ ok: true, data: [dup({ balance: -50_000 })] }) } });
    const dialog = await trigger(shell);
    const text = dialog.querySelector('[data-balance]')!.textContent!;
    expect(text).toBe(f.advance('Rs 500'));
    expect(text).not.toMatch(/-/);
    expect(dialog.textContent).not.toMatch(/Rs -|-Rs/);
  });
});

// ---------- edit ----------

describe('edit', () => {
  it('loads the customer, sends only what changed with expected_version, and goes to the customer page', async () => {
    const shell = await editForm(fakeShell(), STAFF);
    set(screen.getByLabelText(f.village), '  Chak 13 ');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')[0]!.input).toEqual({ customer_id: 'c1', fields: { village: 'Chak 13' }, expected_version: 3 });
    expect(shell.of('customers:setTerms')).toHaveLength(0);
  });

  it('owner: terms go through setTerms with the version the update returned', async () => {
    const shell = await editForm();
    set(screen.getByLabelText(f.village), 'Chak 13');
    set(screen.getByLabelText(f.creditLimit), '12500.50');
    click(screen.getByRole('radio', { name: f.retail }));
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')[0]!.input.expected_version).toBe(3);
    expect(shell.of('customers:setTerms')[0]!.input).toEqual({ customer_id: 'c1', credit_limit: 1_250_050, default_price_type: 'retail', expected_version: 4 });
  });

  it('the credit limit is shown with thousands separators while typing and after leaving the box, and the request is still exact paisa', async () => {
    const shell = await editForm();
    const box = screen.getByLabelText(f.creditLimit) as HTMLInputElement;
    set(box, '20000');
    expect(box.value).toBe('20,000'); // grouped as it is typed
    set(box, '20,000'); // typed with the comma: the same amount, the same text
    expect(box.value).toBe('20,000');
    set(box, '20000.5');
    expect(box.value).toBe('20,000.5'); // the half-typed paisa are left alone under the cursor
    fireEvent.blur(box);
    expect(box.value).toBe('20,000.50'); // tidied on leaving
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:setTerms')[0]!.input).toMatchObject({ customer_id: 'c1', credit_limit: 2_000_050 });
  });

  it('typing 20,000 sends exactly 2,000,000 paisa; text that is not an amount is left as typed and is refused', async () => {
    const shell = await editForm();
    const box = screen.getByLabelText(f.creditLimit) as HTMLInputElement;
    set(box, '20,000');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:setTerms')[0]!.input.credit_limit).toBe(2_000_000);
    cleanup();
    await editForm();
    const again = screen.getByLabelText(f.creditLimit) as HTMLInputElement;
    set(again, '2o,000');
    expect(again.value).toBe('2o,000');
    fireEvent.blur(again);
    expect(again.value).toBe('2o,000');
  });

  it('owner: only terms changed sends no update, and no farmer field the shop hides', async () => {
    const shell = await editForm();
    set(screen.getByLabelText(f.creditLimit), '0');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')).toHaveLength(0);
    expect(shell.of('customers:setTerms')[0]!.input).toEqual({ customer_id: 'c1', credit_limit: 0, default_price_type: 'wholesale', expected_version: 3 });
  });

  it('staff: the edit has no terms, and their note shows this customer\'s limit', async () => {
    await editForm(fakeShell(), STAFF);
    expect(document.querySelector('[data-staff-limit-note]')!.textContent).toContain(f.staffCustomerLimit('Rs 10,000'));
  });

  it('a version conflict shows the calm notice with a Reload button that loads the customer again', async () => {
    const shell = fakeShell({ override: { 'customers:update': () => fail('VERSION_CONFLICT', { expected_version: 3, current_version: 4 }) } });
    await editForm(shell);
    set(screen.getByLabelText(f.village), 'Chak 13');
    click(saveBtn());
    const notice = await screen.findByText(f.conflictTitle);
    expect(notice).toBeTruthy();
    expect(document.querySelector('[data-code]')).toBeNull(); // the calm notice, not the red error box
    shell.state.stored = customer({ village: 'Chak 99', version: 4 });
    click(screen.getByRole('button', { name: f.reload }));
    await waitFor(() => expect((screen.getByLabelText(f.village) as HTMLInputElement).value).toBe('Chak 99'));
    expect(screen.queryByText(f.conflictTitle)).toBeNull();
  });

  it('below_balance after setTerms: a warning toast, not an error', async () => {
    const shell = fakeShell({
      override: {
        'customers:setTerms': () => ({ ok: true, data: { customer: summary(), changed: ['credit_limit'], below_balance: true } }),
      },
    });
    await editForm(shell);
    set(screen.getByLabelText(f.creditLimit), '100');
    click(saveBtn());
    expect(await screen.findByText('the customer page c1')).toBeTruthy();
    expect(screen.getByText(f.belowBalance)).toBeTruthy();
  });

  it('no below_balance warning when the shell says false', async () => {
    await editForm();
    set(screen.getByLabelText(f.creditLimit), '100');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(screen.queryByText(f.belowBalance)).toBeNull();
  });

  it('a customer that does not exist says so', async () => {
    show(fakeShell({ override: { 'customers:get': () => fail('NOT_FOUND') } }), '/customers/zz/edit');
    expect(await screen.findByText(f.notFound)).toBeTruthy();
  });
});

// ---------- validation ----------

describe('validation', () => {
  it('no name at all: an inline message, nothing sent; writing a name clears it at once', async () => {
    const shell = await newForm();
    click(saveBtn());
    expect(await screen.findByText(f.problems.name)).toBeTruthy();
    expect(shell.of('customers:create')).toHaveLength(0);
    expect(nameEn().getAttribute('aria-invalid')).toBe('true');
    set(nameEn(), 'A');
    await waitFor(() => expect(screen.queryByText(f.problems.name)).toBeNull());
  });

  it('an Urdu name alone is enough', async () => {
    const shell = await newForm();
    set(screen.getByLabelText(f.nameUr), 'راشد');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input.fields).toEqual({ name_ur: 'راشد', credit_limit: 0, default_price_type: 'retail' });
  });

  it.each(['-5', 'abc', '1e3', '', '12.345', '10 000 000 000'])('a credit limit of "%s" is refused inline and nothing is sent', async (typed) => {
    const shell = await newForm();
    set(nameEn(), 'A');
    set(screen.getByLabelText(f.creditLimit), typed);
    click(saveBtn());
    expect(await screen.findByText(f.problems.creditLimit)).toBeTruthy();
    expect(shell.of('customers:create')).toHaveLength(0);
    set(screen.getByLabelText(f.creditLimit), '100');
    await waitFor(() => expect(screen.queryByText(f.problems.creditLimit)).toBeNull());
  });

  it('a stale save error goes away when the form is edited', async () => {
    const shell = fakeShell({ override: { 'customers:create': () => fail('FIELD_NOT_ALLOWED') } });
    await newForm(shell);
    set(nameEn(), 'A');
    click(saveBtn());
    await screen.findByRole('alert');
    expect(document.querySelector('[data-code=FIELD_NOT_ALLOWED]')).toBeTruthy();
    // a new save clears the old message before the answer comes
    shell.state.settings = { ...shell.state.settings };
    set(nameEn(), '');
    click(saveBtn());
    await screen.findByText(f.problems.name);
    expect(document.querySelector('[data-code=FIELD_NOT_ALLOWED]')).toBeNull();
  });
});

// ---------- Urdu, direction, cost ----------

// ---------- hardening ----------

function gate() {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}

describe('a name with nothing in it', () => {
  it.each([
    ['spaces', '   ', ''],
    ['spaces in both boxes', '  ', '  '],
    ['a zero-width space', '​', ''],
    ['a tab and a line break', '\t\n', ' '],
  ])('%s is no name: the message shows and nothing is sent', async (_label, english, urdu) => {
    const shell = await newForm();
    set(nameEn(), english);
    set(screen.getByLabelText(f.nameUr), urdu);
    click(saveBtn());
    expect(await screen.findByText(f.problems.name)).toBeTruthy();
    expect(shell.of('customers:create')).toHaveLength(0);
  });

  it('blank English with a real Urdu name saves the Urdu name only', async () => {
    const shell = await newForm();
    set(nameEn(), '   ');
    set(screen.getByLabelText(f.nameUr), ' راشد ');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input.fields).toEqual({ name_ur: 'راشد', credit_limit: 0, default_price_type: 'retail' });
  });
});

describe('what staff can and cannot send', () => {
  it('a staff edit never calls setTerms, even for a customer whose limit the form cannot show as an amount', async () => {
    // 10^11 paisa is more digits than the limit box accepts: an owner-style terms check would see a change and send one
    const shell = fakeShell({ stored: { credit_limit: 100_000_000_000 } });
    await editForm(shell, STAFF);
    set(screen.getByLabelText(f.village), 'Chak 13');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')).toHaveLength(1);
    expect(shell.of('customers:setTerms')).toHaveLength(0);
    expect(JSON.stringify(shell.of('customers:update')[0]!.input)).not.toMatch(/credit_limit|price_type/);
  });

  it('a staff create carries no terms, farmer details or confirm flag', async () => {
    const shell = await newForm(fakeShell({ settings: { default_credit_limit: 500_000, show_farmer_fields: true } }), STAFF);
    set(nameEn(), 'Imran');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input).toEqual({ fields: { name_en: 'Imran' } });
    expect(shell.of('customers:setTerms')).toHaveLength(0);
  });
});

describe('edit: what is sent, and what happens when only half is saved', () => {
  it('when the update works and setTerms fails, the form stays, reloads what is saved and says so', async () => {
    const shell = fakeShell({ override: { 'customers:setTerms': () => fail('INTERNAL') } });
    await editForm(shell);
    set(screen.getByLabelText(f.village), 'Chak 99');
    set(screen.getByLabelText(f.creditLimit), '2500');
    click(saveBtn());
    expect(await screen.findByText(f.partial)).toBeTruthy();
    expect(document.querySelector('[data-code=INTERNAL]')).toBeTruthy();
    expect(shell.of('customers:update')).toHaveLength(1);
    expect(shell.of('customers:get').length).toBeGreaterThanOrEqual(2); // loaded again
    expect(screen.queryByText('the customer page c1')).toBeNull(); // did not leave the form
    await waitFor(() => expect((screen.getByLabelText(f.village) as HTMLInputElement).value).toBe('Chak 99')); // what was saved
    expect((screen.getByLabelText(f.creditLimit) as HTMLInputElement).value).toBe('10,000'); // the terms were not saved
  });

  it('a failed update alone (nothing written) is not called partial', async () => {
    const shell = fakeShell({ override: { 'customers:update': () => fail('INTERNAL') } });
    await editForm(shell);
    set(screen.getByLabelText(f.village), 'Chak 99');
    click(saveBtn());
    await screen.findByRole('alert');
    expect(screen.queryByText(f.partial)).toBeNull();
    expect(shell.of('customers:setTerms')).toHaveLength(0);
  });

  it('setTerms is sent with the version from the update reply, not a guess', async () => {
    const shell = fakeShell({
      override: {
        'customers:update': () => ({ ok: true, data: summary(customer({ village: 'Chak 13', version: 9 })) }),
      },
    });
    await editForm(shell);
    set(screen.getByLabelText(f.village), 'Chak 13');
    set(screen.getByLabelText(f.creditLimit), '2500');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:setTerms')[0]!.input.expected_version).toBe(9);
  });

  it('notes are sent on update (and null when cleared)', async () => {
    const shell = await editForm();
    set(screen.getByLabelText(f.notes), '  Pays on Friday ');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')[0]!.input).toEqual({ customer_id: 'c1', fields: { notes: 'Pays on Friday' }, expected_version: 3 });
    cleanup();
    const second = await editForm();
    set(screen.getByLabelText(f.notes), '');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(second.of('customers:update')[0]!.input.fields).toEqual({ notes: null });
  });

  it('a price-type-only change sends setTerms (with the limit unchanged) and no update', async () => {
    const shell = await editForm();
    click(screen.getByRole('radio', { name: f.retail }));
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')).toHaveLength(0);
    expect(shell.of('customers:setTerms')[0]!.input).toEqual({ customer_id: 'c1', credit_limit: 1_000_000, default_price_type: 'retail', expected_version: 3 });
  });

  it('nothing changed sends nothing at all', async () => {
    const shell = await editForm();
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:update')).toHaveLength(0);
    expect(shell.of('customers:setTerms')).toHaveLength(0);
  });
});

describe('saving safely', () => {
  it('a double submit creates one customer; Save is disabled and says Saving… while it runs', async () => {
    const g = gate();
    const shell = fakeShell({ override: { 'customers:create': async () => (await g.wait, { ok: true, data: summary(customer({ id: 'cNew' })) }) } });
    await newForm(shell);
    set(nameEn(), 'Imran');
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    click(screen.getByRole('button', { name: f.saving }));
    await waitFor(() => expect((screen.getByRole('button', { name: f.saving }) as HTMLButtonElement).disabled).toBe(true));
    g.release();
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')).toHaveLength(1);
  });

  it('"Save as new" closes the warning at once and sends the request again once', async () => {
    const g = gate();
    let calls = 0;
    const shell = fakeShell({
      override: {
        'customers:create': async () => {
          calls += 1;
          if (calls === 1) return fail('DUPLICATE_CUSTOMER', { count: 1 });
          await g.wait;
          return { ok: true, data: summary(customer({ id: 'cNew' })) };
        },
      },
    });
    await newForm(shell);
    set(nameEn(), 'Rashid Ali');
    click(saveBtn());
    const dialog = await screen.findByRole('dialog');
    click(within(dialog).getByRole('button', { name: f.dupSaveNew }));
    await waitFor(() => expect(shell.of('customers:create')).toHaveLength(2));
    expect(screen.queryByRole('dialog')).toBeNull(); // the matches are cleared while it saves
    g.release();
    await screen.findByText('the customer page cNew');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shell.of('customers:create')).toHaveLength(2);
  });
});

describe('farmer details: the toggle and the trimming', () => {
  const farmerShell = () => fakeShell({ settings: { show_farmer_fields: true } });

  it('the button opens and closes the block; what was typed is kept while it is closed', async () => {
    await newForm(farmerShell());
    const toggle = () => screen.getByRole('button', { name: new RegExp(`^(${f.addFarmer}|${f.hideFarmer})$`) });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toBe(f.addFarmer);
    click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toBe(f.hideFarmer);
    set(screen.getByLabelText(f.fatherName), 'Muhammad Ali');
    click(toggle());
    expect(screen.queryByLabelText(f.fatherName)).toBeNull();
    click(toggle());
    expect((screen.getByLabelText(f.fatherName) as HTMLInputElement).value).toBe('Muhammad Ali');
  });

  it('create: blank farmer boxes are not sent, typed ones are trimmed', async () => {
    const shell = await newForm(farmerShell());
    click(screen.getByRole('button', { name: f.addFarmer }));
    set(screen.getByLabelText(f.fatherName), '   ');
    set(screen.getByLabelText(f.cnic), '  35202-1234567-1  ');
    set(screen.getByLabelText(f.phone2), ' ');
    set(screen.getByLabelText(f.guarantor), '\t');
    set(nameEn(), 'Ali');
    click(saveBtn());
    await screen.findByText('the customer page cNew');
    expect(shell.of('customers:create')[0]!.input.fields).toEqual({ name_en: 'Ali', credit_limit: 0, default_price_type: 'retail', cnic: '35202-1234567-1' });
  });

  it('edit: whitespace typed into an empty farmer box is no change (nothing is sent)', async () => {
    const shell = await editForm(farmerShell());
    click(screen.getByRole('button', { name: f.addFarmer }));
    set(screen.getByLabelText(f.fatherName), '   ');
    set(screen.getByLabelText(f.cnic), ' ');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:setTerms')).toHaveLength(0);
    expect(shell.of('customers:update')).toHaveLength(0);
  });

  it('edit: a CNIC with spaces round it is sent trimmed', async () => {
    const shell = await editForm(farmerShell());
    click(screen.getByRole('button', { name: f.addFarmer }));
    set(screen.getByLabelText(f.cnic), '  35202-1  ');
    click(saveBtn());
    await screen.findByText('the customer page c1');
    expect(shell.of('customers:setTerms')[0]!.input).toMatchObject({ cnic: '35202-1' });
  });
});

describe('one form per customer', () => {
  function Nav({ to }: { to: string }) {
    const go = useNavigate();
    return (
      <button type="button" onClick={() => go(to)}>
        go {to}
      </button>
    );
  }
  const other = (id: string) => (id === 'c2' ? customer({ id: 'c2', name_en: 'Zahid', name_ur: null, phone: null, village: 'Kot', notes: null, credit_limit: 300_000, default_price_type: 'retail' }) : customer());
  function Harness({ shell, start }: { shell: ReturnType<typeof fakeShell>; start: string }) {
    return (
      <MemoryRouter initialEntries={[start]}>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <ToastProvider>
            <Routes>
              <Route path="/customers/new" element={<><Nav to="/customers/c2/edit" /><CustomerFormPage api={shell.api} user={OWNER} /></>} />
              <Route path="/customers/:id/edit" element={<><Nav to="/customers/c2/edit" /><Nav to="/customers/new" /><CustomerFormPage api={shell.api} user={OWNER} /></>} />
            </Routes>
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>
    );
  }
  const shellFor = () => fakeShell({ override: { 'customers:get': (input: { customer_id: string }) => ({ ok: true, data: summary(other(input.customer_id) as ReturnType<typeof customer>) }) } });

  it('going from one customer to another shows the other customer and nothing that was typed', async () => {
    const shell = shellFor();
    render(<Harness shell={shell} start="/customers/c1/edit" />);
    await screen.findByDisplayValue('Rashid Ali');
    set(screen.getByLabelText(f.village), 'typed but not saved');
    set(screen.getByLabelText(f.notes), 'typed notes');
    click(screen.getByRole('button', { name: 'go /customers/c2/edit' }));
    await screen.findByDisplayValue('Zahid');
    expect((screen.getByLabelText(f.village) as HTMLInputElement).value).toBe('Kot');
    expect((screen.getByLabelText(f.notes) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(f.creditLimit) as HTMLInputElement).value).toBe('3,000');
    expect(document.body.textContent).not.toContain('typed');
  });

  it('the other customer does not inherit the first one\'s error message', async () => {
    const shell = fakeShell({ override: { 'customers:get': (input: { customer_id: string }) => ({ ok: true, data: summary(other(input.customer_id) as ReturnType<typeof customer>) }), 'customers:update': () => fail('INTERNAL') } });
    render(<Harness shell={shell} start="/customers/c1/edit" />);
    await screen.findByDisplayValue('Rashid Ali');
    set(screen.getByLabelText(f.village), 'x');
    click(saveBtn());
    await waitFor(() => expect(document.querySelector('[data-code=INTERNAL]')).toBeTruthy());
    click(screen.getByRole('button', { name: 'go /customers/c2/edit' }));
    await screen.findByDisplayValue('Zahid');
    expect(document.querySelector('[data-code=INTERNAL]')).toBeNull();
  });

  it('going from an edit to Add starts a blank form', async () => {
    const shell = shellFor();
    render(<Harness shell={shell} start="/customers/c1/edit" />);
    await screen.findByDisplayValue('Rashid Ali');
    click(screen.getByRole('button', { name: 'go /customers/new' }));
    await waitFor(() => expect(nameEn().value).toBe(''));
    expect((screen.getByLabelText(f.phone) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(f.addTitle);
  });
});

describe('Settings, Customers section: the edges', () => {
  const s = en.customerSettings;
  const printCfg = { 'print:getConfig': () => ({ ok: true, data: { shop_name: 'S', print_format: '80mm', receipt_footer: '', printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null } }), 'printers:list': () => ({ ok: true, data: [] }) };
  const openSection = async (shell: ReturnType<typeof fakeShell>) => {
    show(shell, '/settings', OWNER, 'en');
    click(await screen.findByRole('button', { name: s.sectionLabel }));
    return (await screen.findByLabelText(s.defaultLimit)) as HTMLInputElement;
  };
  const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${s.save}|${s.saving})$`) }) as HTMLButtonElement;

  it('Save is off when nothing changed and when the limit is invalid, and a forced submit sends nothing', async () => {
    const shell = fakeShell({ settings: { default_credit_limit: 500_000 }, override: printCfg });
    const limit = await openSection(shell);
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(document.querySelector('[data-section=customers]')!);
    set(limit, 'abc');
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(document.querySelector('[data-section=customers]')!);
    set(limit, '5000'); // back to what it was: unchanged again
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(s.nothingChanged)).toBeTruthy();
    expect(shell.of('customers:setSettings')).toHaveLength(0);
  });

  it('the default limit is grouped like the rest of the UI (10,000), grouped as it is typed and tidied on blur, and the request is exact paisa', async () => {
    const shell = fakeShell({ settings: { default_credit_limit: 1_000_000 }, override: printCfg });
    const limit = await openSection(shell);
    expect(limit.value).toBe('10,000');
    set(limit, '20000.5');
    expect(limit.value).toBe('20,000.5');
    fireEvent.blur(limit);
    expect(limit.value).toBe('20,000.50');
    click(saveButton());
    await waitFor(() => expect(shell.of('customers:setSettings')).toHaveLength(1));
    expect(shell.of('customers:setSettings')[0]!.input).toEqual({ default_credit_limit: 2_000_050 });
  });

  it('while saving: Save is off, says Saving…, and a second submit sends nothing', async () => {
    const g = gate();
    const shell = fakeShell({ settings: { default_credit_limit: 500_000 }, override: { ...printCfg, 'customers:setSettings': async (input: object) => (await g.wait, { ok: true, data: { default_credit_limit: 750_000, show_farmer_fields: false, ...input } }) } });
    const limit = await openSection(shell);
    set(limit, '7500');
    click(saveButton());
    await waitFor(() => expect(saveButton().textContent).toBe(s.saving));
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(document.querySelector('[data-section=customers]')!);
    g.release();
    await screen.findByText(s.saved);
    expect(shell.of('customers:setSettings')).toHaveLength(1);
  });

  it('after a save the boxes show what the shell replied, not what was typed', async () => {
    const shell = fakeShell({ settings: { default_credit_limit: 500_000 }, override: { ...printCfg, 'customers:setSettings': () => ({ ok: true, data: { default_credit_limit: 800_000, show_farmer_fields: true } }) } });
    const limit = await openSection(shell);
    set(limit, '7500');
    click(saveButton());
    await screen.findByText(s.saved);
    expect(limit.value).toBe('8,000');
    expect(screen.getByRole('radio', { name: s.on }).getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(true); // nothing differs from the reply now
  });

  it('On and Off are not swapped: a shop with the farmer details on shows On, and Off sends false', async () => {
    const shell = fakeShell({ settings: { show_farmer_fields: true }, override: printCfg });
    await openSection(shell);
    expect(screen.getByRole('radio', { name: s.on }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: s.off }).getAttribute('aria-checked')).toBe('false');
    click(screen.getByRole('radio', { name: s.off }));
    expect(screen.getByRole('radio', { name: s.off }).getAttribute('aria-checked')).toBe('true');
    click(saveButton());
    await screen.findByText(s.saved);
    expect(shell.of('customers:setSettings')[0]!.input).toEqual({ show_farmer_fields: false });
  });

  it('a failed save shows its error, and the next successful save removes it', async () => {
    let calls = 0;
    const shell = fakeShell({ settings: { default_credit_limit: 500_000 }, override: { ...printCfg, 'customers:setSettings': (input: object) => (++calls === 1 ? fail('INTERNAL') : { ok: true, data: { default_credit_limit: 750_000, show_farmer_fields: false, ...input } }) } });
    const limit = await openSection(shell);
    set(limit, '7500');
    click(saveButton());
    await waitFor(() => expect(document.querySelector('[data-section=customers] [data-code=INTERNAL]')).toBeTruthy());
    expect(limit.value).toBe('7,500'); // what was typed stays
    click(saveButton());
    await screen.findByText(s.saved);
    expect(document.querySelector('[data-section=customers] [data-code=INTERNAL]')).toBeNull();
  });

  it('a failed load shows the error with Try again, and Try again loads the section', async () => {
    let calls = 0;
    const shell = fakeShell({ override: { ...printCfg, 'customers:getSettings': () => (++calls === 1 ? fail('INTERNAL') : { ok: true, data: { default_credit_limit: 500_000, show_farmer_fields: false } }) } });
    show(shell, '/settings', OWNER, 'en');
    click(await screen.findByRole('button', { name: s.sectionLabel }));
    const retry = await screen.findByRole('button', { name: s.retry });
    expect(document.querySelector('[data-section=customers] [data-code=INTERNAL]')).toBeTruthy();
    expect(screen.queryByLabelText(s.defaultLimit)).toBeNull();
    click(retry);
    expect(((await screen.findByLabelText(s.defaultLimit)) as HTMLInputElement).value).toBe('5,000');
    expect(document.querySelector('[data-section=customers] [data-code=INTERNAL]')).toBeNull();
    expect(screen.queryByRole('button', { name: s.retry })).toBeNull();
  });
});

describe('Urdu and style', () => {
  it('Urdu: the Urdu words, the Urdu name box is right to left, the phone box stays left to right', async () => {
    await newForm(fakeShell(), OWNER, 'ur');
    const u = ur.customerForm;
    expect(screen.getByLabelText(u.nameUr).getAttribute('dir')).toBe('rtl');
    expect(screen.getByLabelText(u.phone).getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', { name: u.save })).toBeTruthy();
    expect(screen.getByRole('radio', { name: u.wholesale })).toBeTruthy();
    expect(document.querySelector('[data-page=customer-form]')!.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
  });

  it('Urdu duplicate dialog has the Urdu words', async () => {
    const shell = fakeShell({ override: { 'customers:create': () => fail('DUPLICATE_CUSTOMER') } });
    await newForm(shell, OWNER, 'ur');
    set(screen.getByLabelText(ur.customerForm.nameEn), 'Rashid Ali');
    click(screen.getByRole('button', { name: ur.customerForm.save }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: ur.customerForm.dupSaveNew })).toBeTruthy();
    expect(within(dialog).getByText(ur.customerForm.owes(formatMoney(900_000, 'ur')))).toBeTruthy();
  });

  it('the form, the dialog and the settings section never use left or right (only start and end)', () => {
    const bad = /(?:^|[\s"'`:])(?:-?(?:ml|mr|pl|pr|left|right)-(?:\d|\[|px|auto)|text-(?:left|right)|float-(?:left|right)|rounded-[lr]-)/;
    const dirs = [join(__dirname, '..', 'src', 'pages', 'customers', 'form'), join(__dirname, '..', 'src', 'pages', 'settings')];
    let scanned = 0;
    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter((x) => x.endsWith('.tsx') && (dir.endsWith('form') || x.startsWith('customer-')))) {
        scanned += 1;
        readFileSync(join(dir, file), 'utf8')
          .split('\n')
          .forEach((line, i) => expect(bad.test(line), `${file}:${i + 1}: ${line.trim()}`).toBe(false));
      }
    }
    expect(scanned).toBeGreaterThanOrEqual(3);
  });

  it('no cost, profit or margin anywhere on the form, the dialog or the settings section (owner and staff)', async () => {
    const shell = fakeShell({ settings: { show_farmer_fields: true }, override: { 'customers:create': () => fail('DUPLICATE_CUSTOMER') } });
    await newForm(shell);
    click(screen.getByRole('button', { name: f.addFarmer }));
    set(nameEn(), 'A');
    click(saveBtn());
    await screen.findByRole('dialog');
    expect(document.body.textContent).not.toMatch(/cost|profit|margin/i);
    cleanup();
    await newForm(fakeShell(), STAFF);
    expect(document.body.textContent).not.toMatch(/cost|profit|margin/i);
    for (const text of [JSON.stringify(en.customerForm), JSON.stringify(en.customerSettings)]) expect(text).not.toMatch(/cost|profit|margin/i);
  });
});

// ---------- Settings: Customers ----------

describe('Settings, Customers section', () => {
  const open = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en') => {
    show(shell, '/settings', user, language);
    return shell;
  };
  const s = en.customerSettings;

  it('staff see the calm owner-only message, no Customers section, and nothing is asked of the shell', async () => {
    const shell = await open(fakeShell(), STAFF);
    expect(await screen.findByText(en.settings.ownerOnlyTitle)).toBeTruthy();
    expect(screen.queryByText(s.sectionLabel)).toBeNull();
    expect(shell.calls.filter((c) => c.channel.startsWith('customers:'))).toHaveLength(0);
  });

  it('owner: opens the section, shows both settings, and sends ONLY what changed', async () => {
    const shell = await open(fakeShell({ settings: { default_credit_limit: 500_000, show_farmer_fields: false }, override: { 'print:getConfig': () => ({ ok: true, data: { shop_name: 'S', print_format: '80mm', receipt_footer: '', printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null } }), 'printers:list': () => ({ ok: true, data: [] }) } }));
    click(await screen.findByRole('button', { name: s.sectionLabel }));
    const limit = (await screen.findByLabelText(s.defaultLimit)) as HTMLInputElement;
    expect(limit.value).toBe('5,000');
    const save = screen.getByRole('button', { name: s.save }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    // only the toggle changes
    click(screen.getByRole('radio', { name: s.on }));
    click(save);
    expect(await screen.findByText(s.saved)).toBeTruthy();
    expect(shell.of('customers:setSettings')[0]!.input).toEqual({ show_farmer_fields: true });
    // only the limit changes (rupees to paisa)
    set(limit, '7500');
    click(screen.getByRole('button', { name: s.save }));
    await waitFor(() => expect(shell.of('customers:setSettings')).toHaveLength(2));
    expect(shell.of('customers:setSettings')[1]!.input).toEqual({ default_credit_limit: 750_000 });
  });

  it('a garbage limit is refused inline and nothing is sent', async () => {
    const shell = await open(fakeShell({ override: { 'print:getConfig': () => ({ ok: true, data: { shop_name: 'S', print_format: '80mm', receipt_footer: '', printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null } }), 'printers:list': () => ({ ok: true, data: [] }) } }));
    click(await screen.findByRole('button', { name: s.sectionLabel }));
    set(await screen.findByLabelText(s.defaultLimit), '-1');
    expect(screen.getByText(s.limitInvalid)).toBeTruthy();
    expect((screen.getByRole('button', { name: s.save }) as HTMLButtonElement).disabled).toBe(true);
    expect(shell.of('customers:setSettings')).toHaveLength(0);
  });

  it('Urdu: the section has the Urdu words', async () => {
    await open(fakeShell({ override: { 'print:getConfig': () => ({ ok: true, data: { shop_name: 'S', print_format: '80mm', receipt_footer: '', printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null } }), 'printers:list': () => ({ ok: true, data: [] }) } }), OWNER, 'ur');
    click(await screen.findByRole('button', { name: ur.customerSettings.sectionLabel }));
    expect(await screen.findByLabelText(ur.customerSettings.defaultLimit)).toBeTruthy();
    expect(screen.getByRole('radio', { name: ur.customerSettings.on })).toBeTruthy();
  });
});
