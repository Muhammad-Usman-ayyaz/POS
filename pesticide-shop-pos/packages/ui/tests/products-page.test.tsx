// @vitest-environment jsdom
// The Products screen, driven the way a person drives it, against a fake API built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { formatRange, formatTaxRate, formatTotal, minInPacks, withoutIsolates } from '../src/pages/products/catalogue-format.js';
import { ProductsPage } from '../src/pages/products/products-page.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };
const SENTINEL_COST = 7_654_321; // "Rs 76,543.21": must never be on a staff screen

// ---- fixtures: the shapes catalogue:list returns ----

interface SizeSpec {
  id: string;
  label: string;
  packSize: number;
  stock: number;
  retail: number;
  wholesale: number;
  cost?: number | null;
  taxBp?: number;
  minStock?: number;
  nextExpiry?: string | null;
  flags?: { low?: boolean; near_expiry?: boolean; expired?: boolean };
  unit?: 'ml' | 'g' | 'piece';
}

const size = (groupId: string, s: SizeSpec) => ({
  id: s.id,
  group_id: groupId,
  pack_label: s.label,
  base_unit: s.unit ?? 'ml',
  pack_size: s.packSize,
  retail_price: s.retail,
  wholesale_price: s.wholesale,
  tax_rate_bp: s.taxBp ?? 0,
  min_stock: s.minStock ?? 0,
  is_active: 1,
  stock_total: s.stock,
  stock_sellable: s.stock,
  expired_stock: 0,
  next_expiry: s.nextExpiry ?? null,
  next_sellable_expiry: s.nextExpiry ?? null,
  batch_count: 1,
  stocked_batch_count: 1,
  flags: { low: false, near_expiry: false, expired: false, ...s.flags },
  ...(s.cost === undefined ? {} : { cost_price: s.cost }),
});

function group(id: string, en_: string, ur_: string, categoryId: string | null, sizes: SizeSpec[]) {
  const listed = sizes.map((s) => size(id, s));
  const retail = listed.map((s) => s.retail_price);
  const wholesale = listed.map((s) => s.wholesale_price);
  return {
    group: { id, name_en: en_, name_ur: ur_, category_id: categoryId, brand_id: null, notes: null, is_active: 1 },
    sizes: listed,
    matched_size_ids: [],
    rank: 0,
    summary: {
      size_count: listed.length,
      base_unit: listed[0]?.base_unit ?? null,
      stock_total: listed.reduce((a, s) => a + s.stock_total, 0),
      stock_sellable: listed.reduce((a, s) => a + s.stock_sellable, 0),
      retail_min: Math.min(...retail),
      retail_max: Math.max(...retail),
      wholesale_min: Math.min(...wholesale),
      wholesale_max: Math.max(...wholesale),
      low_sizes: listed.filter((s) => s.flags.low).length,
      near_expiry_sizes: listed.filter((s) => s.flags.near_expiry).length,
      expired_sizes: listed.filter((s) => s.flags.expired).length,
    },
  };
}

const insecticideSizes = (withCost: boolean): SizeSpec[] => [
  { id: 's250', label: '250 ml', packSize: 250, stock: 750, retail: 19_000, wholesale: 17_000, minStock: 1250, nextExpiry: '2027-01-18', flags: { low: true }, ...(withCost ? { cost: 13_000 } : {}) },
  { id: 's500', label: '500 ml', packSize: 500, stock: 10_000, retail: 27_000, wholesale: 24_500, nextExpiry: '2027-01-18', ...(withCost ? { cost: 21_500 } : {}) },
  { id: 's1l', label: '1 L', packSize: 1000, stock: 12_000, retail: 50_000, wholesale: 45_000, taxBp: 1700, nextExpiry: '2027-03-12', ...(withCost ? { cost: 40_000 } : {}) },
];

