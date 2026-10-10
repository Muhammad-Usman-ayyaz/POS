// @vitest-environment jsdom
// Receive stock, driven the way the owner drives it, against a fake API built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { PurchasesPage } from '../src/pages/purchases/purchases-page.js';
import { todayText } from '../src/pages/purchases/receive-state.js';
import { ReceiveStockPage } from '../src/pages/purchases/receive-stock-page.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };
const f = en.receive;
const today = todayText();
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const daysAhead = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ---- fixtures ----

const size = (id: string, label: string, packSize: number) => ({ id, group_id: 'g1', pack_label: label, pack_size: packSize, is_active: 1 });
const insecticide = (sizes = [size('p1000', '1 L', 1000), size('p500', '500 ml', 500)]) => ({ group: { id: 'g1', name_en: 'Insecticide', name_ur: 'کیڑے مار دوا' }, sizes, matched_size_ids: [], rank: 0, summary: {} });
const fungicide = () => ({ group: { id: 'g2', name_en: 'Fungicide', name_ur: 'پھپھوندی کش' }, sizes: [size('f250', '250 ml', 250)], matched_size_ids: [], rank: 0, summary: {} });

/** What the shop already has: B-014 for the 1 L (Rs 400, expires 12 Mar 2027) and for the 500 ml (Rs 215, same expiry). */
const BATCHES: Record<string, { batch_id: string; batch_no: string; expiry_date: string; cost_price: number; stock: number }[]> = {
  p1000: [{ batch_id: 'b1', batch_no: 'B-014', expiry_date: '2027-03-12', cost_price: 40_000, stock: 5000 }],
  p500: [{ batch_id: 'b2', batch_no: 'B-014', expiry_date: '2027-03-12', cost_price: 21_500, stock: 10_000 }],
  f250: [],
};

// ---- a pretend main process ----

type Handler = (input: any) => unknown;
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

function fakeShell(options: { override?: Partial<Record<Channel, Handler>>; batches?: typeof BATCHES } = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { suppliers: [{ id: 's1', name_en: 'Green Valley Traders', name_ur: 'گرین ویلی ٹریڈرز' }], batches: options.batches ?? BATCHES };
  const handlers: Partial<Record<Channel, Handler>> = {
    'suppliers:list': () => ({ ok: true, data: state.suppliers }),
    'suppliers:create': (input) => {
      const row = { id: `s${state.suppliers.length + 1}`, name_en: input.name_en ?? null, name_ur: input.name_ur ?? null };
      state.suppliers.push(row);
      return { ok: true, data: row };
    },
    'catalogue:list': ({ query }) => {
      const q = String(query ?? '').toLowerCase();
      const hits = q === '' ? [insecticide(), fungicide()] : q === '8961000250500' ? [insecticide([size('p500', '500 ml', 500)])] : q.includes('insect') ? [insecticide()] : q.includes('fung') ? [fungicide()] : [];
      return { ok: true, data: { hits, total: hits.length, counts: {} } };
    },
    'stock:batchesOf': ({ productId }) => ({ ok: true, data: state.batches[productId] ?? [] }),
    'stock:receive': () => ({ ok: true, data: { purchase_id: 'pu1', total: 910_000, batch_ids: [] } }),
    ...options.override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : fail('INTERNAL');
  });
  const receives = () => calls.filter((c) => c.channel === 'stock:receive');
  return { api, calls, state, handlers, receives };
}

