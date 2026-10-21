// @vitest-environment jsdom
// Phase 6 M6: the customer statement screen (docs/design/CustomerForms.dc.html section 4) and the print buttons, driven like a person drives them against
// a fake API built with the real client code. The figures are the shell's: the fake gives numbers that do NOT add up on purpose (a closing balance and
// running balances that no sum of the rows would produce), so a screen that did its own arithmetic would show something else.
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
import { PaymentReceiptActions, StatementPage, StatementPrintActions } from '../src/pages/khata/index.js';
import { last30Range, thisMonthRange, todayIn } from '../src/pages/khata/statement-requests.js';
import { setUiClock, uiNow } from '../src/lib/clock.js';
import { scanSource } from './source-scan.js';

const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };
const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

const ledger = (id: string, entry_type: string, delta: number, date: string) => ({ id, party_type: 'customer', party_id: 'c1', entry_type, amount_delta: delta, ref_type: null, ref_id: null, entry_date: date, created_by: null, shop_id: 's', branch_id: 'b', device_id: 'd', created_at: date, version: 1 });
const line = (id: string, label: string, type: string, delta: number, running: number, date: string, extra: Record<string, unknown> = {}) => ({
  kind: 'entry', entry: ledger(id, type, delta, date), label, amount_delta: delta, running_balance: running, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null, ...extra,
});
const bf = (amount: number) => ({ kind: 'brought_forward', entry: null, label: 'brought_forward', amount_delta: amount, running_balance: amount, invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null });

const LINES = [
  line('1', 'opening', 'opening', 400_000, 400_000, '2026-10-01T07:00:00.000Z'),
  line('2', 'sale', 'invoice', 500_000, 900_000, '2026-10-02T07:00:00.000Z', { invoice_no: 'INV-A-000001' }),
  line('3', 'payment', 'payment', -200_000, 700_000, '2026-10-02T08:00:00.000Z', { payment_method: 'cash', receipt_no: 'RCP-A-000001' }),
  line('4', 'return', 'return', -100_000, 600_000, '2026-10-02T09:00:00.000Z', { return_no: 'RET-A-000001' }),
  line('5', 'payment', 'payment', -150_000, 450_000, '2026-10-07T07:00:00.000Z', { payment_method: 'bank', reference_no: 'TRX 88213', receipt_no: 'RCP-A-000002' }),
];
// closing balance, totals and current balance are deliberately NOT what the rows add up to
const STATEMENT = { customer: { id: 'c1', name_en: 'Rashid Ali', name_ur: 'راشد علی', phone: '0300 1234567', village: 'Chak 12' }, from: null, to: null, lines: LINES, brought_forward: 0, totals: { owes_more: 912_300, owes_less: 456_700 }, closing_balance: 777_700 };
const SUMMARY = {
  customer: { id: 'c1', name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'Chak 12', phone: '0300 1234567', credit_limit: 1_000_000, default_price_type: 'retail', notes: null, father_name: null, cnic: null, phone2: null, guarantor: null, version: 1 },
  balance: 900_000, credit_left: 100_000, no_limit: false, over_limit: false, next_due: '2026-10-20', overdue_amount: 400_000, overdue_days: 12,
};

type Handler = (input: any) => unknown | Promise<unknown>;
function fakeShell(override: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'khata:statement': () => ok(STATEMENT),
    'customers:get': () => ok(SUMMARY),
    'print:getConfig': () => ok({ print_format: '80mm' }),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? await h(input) : fail('INTERNAL');
  });
  return { api, calls, of: (channel: Channel) => calls.filter((c) => c.channel === channel) };
}
type Shell = ReturnType<typeof fakeShell>;

