// The rules behind the product form: typed text to stored values, what is checked, and exactly which calls a save makes.
import { describe, expect, it } from 'vitest';
import {
  blankSize,
  buildSaveSteps,
  checkDraft,
  draftFromSaved,
  hasProblems,
  isLocked,
  newDraft,
  packsText,
  parseMinPacks,
  parsePackSize,
  parseRupees,
  parseTaxPercent,
  rupeesText,
  taxPercentText,
  unitEditable,
  type ProductDraft,
  type SavedGroup,
  type SavedSize,
} from '../src/pages/products/product-form-state.js';

const savedSize = (over: Partial<SavedSize> = {}): SavedSize =>
  ({
    id: 's250',
    group_id: 'g1',
    pack_label: '250 ml',
    sku: 'INS-250',
    barcode: '8964000112233',
    base_unit: 'ml',
    pack_size: 250,
    allow_loose: 0,
    retail_price: 19_000,
    wholesale_price: 17_000,
    tax_rate_bp: 0,
    min_stock: 1250,
    is_active: 1,
    stock_total: 750,
    stock_sellable: 750,
    expired_stock: 0,
    next_expiry: '2027-01-18',
    next_sellable_expiry: '2027-01-18',
    batch_count: 2,
    stocked_batch_count: 2,
    flags: { low: false, near_expiry: false, expired: false },
    ...over,
  }) as SavedSize;

const savedGroup = (sizes: SavedSize[] = [savedSize(), savedSize({ id: 's500', pack_label: '500 ml', pack_size: 500, batch_count: 0, stock_total: 0, min_stock: 0, sku: null, barcode: null })]): SavedGroup => ({
  group: { id: 'g1', name_en: 'Insecticide', name_ur: 'کیڑے مار دوا', category_id: 'c1', brand_id: null, notes: null, is_active: 1 } as SavedGroup['group'],
  sizes,
});

describe('rupees to paisa', () => {
  it('whole rupees, and up to two decimals; commas and "Rs" are allowed', () => {
    expect(parseRupees('118')).toBe(11_800);
    expect(parseRupees('118.5')).toBe(11_850);
    expect(parseRupees('118.50')).toBe(11_850);
    expect(parseRupees('0')).toBe(0);
    expect(parseRupees('1,250')).toBe(125_000);
    expect(parseRupees('Rs 190')).toBe(19_000);
    expect(parseRupees(' 190 ')).toBe(19_000);
    expect(parseRupees('0.05')).toBe(5);
  });
  it('refuses what is not an amount: empty, letters, three decimals, negatives', () => {
    for (const bad of ['', 'abc', '1.234', '-5', '1..2', '1,2,3.', '12e3', '.5']) expect(parseRupees(bad), bad).toBeNull();
  });
  it('is exact: no floating-point drift (0.07 and 1.15 are whole paisa)', () => {
    expect(parseRupees('0.07')).toBe(7);
    expect(parseRupees('1.15')).toBe(115);
    expect(parseRupees('19.99')).toBe(1999);
  });
  it('turns paisa back into what the field shows', () => {
    expect(rupeesText(11_800)).toBe('118');
    expect(rupeesText(11_850)).toBe('118.50');
    expect(rupeesText(5)).toBe('0.05');
    expect(parseRupees(rupeesText(123_457))).toBe(123_457);
  });
});

describe('tax: percent in the form, basis points stored', () => {
  it('18 is stored as 1800, not 18', () => {
    expect(parseTaxPercent('18')).toBe(1800);
    expect(parseTaxPercent('17')).toBe(1700);
    expect(parseTaxPercent('2.5')).toBe(250);
    expect(parseTaxPercent('0')).toBe(0);
    expect(parseTaxPercent('100')).toBe(10_000);
  });
  it('refuses more than 100 percent, negatives and text', () => {
    for (const bad of ['101', '100.01', '-1', 'x', '', '1.234']) expect(parseTaxPercent(bad), bad).toBeNull();
  });
  it('shows stored basis points as the percent typed', () => {
    expect(taxPercentText(1800)).toBe('18');
    expect(taxPercentText(250)).toBe('2.5');
    expect(taxPercentText(0)).toBe('0');
    expect(taxPercentText(10_000)).toBe('100');
  });
});