let now = en.receive;
function show(shell: ReturnType<typeof fakeShell>, user: SessionUser = OWNER, language: Language = 'en') {
  now = language === 'ur' ? ur.receive : en.receive;
  return render(
    <MemoryRouter initialEntries={['/purchases/receive']}>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <Routes>
            <Route path="/products" element={<p>the product list</p>} />
            <Route path="/purchases" element={<PurchasesPage user={user} />} />
            <Route path="/purchases/receive" element={<ReceiveStockPage api={shell.api} user={user} />} />
          </Routes>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const receiveButton = () => screen.getByRole('button', { name: f.receive }) as HTMLButtonElement;
const lineOf = (n: number): HTMLElement => document.querySelectorAll<HTMLElement>('[data-line]')[n - 1]!;
const lineField = (n: number, name: string) => lineOf(n).querySelector<HTMLInputElement>(`[name=${name}]`)!;
const ready = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en') => {
  show(shell, user, language);
  await screen.findByRole('option', { name: language === 'ur' ? 'گرین ویلی ٹریڈرز' : 'Green Valley Traders' });
  return shell;
};

/** Open the search, type, and pick the size with that label. */
async function addLine(typed: string, sizeLabel: string): Promise<void> {
  const opener = screen.queryByRole('button', { name: f.addLine });
  if (opener) fireEvent.click(opener);
  set(screen.getByRole('searchbox', { name: f.searchLabel }), typed);
  // The results only: a line already on the form has a "Remove ... 1 L" button that would match too.
  const choice = await within(await screen.findByRole('list')).findByRole('button', { name: new RegExp(`${sizeLabel}$`) });
  fireEvent.click(choice);
}

/** One valid line: the size, a batch number, expiry, packs and cost. */
async function fillLine(n: number, typed: string, sizeLabel: string, v: { batch: string; expiry: string; packs: string; cost: string }): Promise<void> {
  await addLine(typed, sizeLabel);
  await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(n));
  set(lineField(n, 'batchNo'), v.batch);
  set(lineField(n, 'expiry'), v.expiry);
  set(lineField(n, 'packs'), v.packs);
  set(lineField(n, 'cost'), v.cost);
}

afterEach(cleanup);

// ---------- access ----------

describe('who can open it', () => {
  it('staff are sent to Purchases, which has no Receive stock link for them', async () => {
    const shell = fakeShell();
    show(shell, STAFF);
    expect(await screen.findByRole('heading', { name: en.pages.purchases.title, level: 1 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: en.purchases.receiveLink })).toBeNull();
    expect(shell.calls.filter((c) => c.channel === 'suppliers:list')).toHaveLength(0);
  });

  it('the owner sees the form; Purchases leads to it', async () => {
    await ready();
    expect(screen.getByRole('heading', { name: f.title, level: 1 })).toBeTruthy();
    cleanup();
    show(fakeShell(), OWNER);
    // Purchases itself: a link to Receive stock for the owner
    cleanup();
    render(
      <MemoryRouter>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <PurchasesPage user={OWNER} />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: en.purchases.receiveLink }).getAttribute('href')).toBe('/purchases/receive');
  });
});

// ---------- header ----------

describe('the header', () => {
  it('has the supplier, the supplier invoice number and the date received (today by default)', async () => {
    await ready();
    expect(screen.getByLabelText(f.supplier)).toBeTruthy();
    expect(screen.getByLabelText(f.invoiceNo)).toBeTruthy();
    expect((screen.getByLabelText(f.dateReceived) as HTMLInputElement).value).toBe(today);
  });

  it('adds a supplier inside the form and selects it (owner only screen)', async () => {
    const shell = await ready();
    fireEvent.click(screen.getByRole('button', { name: f.newSupplier }));
    set(screen.getByLabelText(`${f.supplier}: ${en.productForm.nameEn}`), 'Agri Dealer');
    fireEvent.click(screen.getByRole('button', { name: en.productForm.quickAdd }));
    await waitFor(() => expect((screen.getByLabelText(f.supplier) as HTMLSelectElement).value).toBe('s2'));
    expect(shell.calls.find((c) => c.channel === 'suppliers:create')?.input).toEqual({ name_en: 'Agri Dealer' });
  });

  it('a PAST date is accepted without a fuss', async () => {
    await ready();
    set(screen.getByLabelText(f.dateReceived), daysAgo(1));
    expect(screen.queryByText(f.problems.dateFuture)).toBeNull();
  });

  it('a FUTURE date is refused next to the field, and no request can be sent', async () => {
    const shell = await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '2', cost: '400' });
    set(screen.getByLabelText(f.dateReceived), daysAhead(1));
    expect(screen.getByText(f.problems.dateFuture)).toBeTruthy();
    expect(receiveButton().disabled).toBe(true);
    fireEvent.submit(document.querySelector('form')!);
    expect(shell.receives()).toHaveLength(0);
  });

  it('a supplier must be chosen', async () => {
    await ready();
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '2', cost: '400' });
    await waitFor(() => expect(screen.getByText(f.why.header)).toBeTruthy());
    expect(receiveButton().disabled).toBe(true);
    set(screen.getByLabelText(f.supplier), 's1');
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
  });
});