let T = en.statement;
function show(shell: Shell, language: Language = 'en') {
  T = language === 'ur' ? ur.statement : en.statement;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <MemoryRouter initialEntries={['/customers/c1/statement']}>
        <Routes>
          <Route path="/customers/:id/statement" element={<StatementPage api={shell.api} user={STAFF} />} />
          <Route path="/customers/:id" element={<p>CUSTOMER PAGE</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}
const loaded = () => waitFor(() => expect(document.querySelector('[data-statement-table]')).not.toBeNull());
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-statement-table] tbody tr')];
afterEach(cleanup);

const DESIGN = readFileSync(join(__dirname, '../../../docs/design/CustomerForms.dc.html'), 'utf8');
const designText = (() => {
  const s = DESIGN.slice(DESIGN.indexOf('Customer statement'), DESIGN.indexOf('80 mm print'));
  return s.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').split('|').map((x) => x.trim()).filter(Boolean);
})();

describe('Statement screen: wording against the design', () => {
  it('the card labels, the column heads (Owes more / Owes less as decided) and the line types are the design\'s words', async () => {
    for (const word of ['Current balance', 'Credit limit', 'Credit left', 'Date', 'Type', 'Reference', 'Balance', 'Opening balance', 'Sale', 'Return credit', 'Totals', 'Export CSV', 'Print statement']) expect(designText, word).toContain(word);
    show(fakeShell());
    await loaded();
    const page = document.body.textContent ?? '';
    for (const word of ['Current balance', 'Credit limit', 'Credit left', 'Date', 'Type', 'Reference', 'Balance', 'Totals', 'Export CSV', 'Print statement', 'Opening balance', 'Return credit']) expect(page, word).toContain(word);
    for (const word of ['Owes more', 'Owes less']) expect(page, word).toContain(word);
    // the design's Debit / Credit are replaced by the plan's wording
    const heads = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Date', 'Type', 'Reference', 'Owes more', 'Owes less', 'Balance']);
    expect(heads).not.toContain('Debit');
  });

  it('the type pills: Opening balance, Sale, Payment · Cash / Bank, Return credit, as in the design', async () => {
    show(fakeShell());
    await loaded();
    const pills = rows().map((r) => r.querySelectorAll('td')[1]!.textContent);
    expect(pills).toEqual(['Opening balance', 'Sale', 'Payment · Cash', 'Return credit', 'Payment · Bank']);
  });
});

