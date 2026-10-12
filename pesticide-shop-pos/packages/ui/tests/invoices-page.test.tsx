// @vitest-environment jsdom
// Invoice history, the invoice detail and the print buttons, driven the way a person drives them, against a fake API built with the real client code.
import { buildApi, type Channel, type InvoiceDetail, type InvoiceListRow, type Language, type PrintResult, type SaleView, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { InvoicesPage, PAGE_SIZE } from '../src/pages/invoices/invoices-page.js';
import { PrintActions } from '../src/pages/invoices/print-actions.js';
import { SaleDoneDialog } from '../src/pages/pos/bill-dialogs.js';

// The zone the invoice screens use comes from ONE constant (pages/invoices/time-zone.ts). Tests may move it to prove every date follows it.
const zone = vi.hoisted(() => ({ value: 'Asia/Karachi' }));
vi.mock('../src/pages/invoices/time-zone.js', () => ({
  get SHOP_TIME_ZONE() {
    return zone.value;
  },
}));

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

const ok = (data: unknown) => ({ ok: true as const, data });
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

const row = (n: number, over: Partial<InvoiceListRow> = {}): InvoiceListRow => ({
  id: `inv-${n}`,
  invoice_no: `INV-A-${String(n).padStart(6, '0')}`,
  invoice_date: '2026-10-12T05:42:00.000Z',
  status: 'active',
  customer_name_en: 'Rashid',
  customer_name_ur: 'راشد',
  total: 205_000,
  paid_amount: 100_000,
  on_khata: 105_000,
  payment_method: 'cash',
  sold_by: 'Owner',
  line_count: 3,
  print_count: 0,
  ...over,
});

const ROWS: InvoiceListRow[] = [
  row(3, { customer_name_en: null, customer_name_ur: null, total: 50_000, paid_amount: 50_000, on_khata: 0, payment_method: 'easypaisa', sold_by: 'Salesman', print_count: 2 }),
  row(2),
  row(1, { status: 'voided', customer_name_en: 'Bashir', customer_name_ur: 'بشیر', print_count: 1 }),
];

const DETAIL: InvoiceDetail = {
  invoice: {
    id: 'inv-2', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', due_date: '2026-11-30', status: 'active', payment_method: 'cash', price_type: 'retail',
    subtotal: 195_900, tax_total: 9100, total: 205_000, paid_amount: 100_000, on_khata: 105_000,
  },
  customer: { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12' },
  customer_id: 'c1',
  sold_by: 'Owner',
  lines: [
    { position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', qty: 2000, base_unit: 'ml', pack_size: 1000, unit_price: 50_000, line_discount: 0, tax_rate_bp: 1000, tax_amount: 9100, line_total: 100_000 },
    { position: 2, name_en: 'Fertilizer', name_ur: 'کھاد', batch_no: 'F-001', qty: 250, base_unit: 'g', pack_size: 1000, unit_price: 20_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 5000 },
  ],
};

const printed = (over: Partial<PrintResult> = {}): PrintResult => ({ status: 'printed', pdf_path: null, fallback: null, kind: 'receipt', language: 'en', is_copy: false, ...over });

type Handler = (input: any) => unknown | Promise<unknown>;

function fakeShell(override: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'invoices:list': () => ok({ rows: ROWS, total: ROWS.length }),
    'invoices:get': () => ok(DETAIL),
    'print:document': (input) => ok(printed({ kind: input.kind })),
    ...override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? await h(input) : fail('INTERNAL');
  });
  const of = (channel: string) => calls.filter((c) => c.channel === channel);
  return { api, calls, of, lists: () => of('invoices:list'), prints: () => of('print:document') };
}
type Shell = ReturnType<typeof fakeShell>;

let T = en.invoices;
function show(shell: Shell, user: SessionUser = STAFF, language: Language = 'en') {
  T = language === 'ur' ? ur.invoices : en.invoices;
  return render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <InvoicesPage api={shell.api} user={user} />
    </I18nProvider>,
  );
}
const loaded = () => screen.findByRole('button', { name: T.openLabel('INV-A-000002') });
const openSecond = async () => {
  await userEvent.setup().click(await loaded());
  await screen.findByText('Insecticide 1 L').catch(() => screen.findByText('کیڑے مار دوا 1 لیٹر'));
};
const printButton = (kind: string, output: string) => document.querySelector<HTMLButtonElement>(`[data-print="${kind}:${output}"]`)!;

