// @vitest-environment jsdom
// The Add / Edit product screen, driven the way the owner drives it, against a fake API built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { ProductFormPage } from '../src/pages/products/product-form-page.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

// ---- fixtures ----

const size = (over: Record<string, unknown>) => ({
  group_id: 'g1',
  pack_label: '',
  sku: null,
  barcode: null,
  base_unit: 'ml',
  pack_size: 250,
  allow_loose: 0,
  retail_price: 19_000,
  wholesale_price: 17_000,
  tax_rate_bp: 0,
  min_stock: 0,
  is_active: 1,
  stock_total: 0,
  stock_sellable: 0,
  expired_stock: 0,
  next_expiry: null,
  next_sellable_expiry: null,
  batch_count: 0,
  stocked_batch_count: 0,
  flags: { low: false, near_expiry: false, expired: false },
  ...over,
});

/** Insecticide: a 250 ml size with 2 batches (locked), a 500 ml size with 1 batch (locked), a 1 L size with none, and one switched off. */
const group = () => ({
  group: { id: 'g1', name_en: 'Insecticide', name_ur: 'کیڑے مار دوا', category_id: 'c1', brand_id: 'b1', notes: null, is_active: 1 },
  sizes: [
    size({ id: 's250', pack_label: '250 ml', pack_size: 250, sku: 'INS-250', barcode: '8964000112233', min_stock: 1250, stock_total: 750, batch_count: 2, stocked_batch_count: 2 }),
    size({ id: 's500', pack_label: '500 ml', pack_size: 500, sku: 'INS-500', retail_price: 27_000, wholesale_price: 24_500, stock_total: 10_000, batch_count: 1, stocked_batch_count: 1 }),
    size({ id: 's1l', pack_label: '1 L', pack_size: 1000, retail_price: 50_000, wholesale_price: 45_000, tax_rate_bp: 1700 }),
    size({ id: 'soff', pack_label: '5 L', pack_size: 5000, retail_price: 200_000, wholesale_price: 190_000, is_active: 0 }),
  ],
  matched_size_ids: [],
  rank: 0,
  summary: {},
});

const CATEGORIES = [
  { id: 'c1', name_en: 'Insecticide', name_ur: 'کیڑے مار' },
  { id: 'c2', name_en: 'Fungicide', name_ur: 'پھپھوندی کش' },
];
const BRANDS = [{ id: 'b1', name_en: 'Sample brand', name_ur: null }];

/** A button that goes to Add product, for the test that jumps between forms. */
function NavigateButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/products/new')}>go to new</button>;
}

// ---- a pretend main process ----

type Handler = (input: any) => unknown;
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

function fakeShell(options: { data?: unknown; override?: Partial<Record<Channel, Handler>> } = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { categories: [...CATEGORIES], brands: [...BRANDS], listed: options.data ?? group() };
  const handlers: Partial<Record<Channel, Handler>> = {
    'catalogue:list': () => ({ ok: true, data: { hits: state.listed ? [state.listed] : [], total: 1, counts: {} } }),
    'categories:list': () => ({ ok: true, data: state.categories }),
    'brands:list': () => ({ ok: true, data: state.brands }),
    'categories:create': (input) => {
      const row = { id: `c${state.categories.length + 1}`, name_en: input.name_en ?? null, name_ur: input.name_ur ?? null };
      state.categories.push(row);
      return { ok: true, data: row };
    },
    'brands:create': (input) => {
      const row = { id: `b${state.brands.length + 1}`, name_en: input.name_en ?? null, name_ur: input.name_ur ?? null };
      state.brands.push(row);
      return { ok: true, data: row };
    },
    'catalogue:createGroup': () => ({ ok: true, data: { group: { id: 'gNew' }, sizes: [] } }),
    'catalogue:updateGroup': () => ({ ok: true, data: { group: {}, sizes: [] } }),
    'catalogue:updateSize': () => ({ ok: true, data: {} }),
    'catalogue:addSize': () => ({ ok: true, data: { size: {}, sizes: [] } }),
    'catalogue:setSizeActive': () => ({ ok: true, data: {} }),
    ...options.override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : fail('INTERNAL');
  });
  const writes = () => calls.filter((c) => /^catalogue:(create|update|add|set)/.test(c.channel));
  return { api, calls, state, handlers, writes };
}