describe('pack size and the low-stock alert in packs', () => {
  it('a pack size is a whole number above 0', () => {
    expect(parsePackSize('250')).toBe(250);
    for (const bad of ['0', '', '-1', '2.5', 'x']) expect(parsePackSize(bad), bad).toBeNull();
  });
  it('the alert is typed in packs and stored in base units: 5 packs of 250 ml is 1250 ml', () => {
    expect(parseMinPacks('5', 250)).toBe(1250);
    expect(parseMinPacks('5', 1000)).toBe(5000);
    expect(parseMinPacks('0.5', 1000)).toBe(500);
    expect(parseMinPacks('', 250)).toBe(0);
    expect(parseMinPacks('0', 250)).toBe(0);
  });
  it('refuses an alert that does not come to whole base units, and text', () => {
    expect(parseMinPacks('0.001', 250)).toBeNull(); // a quarter of a millilitre
    expect(parseMinPacks('abc', 250)).toBeNull();
    expect(parseMinPacks('-1', 250)).toBeNull();
  });
  it('shows the stored alert in packs again', () => {
    expect(packsText(1250, 250)).toBe('5');
    expect(packsText(500, 1000)).toBe('0.5');
  });
});

describe('the lock', () => {
  it('a saved size with batches is locked; a new size and a saved size with none are not', () => {
    const d = draftFromSaved(savedGroup());
    expect(isLocked(d.sizes[0]!)).toBe(true);
    expect(isLocked(d.sizes[1]!)).toBe(false);
    expect(isLocked(blankSize())).toBe(false);
  });
  it('the unit is editable only for a new product, or one with a single saved size that has no batches', () => {
    expect(unitEditable(newDraft())).toBe(true);
    expect(unitEditable(draftFromSaved(savedGroup()))).toBe(false); // two saved sizes, one locked
    expect(unitEditable(draftFromSaved(savedGroup([savedSize({ batch_count: 0 })])))).toBe(true);
    expect(unitEditable(draftFromSaved(savedGroup([savedSize()])))).toBe(false); // one saved size, but it has batches
  });
});

describe('checking the form', () => {
  const filled = (): ProductDraft => ({ ...newDraft(), nameEn: 'Insecticide', sizes: [{ ...blankSize(), packSize: '250', retail: '190', wholesale: '170' }] });

  it('a filled form has no problems', () => {
    expect(hasProblems(checkDraft(filled()))).toBe(false);
  });
  it('needs an English or an Urdu name', () => {
    expect(checkDraft({ ...filled(), nameEn: '', nameUr: '' }).name).toBe(true);
    expect(checkDraft({ ...filled(), nameEn: '', nameUr: 'کھاد' }).name).toBe(false);
  });
  it('a label is needed once there are two sizes, not for one', () => {
    expect(hasProblems(checkDraft(filled()))).toBe(false);
    const two = { ...filled(), sizes: [...filled().sizes, { ...blankSize(), packSize: '500', retail: '270', wholesale: '245' }] };
    const found = checkDraft(two);
    expect(Object.values(found.sizes).map((p) => p.label)).toEqual(['labelRequired', 'labelRequired']);
  });
  it('flags a bad pack size, prices, tax and alert on the size they belong to', () => {
    const d = filled();
    const size = { ...d.sizes[0]!, packSize: '0', retail: 'abc', wholesale: '', taxPct: '101', minPacks: 'x' };
    const found = checkDraft({ ...d, sizes: [size] });
    expect(found.sizes[size.key]).toMatchObject({ packSize: 'packInvalid', retail: 'retailInvalid', wholesale: 'wholesaleInvalid', tax: 'taxInvalid' });
  });
});

describe('what a save sends: a new product', () => {
  it('is ONE call, with prices in paisa, tax in basis points, the alert in base units and the product-level unit on every size', () => {
    const draft: ProductDraft = {
      ...newDraft(),
      nameEn: 'Insecticide',
      nameUr: 'کیڑے مار دوا',
      categoryId: 'c1',
      unit: 'ml',
      sizes: [
        { ...blankSize(), label: '250 ml', packSize: '250', sku: 'INS-250', barcode: '', retail: '118', wholesale: '110.50', taxPct: '18', minPacks: '5', allowLoose: true },
        { ...blankSize(), label: '1 L', packSize: '1000', retail: '500', wholesale: '450', taxPct: '0', minPacks: '' },
      ],
    };
    const steps = buildSaveSteps(draft, null);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      kind: 'createGroup',
      input: {
        name_en: 'Insecticide',
        name_ur: 'کیڑے مار دوا',
        category_id: 'c1',
        brand_id: null,
        sizes: [
          { pack_label: '250 ml', sku: 'INS-250', barcode: null, base_unit: 'ml', pack_size: 250, allow_loose: 1, retail_price: 11_800, wholesale_price: 11_050, tax_rate_bp: 1800, min_stock: 1250 },
          { pack_label: '1 L', sku: null, barcode: null, base_unit: 'ml', pack_size: 1000, allow_loose: 0, retail_price: 50_000, wholesale_price: 45_000, tax_rate_bp: 0, min_stock: 0 },
        ],
      },
    });
  });
  it('a name left empty is left out, not sent as an empty string', () => {
    const [step] = buildSaveSteps({ ...newDraft(), nameUr: 'کھاد', sizes: [{ ...blankSize(), packSize: '1', retail: '1', wholesale: '1' }] }, null);
    expect(step).toMatchObject({ kind: 'createGroup' });
    expect(Object.keys((step as { input: object }).input)).not.toContain('name_en');
  });
  it('loose sale is never sent for a product counted in pieces', () => {
    const [step] = buildSaveSteps({ ...newDraft(), nameEn: 'Sprayer', unit: 'piece', sizes: [{ ...blankSize(), packSize: '1', retail: '1', wholesale: '1', allowLoose: true }] }, null);
    expect((step as { input: { sizes: { allow_loose: number }[] } }).input.sizes[0]!.allow_loose).toBe(0);
  });
});

