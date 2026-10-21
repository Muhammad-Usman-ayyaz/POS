// @vitest-environment jsdom
// The customer list (design: docs/design/Customer Khata.png, wording also in CustomerForms.dc.html), driven the way a person drives it,
// against a fake API built with the real client code. The wording is checked on the RENDERED page, against text read from the design file.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { CustomersListPage } from '../src/pages/customers/list/customers-list-page.js';
import { PAGE_SIZE } from '../src/pages/customers/list/customer-list-requests.js';
import { scanSource } from './source-scan.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

const customer = (id: string, name_en: string | null, name_ur: string | null, village: string | null, phone: string | null) => ({
  id, name_en, name_ur, village, phone, credit_limit: 1_000_000, default_price_type: 'retail', notes: null, father_name: null, cnic: null, phone2: null, guarantor: null,
});
const row = (c: ReturnType<typeof customer>, over: Record<string, unknown> = {}) => ({
  customer: c, balance: 0, credit_left: 1_000_000, no_limit: false, over_limit: false, next_due: null, overdue_amount: 0, overdue_days: 0, ...over,
});

const ROWS = [
  row(customer('c1', 'Rashid', 'راشد', 'Chak 12', '0300 1234567'), { balance: 200_000, credit_left: 800_000 }),
  row(customer('c2', 'Imran', 'عمران', 'Chak 45', '0301 1111111'), { balance: 1_550_000, credit_left: 0, over_limit: true, next_due: '2026-10-31', overdue_amount: 1_550_000, overdue_days: 12 }),
  row(customer('c3', 'Bashir', 'بشیر', 'Chak 7', null), { balance: -100_000, credit_left: null, no_limit: true }),
  row(customer('c4', 'Tariq', null, 'Chak 45', null), { balance: 475_000, credit_left: 525_000 }),
  row(customer('c5', null, 'ساجد', null, null), { balance: 0, credit_left: 1_000_000 }),
];
// Deliberately NOT the sum of the rows: the cards must show what the shell says.
const TOTALS = { total_outstanding: 3_045_000, overdue_total: 1_550_000, count: 5 };

type Handler = (input: any) => unknown | Promise<unknown>;
function fakeShell(override: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = { 'customers:list': () => ok({ rows: ROWS, totals: TOTALS }), ...override };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? await h(input) : fail('INTERNAL');
  });
  return { api, calls, lists: () => calls.filter((c) => c.channel === 'customers:list') };
}
type Shell = ReturnType<typeof fakeShell>;