function show(shell: ReturnType<typeof fakeShell>, path: string, user: SessionUser = OWNER, language: Language = 'en') {
  now = language === 'ur' ? ur.productForm : en.productForm;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <Routes>
            <Route path="/products" element={<p>the product list</p>} />
            <Route path="/products/new" element={<ProductFormPage api={shell.api} user={user} />} />
            <Route path="/products/:groupId/edit" element={<ProductFormPage api={shell.api} user={user} />} />
          </Routes>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const f = en.productForm;
/** The words of the language on screen (set by show), so the helpers find cards in Urdu too. */
let now = en.productForm;
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const card = (n: number) => screen.getByRole('region', { name: now.sizeN(n) });
const field = (n: number, name: string) => card(n).querySelector<HTMLInputElement>(`[name=${name}]`)!;
const editReady = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en') => {
  show(shell, '/products/g1/edit', user, language);
  await screen.findByRole('region', { name: (language === 'ur' ? ur : en).productForm.sizeN(1) });
  return shell;
};

afterEach(cleanup);

// ---------- access ----------

describe('who can open it', () => {
  it('staff are sent back to the product list (and nothing is loaded)', async () => {
    const shell = fakeShell();
    show(shell, '/products/g1/edit', STAFF);
    expect(await screen.findByText('the product list')).toBeTruthy();
    show(shell, '/products/new', STAFF);
    expect(shell.calls.filter((c) => c.channel === 'catalogue:list')).toHaveLength(0);
    expect(screen.queryByLabelText(f.nameEn)).toBeNull();
  });
  it('the owner sees the form', async () => {
    show(fakeShell(), '/products/new');
    expect(await screen.findByRole('heading', { name: f.addTitle, level: 1 })).toBeTruthy();
  });
});

// ---------- adding ----------