describe('Statement screen: the shell\'s figures, shown and not recomputed', () => {
  it('every cell is what the shell sent: dates, references, owes more / owes less, running balances, totals and the closing balance', async () => {
    show(fakeShell());
    await loaded();
    const cells = rows().map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
    expect(cells[0]).toEqual(['01 Oct 2026', 'Opening balance', '', 'Rs 4,000', '', 'Rs 4,000']);
    expect(cells[1]).toEqual(['02 Oct 2026', 'Sale', 'INV-A-000001', 'Rs 5,000', '', 'Rs 9,000']);
    expect(cells[2]).toEqual(['02 Oct 2026', 'Payment · Cash', 'RCP-A-000001', '', 'Rs 2,000', 'Rs 7,000']);
    expect(cells[3]).toEqual(['02 Oct 2026', 'Return credit', 'RET-A-000001', '', 'Rs 1,000', 'Rs 6,000']);
    expect(cells[4]).toEqual(['07 Oct 2026', 'Payment · Bank', 'TRX 88213', '', 'Rs 1,500', 'Rs 4,500']);
    const totals = document.querySelector('[data-totals]')!;
    expect(within(totals as HTMLElement).getByText('Rs 9,123')).toBeTruthy();
    expect(within(totals as HTMLElement).getByText('Rs 4,567')).toBeTruthy();
    // the closing balance is the shell's (Rs 7,777), not the last running balance (Rs 4,500) and not a sum of the rows
    expect(document.querySelector('[data-total="closing"]')!.textContent).toBe('Rs 7,777');
    expect(document.querySelector('[data-closing-value]')!.textContent).toBe('He owes Rs 7,777');
  });

  it('the header cards show customers:get\'s balance, credit limit and credit left', async () => {
    show(fakeShell());
    await loaded();
    expect(document.querySelector('[data-card="balance"] [data-value]')!.textContent).toBe('Rs 9,000');
    expect(document.querySelector('[data-card="limit"] [data-value]')!.textContent).toBe('Rs 10,000');
    expect(document.querySelector('[data-card="left"] [data-value]')!.textContent).toBe('Rs 1,000');
    expect(screen.getByText('Overdue Rs 4,000 · 12 days')).toBeTruthy();
    expect(screen.getByText('Rashid Ali')).toBeTruthy();
    expect(screen.getByText('راشد علی')).toBeTruthy();
  });

  it('no limit: the cards say No limit, never Rs 0', async () => {
    show(fakeShell({ 'customers:get': () => ok({ ...SUMMARY, credit_left: null, no_limit: true, customer: { ...SUMMARY.customer, credit_limit: 0 } }) }));
    await loaded();
    expect(document.querySelector('[data-card="limit"] [data-value]')!.textContent).toBe('No limit');
    expect(document.querySelector('[data-card="left"] [data-value]')!.textContent).toBe('No limit');
  });

  it('a negative balance is an Advance, never "Owes Rs -x" or a minus sign: in the table, the closing line and the card', async () => {
    const adv = { ...STATEMENT, lines: [line('9', 'payment', 'payment', -150_000, -50_000, '2026-10-07T07:00:00.000Z', { payment_method: 'cash' })], closing_balance: -50_000, totals: { owes_more: 0, owes_less: 150_000 } };
    show(fakeShell({ 'khata:statement': () => ok(adv), 'customers:get': () => ok({ ...SUMMARY, balance: -50_000, overdue_amount: 0, overdue_days: 0 }) }));
    await loaded();
    expect(rows()[0]!.querySelectorAll('td')[5]!.textContent).toBe('Advance Rs 500');
    expect(document.querySelector('[data-closing-value]')!.textContent).toBe('Advance Rs 500');
    expect(document.querySelector('[data-closing]')!.getAttribute('data-closing')).toBe('advance');
    expect(document.querySelector('[data-card="balance"] [data-value]')!.textContent).toBe('Advance Rs 500');
    expect(document.body.textContent).not.toMatch(/Rs -|Owes Rs|He owes/);
  });

  it('a zero closing balance says Clear', async () => {
    show(fakeShell({ 'khata:statement': () => ok({ ...STATEMENT, closing_balance: 0 }) }));
    await loaded();
    expect(document.querySelector('[data-closing-value]')!.textContent).toBe('Clear');
  });
});