function catalogue(withCost = true) {
  const hits = [
    group('g1', 'Insecticide', 'کیڑے مار دوا', 'c1', insecticideSizes(withCost)),
    group('g2', 'Fungicide', 'پھپھوندی کش', 'c2', [
      { id: 'f250', label: '250 ml', packSize: 250, stock: 2250, retail: 35_000, wholesale: 32_000, nextExpiry: '2026-10-26', flags: { near_expiry: true }, ...(withCost ? { cost: 28_000 } : {}) },
      { id: 'f1l', label: '1 L', packSize: 1000, stock: 4000, retail: 16_000, wholesale: 15_000, nextExpiry: '2027-06-01', ...(withCost ? { cost: 12_000 } : {}) },
    ]),
    group('g3', 'DAP fertilizer', 'ڈی اے پی کھاد', 'c3', [{ id: 'd50', label: '', packSize: 50_000, stock: 700_000, retail: 1_250_000, wholesale: 1_220_000, unit: 'g', nextExpiry: '2028-08-15', ...(withCost ? { cost: SENTINEL_COST } : {}) }]),
    group('g4', 'Rodenticide', 'چوہے مار دوا', null, [{ id: 'r100', label: '100 g', packSize: 100, stock: 100, retail: 13_000, wholesale: 11_500, unit: 'g', nextExpiry: '2026-09-15', flags: { expired: true } }]),
  ];
  return { hits, total: hits.length, counts: { products: 4, low: 1, near_expiry: 1, expired: 1 } };
}

const CATEGORIES = [
  { id: 'c1', name_en: 'Insecticide', name_ur: 'کیڑے مار' },
  { id: 'c2', name_en: 'Fungicide', name_ur: 'پھپھوندی کش' },
  { id: 'c3', name_en: 'Fertilizer', name_ur: 'کھاد' },
];

// ---- a pretend main process ----

function fakeShell(options: { data?: unknown; role?: 'owner' | 'staff' } = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { data: options.data ?? catalogue(), failNext: 0, hold: null as null | Promise<void> };
  const api = buildApi(async (channel: Channel, input: unknown) => {
    calls.push({ channel, input });
    if (channel === 'categories:list') return { ok: true, data: CATEGORIES };
    if (channel === 'catalogue:list') {
      if (state.hold) await state.hold;
      if (state.failNext > 0) {
        state.failNext -= 1;
        return { ok: false, error: { code: 'INTERNAL', message: 'x', params: {} } };
      }
      return { ok: true, data: state.data };
    }
    return { ok: false, error: { code: 'INTERNAL', message: 'x', params: {} } };
  });
  const lists = () => calls.filter((c) => c.channel === 'catalogue:list');
  return { api, calls, state, lists };
}