describe('switching between products', () => {
  it('going from an edit form straight to Add product starts empty: nothing typed or loaded carries over', async () => {
    const shell = fakeShell();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/products/g1/edit']}>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <ToastProvider>
            <Routes>
              <Route path="/products/new" element={<ProductFormPage api={shell.api} user={OWNER} />} />
              <Route path="/products/:groupId/edit" element={<ProductFormPage api={shell.api} user={OWNER} />} />
            </Routes>
            <NavigateButton />
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    void rerender;
    await screen.findByRole('region', { name: en.productForm.sizeN(4) });
    fireEvent.click(screen.getByRole('button', { name: 'go to new' }));
    await screen.findByRole('heading', { name: f.addTitle, level: 1 });
    expect((screen.getByLabelText(f.nameEn) as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });
});

describe('Add product', () => {
  const fillFirstSize = () => {
    set(field(1, 'packSize'), '250');
    set(field(1, 'retail'), '118');
    set(field(1, 'wholesale'), '110.50');
    set(field(1, 'tax'), '18');
    set(field(1, 'minPacks'), '5');
  };

  it('starts with the product fields, the base unit and one empty size', async () => {
    show(fakeShell(), '/products/new');
    expect(await screen.findByLabelText(f.nameEn)).toBeTruthy();
    expect(screen.getByLabelText(f.nameUr)).toBeTruthy();
    expect(screen.getByLabelText(f.category)).toBeTruthy();
    expect(screen.getByLabelText(f.brand)).toBeTruthy();
    expect(screen.getByLabelText(f.baseUnit)).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByText(f.chipNew)).toBeTruthy();
  });

  it('the unit is shown at the product level only: a size has a number and the unit as a suffix, no unit drop-down of its own', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    expect(screen.getAllByRole('combobox').map((c) => c.id)).toEqual(['category', 'brand', 'unit']);
    expect(within(card(1)).queryByRole('combobox')).toBeNull();
    expect(within(card(1)).getByText('ml')).toBeTruthy();
    set(screen.getByLabelText(f.baseUnit), 'g');
    expect(within(card(1)).getByText('g')).toBeTruthy();
  });

  it('saves ONE createGroup call: prices in paisa, tax 18 stored as 1800, the alert in base units; then goes back to the list', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    set(await screen.findByLabelText(f.nameEn), 'Insecticide');
    set(screen.getByLabelText(f.nameUr), 'کیڑے مار دوا');
    set(screen.getByLabelText(f.category), 'c1');
    fillFirstSize();
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect(await screen.findByText('the product list')).toBeTruthy();
    expect(shell.writes()).toHaveLength(1);
    expect(shell.writes()[0]).toEqual({
      channel: 'catalogue:createGroup',
      input: {
        name_en: 'Insecticide',
        name_ur: 'کیڑے مار دوا',
        category_id: 'c1',
        brand_id: null,
        sizes: [{ pack_label: '', sku: null, barcode: null, base_unit: 'ml', pack_size: 250, allow_loose: 0, retail_price: 11_800, wholesale_price: 11_050, tax_rate_bp: 1800, min_stock: 1250 }],
      },
    });
  });

  it('never sends who is saving (the shell knows it)', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    set(await screen.findByLabelText(f.nameEn), 'X');
    fillFirstSize();
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    await screen.findByText('the product list');
    expect(JSON.stringify(shell.writes())).not.toMatch(/actor|created_by|user_id|approved_by|include_cost/);
  });

  it('both prices say "incl. tax"', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    expect(within(card(1)).getByText(f.retail)).toBeTruthy();
    expect(within(card(1)).getByText(f.wholesale)).toBeTruthy();
    expect(f.retail).toContain('incl. tax');
    expect(f.wholesale).toContain('incl. tax');
  });

  it('says what tax is INSIDE the price: "Rs 118 includes Rs 18 tax", and does not add it to the price typed', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    set(field(1, 'retail'), '118');
    set(field(1, 'tax'), '18');
    expect(within(card(1)).getByText('Rs 118 includes Rs 18 tax')).toBeTruthy();
    expect(field(1, 'retail').value).toBe('118'); // not 139.24
    set(field(1, 'retail'), '1000');
    set(field(1, 'tax'), '17');
    expect(within(card(1)).getByText('Rs 1,000 includes Rs 145.30 tax')).toBeTruthy(); // 1000 * 1700 / 11700 = 145.299...
  });

  it('with no tax it says so, and with no price yet it says nothing', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    expect(within(card(1)).queryByText(/includes/)).toBeNull();
    set(field(1, 'retail'), '190');
    expect(within(card(1)).getByText(f.noTax)).toBeTruthy();
  });

  it('adds another size, which has Remove (a new size can be removed again)', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.addSize }));
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(document.activeElement).toBe(field(2, 'label')); // the cursor is on the new size's label
    fireEvent.click(screen.getByRole('button', { name: f.removeLabel(2) }));
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('loose sale is a checkbox per size, labelled with the unit; not available for pieces', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    const box = field(1, 'loose');
    expect(within(card(1)).getByText('Sell by ml')).toBeTruthy();
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    set(screen.getByLabelText(f.baseUnit), 'piece');
    expect(field(1, 'loose').disabled).toBe(true);
    expect(field(1, 'loose').checked).toBe(false);
  });

  it('shows what is wrong next to each field, sends nothing, and puts the cursor on the first problem', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    await screen.findByLabelText(f.nameEn);
    set(field(1, 'retail'), 'abc');
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect(await screen.findByText(f.problems.name)).toBeTruthy();
    expect(screen.getByText(f.problems.packInvalid)).toBeTruthy();
    expect(screen.getByText(f.problems.retailInvalid)).toBeTruthy();
    expect(screen.getByText(f.problems.wholesaleInvalid)).toBeTruthy();
    expect(shell.writes()).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(f.nameEn)));
  });

  it('a message goes away as soon as its field is put right (the others stay until theirs are)', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect(await screen.findByText(f.problems.name)).toBeTruthy();
    expect(screen.getByText(f.problems.retailInvalid)).toBeTruthy();
    set(screen.getByLabelText(f.nameEn), 'Insecticide');
    expect(screen.queryByText(f.problems.name)).toBeNull();
    expect(screen.getByText(f.problems.retailInvalid)).toBeTruthy();
    set(field(1, 'retail'), '190');
    expect(screen.queryByText(f.problems.retailInvalid)).toBeNull();
    expect(screen.getByText(f.problems.wholesaleInvalid)).toBeTruthy();
  });

  it('two sizes need labels; one size does not', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    set(await screen.findByLabelText(f.nameEn), 'X');
    set(field(1, 'packSize'), '250');
    set(field(1, 'retail'), '1');
    set(field(1, 'wholesale'), '1');
    fireEvent.click(screen.getByRole('button', { name: f.addSize }));
    set(field(2, 'packSize'), '500');
    set(field(2, 'retail'), '1');
    set(field(2, 'wholesale'), '1');
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect((await screen.findAllByText(f.problems.labelRequired)).length).toBe(2);
    expect(shell.writes()).toHaveLength(0);
  });

  it('a refusal from the shell is shown in words, and the form stays as it was typed', async () => {
    const shell = fakeShell({ override: { 'catalogue:createGroup': () => fail('DUPLICATE_NAME', { name: 'Insecticide' }) } });
    show(shell, '/products/new');
    set(await screen.findByLabelText(f.nameEn), 'Insecticide');
    fillFirstSize();
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect(await screen.findByText('"Insecticide" is already in the list')).toBeTruthy();
    expect((screen.getByLabelText(f.nameEn) as HTMLInputElement).value).toBe('Insecticide');
    expect(field(1, 'retail').value).toBe('118');
    expect(screen.queryByText('the product list')).toBeNull();
  });

  it('Save cannot be pressed twice while it is saving', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const shell = fakeShell({ override: { 'catalogue:createGroup': async () => (await gate, { ok: true, data: { group: {}, sizes: [] } }) } });
    show(shell, '/products/new');
    set(await screen.findByLabelText(f.nameEn), 'X');
    fillFirstSize();
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    const busy = await screen.findByRole('button', { name: f.saving });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    release();
    await screen.findByText('the product list');
    expect(shell.writes()).toHaveLength(1);
  });
});