// ---------- lines ----------

describe('lines', () => {
  it('starts empty, with a message, Receive off and the reason', async () => {
    await ready();
    expect(screen.getByText(f.emptyLines)).toBeTruthy();
    expect(receiveButton().disabled).toBe(true);
    expect(screen.getByText(f.why.noLines)).toBeTruthy();
    expect(screen.getByText(f.summary(0, 0))).toBeTruthy();
  });

  it('adds a line from the search, named with its size', async () => {
    await ready();
    await addLine('insect', '1 L');
    const line = lineOf(1);
    expect(within(line).getByText('Insecticide')).toBeTruthy();
    expect(within(line).getByText('1 L')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull(); // the search closed
  });

  it('the search waits for typing to pause: fast typing sends ONE search with the last text', async () => {
    vi.useFakeTimers();
    try {
      const shell = fakeShell();
      show(shell);
      await act(() => vi.advanceTimersByTimeAsync(10));
      fireEvent.click(screen.getByRole('button', { name: f.addLine }));
      await act(() => vi.advanceTimersByTimeAsync(10));
      const before = shell.calls.filter((c) => c.channel === 'catalogue:list').length;
      const box = screen.getByRole('searchbox', { name: f.searchLabel });
      for (const text of ['i', 'in', 'ins']) {
        fireEvent.change(box, { target: { value: text } });
        await act(() => vi.advanceTimersByTimeAsync(50));
      }
      expect(shell.calls.filter((c) => c.channel === 'catalogue:list')).toHaveLength(before);
      await act(() => vi.advanceTimersByTimeAsync(200));
      const searches = shell.calls.filter((c) => c.channel === 'catalogue:list');
      expect(searches).toHaveLength(before + 1);
      expect(searches.at(-1)!.input).toMatchObject({ query: 'ins' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a scanned barcode (typed, then Enter) adds the one size it matches, and does not submit the receipt', async () => {
    const shell = await ready();
    fireEvent.click(screen.getByRole('button', { name: f.addLine }));
    const box = screen.getByRole('searchbox', { name: f.searchLabel });
    set(box, '8961000250500');
    fireEvent.keyDown(box, { key: 'Enter' }); // at once, as a scanner does: the answer is not here yet
    await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(1));
    expect(within(lineOf(1)).getByText('500 ml')).toBeTruthy();
    expect(shell.receives()).toHaveLength(0);
  });

  it('Enter pressed straight after typing never picks from the PREVIOUS search (a stale single result)', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: f.addLine }));
    const box = screen.getByRole('searchbox', { name: f.searchLabel });
    set(box, 'fung');
    await within(screen.getByRole('list')).findByRole('button', { name: /250 ml$/ }); // the list now has exactly one size
    set(box, 'insect');
    fireEvent.keyDown(box, { key: 'Enter' }); // the list on screen is still Fungicide's
    await within(screen.getByRole('list')).findByRole('button', { name: /1 L$/ });
    expect(document.querySelectorAll('[data-line]')).toHaveLength(0); // two sizes match: nothing is picked, and certainly not the fungicide
  });

  it('Enter with several matches adds nothing; no match says so; Close closes the search', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: f.addLine }));
    const box = screen.getByRole('searchbox', { name: f.searchLabel });
    set(box, 'insect');
    await screen.findByRole('button', { name: /1 L$/ });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(document.querySelectorAll('[data-line]')).toHaveLength(0);
    set(box, 'zzzz');
    expect(await screen.findByText(f.noResults)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: f.closeSearch }));
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('a line is removed with its x', async () => {
    await ready();
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '2', cost: '400' });
    fireEvent.click(within(lineOf(1)).getByRole('button', { name: f.removeLine('Insecticide 1 L') }));
    expect(document.querySelectorAll('[data-line]')).toHaveLength(0);
  });

  it('shows what is wrong with a field once it has been left, not before', async () => {
    await ready();
    await addLine('insect', '1 L');
    expect(within(lineOf(1)).queryByText(f.problems.packsInvalid)).toBeNull();
    fireEvent.blur(lineField(1, 'packs'));
    expect(within(lineOf(1)).getByText(f.problems.packsInvalid)).toBeTruthy();
    set(lineField(1, 'packs'), '12');
    expect(within(lineOf(1)).queryByText(f.problems.packsInvalid)).toBeNull();
  });

  it('the line total is packs times cost per pack, and the footer counts lines, packs and the total cost', async () => {
    await ready();
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '12', cost: '400' });
    await fillLine(2, 'insect', '500 ml', { batch: 'B-020', expiry: '2027-05-01', packs: '20', cost: '215' });
    expect(within(lineOf(1)).getByText('Rs 4,800')).toBeTruthy();
    expect(within(lineOf(2)).getByText('Rs 4,300')).toBeTruthy();
    expect(screen.getByText(f.summary(2, 32))).toBeTruthy();
    expect(screen.getByTestId('total-cost').textContent).toBe('Rs 9,100');
    expect(f.summary(1, 1)).toBe('1 line · 1 pack');
  });

  it('is always paid in full: says so, and has no payment fields and no Save draft', async () => {
    await ready();
    expect(screen.getByText(f.paidInFull)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /draft/i })).toBeNull();
    expect(screen.queryByLabelText(/paid|payment|credit/i)).toBeNull();
  });
});