afterEach(() => {
  cleanup();
  zone.value = 'Asia/Karachi';
});

describe('Invoices: the list', () => {
  it('shows a loading state, then the rows: number, date, customer or walk-in, total, paid, on Khata, method, sold by and the printed hint', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const shell = fakeShell({ 'invoices:list': async () => (await gate, ok({ rows: ROWS, total: 3 })) });
    show(shell);
    expect(screen.getByRole('status').textContent).toContain(T.loading);
    release();
    await loaded();
    const second = document.querySelector('[data-invoice-row="INV-A-000002"]') as HTMLElement;
    const text = second.textContent!;
    for (const part of ['INV-A-000002', '12 Oct 2026, 10:42', 'Rashid', 'Rs 2,050', 'Rs 1,000', 'Rs 1,050', 'Cash', 'Owner', 'Not printed']) expect(text, part).toContain(part);
    const walkIn = document.querySelector('[data-invoice-row="INV-A-000003"]')!.textContent!;
    for (const part of ['Walk-in', 'Easypaisa', 'Salesman', 'Printed 2 times', '—']) expect(walkIn, part).toContain(part);
    expect(document.querySelector('[data-invoice-row="INV-A-000001"]')!.textContent).toContain('Voided');
    expect(document.querySelector('[data-invoice-row="INV-A-000001"]')!.textContent).toContain('Printed once');
  });

  it('the first request is the newest page with no filter, and the owner and staff send the very same request', async () => {
    const a = fakeShell();
    show(a, STAFF);
    await loaded();
    cleanup();
    const b = fakeShell();
    show(b, OWNER);
    await loaded();
    expect(a.lists()[0]!.input).toEqual({ limit: PAGE_SIZE, offset: 0 });
    expect(b.lists()[0]!.input).toEqual(a.lists()[0]!.input);
  });

  it('search waits for typing to pause: one request for "ras", none for "r" or "ra"', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const before = shell.lists().length;
    await userEvent.setup().type(screen.getByRole('searchbox', { name: T.searchLabel }), 'ras');
    expect(shell.lists().length).toBe(before); // nothing sent while typing
    await waitFor(() => expect(shell.lists().length).toBe(before + 1));
    expect(shell.lists().slice(before).map((c) => c.input.query)).toEqual(['ras']);
  });

  it('status chips and the date range are sent as filters, and any change goes back to the first page', async () => {
    const shell = fakeShell({ 'invoices:list': () => ok({ rows: ROWS, total: 60 }) });
    show(shell);
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name: T.next }));
    await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(PAGE_SIZE));
    await userEvent.setup().click(screen.getByRole('button', { name: T.statusVoided }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ status: 'voided', limit: PAGE_SIZE, offset: 0 }));
    fireEvent.change(screen.getByLabelText(T.from), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(T.to), { target: { value: '2026-10-12' } });
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ status: 'voided', from: '2026-10-01', to: '2026-10-12', limit: PAGE_SIZE, offset: 0 }));
    expect(screen.getByRole('button', { name: T.statusVoided }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(screen.getByRole('button', { name: T.statusAll }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toEqual({ from: '2026-10-01', to: '2026-10-12', limit: PAGE_SIZE, offset: 0 }));
  });

  it('paging asks for the next and the previous page, says which rows are shown, and disables the ends', async () => {
    const shell = fakeShell({ 'invoices:list': (input) => ok({ rows: ROWS, total: 60 + 0 * input.offset }) });
    show(shell);
    await loaded();
    expect(document.querySelector('[data-range]')!.textContent).toBe('1–3 of 60');
    expect((screen.getByRole('button', { name: T.previous }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: T.next }));
    await waitFor(() => expect(document.querySelector('[data-range]')!.textContent).toBe('26–28 of 60'));
    expect(shell.lists().at(-1)!.input).toEqual({ limit: PAGE_SIZE, offset: PAGE_SIZE });
    await userEvent.setup().click(screen.getByRole('button', { name: T.previous }));
    await waitFor(() => expect(shell.lists().at(-1)!.input.offset).toBe(0));
  });

  it('the last page has no Next', async () => {
    show(fakeShell());
    await loaded();
    expect((screen.getByRole('button', { name: T.next }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('empty: says there are no invoices yet; nothing found: offers to clear the search', async () => {
    const shell = fakeShell({ 'invoices:list': () => ok({ rows: [], total: 0 }) });
    show(shell);
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: T.statusVoided }));
    expect(await screen.findByText(T.noMatchTitle)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: T.clearFilters }));
    expect(await screen.findByText(T.emptyTitle)).toBeTruthy();
    expect(shell.lists().at(-1)!.input).toEqual({ limit: PAGE_SIZE, offset: 0 });
  });

  it('an error is shown with a Try again that asks again', async () => {
    let failing = true;
    const shell = fakeShell({ 'invoices:list': () => (failing ? fail('INTERNAL') : ok({ rows: ROWS, total: 3 })) });
    show(shell);
    expect(await screen.findByRole('alert')).toBeTruthy();
    failing = false;
    await userEvent.setup().click(screen.getByRole('button', { name: T.retry }));
    await loaded();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Invoices: the time zone of every date', () => {
  // 2026-10-12 05:42 UTC is 10:42 in Karachi (UTC+5) and 18:42 in Auckland (UTC+13 in October).
  it('the list and the detail both show invoice dates in the one shop zone', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    const rowText = () => document.querySelector('[data-invoice-row="INV-A-000002"]')!.textContent!;
    expect(rowText()).toContain('12 Oct 2026, 10:42');
    await openSecond();
    const detail = screen.getByRole('dialog');
    expect(detail.textContent).toContain('12 Oct 2026, 10:42');
    cleanup();

    zone.value = 'Pacific/Auckland'; // change the ONE constant: nothing else is touched
    show(fakeShell());
    await loaded();
    expect(rowText()).toContain('12 Oct 2026, 18:42');
    expect(rowText()).not.toContain('10:42');
    await openSecond();
    expect(screen.getByRole('dialog').textContent).toContain('12 Oct 2026, 18:42');
    expect(screen.getByRole('dialog').textContent).not.toContain('10:42');
  });

  it('no file in pages/invoices names a time zone except time-zone.ts', () => {
    const dir = join(__dirname, '..', 'src', 'pages', 'invoices');
    for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== 'time-zone.ts')) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(/['"`][A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+['"`]/.test(text), `${file} names an IANA zone`).toBe(false);
      expect(text, file).not.toContain('Karachi');
    }
    expect(readFileSync(join(dir, 'time-zone.ts'), 'utf8')).toContain("export const SHOP_TIME_ZONE = 'Asia/Karachi'");
  });
});

