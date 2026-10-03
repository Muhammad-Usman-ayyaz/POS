import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchCatalogue, sizeDisplayName, tidyText, type GroupWithSizes, type ProductGroup, type SizeWithStock } from '../src/index.js';

describe('sizeDisplayName', () => {
  it('joins the group name and the pack label with one space', () => {
    expect(sizeDisplayName('Insecticide X', '500 ml')).toBe('Insecticide X 500 ml');
    expect(sizeDisplayName('کیڑے مار دوا ایکس', '1 L')).toBe('کیڑے مار دوا ایکس 1 L');
  });
  it('an empty label gives the group name alone, and a missing name stays missing', () => {
    expect(sizeDisplayName('Weedicide 1L', '')).toBe('Weedicide 1L');
    expect(sizeDisplayName(null, '500 ml')).toBeNull();
    expect(sizeDisplayName(null, '')).toBeNull();
  });
});

describe('tidyText', () => {
  it('trims and collapses runs of spaces, so the stored name equals what the database view computes', () => {
    expect(tidyText('  Insecticide   X  ')).toBe('Insecticide X');
    expect(tidyText('500  ml')).toBe('500 ml'); // a non-breaking space counts as a space
  });
});

describe('normalizeSearchText', () => {
  it('lower-cases and keeps one space between words', () => {
    expect(normalizeSearchText('  INSECTICIDE   X ')).toBe('insecticide x');
  });

  it('Eastern Arabic digits (٠-٩) become ASCII digits', () => {
    expect(normalizeSearchText('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeSearchText('٥٠٠')).toBe('500');
  });

  it('Urdu/Persian digits (۰-۹) become ASCII digits too', () => {
    expect(normalizeSearchText('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeSearchText('۲۵۰')).toBe('250');
  });

  it('mixed digit sets and ASCII digits all give the same text', () => {
    const forms = ['250', '٢٥٠', '۲۵۰', '٢5۰'];
    expect(new Set(forms.map(normalizeSearchText)).size).toBe(1);
  });

  it('a number next to a unit matches with or without the space: 500 ml = 500ml = ۵۰۰ ml', () => {
    expect(normalizeSearchText('500 ml')).toBe('500ml');
    expect(normalizeSearchText('500ml')).toBe('500ml');
    expect(normalizeSearchText('۵۰۰ ml')).toBe('500ml');
    expect(normalizeSearchText('٥٠٠ ML')).toBe('500ml');
  });

  it('does not glue unrelated words: a digit followed by a space and a digit stays apart', () => {
    expect(normalizeSearchText('12 34')).toBe('12 34');
  });

  it('Arabic and Urdu letter variants are the same letter: yeh, kaf, heh', () => {
    expect(normalizeSearchText('علي')).toBe(normalizeSearchText('علی')); // ي (Arabic yeh) vs ی
    expect(normalizeSearchText('كھاد')).toBe(normalizeSearchText('کھاد')); // ك (Arabic kaf) vs ک
    expect(normalizeSearchText('جڑي بوٹي')).toBe(normalizeSearchText('جڑی بوٹی'));
    expect(normalizeSearchText('ڈی اے پی کھاد')).toBe(normalizeSearchText('ڈي اے پي كھاد'));
    expect(normalizeSearchText('ہ')).toBe(normalizeSearchText('ه')); // ه (Arabic heh) vs ہ
    expect(normalizeSearchText('ۃ')).toBe(normalizeSearchText('ہ'));
  });

  it('keeps letters that really are different: do-chashmi heh (ھ) is not heh (ہ), and alef madda (آ) is not alef', () => {
    expect(normalizeSearchText('بھ')).not.toBe(normalizeSearchText('بہ'));
    expect(normalizeSearchText('آم')).not.toBe(normalizeSearchText('ام'));
  });

  it('drops Urdu diacritics, tatweel, joiners and direction marks', () => {
    expect(normalizeSearchText('کِیڑے')).toBe(normalizeSearchText('کیڑے')); // kasra
    expect(normalizeSearchText('دَوا')).toBe(normalizeSearchText('دوا')); // fatha
    expect(normalizeSearchText('کـیـڑے')).toBe(normalizeSearchText('کیڑے')); // tatweel
    expect(normalizeSearchText('کی‌ڑے')).toBe(normalizeSearchText('کیڑے')); // zero-width non-joiner
    expect(normalizeSearchText('‏دوا‎')).toBe('دوا'); // direction marks
  });

  it('is idempotent: normalising twice changes nothing', () => {
    for (const text of ['٥٠٠ ML', 'كيڑے مار دوا', '  a   b ', '۱ L']) {
      expect(normalizeSearchText(normalizeSearchText(text))).toBe(normalizeSearchText(text));
    }
  });
});

// ---------- search ----------

const meta = { created_at: 'x', updated_at: 'x', deleted_at: null, version: 1, shop_id: 's', branch_id: 'b', device_id: 'd' };
const group = (id: string, name_en: string | null, name_ur: string | null, o: Partial<ProductGroup> = {}): ProductGroup =>
  ({ id, name_en, name_ur, category_id: null, brand_id: null, notes: null, is_active: 1, ...meta, ...o }) as ProductGroup;
const size = (id: string, groupId: string, label: string, groupName: [string | null, string | null], o: Partial<SizeWithStock> = {}): SizeWithStock =>
  ({
    id, group_id: groupId, pack_label: label, category_id: null, brand_id: null,
    name_en: groupName[0] === null ? null : label === '' ? groupName[0] : `${groupName[0]} ${label}`,
    name_ur: groupName[1] === null ? null : label === '' ? groupName[1] : `${groupName[1]} ${label}`,
    sku: null, barcode: null, base_unit: 'ml', pack_size: 500, allow_loose: 0, retail_price: 1, wholesale_price: 1, tax_rate_bp: 0, min_stock: 0, is_active: 1,
    stock_total: 0, stock_sellable: 0, ...meta, ...o,
  }) as SizeWithStock;

const X: [string, string] = ['Insecticide X', 'کیڑے مار دوا ایکس'];
const catalogue: GroupWithSizes[] = [
  { group: group('g-x', X[0], X[1]), sizes: [size('x250', 'g-x', '250 ml', X, { pack_size: 250, barcode: '8961000250250' }), size('x500', 'g-x', '500 ml', X), size('x1l', 'g-x', '1 L', X, { pack_size: 1000, sku: 'INS-X-1L' })] },
  { group: group('g-f', 'Fertilizer', 'کھاد'), sizes: [size('f1', 'g-f', '1 kg', ['Fertilizer', 'کھاد'], { base_unit: 'g' }), size('f50', 'g-f', '50 kg bag', ['Fertilizer', 'کھاد'], { base_unit: 'g', is_active: 0 })] },
  { group: group('g-w', 'Weedicide 1L', 'جڑی بوٹی مار دوا'), sizes: [size('w1', 'g-w', '', ['Weedicide 1L', 'جڑی بوٹی مار دوا'])] },
  { group: group('g-off', 'Insecticide Old', null, { is_active: 0 }), sizes: [size('o1', 'g-off', '', ['Insecticide Old', null], { is_active: 0 })] },
  { group: group('g-ur', null, 'سبزی کا بیج'), sizes: [size('s1', 'g-ur', '1 kg', [null, 'سبزی کا بیج'], { base_unit: 'g' })] },
];
const ids = (hits: ReturnType<typeof searchCatalogue>) => hits.map((h) => h.group.id);

describe('searchCatalogue', () => {
  it('finds a group by its English name and returns it with all its active sizes', () => {
    const [hit] = searchCatalogue(catalogue, 'insecticide x');
    expect(hit!.group.id).toBe('g-x');
    expect(hit!.sizes.map((s) => s.id)).toEqual(['x250', 'x500', 'x1l']);
    expect(hit!.matched_size_ids).toEqual(['x250', 'x500', 'x1l']); // the group name matched, so every size did
  });

  it('is case-insensitive, and finds by part of a word', () => {
    expect(ids(searchCatalogue(catalogue, 'INSECT'))).toEqual(['g-x']);
  });

  it('finds the same group by its Urdu name', () => {
    expect(ids(searchCatalogue(catalogue, 'کیڑے مار'))).toEqual(['g-x']);
    expect(ids(searchCatalogue(catalogue, 'جڑی بوٹی'))).toEqual(['g-w']);
  });

  it('finds an Urdu-only product, and an Urdu spelling with Arabic letters', () => {
    expect(ids(searchCatalogue(catalogue, 'سبزی'))).toEqual(['g-ur']);
    expect(ids(searchCatalogue(catalogue, 'جڑي بوٹي'))).toEqual(['g-w']); // Arabic yeh in the query
    expect(ids(searchCatalogue(catalogue, 'كھاد'))).toEqual(['g-f']); // Arabic kaf in the query
  });

  it('every word typed must match: "insecticide 500" finds only the 500 ml size, still shown inside its group', () => {
    const hits = searchCatalogue(catalogue, 'insecticide 500');
    expect(ids(hits)).toEqual(['g-x']);
    expect(hits[0]!.matched_size_ids).toEqual(['x500']);
    expect(hits[0]!.sizes).toHaveLength(3);
    expect(searchCatalogue(catalogue, 'insecticide zzz')).toEqual([]);
  });

  it('finds a size by its label with or without a space, and by Eastern Arabic or Urdu digits', () => {
    for (const q of ['250 ml', '250ml', '٢٥٠ ml', '۲۵۰ml', '٢٥٠ ML']) {
      const hits = searchCatalogue(catalogue, q);
      expect(hits[0]!.group.id, q).toBe('g-x');
      expect(hits[0]!.matched_size_ids, q).toEqual(['x250']);
    }
  });

  it('an exact barcode or SKU finds that one size, ahead of everything else', () => {
    const byBarcode = searchCatalogue(catalogue, '8961000250250');
    expect(byBarcode).toHaveLength(1);
    expect(byBarcode[0]).toMatchObject({ rank: 0, matched_size_ids: ['x250'] });
    const bySku = searchCatalogue(catalogue, 'ins-x-1l');
    expect(bySku[0]).toMatchObject({ rank: 0, matched_size_ids: ['x1l'] });
    expect(searchCatalogue(catalogue, '896100025')).toEqual([]); // part of a barcode is not enough
  });

  it('digits in a barcode typed with Eastern Arabic digits still match', () => {
    expect(searchCatalogue(catalogue, '٨٩٦١٠٠٠٢٥٠٢٥٠')[0]?.matched_size_ids).toEqual(['x250']);
  });

  it('hides inactive sizes and inactive groups unless asked', () => {
    expect(ids(searchCatalogue(catalogue, 'insecticide'))).toEqual(['g-x']); // "Insecticide Old" is inactive
    expect(searchCatalogue(catalogue, 'fertilizer')[0]!.sizes.map((s) => s.id)).toEqual(['f1']); // the inactive 50 kg bag is hidden
    expect(ids(searchCatalogue(catalogue, 'insecticide', { include_inactive: true }))).toEqual(['g-off', 'g-x']); // same rank, so by name
    expect(searchCatalogue(catalogue, 'fertilizer', { include_inactive: true })[0]!.sizes.map((s) => s.id)).toEqual(['f1', 'f50']);
  });

  it('an inactive product is hidden by itself, even if one of its sizes is (wrongly) still active', () => {
    // The database never allows this state, but the search must not depend on that: the product's own switch decides.
    const odd: GroupWithSizes[] = [{ group: group('g-off2', 'Switched Off', null, { is_active: 0 }), sizes: [size('z1', 'g-off2', '', ['Switched Off', null], { is_active: 1 })] }];
    expect(searchCatalogue(odd, 'switched')).toEqual([]);
    expect(searchCatalogue(odd, '')).toEqual([]);
    expect(ids(searchCatalogue(odd, 'switched', { include_inactive: true }))).toEqual(['g-off2']);
  });

  it('an empty search lists every active product in name order', () => {
    expect(ids(searchCatalogue(catalogue, ''))).toEqual(['g-f', 'g-x', 'g-w', 'g-ur'].sort((a, b) => (nameKey(a) < nameKey(b) ? -1 : 1)));
    expect(ids(searchCatalogue(catalogue, '   '))).toEqual(ids(searchCatalogue(catalogue, '')));
  });

  it('ranks: a name that starts with the words, then a name with a word that starts with them, then anywhere', () => {
    const cat: GroupWithSizes[] = [
      { group: group('anywhere', 'Super Xtreme', null), sizes: [size('a', 'anywhere', '', ['Super Xtreme', null])] },
      { group: group('word', 'Garden Xtra', null), sizes: [size('b', 'word', '', ['Garden Xtra', null])] },
      { group: group('starts', 'Xtra Power', null), sizes: [size('c', 'starts', '', ['Xtra Power', null])] },
    ];
    const hits = searchCatalogue(cat, 'xtr');
    expect(hits.map((h) => [h.group.id, h.rank])).toEqual([['starts', 1], ['word', 2], ['anywhere', 2]].sort((a, b) => (a[1] as number) - (b[1] as number)) as [string, number][]);
    expect(hits[0]!.group.id).toBe('starts');
  });

  it('the order never depends on the order the catalogue came in', () => {
    const forward = ids(searchCatalogue(catalogue, 'k'));
    const backward = ids(searchCatalogue([...catalogue].reverse(), 'k'));
    expect(backward).toEqual(forward);
  });

  it('a product with no live sizes is not found, unless inactive ones are asked for and nothing was typed', () => {
    const empty: GroupWithSizes[] = [{ group: group('e', 'Empty product', null), sizes: [] }];
    expect(searchCatalogue(empty, 'empty')).toEqual([]);
    expect(searchCatalogue(empty, '')).toEqual([]);
    expect(ids(searchCatalogue(empty, '', { include_inactive: true }))).toEqual(['e']);
  });
});

function nameKey(id: string): string {
  const g = catalogue.find((c) => c.group.id === id)!.group;
  return normalizeSearchText(g.name_en ?? g.name_ur ?? '');
}