// ---------- saving ----------

describe('Receive', () => {
  it('sends the receipt with packs turned into BASE UNITS, the cost per pack in paisa, and goes back to the products', async () => {
    const shell = await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    set(screen.getByLabelText(f.invoiceNo), 'GV-20418');
    set(screen.getByLabelText(f.dateReceived), daysAgo(1));
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '12', cost: '400' });
    await fillLine(2, 'insect', '500 ml', { batch: 'B-021', expiry: '2027-06-30', packs: '20', cost: '215.50' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    expect(await screen.findByText('the product list')).toBeTruthy();
    expect(shell.receives()).toHaveLength(1);
    expect(shell.receives()[0]!.input).toEqual({
      supplier_id: 's1',
      supplier_invoice_no: 'GV-20418',
      purchase_date: daysAgo(1),
      items: [
        { product_id: 'p1000', batch_no: 'B-020', expiry_date: '2027-05-01', qty: 12_000, cost_price: 40_000 }, // 12 packs x 1000 ml
        { product_id: 'p500', batch_no: 'B-021', expiry_date: '2027-06-30', qty: 10_000, cost_price: 21_550 }, // 20 packs x 500 ml
      ],
    });
  });

  it('never sends who receives, or a payment', async () => {
    const shell = await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '1', cost: '400' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    await screen.findByText('the product list');
    expect(JSON.stringify(shell.receives())).not.toMatch(/created_by|actor|user_id|paid|payment|pay_in_full/);
  });

  it('cannot be pressed twice while it is saving', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const shell = await ready(fakeShell({ override: { 'stock:receive': async () => (await gate, { ok: true, data: { purchase_id: 'p', total: 1, batch_ids: [] } }) } }));
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '1', cost: '400' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    const busy = await screen.findByRole('button', { name: f.receiving });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    release();
    await screen.findByText('the product list');
    expect(shell.receives()).toHaveLength(1);
  });

  it('a refusal is shown in words and the form keeps everything typed', async () => {
    const shell = await ready(fakeShell({ override: { 'stock:receive': () => fail('PRODUCT_INACTIVE') } }));
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-020', expiry: '2027-05-01', packs: '12', cost: '400' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(lineField(1, 'packs').value).toBe('12');
    expect(screen.queryByText('the product list')).toBeNull();
    expect(shell.receives()).toHaveLength(1);
  });
});

// ---------- batch clashes ----------