let T = en.customersList;
function show(shell: Shell, user: SessionUser = STAFF, language: Language = 'en') {
  T = language === 'ur' ? ur.customersList : en.customersList;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <MemoryRouter initialEntries={['/customers']}>
        <Routes>
          <Route path="/customers" element={<CustomersListPage api={shell.api} user={user} />} />
          <Route path="/customers/new" element={<p>NEW FORM</p>} />
          <Route path="/customers/:id" element={<p>CUSTOMER PAGE</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}
const rowEl = (id: string) => document.querySelector<HTMLElement>(`[data-customer-row="${id}"]`)!;
const loaded = () => screen.findByText('Rashid').catch(() => screen.findByText('راشد'));
afterEach(cleanup);

const DESIGN = readFileSync(join(__dirname, '../../../docs/design/CustomerForms.dc.html'), 'utf8');

describe('Customers list: wording against the design', () => {
  it('the sidebar name and the overdue chip pattern in CustomerForms.dc.html are what the app says', async () => {
    // (CustomerForms.dc.html has no sidebar: it only names the section; the sidebar label is in the PNG.)
    const section = /for (Customers &amp; Khata)\./.exec(DESIGN)?.[1]?.replace('&amp;', '&');
    expect(section).toBe(en.nav.customers);
    expect(en.nav.customers).toBe('Customers & Khata');
    // The design writes "Overdue Rs 4,000 · 12 days": read the pattern out of it, then render the same figures and compare.
    const chip = />(Overdue Rs [\d,]+ · \d+ days)</.exec(DESIGN)?.[1];
    expect(chip).toBeTruthy();
    const [, amount, days] = /Overdue Rs ([\d,]+) · (\d+) days/.exec(chip!)!;
    const shell = fakeShell({ 'customers:list': () => ok({ rows: [row(ROWS[1]!.customer, { balance: 400_000, overdue_amount: Number(amount!.replace(/,/g, '')) * 100, overdue_days: Number(days) })], totals: TOTALS }) });
    show(shell);
    await screen.findByText('Imran');
    expect(rowEl('c2').querySelector('[data-chip="overdue"]')!.textContent).toBe(chip);
  });

  it('shows the labels of Customer Khata.png: Customers, Total outstanding, Overdue, the search hint, Rs 0 for a clear balance', async () => {
    show(fakeShell());
    await loaded();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Customers');
    expect(document.querySelector('[data-card="outstanding"]')!.textContent).toContain('Total outstanding');
    expect(document.querySelector('[data-card="overdue"]')!.textContent).toContain('Overdue');
    expect(screen.getByRole('searchbox', { name: T.searchLabel }).getAttribute('placeholder')).toBe('Name, village or phone');
    expect(rowEl('c5').textContent).toContain('Rs 0');
    expect(screen.getByRole('link', { name: 'Add customer' }).getAttribute('href')).toBe('/customers/new');
  });
});

describe('Customers list: the rows and the cards', () => {
  it('the cards show the shell\'s totals (not the sum of the rows) and the count', async () => {
    show(fakeShell());
    await loaded();
    expect(document.querySelector('[data-card="outstanding"] [data-value]')!.textContent).toBe('Rs 30,450');
    expect(document.querySelector('[data-card="overdue"] [data-value]')!.textContent).toBe('Rs 15,500');
    expect(document.querySelector('[data-count]')!.textContent).toBe('5 customers');
  });

  it('a row has the name, village, phone, balance, credit chip, overdue chip and next due', async () => {
    show(fakeShell());
    await loaded();
    const rashid = rowEl('c1').textContent!;
    for (const part of ['Rashid', 'Chak 12', '0300 1234567', 'Owes Rs 2,000', 'Rs 8,000 left']) expect(rashid, part).toContain(part);
    const imran = rowEl('c2').textContent!;
    for (const part of ['Owes Rs 15,500', 'Over limit', 'Overdue Rs 15,500 · 12 days', 'Next due 31 Oct 2026']) expect(imran, part).toContain(part);
  });

  it('a negative balance reads "Advance Rs 1,000", never "Owes Rs -1,000"', async () => {
    show(fakeShell());
    await loaded();
    const text = rowEl('c3').textContent!;
    expect(text).toContain('Advance Rs 1,000');
    expect(text).not.toContain('Owes');
    expect(text).not.toContain('-');
    expect(document.body.textContent).not.toMatch(/Rs\s*-/);
  });

  it('a credit limit of 0 is a loud "No limit" chip and never "Rs 0 left"', async () => {
    show(fakeShell());
    await loaded();
    const chip = rowEl('c3').querySelector('[data-chip="no-limit"]')!;
    expect(chip.textContent).toBe('No limit');
    expect(chip.className).toContain('bg-warn-bg');
    expect(rowEl('c3').textContent).not.toContain('left');
    expect(rowEl('c1').querySelector('[data-chip="no-limit"]')).toBeNull();
  });

  it('over limit gets its own chip, and no "left" text', async () => {
    show(fakeShell());
    await loaded();
    expect(rowEl('c2').querySelector('[data-chip="over-limit"]')!.textContent).toBe('Over limit');
    expect(rowEl('c2').textContent).not.toContain('left');
  });

  it('the overdue chip shows whenever the shell reports an overdue amount, and not otherwise', async () => {
    show(fakeShell());
    await loaded();
    expect(rowEl('c2').querySelector('[data-chip="overdue"]')).not.toBeNull();
    expect(rowEl('c1').querySelector('[data-chip="overdue"]')).toBeNull();
    cleanup();
    show(fakeShell({ 'customers:list': () => ok({ rows: [row(ROWS[0]!.customer, { overdue_amount: 100, overdue_days: 1 })], totals: TOTALS }) }));
    await loaded();
    expect(rowEl('c1').querySelector('[data-chip="overdue"]')!.textContent).toBe('Overdue Rs 1 · 1 day');
  });

  it('the name is in the current language, the other one when it is missing, and never blank', async () => {
    show(fakeShell());
    await loaded();
    expect(rowEl('c4').querySelector('[data-name]')!.textContent).toBe('Tariq');
    expect(rowEl('c5').querySelector('[data-name]')!.textContent).toBe('ساجد'); // no English name: the Urdu one
    cleanup();
    show(fakeShell(), STAFF, 'ur');
    await loaded();
    expect(rowEl('c1').querySelector('[data-name]')!.textContent).toBe('راشد');
    expect(rowEl('c4').querySelector('[data-name]')!.textContent).toBe('Tariq'); // no Urdu name: the English one
    cleanup();
    show(fakeShell({ 'customers:list': () => ok({ rows: [row(customer('x', null, null, null, null))], totals: TOTALS }) }));
    await waitFor(() => expect(rowEl('x').querySelector('[data-name]')!.textContent).toBe(T.unnamed));
  });

  it('a row opens the customer page: its link goes to /customers/<id> and a click gets there', async () => {
    show(fakeShell());
    await loaded();
    expect(rowEl('c2').getAttribute('href')).toBe('/customers/c2');
    expect(rowEl('c1').getAttribute('href')).toBe('/customers/c1');
    await userEvent.setup().click(rowEl('c2'));
    expect(await screen.findByText('CUSTOMER PAGE')).toBeTruthy();
  });

  it('is keyboard friendly: a row is a link reached with Tab and opened with Enter, and every target is at least 44px (min-h-11)', async () => {
    show(fakeShell());
    await loaded();
    const user = userEvent.setup();
    rowEl('c1').focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('CUSTOMER PAGE')).toBeTruthy();
    cleanup();
    show(fakeShell());
    await loaded();
    expect(rowEl('c1').className).toContain('min-h-11');
    for (const b of screen.getAllByRole('button')) expect(b.className, b.textContent!).toContain('min-h-11');
  });

  it('staff and owner see the same screen and send the same request', async () => {
    const a = fakeShell();
    show(a, STAFF);
    await loaded();
    const staffText = document.body.textContent;
    cleanup();
    const b = fakeShell();
    show(b, OWNER);
    await loaded();
    expect(document.body.textContent).toBe(staffText);
    expect(b.lists()[0]!.input).toEqual(a.lists()[0]!.input);
  });

  it('shows no cost, margin or profit, even if the reply carried one', async () => {
    show(fakeShell({ 'customers:list': () => ok({ rows: ROWS.map((r) => ({ ...r, cost: 123_456, margin: 777_777 })), totals: { ...TOTALS, cost: 99 } }) }));
    await loaded();
    expect(document.body.textContent).not.toMatch(/cost|margin|profit|123,456|7,777/i);
  });
});