function show(shell: ReturnType<typeof fakeShell>, user: SessionUser = OWNER, language: Language = 'en') {
  return render(
    <MemoryRouter>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ProductsPage api={shell.api} user={user} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

const rowOf = (text: string): HTMLElement => screen.getByText(text).closest('tr') as HTMLElement;
/** The row of a product, found by its open/close button (the name also appears as a category). */
const groupRow = (name: string): HTMLElement => screen.getByRole('button', { name: new RegExp(`sizes of ${name}$`) }).closest('tr') as HTMLElement;
const loaded = async () => await screen.findByRole('button', { name: 'Show the sizes of Insecticide' });

beforeEach(() => vi.useRealTimers());
afterEach(cleanup);

// ---------- the numbers on screen ----------

describe('the formats the screen uses', () => {
  it('a whole product in litres or kilograms, pieces stay pieces', () => {
    expect(formatTotal(22_750, 'ml', en.products)).toBe('22.75 L');
    expect(formatTotal(700_000, 'g', en.products)).toBe('700 kg');
    expect(formatTotal(9_750, 'g', en.products)).toBe('9.75 kg');
    expect(formatTotal(1, 'piece', en.products)).toBe('1 piece');
    expect(formatTotal(40, 'piece', en.products)).toBe('40 pieces');
    expect(formatTotal(0, 'ml', en.products)).toBe('0 L');
    expect(formatTotal(1_234_000, 'ml', en.products)).toBe('1,234 L');
  });

  it('the same total in Urdu words, with no left-to-right marks (words and numbers follow the right-to-left order)', () => {
    const text = formatTotal(22_750, 'ml', ur.products);
    expect(text).toBe('22.75 لیٹر');
    expect(withoutIsolates('⁦2 پیک اور 250 کھلا⁩')).toBe('2 پیک اور 250 کھلا');
  });

  it('minimum stock is shown in packs (it is stored in base units)', () => {
    expect(minInPacks(1250, 250)).toBe('5');
    expect(minInPacks(5000, 1000)).toBe('5');
    expect(minInPacks(500, 1000)).toBe('0.5');
  });

  it('a tax rate in basis points becomes a percentage', () => {
    expect(formatTaxRate(0)).toBe('0%');
    expect(formatTaxRate(1700)).toBe('17%');
    expect(formatTaxRate(250)).toBe('2.5%');
  });

  it('a retail range, one price when all sizes cost the same, a dash when none', () => {
    expect(formatRange(19_000, 50_000, 'en')).toBe('Rs 190 – 500');
    expect(formatRange(250_000, 250_000, 'en')).toBe('Rs 2,500');
    expect(formatRange(78_000, 340_000, 'en')).toBe('Rs 780 – 3,400');
    expect(formatRange(null, null, 'en')).toBe('—');
  });
});

// ---------- the screen, owner ----------

describe('Products: the owner', () => {
  it('shows a loading state first, then the products', async () => {
    const shell = fakeShell();
    let release!: () => void;
    shell.state.hold = new Promise<void>((resolve) => (release = resolve));
    show(shell);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(screen.queryByText('Insecticide')).toBeNull();
    release();
    expect(await loaded()).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a product row says "N sizes", the total in litres or kg, the retail range (labelled) and its badges', async () => {
    show(fakeShell());
    await loaded();
    const insecticide = groupRow('Insecticide');
    expect(within(insecticide).getByText('3 sizes')).toBeTruthy();
    expect(within(insecticide).getByText('22.75 L')).toBeTruthy();
    expect(within(insecticide).getByText('Retail range')).toBeTruthy();
    expect(within(insecticide).getByText('Rs 190 – 500')).toBeTruthy();
    expect(within(insecticide).getByText('1 size low')).toBeTruthy();
    expect(within(insecticide).getByText('کیڑے مار دوا')).toBeTruthy(); // the other language, small
    expect(within(insecticide).getByText('Insecticide', { selector: 'td' })).toBeTruthy(); // its category

    expect(within(groupRow('DAP fertilizer')).getByText('700 kg')).toBeTruthy();
    expect(within(groupRow('DAP fertilizer')).getByText('1 size')).toBeTruthy();
    expect(within(groupRow('Fungicide')).getByText('1 size near expiry')).toBeTruthy();
    expect(within(groupRow('Rodenticide')).getByText('1 size expired')).toBeTruthy();
  });

  it('the sizes are folded away until the row is opened', async () => {
    show(fakeShell());
    await loaded();
    expect(screen.queryByText('250 ml')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show the sizes of Insecticide' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide the sizes of Insecticide' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('250 ml')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the sizes of Insecticide' }));
    expect(screen.queryByText('250 ml')).toBeNull();
  });

  it('a size row shows stock, cost, retail, wholesale, tax, next expiry and its badge', async () => {
    show(fakeShell());
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Show the sizes of Insecticide' }));
    const small = rowOf('250 ml');
    expect(within(small).getByText('3 packs')).toBeTruthy();
    expect(within(small).getByText('Rs 130')).toBeTruthy(); // cost
    expect(within(small).getByText('Rs 190')).toBeTruthy(); // retail
    expect(within(small).getByText('Rs 170')).toBeTruthy(); // wholesale
    expect(within(small).getByText('0%')).toBeTruthy();
    expect(within(small).getByText('18 Jan 2027')).toBeTruthy();
    expect(within(small).getByText('Low stock · min 5')).toBeTruthy();
    const litre = rowOf('1 L');
    expect(within(litre).getByText('12 packs')).toBeTruthy();
    expect(within(litre).getByText('17%')).toBeTruthy();
    expect(within(litre).queryByText(/Low stock/)).toBeNull();
  });

  it('a size with no label (a single-size product) is called "Single size"', async () => {
    show(fakeShell());
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Show the sizes of DAP fertilizer' }));
    expect(screen.getByText('Single size')).toBeTruthy();
    expect(within(rowOf('Single size')).getByText('14 packs')).toBeTruthy();
  });

  it('a size with an expired batch says Expired; a size with no batches shows dashes', async () => {
    const data = catalogue();
    (data.hits[3]!.sizes[0] as any).next_expiry = null;
    show(fakeShell({ data }));
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Show the sizes of Rodenticide' }));
    const row = rowOf('100 g');
    expect(within(row).getByText('Expired')).toBeTruthy();
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2); // no cost came back, and no expiry
  });

  it('Expand all opens every product, and becomes Collapse all', async () => {
    show(fakeShell());
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByText('250 ml')).toHaveLength(2); // Insecticide and Fungicide
    expect(screen.getByText('100 g')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('250 ml')).toBeNull();
  });

  it('shows Add product, Receive stock, the Cost column and an Edit button of at least 44 px on each product', async () => {
    show(fakeShell());
    await loaded();
    expect(screen.getByRole('link', { name: 'Add product' }).getAttribute('href')).toBe('/products/new');
    expect(screen.getByRole('link', { name: 'Receive stock' }).getAttribute('href')).toBe('/purchases/receive');
    expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeTruthy();
    const edit = screen.getByRole('link', { name: 'Edit Insecticide' });
    expect(edit.getAttribute('href')).toBe('/products/g1/edit');
    expect(edit.className).toMatch(/\bh-11\b/); // 44 px
    expect(edit.className).not.toMatch(/\bh-(8|9|10)\b/);
    expect(screen.getAllByRole('link', { name: /^Edit / })).toHaveLength(4);
  });

  it('labels both prices "incl. tax"', async () => {
    show(fakeShell());
    await loaded();
    expect(screen.getByRole('columnheader', { name: /Retail/ }).textContent).toContain('incl. tax');
    expect(screen.getByRole('columnheader', { name: /Wholesale/ }).textContent).toContain('incl. tax');
  });
});

// ---------- the screen, staff ----------

describe('Products: staff', () => {
  it('no Cost column, no Receive stock, no Add product, no Edit', async () => {
    show(fakeShell(), STAFF);
    await loaded();
    expect(screen.queryByRole('columnheader', { name: 'Cost' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Receive stock' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add product' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Edit/ })).toBeNull();
    expect(screen.queryByText('Receive stock')).toBeNull();
  });

  it('shows no cost even if a cost arrives (the shell never sends one, but the screen must not depend on that)', async () => {
    show(fakeShell({ data: catalogue(true) }), STAFF);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('76,543');
    expect(text).not.toContain('Rs 215'); // the 500 ml cost
    expect(text).not.toContain('Rs 400'); // the 1 L cost
    expect(screen.getByText('Rs 190')).toBeTruthy(); // the prices are there
  });

  it('still sees stock, prices, tax, expiry and the badges, and can open a product', async () => {
    show(fakeShell({ data: catalogue(false) }), STAFF);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Show the sizes of Insecticide' }));
    const small = rowOf('250 ml');
    expect(within(small).getByText('3 packs')).toBeTruthy();
    expect(within(small).getByText('Rs 190')).toBeTruthy();
    expect(within(small).getByText('Low stock · min 5')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Wholesale/ })).toBeTruthy();
  });

  it('the empty state for staff does not offer to add a product', async () => {
    show(fakeShell({ data: { hits: [], total: 0, counts: { products: 0, low: 0, near_expiry: 0, expired: 0 } } }), STAFF);
    expect(await screen.findByText('No products yet')).toBeTruthy();
    expect(screen.getByText('The owner has not added any products yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Add product' })).toBeNull();
  });
});