// ---------- category and brand quick-add ----------

describe('category and brand quick-add', () => {
  it('adds a category inside the form and selects it', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.newCategory }));
    set(screen.getByLabelText(`${f.category}: ${f.nameEn}`), 'Seeds');
    fireEvent.click(screen.getByRole('button', { name: f.quickAdd }));
    await waitFor(() => expect((screen.getByLabelText(f.category) as HTMLSelectElement).value).toBe('c3'));
    expect(within(screen.getByLabelText(f.category)).getByText('Seeds')).toBeTruthy();
    expect(shell.calls.find((c) => c.channel === 'categories:create')?.input).toEqual({ name_en: 'Seeds' });
  });

  it('adds a brand with an Urdu name only', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.newBrand }));
    set(screen.getByLabelText(`${f.brand}: ${f.nameUr}`), 'نیا برانڈ');
    fireEvent.click(screen.getByRole('button', { name: f.quickAdd }));
    await waitFor(() => expect((screen.getByLabelText(f.brand) as HTMLSelectElement).value).toBe('b2'));
    expect(shell.calls.find((c) => c.channel === 'brands:create')?.input).toEqual({ name_ur: 'نیا برانڈ' });
  });

  it('Add stays off until a name is typed, and Enter in the box adds it instead of saving the whole product', async () => {
    const shell = fakeShell();
    show(shell, '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.newCategory }));
    expect((screen.getByRole('button', { name: f.quickAdd }) as HTMLButtonElement).disabled).toBe(true);
    const box = screen.getByLabelText(`${f.category}: ${f.nameEn}`);
    set(box, 'Seeds');
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(shell.calls.some((c) => c.channel === 'categories:create')).toBe(true));
    expect(shell.writes()).toHaveLength(0); // the product was not saved
  });

  it('a refusal (the same name again) is shown in the small form, which stays open', async () => {
    const shell = fakeShell({ override: { 'categories:create': () => fail('DUPLICATE_NAME', { name: 'Fungicide' }) } });
    show(shell, '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.newCategory }));
    set(screen.getByLabelText(`${f.category}: ${f.nameEn}`), 'Fungicide');
    fireEvent.click(screen.getByRole('button', { name: f.quickAdd }));
    expect(await screen.findByText('"Fungicide" is already in the list')).toBeTruthy();
    expect(screen.getByLabelText(`${f.category}: ${f.nameEn}`)).toBeTruthy();
  });
});