describe('Customers list: requests', () => {
  it('the first request is the first page by name in the current language with no filter and no query', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    expect(shell.lists()[0]!.input).toEqual({ sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 });
    expect(PAGE_SIZE).toBe(25);
    cleanup();
    const ush = fakeShell();
    show(ush, STAFF, 'ur');
    await loaded();
    expect(ush.lists()[0]!.input).toEqual({ sort: 'name', name_language: 'ur', limit: PAGE_SIZE, offset: 0 });
  });

  it('search waits for typing to pause: one request for six letters, trimmed, sent as typed', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const before = shell.lists().length;
    await userEvent.setup().type(screen.getByRole('searchbox', { name: T.searchLabel }), '  rashid ');
    expect(shell.lists().length).toBe(before);
    await waitFor(() => expect(shell.lists().length).toBe(before + 1));
    expect(shell.lists().slice(before).map((c) => c.input.query)).toEqual(['rashid']);
  });

  it('an Urdu name and a digits-only phone are sent as typed', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const box = screen.getByRole('searchbox', { name: T.searchLabel });
    await userEvent.setup().type(box, 'راشد');
    await waitFor(() => expect(shell.lists().at(-1)!.input.query).toBe('راشد'));
    await userEvent.setup().clear(box);
    await userEvent.setup().type(box, '03001234567');
    await waitFor(() => expect(shell.lists().at(-1)!.input.query).toBe('03001234567'));
  });

  it('each filter chip is sent, All sends none, and any change of filter or search goes back to the first page', async () => {
    const shell = fakeShell({ 'customers:list': () => ok({ rows: ROWS, totals: { ...TOTALS, count: 60 } }) });
    show(shell);
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: T.next }));
    await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(PAGE_SIZE));
    for (const [text, key] of [[T.filterOwes, 'owes'], [T.filterOverdue, 'overdue'], [T.filterAdvance, 'advance']] as const) {
      await user.click(screen.getByRole('button', { name: text }));
      await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ filter: key, sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 }));
      expect(screen.getByRole('button', { name: text }).getAttribute('aria-pressed')).toBe('true');
      await user.click(screen.getByRole('button', { name: T.next }));
      await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(PAGE_SIZE));
    }
    await user.click(screen.getByRole('button', { name: T.filterAll }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 }));
    await user.click(screen.getByRole('button', { name: T.next }));
    await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(PAGE_SIZE));
    await user.type(screen.getByRole('searchbox', { name: T.searchLabel }), 'ra');
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ query: 'ra', sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 }));
  });

  it('paging asks for the next and previous page, says which rows are shown, and disables the ends', async () => {
    const shell = fakeShell({ 'customers:list': () => ok({ rows: ROWS, totals: { ...TOTALS, count: 60 } }) });
    show(shell);
    await loaded();
    expect(document.querySelector('[data-range]')!.textContent).toBe('1–5 of 60');
    expect((screen.getByRole('button', { name: T.previous }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: T.next }));
    await waitFor(() => expect(document.querySelector('[data-range]')!.textContent).toBe('26–30 of 60'));
    expect(shell.lists().at(-1)!.input.offset).toBe(25);
    await userEvent.setup().click(screen.getByRole('button', { name: T.previous }));
    await waitFor(() => expect(document.querySelector('[data-range]')!.textContent).toBe('1–5 of 60'));
    cleanup();
    show(fakeShell());
    await loaded();
    expect((screen.getByRole('button', { name: T.next }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Customers list: states', () => {
  it('shows a loading state first', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    show(fakeShell({ 'customers:list': async () => (await gate, ok({ rows: ROWS, totals: TOTALS })) }));
    expect(screen.getByRole('status').textContent).toContain(T.loading);
    release();
    await loaded();
  });

  it('no customers at all: an empty state with Add customer; a search with no match: a no-match state that clears', async () => {
    const shell = fakeShell({ 'customers:list': (input) => ok({ rows: [], totals: { total_outstanding: 0, overdue_total: 0, count: 0 }, q: input.query }) });
    show(shell);
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: T.addCustomer })).toHaveLength(2);
    await userEvent.setup().type(screen.getByRole('searchbox', { name: T.searchLabel }), 'zzz');
    expect(await screen.findByText(T.noMatchTitle)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: T.clearFilters }));
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it('an error shows the notice with Try again, and trying again loads the rows', async () => {
    let fails = true;
    const shell = fakeShell({ 'customers:list': () => (fails ? fail('INTERNAL') : ok({ rows: ROWS, totals: TOTALS })) });
    show(shell);
    await screen.findByRole('alert');
    fails = false;
    await userEvent.setup().click(screen.getByRole('button', { name: T.retry }));
    await loaded();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Customers list: edges', () => {
  const EMPTY = { rows: [], totals: { total_outstanding: 0, overdue_total: 0, count: 0 } };

  it('nothing at all says "No customers yet" with its own hint; a narrowed list says "Nothing matches" with the other hint', async () => {
    const shell = fakeShell({ 'customers:list': () => ok(EMPTY) });
    show(shell);
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    expect(screen.getByText(T.emptyHint)).toBeTruthy();
    expect(screen.queryByText(T.noMatchHint)).toBeNull();
    expect(screen.queryByRole('button', { name: T.clearFilters })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: T.filterOwes })); // a filter alone narrows too
    expect(await screen.findByText(T.noMatchTitle)).toBeTruthy();
    expect(screen.getByText(T.noMatchHint)).toBeTruthy();
    expect(screen.queryByText(T.emptyHint)).toBeNull();
    expect(screen.getByRole('button', { name: T.clearFilters })).toBeTruthy();
  });

  it('a query of only spaces is not sent and does not count as a search', async () => {
    const shell = fakeShell({ 'customers:list': () => ok(EMPTY) });
    show(shell);
    await screen.findByText(T.emptyTitle);
    await userEvent.setup().type(screen.getByRole('searchbox', { name: T.searchLabel }), '   ');
    await waitFor(() => expect(shell.lists().length).toBeGreaterThan(1));
    expect(shell.lists().at(-1)!.input).toEqual({ sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 });
    expect(screen.getByText(T.emptyTitle)).toBeTruthy(); // still "No customers yet", not "Nothing matches"
    expect(screen.queryByText(T.noMatchTitle)).toBeNull();
  });

  it('"Clear search and filter" resets the search, the filter and the page', async () => {
    const shell = fakeShell({ 'customers:list': (input) => ok(input.offset > 0 ? { rows: [], totals: { ...TOTALS, count: 60 } } : { rows: ROWS, totals: { ...TOTALS, count: 60 } }) });
    show(shell);
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: T.filterOwes }));
    await user.type(screen.getByRole('searchbox', { name: T.searchLabel }), 'ra');
    await waitFor(() => expect(shell.lists().at(-1)!.input).toMatchObject({ query: 'ra', filter: 'owes', offset: 0 }));
    await user.click(await screen.findByRole('button', { name: T.next }));
    await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(PAGE_SIZE));
    await user.click(await screen.findByRole('button', { name: T.clearFilters }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ sort: 'name', name_language: 'en', limit: PAGE_SIZE, offset: 0 }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: T.filterAll }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: T.filterOwes }).getAttribute('aria-pressed')).toBe('false');
  });

  it('a clear balance is plain "Rs 0": never "Owes Rs 0", never "Advance"', async () => {
    show(fakeShell());
    await loaded();
    const text = rowEl('c5').querySelector('[data-balance]')!;
    expect(text.getAttribute('data-balance')).toBe('clear');
    expect(text.textContent).toBe('Rs 0');
    expect(rowEl('c5').textContent).not.toMatch(/Owes|Advance/);
  });

  it('credit left of exactly 0 (not over the limit) reads "Rs 0 left", not "No limit" and not "Over limit"', async () => {
    const shell = fakeShell({ 'customers:list': () => ok({ rows: [row(ROWS[0]!.customer, { balance: 1_000_000, credit_left: 0 })], totals: { ...TOTALS, count: 1 } }) });
    show(shell);
    await screen.findByText('Rashid');
    const chip = rowEl('c1').querySelector('[data-chip]')!;
    expect(chip.getAttribute('data-chip')).toBe('credit-left');
    expect(chip.textContent).toBe('Rs 0 left');
    expect(rowEl('c1').textContent).not.toMatch(/No limit|Over limit/);
  });

  it('the count is the shell\'s total, not the number of rows on this page', async () => {
    show(fakeShell({ 'customers:list': () => ok({ rows: ROWS, totals: { ...TOTALS, count: 60 } }) }));
    await loaded();
    expect(document.querySelector('[data-count]')!.textContent).toBe('60 customers');
    expect(document.querySelector('[data-range]')!.textContent).toBe('1–5 of 60');
  });

  it('1 is singular and 0 is plural: "1 customer", "0 customers", "1 day"', async () => {
    const one = fakeShell({ 'customers:list': () => ok({ rows: [row(ROWS[1]!.customer, { balance: 100, overdue_amount: 100, overdue_days: 1 })], totals: { ...TOTALS, count: 1 } }) });
    show(one);
    await screen.findByText('Imran');
    expect(document.querySelector('[data-count]')!.textContent).toBe('1 customer');
    expect(rowEl('c2').querySelector('[data-chip="overdue"]')!.textContent).toBe('Overdue Rs 1 · 1 day');
    cleanup();
    show(fakeShell({ 'customers:list': () => ok(EMPTY) }));
    await screen.findByText(T.emptyTitle);
    expect(document.querySelector('[data-count]')!.textContent).toBe('0 customers');
  });

  it('when the first load fails there are no placeholder rows, only the error and Try again', async () => {
    show(fakeShell({ 'customers:list': () => fail('INTERNAL') }));
    await screen.findByRole('alert');
    expect(document.querySelector('[data-skeleton]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: T.retry })).toBeTruthy();
  });
});