describe('what a save sends: editing', () => {
  it('nothing changed, nothing sent', () => {
    expect(buildSaveSteps(draftFromSaved(savedGroup()), savedGroup())).toEqual([]);
  });

  it('only the product fields that changed', () => {
    const d = draftFromSaved(savedGroup());
    d.nameEn = 'Insecticide X';
    d.brandId = 'b1';
    expect(buildSaveSteps(d, savedGroup())).toEqual([{ kind: 'updateGroup', input: { group_id: 'g1', name_en: 'Insecticide X', brand_id: 'b1' } }]);
  });

  it('clearing a name or a category sends null', () => {
    const d = draftFromSaved(savedGroup());
    d.nameUr = '';
    d.categoryId = '';
    expect(buildSaveSteps(d, savedGroup())).toEqual([{ kind: 'updateGroup', input: { group_id: 'g1', name_ur: null, category_id: null } }]);
  });

  it('a changed price and tax on a size: only those, in paisa and basis points', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[0] = { ...d.sizes[0]!, retail: '200', taxPct: '18' };
    expect(buildSaveSteps(d, savedGroup())).toEqual([{ kind: 'updateSize', key: 's250', input: { product_id: 's250', changes: { retail_price: 20_000, tax_rate_bp: 1800 } } }]);
  });

  it('the pack size and unit of a LOCKED size are never sent, even if the draft was changed', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[0] = { ...d.sizes[0]!, packSize: '300', label: '300 ml' };
    const steps = buildSaveSteps(d, savedGroup());
    expect(steps).toEqual([{ kind: 'updateSize', key: 's250', input: { product_id: 's250', changes: { pack_label: '300 ml' } } }]);
  });

  it('the pack size of a size with NO batches can be sent', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[1] = { ...d.sizes[1]!, packSize: '600' };
    expect(buildSaveSteps(d, savedGroup())).toEqual([{ kind: 'updateSize', key: 's500', input: { product_id: 's500', changes: { pack_size: 600 } } }]);
  });

  it('the low-stock alert is converted with the pack size it will have', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[1] = { ...d.sizes[1]!, packSize: '600', minPacks: '2' };
    expect(buildSaveSteps(d, savedGroup())).toEqual([{ kind: 'updateSize', key: 's500', input: { product_id: 's500', changes: { pack_size: 600, min_stock: 1200 } } }]);
  });

  it('a new size is added with the product-level unit, after the saved ones are updated', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[0] = { ...d.sizes[0]!, retail: '195' };
    d.sizes.push({ ...blankSize(), label: '1 L', packSize: '1000', retail: '500', wholesale: '450', taxPct: '17' });
    const steps = buildSaveSteps(d, savedGroup());
    expect(steps.map((s) => s.kind)).toEqual(['updateSize', 'addSize']);
    expect(steps[1]).toMatchObject({ kind: 'addSize', input: { group_id: 'g1', size: { pack_label: '1 L', base_unit: 'ml', pack_size: 1000, tax_rate_bp: 1700, retail_price: 50_000 } } });
  });

  it('switching a size off (or on) is its own step, last', () => {
    const d = draftFromSaved(savedGroup());
    d.sizes[1] = { ...d.sizes[1]!, active: false };
    d.nameEn = 'Insecticide X';
    expect(buildSaveSteps(d, savedGroup()).map((s) => s.kind)).toEqual(['updateGroup', 'setSizeActive']);
    const back = savedGroup([savedSize(), savedSize({ id: 's500', pack_label: '500 ml', is_active: 0, batch_count: 0 })]);
    const e = draftFromSaved(back);
    e.sizes[1] = { ...e.sizes[1]!, active: true };
    expect(buildSaveSteps(e, back)).toEqual([{ kind: 'setSizeActive', key: 's500', input: { id: 's500', is_active: true } }]);
  });

  it('never deletes anything: a saved size can only be switched off', () => {
    const d = draftFromSaved(savedGroup());
    const kinds = buildSaveSteps({ ...d, sizes: d.sizes.map((s) => ({ ...s, active: false })) }, savedGroup()).map((s) => s.kind);
    expect(kinds.every((k) => k === 'setSizeActive')).toBe(true);
  });
});