describe('Statement screen: the date range', () => {
  it('opens with no range: the whole history is requested', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    expect(shell.of('khata:statement')[0]!.input).toEqual({ customer_id: 'c1' });
    expect(document.querySelector('[data-line="brought_forward"]')).toBeNull();
  });

  it('Last 30 days and This month send their dates; All clears them', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const user = userEvent.setup();
    const today = todayIn('Asia/Karachi', uiNow());
    await user.click(screen.getByRole('button', { name: T.last30 }));
    await waitFor(() => expect(shell.of('khata:statement').at(-1)!.input).toEqual({ customer_id: 'c1', ...last30Range(today) }));
    await user.click(screen.getByRole('button', { name: T.thisMonth }));
    await waitFor(() => expect(shell.of('khata:statement').at(-1)!.input).toEqual({ customer_id: 'c1', ...thisMonthRange(today) }));
    await user.click(screen.getByRole('button', { name: T.all }));
    await waitFor(() => expect(shell.of('khata:statement').at(-1)!.input).toEqual({ customer_id: 'c1' }));
  });

  describe('the quick ranges follow the shop clock (pinned with setUiClock)', () => {
    afterEach(() => setUiClock());
    const pressed = async (at: string, name: string) => {
      setUiClock(() => new Date(at));
      const shell = fakeShell();
      show(shell);
      await loaded();
      await userEvent.setup().click(screen.getByRole('button', { name }));
      await waitFor(() => expect(shell.of('khata:statement').length).toBeGreaterThan(1));
      return shell.of('khata:statement').at(-1)!.input;
    };

    it('on the 1st of a month, This month is that one day', async () => {
      expect(await pressed('2026-03-01T09:00:00+05:00', T.thisMonth)).toEqual({ customer_id: 'c1', from: '2026-03-01', to: '2026-03-01' });
    });
    it('on the 1st, Last 30 days reaches back into the month before (29 days)', async () => {
      expect(await pressed('2026-03-01T09:00:00+05:00', T.last30)).toEqual({ customer_id: 'c1', from: '2026-01-31', to: '2026-03-01' });
    });
    it('just after midnight in Karachi it is already the next day even though UTC is still the day before', async () => {
      // 00:30 on 1 April in Karachi is 19:30 on 31 March UTC
      expect(await pressed('2026-03-31T19:30:00Z', T.thisMonth)).toEqual({ customer_id: 'c1', from: '2026-04-01', to: '2026-04-01' });
    });
    it('just before midnight in Karachi it is still the same day', async () => {
      // 23:59 on 31 March in Karachi is 18:59 UTC
      expect(await pressed('2026-03-31T18:59:00Z', T.last30)).toEqual({ customer_id: 'c1', from: '2026-03-02', to: '2026-03-31' });
    });
  });

  it('the quick ranges are plain calendar maths', () => {
    expect(thisMonthRange('2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-19' });
    expect(last30Range('2026-10-19')).toEqual({ from: '2026-09-20', to: '2026-10-19' });
    expect(last30Range('2026-03-05')).toEqual({ from: '2026-02-04', to: '2026-03-05' });
    expect(todayIn('Asia/Karachi', new Date('2026-10-18T20:30:00Z'))).toBe('2026-10-19'); // 01:30 the next day in Karachi
  });

  it('a range shows the brought-forward row the shell sent, in the Balance column only', async () => {
    const withBf = { ...STATEMENT, from: '2026-10-05', lines: [bf(600_000), LINES[4]], brought_forward: 600_000 };
    const shell = fakeShell({ 'khata:statement': (input) => ok(input.from ? withBf : STATEMENT) });
    show(shell);
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name: T.last30 }));
    await waitFor(() => expect(document.querySelector('[data-line="brought_forward"]')).not.toBeNull());
    const cells = [...document.querySelector('[data-line="brought_forward"]')!.querySelectorAll('td')].map((td) => td.textContent);
    expect(cells).toEqual(['', 'Brought forward', '', '', '', 'Rs 6,000']);
  });

  it('typing a first date after the last date shows a message and sends nothing', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const user = userEvent.setup();
    const before = shell.of('khata:statement').length;
    await user.type(document.querySelector<HTMLInputElement>('input[name="to"]')!, '01 Oct 2026');
    await user.tab();
    await user.type(document.querySelector<HTMLInputElement>('input[name="from"]')!, '12 Oct 2026');
    await user.tab();
    await waitFor(() => expect(document.querySelector('[data-range-error]')!.textContent).toBe(T.rangeInvalid));
    expect(shell.of('khata:statement').filter((c) => c.input.from === '2026-10-12' && c.input.to === '2026-10-01')).toHaveLength(0);
    expect(shell.of('khata:statement').length).toBeGreaterThanOrEqual(before);
  });
});