// ---------- editing ----------

describe('Edit product', () => {
  it('loads the product and every size, including a switched-off one; prices come back in rupees, tax in percent, the alert in packs', async () => {
    const shell = await editReady();
    expect(shell.calls.find((c) => c.channel === 'catalogue:list')?.input).toEqual({ group_id: 'g1', include_inactive: true });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(f.editTitle('Insecticide'));
    expect((screen.getByLabelText(f.nameEn) as HTMLInputElement).value).toBe('Insecticide');
    expect((screen.getByLabelText(f.nameUr) as HTMLInputElement).value).toBe('کیڑے مار دوا');
    expect((screen.getByLabelText(f.category) as HTMLSelectElement).value).toBe('c1');
    expect((screen.getByLabelText(f.brand) as HTMLSelectElement).value).toBe('b1');
    expect(screen.getAllByRole('region')).toHaveLength(4);
    expect(field(1, 'label').value).toBe('250 ml');
    expect(field(1, 'retail').value).toBe('190');
    expect(field(1, 'wholesale').value).toBe('170');
    expect(field(1, 'minPacks').value).toBe('5'); // 1250 ml of a 250 ml pack
    expect(field(1, 'sku').value).toBe('INS-250');
    expect(field(1, 'barcode').value).toBe('8964000112233');
    expect(field(3, 'tax').value).toBe('17');
    expect(within(card(4)).getByText(f.chipOff)).toBeTruthy();
  });

  it('the unit is read-only here (sizes have stock records), with the reason', async () => {
    await editReady();
    expect((screen.getByLabelText(f.baseUnit) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(f.unitLocked, { exact: false })).toBeTruthy();
  });

  it('a size with exactly one batch is locked too', async () => {
    await editReady();
    expect(within(card(2)).getByText(f.chipHasStock(1))).toBeTruthy();
    expect(field(2, 'packSize')).toBeNull();
    expect(within(card(2)).getByRole('button', { name: new RegExp(f.packSize) })).toBeTruthy();
  });

  it('the Urdu boxes of the quick-add forms are right to left and marked as Urdu', async () => {
    show(fakeShell(), '/products/new');
    await screen.findByLabelText(f.nameEn);
    fireEvent.click(screen.getByRole('button', { name: f.newCategory }));
    const urdu = screen.getByLabelText(`${f.category}: ${f.nameUr}`);
    expect(urdu.getAttribute('dir')).toBe('rtl');
    expect(urdu.getAttribute('lang')).toBe('ur');
  });

  it('a size with batches shows "Has stock · 2 batches" and its pack size as a locked button, not a field', async () => {
    await editReady();
    expect(within(card(1)).getByText(f.chipHasStock(2))).toBeTruthy();
    expect(within(card(2)).getByText(f.chipHasStock(1))).toBeTruthy();
    expect(field(1, 'packSize')).toBeNull();
    const lock = within(card(1)).getByRole('button', { name: new RegExp(f.packSize) });
    expect(within(lock).getByText(f.locked)).toBeTruthy();
    expect(lock.textContent).toContain('250 ml');
    // a size with no batches is an ordinary field
    expect(field(3, 'packSize').value).toBe('1000');
    expect(field(3, 'packSize').readOnly).toBe(false);
    expect(field(3, 'packSize').disabled).toBe(false);
  });

  it('pressing the lock opens "This pack size can no longer be changed", saying how much stock and how many batches', async () => {
    await editReady();
    fireEvent.click(within(card(1)).getByRole('button', { name: new RegExp(f.packSize) }));
    // The words are checked literally (not through the message file), because they are the promise made to the owner.
    const dialog = screen.getByRole('dialog', { name: 'This pack size can no longer be changed' });
    expect(within(dialog).getByRole('button', { name: 'Add a new size' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Keep current size' })).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText(f.lockBody('250 ml', '3 packs', 2))).toBeTruthy();
    expect(within(dialog).getByText(f.lockNextLead)).toBeTruthy();
    expect(dialog.textContent).toContain(f.lockNext);
    expect(within(dialog).getByRole('button', { name: f.addNewSize })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: f.keepSize })).toBeTruthy();
  });

  it('"Keep current size" just closes it; Escape does too, and focus goes back to the lock', async () => {
    await editReady();
    const lock = within(card(1)).getByRole('button', { name: new RegExp(f.packSize) });
    lock.focus();
    fireEvent.click(lock);
    fireEvent.click(screen.getByRole('button', { name: f.keepSize }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('region')).toHaveLength(4);
    fireEvent.click(lock);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(lock);
  });

  it('"Add a new size" closes the message and opens a NEW size row, with the cursor on its label', async () => {
    const shell = await editReady();
    fireEvent.click(within(card(1)).getByRole('button', { name: new RegExp(f.packSize) }));
    fireEvent.click(screen.getByRole('button', { name: f.addNewSize }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('region')).toHaveLength(5);
    expect(within(card(5)).getByText(f.chipNew)).toBeTruthy();
    expect(document.activeElement).toBe(field(5, 'label'));
    expect(shell.writes()).toHaveLength(0); // nothing is saved by opening it
  });

  it('a PACK_SIZE_LOCKED reply from the shell opens the same message for the size it was about', async () => {
    const shell = fakeShell({ override: { 'catalogue:updateSize': () => fail('PACK_SIZE_LOCKED', { productId: 's1l' }) } });
    await editReady(shell);
    set(field(3, 'packSize'), '2000'); // this size has no batches here, but the shell says it is locked (stock arrived elsewhere)
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    const dialog = await screen.findByRole('dialog', { name: f.lockTitle });
    expect(dialog.textContent).toContain('1 L');
    expect(within(dialog).getByRole('button', { name: f.addNewSize })).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull(); // not a generic error
  });

  it('only a NEW size has Remove; saved sizes have "Switch off" (or "Switch on" when off), never Remove', async () => {
    await editReady();
    expect(screen.queryByRole('button', { name: f.remove })).toBeNull();
    expect(within(card(1)).getByRole('button', { name: f.switchOff })).toBeTruthy();
    expect(within(card(4)).getByRole('button', { name: f.switchOn })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: f.addSize }));
    expect(within(card(5)).getByRole('button', { name: f.removeLabel(5) })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Remove size/ })).toHaveLength(1);
  });

  it('switching a size off is saved with Save, as setSizeActive; nothing is deleted', async () => {
    const shell = await editReady();
    fireEvent.click(within(card(3)).getByRole('button', { name: f.switchOff }));
    expect(within(card(3)).getByText(f.chipOff)).toBeTruthy();
    expect(within(card(3)).getByRole('button', { name: f.switchOn })).toBeTruthy();
    expect(shell.writes()).toHaveLength(0); // not yet
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    await screen.findByText('the product list');
    expect(shell.writes()).toEqual([{ channel: 'catalogue:setSizeActive', input: { id: 's1l', is_active: false } }]);
  });

  it('saves only what changed: a price and a tax rate become paisa and basis points', async () => {
    const shell = await editReady();
    set(field(1, 'retail'), '200');
    set(field(1, 'tax'), '18');
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    await screen.findByText('the product list');
    expect(shell.writes()).toEqual([{ channel: 'catalogue:updateSize', input: { product_id: 's250', changes: { retail_price: 20_000, tax_rate_bp: 1800 } } }]);
  });

  it('the pack size of a locked size is never sent', async () => {
    const shell = await editReady();
    set(field(1, 'label'), '250 ml bottle');
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    await screen.findByText('the product list');
    expect(JSON.stringify(shell.writes())).not.toContain('pack_size');
    expect(JSON.stringify(shell.writes())).not.toContain('base_unit');
  });

  it('a changed name, a new size and a size switched off go in that order: product, new size, switch off', async () => {
    const shell = await editReady();
    set(screen.getByLabelText(f.nameEn), 'Insecticide X');
    fireEvent.click(screen.getByRole('button', { name: f.addSize }));
    set(field(5, 'label'), '2 L');
    set(field(5, 'packSize'), '2000');
    set(field(5, 'retail'), '900');
    set(field(5, 'wholesale'), '850');
    fireEvent.click(within(card(3)).getByRole('button', { name: f.switchOff }));
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    await screen.findByText('the product list');
    expect(shell.writes().map((c) => c.channel)).toEqual(['catalogue:updateGroup', 'catalogue:addSize', 'catalogue:setSizeActive']);
    expect(shell.writes()[1]!.input).toMatchObject({ group_id: 'g1', size: { pack_label: '2 L', pack_size: 2000, base_unit: 'ml', retail_price: 90_000, tax_rate_bp: 0 } });
  });

  it('when a later step fails, the earlier ones stay saved, the form is reloaded, and it says so', async () => {
    const shell = fakeShell({ override: { 'catalogue:addSize': () => fail('DUPLICATE_PACK_LABEL', { label: '1 L' }) } });
    await editReady(shell);
    set(screen.getByLabelText(f.nameEn), 'Insecticide X');
    fireEvent.click(screen.getByRole('button', { name: f.addSize }));
    set(field(5, 'label'), '1 L');
    set(field(5, 'packSize'), '1000');
    set(field(5, 'retail'), '1');
    set(field(5, 'wholesale'), '1');
    shell.state.listed = { ...group(), group: { ...group().group, name_en: 'Insecticide X' } }; // what the shell now holds
    fireEvent.click(screen.getByRole('button', { name: f.save }));
    expect(await screen.findByText(f.partial)).toBeTruthy();
    expect(await screen.findByText(/already has a size/i)).toBeTruthy();
    expect(shell.writes().map((c) => c.channel)).toEqual(['catalogue:updateGroup', 'catalogue:addSize']);
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(4)); // the unsaved new size is gone: the form shows what is saved
    expect((screen.getByLabelText(f.nameEn) as HTMLInputElement).value).toBe('Insecticide X');
  });

  it('a product that does not exist says so, with a way back', async () => {
    const shell = fakeShell();
    shell.state.listed = null as never;
    show(shell, '/products/g1/edit');
    expect(await screen.findByText(f.notFound)).toBeTruthy();
    expect(screen.getByRole('link', { name: f.back })).toBeTruthy();
  });

  it('a load error is shown in words, with Try again', async () => {
    const shell = fakeShell({ override: { 'catalogue:list': () => fail('INTERNAL') } });
    show(shell, '/products/g1/edit');
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: en.products.retry })).toBeTruthy();
  });

  it('shows the loading message first', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const shell = fakeShell({ override: { 'catalogue:list': async () => (await gate, { ok: true, data: { hits: [group()], total: 1, counts: {} } }) } });
    show(shell, '/products/g1/edit');
    expect(screen.getByRole('status').textContent).toBe(f.loading);
    release();
    await screen.findByRole('region', { name: f.sizeN(1) });
  });

  it('Cancel goes back to the list without saving', async () => {
    const shell = await editReady();
    set(field(1, 'retail'), '999');
    fireEvent.click(screen.getByRole('link', { name: f.cancel }));
    expect(await screen.findByText('the product list')).toBeTruthy();
    expect(shell.writes()).toHaveLength(0);
  });
});