describe('Invoices: the detail', () => {
  it('opens with invoices:get for that invoice and shows the lines as sold, the totals and the print count', async () => {
    const shell = fakeShell();
    show(shell);
    await openSecond();
    expect(shell.of('invoices:get')[0]!.input).toEqual({ invoice_id: 'inv-2' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    const lines = [...dialog.querySelectorAll('[data-line]')].map((l) => l.textContent!);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Insecticide 1 L');
    expect(lines[0]).toContain('2'); // two whole packs
    expect(lines[0]).toContain('Rs 500'); // price per pack
    expect(lines[0]).toContain('Rs 91'); // tax inside the line
    expect(lines[0]).toContain('Rs 1,000');
    expect(lines[1]).toContain('250 g'); // loose
    expect(lines[1]).toContain('Rs 200/kg');
    expect(lines[1]).toContain('loose');
    expect(within(dialog).getByText('Rashid · Chak 12')).toBeTruthy();
    expect(dialog.querySelector('[data-detail-total]')!.textContent).toBe('Rs 2,050');
    expect(dialog.textContent).toContain('Rs 1,050'); // on Khata
    expect(dialog.textContent).toContain('Not printed');
  });

  it('while the invoice loads it says so, and an error offers to try again', async () => {
    let failing = true;
    const shell = fakeShell({ 'invoices:get': () => (failing ? fail('INTERNAL') : ok(DETAIL)) });
    show(shell);
    await userEvent.setup().click(await loaded());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    failing = false;
    await userEvent.setup().click(within(dialog).getByRole('button', { name: T.retry }));
    await within(dialog).findByText('Insecticide 1 L');
  });

  it('Close closes it', async () => {
    show(fakeShell());
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.detail.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Printing from the history', () => {
  it('each button sends print:document with the invoice, the right kind and the right output (and no language)', async () => {
    const shell = fakeShell();
    show(shell);
    await openSecond();
    const cases: [string, string, { kind: string; output: string }][] = [
      [T.print.receipt, 'receipt:printer', { kind: 'receipt', output: 'printer' }],
      [T.print.invoice, 'invoice:printer', { kind: 'invoice', output: 'printer' }],
      [T.print.receiptPdf, 'receipt:pdf', { kind: 'receipt', output: 'pdf' }],
      [T.print.invoicePdf, 'invoice:pdf', { kind: 'invoice', output: 'pdf' }],
    ];
    for (const [name, , expected] of cases) {
      await userEvent.setup().click(screen.getByRole('button', { name }));
      await waitFor(() => expect(shell.prints().at(-1)!.input).toEqual({ invoice_id: 'inv-2', ...expected }));
      await waitFor(() => expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false));
    }
    expect(shell.prints()).toHaveLength(4);
  });

  it('a printed reply is a calm confirmation, and the list is refreshed so the printed count follows', async () => {
    let count = 0;
    const shell = fakeShell({ 'invoices:list': () => ok({ rows: [row(2, { print_count: count })], total: 1 }), 'print:document': () => ((count = 1), ok(printed())) });
    show(shell);
    await openSecond();
    const before = shell.lists().length;
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.receipt }));
    const outcome = await waitFor(() => {
      const el = document.querySelector('[data-print-outcome="printed"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(outcome.textContent).toContain(T.print.printed);
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(shell.lists().length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Printed once'));
  });

  it.each([
    ['no_printer', en.invoices.print.savedNoPrinter],
    ['print_failed', en.invoices.print.savedFailed],
  ] as const)('a PDF saved instead (%s) is shown as a NOTICE with the file path, not as an error', async (fallback, reason) => {
    const path = 'C:\\Users\\Shop\\Documents\\Pesticide Club POS\\Receipts\\INV-A-000002.pdf';
    const shell = fakeShell({ 'print:document': () => ok(printed({ status: 'pdf_saved', pdf_path: path, fallback })) });
    show(shell);
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.receipt }));
    const outcome = await waitFor(() => {
      const el = document.querySelector('[data-print-outcome="pdf_saved"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(outcome.getAttribute('data-fallback')).toBe(fallback);
    expect(within(outcome).getByRole('status').textContent).toContain(T.print.savedTitle);
    expect(outcome.textContent).toContain(reason);
    expect(outcome.querySelector('[data-pdf-path]')!.textContent).toContain(path);
    expect(screen.queryByRole('alert')).toBeNull(); // no error box anywhere
  });

  it('a PDF that was asked for says the file is ready (no fallback reason)', async () => {
    const shell = fakeShell({ 'print:document': () => ok(printed({ status: 'pdf_saved', pdf_path: 'C:\\r\\a.pdf', fallback: null })) });
    show(shell);
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.receiptPdf }));
    const outcome = await waitFor(() => document.querySelector('[data-print-outcome="pdf_saved"]') as HTMLElement);
    expect(outcome.textContent).toContain(T.print.savedAsked);
    expect(outcome.textContent).not.toContain(T.print.savedNoPrinter);
  });

  it('a COPY reply shows the COPY hint', async () => {
    const shell = fakeShell({ 'print:document': () => ok(printed({ is_copy: true })) });
    show(shell);
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.receipt }));
    const hint = await waitFor(() => document.querySelector('[data-copy-hint]') as HTMLElement);
    expect(hint.textContent).toContain('COPY');
    expect(hint.textContent).toContain(T.print.copyHint);
  });

  it('only a real failure (not even a PDF could be made) is an error', async () => {
    const shell = fakeShell({ 'print:document': () => fail('INTERNAL') });
    show(shell);
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.receipt }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(document.querySelector('[data-print-outcome]')).toBeNull();
    // and the buttons work again
    expect((screen.getByRole('button', { name: T.print.receipt }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a second click while one print is on its way sends one request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const shell = fakeShell({ 'print:document': async () => (await gate, ok(printed())) });
    show(shell);
    await openSecond();
    const button = screen.getByRole('button', { name: T.print.receipt });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(printButton('invoice', 'pdf'));
    release();
    await waitFor(() => expect(document.querySelector('[data-print-outcome]')).toBeTruthy());
    expect(shell.prints()).toHaveLength(1);
  });
});