describe('a batch number that already exists for the size', () => {
  const clashOn500 = async (v: { expiry: string; cost: string }) => {
    const shell = await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '500 ml', { batch: 'B-014', expiry: v.expiry, packs: '20', cost: v.cost });
    return shell;
  };
  const panel = () => screen.getByRole('group', { name: 'Insecticide 500 ml' });

  it('same number, expiry and cost: no clash (the stock is added to that batch)', async () => {
    await clashOn500({ expiry: '2027-03-12', cost: '215' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('a different EXPIRY with the same cost: says so with both dates, and offers BOTH choices', async () => {
    await clashOn500({ expiry: '2027-06-30', cost: '215' });
    const p = await waitFor(() => panel());
    expect(within(p).getByText(f.clash.expiryTitle('B-014'))).toBeTruthy();
    expect(within(p).getByText(f.clash.expiryBody('B-014', '12 Mar 2027', '30 Jun 2027'))).toBeTruthy();
    expect(within(p).getByRole('button', { name: 'Use expiry 12 Mar 2027' })).toBeTruthy();
    expect(within(p).getByRole('button', { name: f.clash.newBatch })).toBeTruthy();
  });

  it('a different COST: only "Save as new batch number" (a cost is never rewritten), saying both costs', async () => {
    await clashOn500({ expiry: '2027-03-12', cost: '230' });
    const p = await waitFor(() => panel());
    expect(within(p).getByText(f.clash.costTitle('B-014'))).toBeTruthy();
    expect(within(p).getByText(f.clash.costBody('Rs 215', 'Rs 230'))).toBeTruthy();
    expect(within(p).getByRole('button', { name: f.clash.newBatch })).toBeTruthy();
    expect(within(p).queryByRole('button', { name: /Use expiry/ })).toBeNull();
  });

  it('a different cost AND a different expiry is a cost clash: still no "Use existing expiry"', async () => {
    await clashOn500({ expiry: '2027-06-30', cost: '230' });
    const p = await waitFor(() => panel());
    expect(within(p).getByText(f.clash.costTitle('B-014'))).toBeTruthy();
    expect(within(p).queryByRole('button', { name: /Use expiry/ })).toBeNull();
  });

  it('Receive is OFF while a clash is open, with the reason; it turns on when the clash is settled', async () => {
    await clashOn500({ expiry: '2027-06-30', cost: '215' });
    await waitFor(() => panel());
    expect(receiveButton().disabled).toBe(true);
    expect(screen.getByText(f.why.clash)).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: /Use expiry/ }));
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
  });

  it('"Use existing expiry" puts the EXISTING date in the field (not what was typed), and that is what is sent', async () => {
    const shell = await clashOn500({ expiry: '2027-06-30', cost: '215' });
    fireEvent.click(within(await waitFor(() => panel())).getByRole('button', { name: 'Use expiry 12 Mar 2027' }));
    expect(lineField(1, 'expiry').value).toBe('2027-03-12');
    expect(screen.queryByRole('group')).toBeNull();
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    await screen.findByText('the product list');
    expect(shell.receives()[0]!.input.items[0]).toMatchObject({ batch_no: 'B-014', expiry_date: '2027-03-12' });
  });

  it('"Save as new batch number" fills in the NEXT FREE number, which can be edited, and that is what is sent', async () => {
    const shell = await clashOn500({ expiry: '2027-06-30', cost: '215' });
    fireEvent.click(within(await waitFor(() => panel())).getByRole('button', { name: f.clash.newBatch }));
    expect(lineField(1, 'batchNo').value).toBe('B-015');
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByText(f.clash.newBatchHint)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(lineField(1, 'batchNo')));
    set(lineField(1, 'batchNo'), 'B-014-X'); // editable
    expect(screen.queryByText(f.clash.newBatchHint)).toBeNull();
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    await screen.findByText('the product list');
    expect(shell.receives()[0]!.input.items[0]).toMatchObject({ batch_no: 'B-014-X', expiry_date: '2027-06-30', cost_price: 21_500 });
  });

  it('the suggested number is never the old one, and skips numbers the size has and other lines use', async () => {
    const shell = fakeShell({ batches: { ...BATCHES, p500: [{ batch_id: 'b2', batch_no: 'B-014', expiry_date: '2027-03-12', cost_price: 21_500, stock: 1 }, { batch_id: 'b3', batch_no: 'B-015', expiry_date: '2027-03-12', cost_price: 21_500, stock: 1 }] } });
    await ready(shell);
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '500 ml', { batch: 'B-016', expiry: '2027-01-01', packs: '1', cost: '215' }); // another line takes B-016
    await fillLine(2, 'insect', '500 ml', { batch: 'B-014', expiry: '2027-06-30', packs: '1', cost: '215' });
    fireEvent.click(within(await waitFor(() => screen.getByRole('group'))).getByRole('button', { name: f.clash.newBatch }));
    expect(lineField(2, 'batchNo').value).toBe('B-017');
  });

  it('the same batch number twice on one receipt shows the duplicate-line message on the second line, with no buttons', async () => {
    await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '2', cost: '400' });
    await fillLine(2, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '3', cost: '400' });
    const p = await waitFor(() => screen.getByRole('group', { name: 'Insecticide 1 L' }));
    expect(within(p).getByText('The same item is listed twice')).toBeTruthy();
    expect(within(p).queryByRole('button')).toBeNull();
    expect(within(lineOf(1)).queryByRole('group')).toBeNull(); // the first line is not blamed
    expect(receiveButton().disabled).toBe(true);
    set(lineField(2, 'batchNo'), 'B-051');
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
  });

  it('a clash is judged per size: the same number on two different sizes is fine', async () => {
    await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '2', cost: '400' });
    await fillLine(2, 'insect', '500 ml', { batch: 'B-050', expiry: '2027-05-01', packs: '3', cost: '215' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
  });

  it('Receive stays off until the existing batches have been looked at (a clash must not be missed)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const shell = fakeShell({ override: { 'stock:batchesOf': async () => (await gate, { ok: true, data: [] }) } });
    await ready(shell);
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '2', cost: '400' });
    expect(receiveButton().disabled).toBe(true);
    expect(screen.getByText(f.why.loading)).toBeTruthy();
    release();
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
  });

  it('if the shell still reports BATCH_CONFLICT (the screen had stale batches), it is shown, the batches are asked again, and the clash appears on its line', async () => {
    let asked = 0;
    const shell = fakeShell({
      override: {
        'stock:batchesOf': ({ productId }) => ({ ok: true, data: (asked += 1) === 1 ? [] : (BATCHES[productId] ?? []) }),
        'stock:receive': () => fail('BATCH_CONFLICT', { kind: 'expiry', batchNo: 'B-014', existingExpiry: '2027-03-12', newExpiry: '2027-06-30' }),
      },
    });
    await ready(shell);
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-014', expiry: '2027-03-12', packs: '1', cost: '400' }); // looks fine: no batches known yet
    set(lineField(1, 'expiry'), '2027-06-30');
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
    expect(await screen.findByRole('group', { name: 'Insecticide 1 L' })).toBeTruthy();
    expect(receiveButton().disabled).toBe(true);
  });
});