describe('Statement screen: states', () => {
  it('loading, then the table', async () => {
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => (release = r));
    show(fakeShell({ 'khata:statement': async () => (await gate, ok(STATEMENT)) }));
    expect(await screen.findByText(T.loading)).toBeTruthy();
    release(null);
    await loaded();
    expect(document.querySelector('[data-loading]')).toBeNull();
  });

  it('empty: a calm message, no table', async () => {
    show(fakeShell({ 'khata:statement': () => ok({ ...STATEMENT, lines: [], totals: { owes_more: 0, owes_less: 0 }, closing_balance: 0 }) }));
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    expect(screen.getByText(T.emptyHint)).toBeTruthy();
    expect(document.querySelector('[data-statement-table]')).toBeNull();
  });

  it('an error shows the notice and a Try again that asks again', async () => {
    let n = 0;
    const shell = fakeShell({ 'khata:statement': () => (++n === 1 ? fail('NOT_FOUND') : ok(STATEMENT)) });
    show(shell);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: T.retry }));
    await loaded();
    expect(rows()).toHaveLength(5);
  });
});

describe('Statement buttons: Print (80 mm), Print A4, Save PDF, Export CSV', () => {
  const press = async (shell: Shell, name: string) => {
    show(shell);
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name }));
  };
  const printed = { status: 'printed', pdf_path: null, fallback: null, kind: 'receipt', language: 'en', is_copy: false };

  it('each sends exactly its own request: no language, no user, the range as set', async () => {
    const shell = fakeShell({ 'print:statement': () => ok(printed) });
    show(shell);
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: T.print80 }));
    await waitFor(() => expect(shell.of('print:statement')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: T.printA4 }));
    await waitFor(() => expect(shell.of('print:statement')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: T.savePdf }));
    await waitFor(() => expect(shell.of('print:statement')).toHaveLength(3));
    expect(shell.of('print:statement').map((c) => c.input)).toEqual([
      { customer_id: 'c1', kind: 'receipt', output: 'printer' },
      { customer_id: 'c1', kind: 'invoice', output: 'printer' },
      { customer_id: 'c1', kind: 'invoice', output: 'pdf' },
    ]);
    expect(JSON.stringify(shell.of('print:statement'))).not.toMatch(/created_by|actor|user_id|language/);
  });

  it('a PDF saved because there is no printer is a calm notice with the path, not an error; COPY is said', async () => {
    await press(fakeShell({ 'print:statement': () => ok({ status: 'pdf_saved', pdf_path: 'C:/Docs/Statement.pdf', fallback: 'no_printer', kind: 'receipt', language: 'en', is_copy: true }) }), T.print80);
    await waitFor(() => expect(document.querySelector('[data-print-outcome="pdf_saved"]')).not.toBeNull());
    expect(document.querySelector('[data-fallback="no_printer"]')).not.toBeNull();
    expect(document.querySelector('[data-pdf-path]')!.textContent).toContain('C:/Docs/Statement.pdf');
    expect(document.querySelector('[data-copy-hint]')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a real failure (not even a PDF) is an error notice', async () => {
    await press(fakeShell({ 'print:statement': () => fail('INTERNAL') }), T.print80);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('Export CSV asks the shell (which opens the Save box): saved shows the path, cancelled says nothing was written', async () => {
    const shell = fakeShell({ 'khata:exportStatement': () => ok({ status: 'saved', path: 'C:/Docs/Statement.csv' }) });
    await press(shell, T.exportCsv);
    await waitFor(() => expect(document.querySelector('[data-csv-outcome="saved"]')).not.toBeNull());
    expect(shell.of('khata:exportStatement')[0]!.input).toEqual({ customer_id: 'c1' });
    expect(document.querySelector('[data-csv-path]')!.textContent).toContain('C:/Docs/Statement.csv');
    cleanup();
    await press(fakeShell({ 'khata:exportStatement': () => ok({ status: 'cancelled' }) }), T.exportCsv);
    await waitFor(() => expect(document.querySelector('[data-csv-outcome="cancelled"]')).not.toBeNull());
    expect(document.querySelector('[data-csv-outcome="cancelled"]')!.textContent).toContain(T.csvCancelledNext);
  });

  it('the buttons work on their own (the customer page puts StatementPrintActions in its slot), and a second click while one is on its way is ignored', async () => {
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => (release = r));
    const shell = fakeShell({ 'print:statement': async () => (await gate, ok(printed)) });
    render(
      <I18nProvider language="en" onLanguageChange={() => undefined}>
        <StatementPrintActions api={shell.api} customerId="c9" from="2026-10-01" to="2026-10-31" />
      </I18nProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: T.print80 }));
    expect(screen.getByRole('button', { name: T.printA4 }).hasAttribute('disabled')).toBe(true);
    release(null);
    await waitFor(() => expect(document.querySelector('[data-print-outcome]')).not.toBeNull());
    expect(shell.of('print:statement')).toEqual([{ channel: 'print:statement', input: { customer_id: 'c9', from: '2026-10-01', to: '2026-10-31', kind: 'receipt', output: 'printer' } }]);
  });
});