describe('Customers list: Urdu and right to left', () => {
  it('uses Urdu words, the layout is right to left, and numbers, amounts and dates stay left to right', async () => {
    show(fakeShell(), STAFF, 'ur');
    await loaded();
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ur.customersList.title);
    expect(document.querySelector('[data-card="outstanding"]')!.textContent).toContain(ur.customersList.totalOutstanding);
    const imran = rowEl('c2').textContent!;
    expect(imran).toContain('عمران');
    expect(imran).toContain(ur.customersList.overLimit);
    // amounts and dates are isolated left-to-right (U+2066 ... U+2069); "Rs 15,500" is not scrambled
    expect(imran).toContain('⁦Rs 15,500⁩');
    expect(imran).toContain('⁦31 Oct 2026⁩');
    expect(imran).toContain('⁦12⁩');
    expect(rowEl('c1').textContent).toContain('⁦Rs 8,000⁩ باقی');
    expect(rowEl('c3').textContent).toContain(`${ur.customersList.advance('⁦Rs 1,000⁩')}`);
    expect(rowEl('c3').textContent).not.toContain('Owes');
    expect(document.querySelector('[data-card="outstanding"] [data-value]')!.textContent).toBe('⁦Rs 30,450⁩');
    expect(rowEl('c1').querySelector('.num')!.textContent).toBe('0300 1234567');
  });

  it('the Urdu texts have the same keys as the English ones', () => {
    expect(Object.keys(ur.customersList).sort()).toEqual(Object.keys(en.customersList).sort());
  });
});

describe('Customers list: source', () => {
  it('uses logical classes only: no left, right, ml, mr, pl or pr in the list files', () => {
    const dir = join(__dirname, '../src/pages/customers/list');
    const bad = /(^|[\s"'`:])(-?(ml|mr|pl|pr)-\S+|(text|float|border|rounded)-(left|right|l|r)\b\S*|(left|right)-\S+)/;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const { strings } = scanSource(readFileSync(join(dir, f), 'utf8'));
      for (const s of strings) expect(bad.test(s), `${f}: ${s}`).toBe(false);
    }
  });
});