// ---------- an old date ----------

describe('a receipt dated more than 30 days ago', () => {
  const oldDate = (days: number) => fail('RECEIPT_DATE_OLD', { date: daysAgo(days), today, days });
  const prepare = async (shell: ReturnType<typeof fakeShell>) => {
    await ready(shell);
    set(screen.getByLabelText(f.supplier), 's1');
    set(screen.getByLabelText(f.dateReceived), daysAgo(45));
    await fillLine(1, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '2', cost: '400' });
    await waitFor(() => expect(receiveButton().disabled).toBe(false));
    fireEvent.click(receiveButton());
  };

  it('asks "This receipt is dated 45 days ago. Save anyway?", and "Save anyway" sends it again with the confirmation', async () => {
    let first = true;
    const shell = fakeShell({ override: { 'stock:receive': () => (first ? ((first = false), oldDate(45)) : { ok: true, data: { purchase_id: 'p', total: 80_000, batch_ids: [] } }) } });
    await prepare(shell);
    const dialog = await screen.findByRole('dialog', { name: 'This receipt is dated 45 days ago' });
    expect(within(dialog).getByText('Save anyway?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save anyway' }));
    expect(await screen.findByText('the product list')).toBeTruthy();
    expect(shell.receives()).toHaveLength(2);
    expect(shell.receives()[0]!.input).not.toHaveProperty('confirm_old_date');
    expect(shell.receives()[1]!.input.confirm_old_date).toBe(true);
    expect(shell.receives()[1]!.input.purchase_date).toBe(daysAgo(45));
  });

  it('"Change the date" closes the question, sends nothing more, and puts the cursor on the date', async () => {
    const shell = fakeShell({ override: { 'stock:receive': () => oldDate(45) } });
    await prepare(shell);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change the date' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shell.receives()).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(f.dateReceived)));
  });

  it('the first send never carries the confirmation (it is asked for, not assumed)', async () => {
    const shell = fakeShell({ override: { 'stock:receive': () => oldDate(45) } });
    await prepare(shell);
    await screen.findByRole('dialog');
    expect(shell.receives()[0]!.input).not.toHaveProperty('confirm_old_date');
  });
});