// ---------- chips and search ----------

describe('Products: the filter chips', () => {
  it('count sizes and say "sizes" (the first chip counts products)', async () => {
    show(fakeShell());
    await loaded();
    expect(screen.getByRole('button', { name: 'All · 4 products' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Low stock · 1 size' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Near expiry · 1 size' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expired · 1 size' })).toBeTruthy();
  });

  it('say "sizes" when the count is not one, and for none', async () => {
    const data = catalogue();
    data.counts = { products: 1, low: 4, near_expiry: 0, expired: 2 };
    show(fakeShell({ data }));
    await loaded();
    expect(screen.getByRole('button', { name: 'All · 1 product' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Low stock · 4 sizes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Near expiry · 0 sizes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expired · 2 sizes' })).toBeTruthy();
  });

  it('the chosen chip is marked, and asks the shell for that filter', async () => {
    const shell = fakeShell();
    show(shell);
    await loaded();
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Low stock/ }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toMatchObject({ filter: 'low' }));
    expect(screen.getByRole('button', { name: /^Low stock/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /^Expired/ }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toMatchObject({ filter: 'expired' }));
    fireEvent.click(screen.getByRole('button', { name: /^Near expiry/ }));
    await waitFor(() => expect(shell.lists().at(-1)!.input).toMatchObject({ filter: 'near_expiry' }));
  });
});

describe('Products: search', () => {
  it('waits for typing to pause: fast typing sends ONE search, with the last text', async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    show(shell);
    await act(() => vi.advanceTimersByTimeAsync(10));
    const first = shell.lists().length;
    const box = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(box, { target: { value: 'i' } });
    await act(() => vi.advanceTimersByTimeAsync(50));
    fireEvent.change(box, { target: { value: 'in' } });
    await act(() => vi.advanceTimersByTimeAsync(50));
    fireEvent.change(box, { target: { value: 'ins' } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(shell.lists()).toHaveLength(first); // 100 ms after the last key: not yet
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(shell.lists()).toHaveLength(first + 1);
    expect(shell.lists().at(-1)!.input).toMatchObject({ query: 'ins' });
  });

  it('a SLOW earlier answer never replaces a newer one on the screen', async () => {
    vi.useFakeTimers();
    try {
      let releaseSlow!: () => void;
      const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
      const only = (name: string) => {
        const data = catalogue();
        const hit = data.hits.find((h) => h.group.name_en === name)!;
        return { ...data, hits: [hit], total: 1 };
      };
      const api = buildApi(async (channel: Channel, input: any) => {
        if (channel === 'categories:list') return { ok: true, data: CATEGORIES };
        if (channel === 'catalogue:list') {
          if (input.query === 'slow') {
            await slow;
            return { ok: true, data: only('Rodenticide') };
          }
          return { ok: true, data: input.query === 'fast' ? only('Fungicide') : catalogue() };
        }
        return { ok: false, error: { code: 'INTERNAL', message: 'x', params: {} } };
      });
      show({ api } as ReturnType<typeof fakeShell>);
      await act(() => vi.advanceTimersByTimeAsync(10));
      const box = screen.getByRole('searchbox');
      fireEvent.change(box, { target: { value: 'slow' } });
      await act(() => vi.advanceTimersByTimeAsync(200)); // the slow search is on its way
      fireEvent.change(box, { target: { value: 'fast' } });
      await act(() => vi.advanceTimersByTimeAsync(200)); // the fast one answers
      expect(screen.getByRole('button', { name: 'Show the sizes of Fungicide' })).toBeTruthy();
      releaseSlow();
      await act(() => vi.advanceTimersByTimeAsync(50)); // the slow, older answer arrives late
      expect(screen.getByRole('button', { name: 'Show the sizes of Fungicide' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Show the sizes of Rodenticide' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is typed in English or Urdu and sent as typed', async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    show(shell);
    await act(() => vi.advanceTimersByTimeAsync(10));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'کھاد' } });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(shell.lists().at(-1)!.input).toMatchObject({ query: 'کھاد' });
    expect((screen.getByRole('searchbox') as HTMLInputElement).placeholder).toBe('Search in English or اردو');
  });

  it('keeps the old list on screen (dimmed, busy) while a new search is on its way', async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    show(shell);
    await act(() => vi.advanceTimersByTimeAsync(10));
    let release!: () => void;
    shell.state.hold = new Promise<void>((resolve) => (release = resolve));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fung' } });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByRole('button', { name: 'Show the sizes of Insecticide' })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    release();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

// ---------- empty, no match, error ----------

describe('Products: empty, no match and error states', () => {
  const none = { hits: [], total: 0, counts: { products: 0, low: 0, near_expiry: 0, expired: 0 } };

  it('no products yet: the owner is invited to add one', async () => {
    show(fakeShell({ data: none }));
    expect(await screen.findByText('No products yet')).toBeTruthy();
    expect(screen.getByText('Add your first product to start counting stock.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Add product' }).length).toBeGreaterThanOrEqual(2); // header and here
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull();
  });

  it('nothing matches the search: says so, and one button clears the search and the filter', async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    show(shell);
    await act(() => vi.advanceTimersByTimeAsync(10));
    shell.state.data = { ...none, counts: catalogue().counts };
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: /^Low stock/ }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText('Nothing matches')).toBeTruthy();
    expect(screen.queryByText('No products yet')).toBeNull();
    shell.state.data = catalogue();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filter' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show the sizes of Insecticide' })).toBeTruthy();
    expect(shell.lists().at(-1)!.input).toMatchObject({ query: '', filter: 'all' });
  });

  it('an error on the first load: a readable message and Try again, not a blank screen or a loading bar for ever', async () => {
    const shell = fakeShell();
    shell.state.failNext = 1;
    show(shell);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await loaded()).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('an error while the list is already on screen keeps the list and shows the error above it', async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    show(shell);
    await act(() => vi.advanceTimersByTimeAsync(10));
    shell.state.failNext = 1;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show the sizes of Insecticide' })).toBeTruthy();
  });

  it('a category that cannot be loaded does not break the page', async () => {
    const shell = fakeShell();
    const original = shell.api.categories.list;
    shell.api.categories.list = () => Promise.reject(new Error('down'));
    show(shell);
    await loaded();
    expect(within(groupRow('Insecticide')).getAllByText('—').length).toBeGreaterThan(0);
    shell.api.categories.list = original;
  });
});

// ---------- Urdu, right to left, motion ----------

describe('Products: Urdu and right to left', () => {
  it('uses Urdu words, the Urdu name first, and keeps amounts left to right', async () => {
    show(fakeShell(), OWNER, 'ur');
    await screen.findByText('کیڑے مار دوا');
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ur.pages.products.title);
    expect(screen.getByRole('link', { name: ur.products.receiveStock })).toBeTruthy();
    expect(screen.getByRole('link', { name: ur.products.addProduct })).toBeTruthy();
    expect(screen.getByRole('button', { name: ur.products.filterLow(1) })).toBeTruthy();
    expect(screen.getByRole('button', { name: ur.products.filterAll(4) })).toBeTruthy();
    const row = rowOf('کیڑے مار دوا');
    expect(within(row).getByText(ur.products.sizes(3))).toBeTruthy();
    expect(within(row).getByText(ur.products.groupLow(1))).toBeTruthy();
    expect(within(row).getByText('Insecticide')).toBeTruthy(); // the other language, small
    const numbers = [...row.querySelectorAll('.num')];
    expect(numbers.length).toBeGreaterThanOrEqual(1); // the range (the total has an Urdu unit word in it, so it is not forced left to right)
    expect(within(row).getByText('22.75 لیٹر').className).not.toContain('num');
    expect(row.textContent).toContain('22.75');
    expect(screen.getAllByText(ur.products.retailRange)).toHaveLength(4); // one per product
  });

  it('the size rows, dates and badges are Urdu too', async () => {
    show(fakeShell(), OWNER, 'ur');
    await screen.findByText('کیڑے مار دوا');
    fireEvent.click(screen.getByRole('button', { name: ur.products.showSizes('کیڑے مار دوا') }));
    const row = rowOf('250 ml');
    expect(within(row).getByText(ur.products.badgeLow('5'))).toBeTruthy();
    expect(row.textContent).toContain('18 Jan 2027'); // English month names with Latin digits, as in the design
    expect(within(row).getByText('18 Jan 2027').className).toContain('num');
    expect(within(row).getByText(/پیک/).className).not.toContain('num');
    expect(row.querySelectorAll('.num').length).toBeGreaterThanOrEqual(5); // prices, tax and the date stay left to right
  });

  it('a Latin size label such as "1 L" or "50 kg bag" works out its own direction, so it is not reversed in Urdu', async () => {
    show(fakeShell(), OWNER, 'ur');
    await screen.findByText('کیڑے مار دوا');
    fireEvent.click(screen.getByRole('button', { name: ur.products.showSizes('کیڑے مار دوا') }));
    expect(screen.getByText('250 ml').getAttribute('dir')).toBe('auto');
  });

  it('uses only logical (start/end) classes: nothing is pinned to the left or right', async () => {
    for (const language of ['en', 'ur'] as const) {
      show(fakeShell(), OWNER, language);
      await screen.findByRole('button', { name: /^(Expand all|سب کھولیں)$/ });
      fireEvent.click(screen.getByRole('button', { name: /^(Expand all|سب کھولیں)$/ }));
      const classes = [...document.querySelectorAll('[class]')].map((e) => e.getAttribute('class') ?? '').join(' ');
      expect(classes).not.toMatch(/(^|\s)-?(ml|mr|pl|pr|left|right)-[\w\[]/);
      expect(classes).not.toMatch(/text-(left|right)\b/);
      expect(classes).not.toMatch(/(^|\s)(rounded|border)-(l|r)(-|\s|$)/);
      cleanup();
    }
  });

  it('the chevron that points forward flips in right to left', async () => {
    show(fakeShell());
    await loaded();
    const chevron = screen.getByRole('button', { name: 'Show the sizes of Insecticide' }).querySelector('svg')!;
    expect(chevron.getAttribute('class')).toContain('rtl:-scale-x-100');
  });
});

describe('Products: motion', () => {
  it('uses only the shared animation classes, which prefers-reduced-motion switches off, and no animation of its own', async () => {
    show(fakeShell());
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    const styled = [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style') ?? '');
    for (const style of styled) expect(style).not.toMatch(/animation|transition/);
    const classes = [...document.querySelectorAll('[class]')].map((e) => e.getAttribute('class') ?? '').join(' ');
    expect(classes).not.toMatch(/\banimate-|\bduration-|\btransition\b/);
  });
});