// ---------- Urdu, right to left, touch size, motion ----------

describe('Urdu and right to left', () => {
  it('uses the Urdu words, keeps numbers left to right, and mirrors the back arrow', async () => {
    await editReady(fakeShell(), OWNER, 'ur');
    expect(document.getElementById('app-root')!.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ur.productForm.editTitle('کیڑے مار دوا'));
    expect(screen.getByLabelText(ur.productForm.nameEn)).toBeTruthy();
    expect(screen.getByRole('button', { name: ur.productForm.save })).toBeTruthy();
    expect(screen.getByRole('button', { name: ur.productForm.addSize })).toBeTruthy();
    expect(within(card(1)).getByText(ur.productForm.chipHasStock(2))).toBeTruthy();
    expect(field(1, 'retail').className).toContain('num');
    expect((screen.getByLabelText(ur.productForm.nameUr) as HTMLInputElement).getAttribute('dir')).toBe('rtl');
  });

  it('the lock message and the tax line are in Urdu', async () => {
    await editReady(fakeShell(), OWNER, 'ur');
    set(field(3, 'retail'), '118');
    set(field(3, 'tax'), '18');
    expect(within(card(3)).getByText(/ٹیکس شامل ہے/)).toBeTruthy();
    fireEvent.click(within(card(1)).getByRole('button', { name: new RegExp(ur.productForm.packSize) }));
    const dialog = screen.getByRole('dialog', { name: ur.productForm.lockTitle });
    expect(within(dialog).getByRole('button', { name: ur.productForm.addNewSize })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: ur.productForm.keepSize })).toBeTruthy();
  });

  it('a Latin size label such as "1 L" is not reversed in right to left (the label field works out its own direction)', async () => {
    await editReady(fakeShell(), OWNER, 'ur');
    expect(field(3, 'label').getAttribute('dir')).toBe('auto');
    expect((screen.getByLabelText(ur.productForm.nameEn) as HTMLInputElement).getAttribute('dir')).toBe('auto');
  });

  it('uses only logical (start/end) classes, never left or right', async () => {
    for (const language of ['en', 'ur'] as const) {
      await editReady(fakeShell(), OWNER, language);
      fireEvent.click(within(card(1)).getByRole('button', { name: new RegExp((language === 'ur' ? ur : en).productForm.packSize) }));
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
    await editReady();
    fireEvent.click(screen.getByRole('button', { name: f.newCategory }));
    const tall = /(^|\s)(min-h-11|min-h-14|h-11|h-12|h-14)(\s|$)/;
    const targets = [...document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type=checkbox])')];
    expect(targets.length).toBeGreaterThan(20);
    const short = targets.filter((el) => !tall.test(el.className)).map((el) => el.outerHTML.slice(0, 90));
    expect(short).toEqual([]);
    // a checkbox is the size of its row: the label around it is 56 px
    for (const box of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) expect(tall.test(box.closest('label')!.className)).toBe(true);
  });

  it('adds no animation of its own (the shared classes are switched off by prefers-reduced-motion)', async () => {
    await editReady();
    fireEvent.click(within(card(1)).getByRole('button', { name: new RegExp(f.packSize) }));
    const styled = [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style') ?? '');
    for (const style of styled) expect(style).not.toMatch(/animation|transition/);
    const classes = [...document.querySelectorAll('[class]')].map((e) => e.getAttribute('class') ?? '').join(' ');
    expect(classes).not.toMatch(/\banimate-|\bduration-|\btransition\b/);
  });
});