// ---------- loading and errors ----------

describe('loading and error states', () => {
  it('a supplier list that cannot be loaded shows the error with Try again, and it works the second time', async () => {
    let fails = 1;
    const shell = fakeShell({ override: { 'suppliers:list': () => (fails-- > 0 ? fail('INTERNAL') : { ok: true, data: [{ id: 's1', name_en: 'Green Valley Traders', name_ur: null }] }) } });
    show(shell);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.products.retry }));
    expect(await screen.findByRole('option', { name: 'Green Valley Traders' })).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows "Loading…" in the supplier box until the suppliers arrive', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const shell = fakeShell({ override: { 'suppliers:list': async () => (await gate, { ok: true, data: [] }) } });
    show(shell);
    expect(screen.getByRole('option', { name: f.loading })).toBeTruthy();
    release();
    await screen.findByRole('option', { name: f.supplierPick });
  });

  it('a batch lookup that fails is shown, and Receive stays off', async () => {
    const shell = fakeShell({ override: { 'stock:batchesOf': () => fail('INTERNAL') } });
    await ready(shell);
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '1 L', { batch: 'B-050', expiry: '2027-05-01', packs: '2', cost: '400' });
    expect((await screen.findAllByText('Something went wrong')).length).toBeGreaterThan(0);
    expect(receiveButton().disabled).toBe(true);
  });
});

// ---------- Urdu, touch size, motion ----------