describe('Printing from the sale-saved box at the counter', () => {
  const sale = { invoice: { id: 'inv-9', invoice_no: 'INV-A-000009', total: 50_000, paid_amount: 50_000, payment_method: 'cash' }, items: [], payment_id: 'p' } as unknown as SaleView;

  function showDone(shell: Shell, language: Language = 'en') {
    return render(
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <SaleDoneDialog sale={sale} tendered={null} isCash onNewSale={() => undefined} receiptActions={(s, newSale) => (
          <PrintActions counter api={shell.api} invoiceId={s.invoice.id} kinds={['receipt']}>
            {newSale}
          </PrintActions>
        )} />
      </I18nProvider>,
    );
  }

  it('has Print receipt and Save PDF for that invoice, and no A4 button', async () => {
    const shell = fakeShell();
    showDone(shell);
    expect(screen.queryByRole('button', { name: en.invoices.print.invoice })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: en.invoices.print.receipt }));
    await waitFor(() => expect(shell.prints()[0]!.input).toEqual({ invoice_id: 'inv-9', kind: 'receipt', output: 'printer' }));
    await waitFor(() => expect((screen.getByRole('button', { name: en.invoices.print.receipt }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.setup().click(screen.getByRole('button', { name: en.invoices.print.savePdf }));
    await waitFor(() => expect(shell.prints()[1]!.input).toEqual({ invoice_id: 'inv-9', kind: 'receipt', output: 'pdf' }));
  });

  it('a PDF fallback is a notice inside the box, not an error', async () => {
    const shell = fakeShell({ 'print:document': () => ok(printed({ status: 'pdf_saved', pdf_path: 'C:\\r\\a.pdf', fallback: 'no_printer' })) });
    showDone(shell);
    await userEvent.setup().click(screen.getByRole('button', { name: en.invoices.print.receipt }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.querySelector('[data-print-outcome="pdf_saved"]')).toBeTruthy());
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(dialog.textContent).toContain('C:\\r\\a.pdf');
    expect(within(dialog).getByRole('button', { name: en.pos.done.newSale })).toBeTruthy();
  });
});

describe('Invoices in Urdu', () => {
  it('is right to left with Urdu words, Urdu customer names and Latin amounts', async () => {
    const shell = fakeShell();
    show(shell, STAFF, 'ur');
    await loaded();
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ur.pages.invoices.title);
    const text = document.querySelector('[data-page="invoices"]')!.textContent!;
    for (const part of [ur.invoices.colCustomer, ur.invoices.colKhata, ur.invoices.walkIn, 'راشد', ur.invoices.printedTimes(2), 'Rs 2,050']) expect(text, part).toContain(part);
    expect(text).not.toContain('Walk-in');
    // numbers keep left to right
    expect(document.querySelector('[data-invoice-row="INV-A-000002"] td:nth-child(4)')!.className).toContain('num');
  });

  it('the detail and the print buttons are in Urdu and still send the same requests', async () => {
    const shell = fakeShell({ 'print:document': () => ok(printed({ status: 'pdf_saved', pdf_path: 'C:\\r\\a.pdf', fallback: 'no_printer', is_copy: true })) });
    show(shell, STAFF, 'ur');
    await openSecond();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('کیڑے مار دوا 1 لیٹر');
    expect(dialog.textContent).toContain('راشد · Chak 12');
    await userEvent.setup().click(screen.getByRole('button', { name: ur.invoices.print.invoice }));
    await waitFor(() => expect(shell.prints()[0]!.input).toEqual({ invoice_id: 'inv-2', kind: 'invoice', output: 'printer' }));
    const outcome = await waitFor(() => dialog.querySelector('[data-print-outcome="pdf_saved"]') as HTMLElement);
    expect(outcome.textContent).toContain(ur.invoices.print.savedTitle);
    expect(outcome.textContent).toContain(ur.invoices.print.savedNoPrinter);
    expect(outcome.querySelector('[data-pdf-path]')!.getAttribute('dir')).toBe('ltr');
    expect(dialog.textContent).toContain('COPY');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('the Urdu and English texts have the same shape', () => {
    expect(Object.keys(ur.invoices).sort()).toEqual(Object.keys(en.invoices).sort());
    expect(Object.keys(ur.invoices.print).sort()).toEqual(Object.keys(en.invoices.print).sort());
    expect(Object.keys(ur.invoices.detail).sort()).toEqual(Object.keys(en.invoices.detail).sort());
  });
});

describe('Invoices: no cost, and right to left by logical classes only', () => {
  it('no request carries a cost flag, and nothing on the screen or in the detail says cost', async () => {
    const shell = fakeShell();
    show(shell, STAFF);
    await openSecond();
    await userEvent.setup().click(screen.getByRole('button', { name: T.print.invoice }));
    await waitFor(() => expect(shell.prints()).toHaveLength(1));
    expect(JSON.stringify(shell.calls)).not.toMatch(/cost|include_cost|includeCost|profit|margin/i);
    expect(document.body.textContent).not.toMatch(/cost|profit|margin/i);
  });

  it('no file in pages/invoices uses left or right', () => {
    const dir = join(__dirname, '..', 'src', 'pages', 'invoices');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-left|text-right|\bleft-\d|\bright-\d/);
    }
  });
});

describe('Invoices: dates that read the same in English and Urdu (docs/design: "30 Nov 2026")', () => {
  it('the From and To boxes say "Any date" until a date is chosen, then "5 Dec 2026", never the browser mm/dd/yyyy, and still send YYYY-MM-DD', async () => {
    for (const language of ['en', 'ur'] as const) {
      const T2 = language === 'ur' ? ur.invoices : en.invoices;
      const shell = fakeShell();
      show(shell, STAFF, language);
      await loaded();
      const from = screen.getByLabelText(T2.from) as HTMLInputElement;
      const box = from.closest('[data-date-field]')!;
      expect(box.textContent).toBe(T2.anyDate);
      fireEvent.change(from, { target: { value: '2026-12-05' } });
      await waitFor(() => expect(box.textContent).toBe('5 Dec 2026'));
      expect(box.textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|mm|yyyy/i);
      await waitFor(() => expect(shell.lists().at(-1)!.input).toMatchObject({ from: expect.stringContaining('2026-12-05') }));
      cleanup();
    }
  });
});

describe('Printing from the sale-saved box: the "Could not print" box (docs/design/PosDialogs.dc.html)', () => {
  const sale = { invoice: { id: 'inv-9', invoice_no: 'INV-A-000009', total: 50_000, paid_amount: 50_000, payment_method: 'cash' }, items: [], payment_id: 'p' } as unknown as SaleView;
  const showDone = (shell: Shell) =>
    render(
      <I18nProvider language="en" onLanguageChange={() => undefined}>
        <SaleDoneDialog
          sale={sale}
          tendered={null}
          isCash
          onNewSale={() => undefined}
          receiptActions={(s, newSale) => (
            <PrintActions counter api={shell.api} invoiceId={s.invoice.id} kinds={['receipt']}>
              {newSale}
            </PrintActions>
          )}
        />
      </I18nProvider>,
    );

  it('the sale-saved box has Save PDF, New sale and Print receipt in that order, Print receipt being the main (green) one', () => {
    showDone(fakeShell());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([en.invoices.print.savePdf, en.pos.done.newSale, en.invoices.print.receipt]);
    expect(within(dialog).getByRole('button', { name: en.invoices.print.receipt }).className).toContain('bg-accent');
    expect(within(dialog).getByRole('button', { name: en.pos.done.newSale }).className).not.toContain('bg-accent');
  });

  it('when not even a PDF could be made, a box says so with Skip, Save PDF and Try again; Try again asks for the same thing, Skip closes it, the sale stays saved', async () => {
    const shell = fakeShell({ 'print:document': () => fail('INTERNAL') });
    showDone(shell);
    await userEvent.setup().click(screen.getByRole('button', { name: en.invoices.print.receipt }));
    const failed = await screen.findByRole('dialog', { name: en.invoices.print.failedTitle });
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