describe('PaymentReceiptActions', () => {
  it('Print receipt and Save PDF send print:paymentReceipt for that payment; a saved PDF is a notice', async () => {
    const shell = fakeShell({ 'print:paymentReceipt': (input) => ok({ status: input.output === 'pdf' ? 'pdf_saved' : 'printed', pdf_path: input.output === 'pdf' ? 'C:/R.pdf' : null, fallback: null, kind: 'receipt', language: 'en', is_copy: false }) });
    render(
      <I18nProvider language="en" onLanguageChange={() => undefined}>
        <PaymentReceiptActions api={shell.api} paymentId="p1" />
      </I18nProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: en.paymentReceipt.print }));
    await waitFor(() => expect(document.querySelector('[data-print-outcome="printed"]')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: en.paymentReceipt.savePdf }));
    await waitFor(() => expect(document.querySelector('[data-print-outcome="pdf_saved"]')).not.toBeNull());
    expect(shell.of('print:paymentReceipt').map((c) => c.input)).toEqual([{ payment_id: 'p1', output: 'printer' }, { payment_id: 'p1', output: 'pdf' }]);
  });
});

describe('Urdu, right to left', () => {
  it('the screen is dir=rtl with Urdu words, and the amounts stay left to right', async () => {
    show(fakeShell(), 'ur');
    await loaded();
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    const heads = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual([ur.statement.colDate, ur.statement.colType, ur.statement.colReference, ur.statement.colOwesMore, ur.statement.colOwesLess, ur.statement.colBalance]);
    expect(document.querySelector('[data-closing-value]')!.textContent).toContain(ur.statement.heOwes);
    expect(rows()[1]!.querySelectorAll('td')[1]!.textContent).toBe(ur.statement.types.sale);
    for (const num of document.querySelectorAll('[data-col="balance"] .num')) expect(num.className).toContain('num');
    expect(screen.getByRole('button', { name: ur.statement.print80 })).toBeTruthy();
  });

  it('English and Urdu say the same things: every key of the statement and paymentReceipt texts exists in both', () => {
    expect(Object.keys(ur.statement).sort()).toEqual(Object.keys(en.statement).sort());
    expect(Object.keys(ur.paymentReceipt).sort()).toEqual(Object.keys(en.paymentReceipt).sort());
    expect(Object.keys(ur.statement.types).sort()).toEqual(Object.keys(en.statement.types).sort());
  });

  it('the folder uses logical classes only (no left/right, ml/mr/pl/pr)', () => {
    const dir = join(__dirname, '../src/pages/khata');
    const bad = /(^|[\s"'`:])(-?(ml|mr|pl|pr)-\S+|(text|float|border|rounded)-(left|right|l|r)\b\S*|(left|right)-\S+)/;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const { strings } = scanSource(readFileSync(join(dir, f), 'utf8'));
      for (const s of strings) expect(bad.test(s), `${f}: ${s}`).toBe(false);
    }
  });

  it('no cost anywhere on the screen', async () => {
    show(fakeShell());
    await loaded();
    expect(document.body.textContent).not.toMatch(/cost|margin|profit|لاگت|منافع/i);
  });
});