describe('Urdu and right to left', () => {
  it('uses Urdu words, flips the layout, and shows the clash in Urdu with the dates and amounts left to right', async () => {
    const shell = fakeShell();
    await ready(shell, OWNER, 'ur');
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { name: ur.receive.title, level: 1 })).toBeTruthy();
    set(screen.getByLabelText(ur.receive.supplier), 's1');
    fireEvent.click(screen.getByRole('button', { name: ur.receive.addLine }));
    set(screen.getByRole('searchbox', { name: ur.receive.searchLabel }), 'insect');
    fireEvent.click(await screen.findByRole('button', { name: /500 ml$/ }));
    await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(1));
    set(lineField(1, 'batchNo'), 'B-014');
    set(lineField(1, 'expiry'), '2027-06-30');
    set(lineField(1, 'packs'), '20');
    set(lineField(1, 'cost'), '215');
    const p = await waitFor(() => screen.getByRole('group'));
    expect(within(p).getByText(ur.receive.clash.expiryTitle('B-014'))).toBeTruthy();
    expect(within(p).getByRole('button', { name: ur.receive.clash.newBatch })).toBeTruthy();
    expect(within(p).getByRole('button', { name: /^میعاد .* رکھیں$/ })).toBeTruthy();
    expect(screen.getByText(ur.receive.why.clash)).toBeTruthy();
    expect(screen.getByTestId('total-cost').className).toContain('num');
    expect(lineField(1, 'cost').className).toContain('num');
  });

  it('the dates stay left to right in Urdu, the received date cannot be picked after today, and the back arrow points the other way', async () => {
    await ready(fakeShell(), OWNER, 'ur');
    const received = screen.getByLabelText(ur.receive.dateReceived) as HTMLInputElement;
    expect(received.getAttribute('dir')).toBe('ltr');
    expect(received.max).toBe(today);
    fireEvent.click(screen.getByRole('button', { name: ur.receive.addLine }));
    set(screen.getByRole('searchbox', { name: ur.receive.searchLabel }), 'insect');
    fireEvent.click(await within(await screen.findByRole('list')).findByRole('button', { name: /1 L$/ }));
    await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(1));
    expect(lineField(1, 'expiry').getAttribute('dir')).toBe('ltr');
    const back = screen.getByRole('link', { name: ur.receive.back }).querySelector('svg')!;
    expect(back.getAttribute('class')).toContain('lucide-arrow-right'); // in right to left "back" points to the right
    cleanup();
    await ready();
    expect(screen.getByRole('link', { name: f.back }).querySelector('svg')!.getAttribute('class')).toContain('lucide-arrow-left');
  });

  it('a Latin size label such as "1 L" is not reversed in right to left, on the line and in the search results', async () => {
    await ready(fakeShell(), OWNER, 'ur');
    fireEvent.click(screen.getByRole('button', { name: ur.receive.addLine }));
    set(screen.getByRole('searchbox', { name: ur.receive.searchLabel }), 'insect');
    const result = await within(await screen.findByRole('list')).findByRole('button', { name: /1 L$/ });
    expect(within(result).getByText('1 L').getAttribute('dir')).toBe('auto');
    fireEvent.click(result);
    await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(1));
    expect(within(lineOf(1)).getByText('1 L').getAttribute('dir')).toBe('auto');
  });

  it('a clash that appears is scrolled into view (the totals bar must not hide it)', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      await ready();
      set(screen.getByLabelText(f.supplier), 's1');
      await fillLine(1, 'insect', '500 ml', { batch: 'B-014', expiry: '2027-06-30', packs: '20', cost: '215' });
      await waitFor(() => screen.getByRole('group'));
      expect(scrolled).toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('uses only logical (start/end) classes, never left or right', async () => {
    for (const language of ['en', 'ur'] as const) {
      await ready(fakeShell(), OWNER, language);
      fireEvent.click(screen.getByRole('button', { name: (language === 'ur' ? ur : en).receive.addLine }));
      const classes = [...document.querySelectorAll('[class]')].map((e) => e.getAttribute('class') ?? '').join(' ');
      expect(classes).not.toMatch(/(^|\s)-?(ml|mr|pl|pr|left|right)-[\w[]/);
      expect(classes).not.toMatch(/text-(left|right)\b/);
      expect(classes).not.toMatch(/(^|\s)(rounded|border)-(l|r)(-|\s|$)/);
      cleanup();
    }
  });
});

describe('touch size and motion', () => {
  it('every button, link and field is at least 44 px tall (by its height classes)', async () => {
    await ready();
    set(screen.getByLabelText(f.supplier), 's1');
    await fillLine(1, 'insect', '500 ml', { batch: 'B-014', expiry: '2027-06-30', packs: '20', cost: '215' });
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: f.addLine }));
    fireEvent.click(screen.getByRole('button', { name: f.newSupplier }));
    const tall = /(^|\s)(min-h-11|min-h-14|h-11|h-12|h-14|size-11)(\s|$)/;
    const targets = [...document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type=checkbox])')];
    expect(targets.length).toBeGreaterThan(15);
    const short = targets.filter((el) => !tall.test(el.className)).map((el) => el.outerHTML.slice(0, 100));
    expect(short).toEqual([]);
  });

  it('adds no animation of its own (the shared classes are switched off by prefers-reduced-motion)', async () => {
    await ready();
    const styled = [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style') ?? '');
    for (const style of styled) expect(style).not.toMatch(/animation|transition/);
    const classes = [...document.querySelectorAll('[class]')].map((e) => e.getAttribute('class') ?? '').join(' ');
    expect(classes).not.toMatch(/\banimate-|\bduration-|\btransition\b/);
  });
});
