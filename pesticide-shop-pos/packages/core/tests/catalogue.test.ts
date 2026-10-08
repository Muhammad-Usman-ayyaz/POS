import { describe, expect, it } from 'vitest';
import { buildCatalogueIndex, normalizeSearchText, searchCatalogue, searchIndex, sizeDisplayName, tidyText, type GroupWithSizes, type ProductGroup, type SizeWithStock } from '../src/index.js';

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

// ---------- the optimised search must give exactly the answers of a plain one ----------

describe('buildCatalogueIndex + searchIndex give the same answers as the plain, slow search', () => {
  // The plain search: normalise everything again for every query, from scratch. It is what the code did before it was optimised.
  function reference(all: readonly GroupWithSizes[], text: string, includeInactive: boolean) {
    const query = normalizeSearchText(text);
    const words = query === '' ? [] : query.split(' ');
    const hits: { id: string; matched: string[]; rank: number; sizes: string[] }[] = [];
    for (const { group, sizes: allSizes } of all) {
      if (!includeInactive && group.is_active !== 1) continue;
      const sizes = includeInactive ? allSizes : allSizes.filter((s) => s.is_active === 1);
      if (sizes.length === 0 && (!includeInactive || words.length > 0)) continue;
      if (words.length === 0) {
        hits.push({ id: group.id, matched: sizes.map((s) => s.id), rank: 3, sizes: sizes.map((s) => s.id) });
        continue;
      }
      const exact = sizes.filter((s) => [s.barcode, s.sku].some((c) => c !== null && normalizeSearchText(c) === query));
      if (exact.length > 0) {
        hits.push({ id: group.id, matched: exact.map((s) => s.id), rank: 0, sizes: sizes.map((s) => s.id) });
        continue;
      }
      const matched = sizes.filter((s) => {
        const hay = normalizeSearchText([group.name_en, group.name_ur, s.name_en, s.name_ur, s.pack_label].filter((t): t is string => !!t).join(' '));
        return words.every((w) => hay.includes(w));
      });
      if (matched.length === 0) continue;
      const names = [group.name_en, group.name_ur].filter((t): t is string => !!t).map(normalizeSearchText);
      const rank = names.some((n) => n.startsWith(query)) ? 1 : names.some((n) => n.split(' ').some((w) => w.startsWith(words[0]!))) ? 2 : 3;
      hits.push({ id: group.id, matched: matched.map((s) => s.id), rank, sizes: sizes.map((s) => s.id) });
    }
    const keys = new Map(all.map(({ group: g }) => [g.id, normalizeSearchText(g.name_en ?? g.name_ur ?? '')]));
    const key = (id: string) => keys.get(id)!;
    return hits.sort((a, b) => a.rank - b.rank || (key(a.id) < key(b.id) ? -1 : key(a.id) > key(b.id) ? 1 : a.id < b.id ? -1 : 1));
  }

  // A fixed seed, printed on failure, with exact 32-bit arithmetic.
  const SEED = 20_261_008;
  let state = SEED;
  const next = (max: number) => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state % max;
  };
  const pick = <T,>(xs: readonly T[]): T => xs[next(xs.length)]!;

  const EN = ['Insecticide', 'Fungicide', 'Weedicide', 'Fertilizer', 'Seed', 'Rodenticide', 'Alpha', 'Bayer', 'Zarai', 'Super', 'Neem', 'Urea', 'DAP'];
  const UR = ['کیڑے مار', 'پھپھوندی کش', 'جڑی بوٹی', 'کھاد', 'بیج', 'چوہے مار', 'دوا', 'سبزی کا بیج', 'ڈی اے پی', 'نیم'];
  const LABELS = ['', '250 ml', '500 ml', '1 L', '1 kg', '50 kg bag', '100 g', '٢٥٠ ml', '۵۰۰ ml'];
  const make = (n: number): GroupWithSizes[] =>
    Array.from({ length: n }, (_, i) => {
      const styled = (t: string) => (next(4) === 0 ? t.toLowerCase() : next(6) === 0 ? `${t} ${1 + next(90)} ${pick(['kg', 'ml', 'g'])}` : t);
      const en = next(8) === 0 ? null : styled(`${pick(EN)} ${pick(EN)} ${next(40)}`);
      const ur = en === null || next(3) !== 0 ? `${pick(UR)} ${pick(UR)} ${next(40)}` : null;
      const gid = `g${i}`;
      const labels = next(3) === 0 ? [''] : [...new Set([pick(LABELS.slice(1)), pick(LABELS.slice(1)), pick(LABELS.slice(1))])];
      const g = group(gid, en, ur, { is_active: next(10) === 0 ? 0 : 1 });
      return { group: g, sizes: labels.map((l, k) => size(`${gid}s${k}`, gid, l, [en, ur], { is_active: next(8) === 0 ? 0 : 1, barcode: next(2) === 0 ? `89${String(i).padStart(4, '0')}${k}` : null, sku: next(5) === 0 ? `SKU-${i}-${k}` : null })) };
    });
  const arabic = (t: string) => t.replace(/ی/g, 'ي').replace(/ک/g, 'ك');
  const easternDigits = (t: string) => t.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));

  it('600 random searches over 250 random products agree on which products, which sizes, the rank and the order', () => {
    const all = make(250);
    const index = buildCatalogueIndex(all);
    const names = all.flatMap((g) => [g.group.name_en, g.group.name_ur]).filter((t): t is string => !!t);
    const labels = all.flatMap((g) => g.sizes.map((s) => s.pack_label)).filter((l) => l !== '');
    const codes = all.flatMap((g) => g.sizes.flatMap((s) => [s.barcode, s.sku])).filter((c): c is string => !!c);
    const queryOf = (): string => {
      switch (next(10)) {
        case 0: return pick(names).split(' ')[0]!;
        case 1: return pick(names).slice(0, 1 + next(5));
        case 2: return `${pick(names).split(' ')[0]} ${pick(labels)}`;
        case 3: return arabic(pick(names));
        case 4: return easternDigits(pick(labels));
        case 5: return pick(codes);
        case 6: return pick(names).toUpperCase();
        case 7: return `${pick(EN)} ${pick(UR)}`;
        case 8: return pick(['', ' ', 'zzzz', '٠', 'ml', '500', '1 l']);
        default: return pick(names);
      }
    };
    for (let n = 0; n < 600; n++) {
      const q = queryOf();
      const includeInactive = next(4) === 0;
      const want = reference(all, q, includeInactive);
      const got = searchIndex(index, q, { include_inactive: includeInactive });
      const note = `seed ${SEED}, search #${n}, query ${JSON.stringify(q)}, inactive ${includeInactive}`;
      expect(got.total, note).toBe(want.length);
      expect(got.hits.map((h) => [h.group.id, h.matched_size_ids, h.rank, h.sizes.map((s) => s.id)]), note).toEqual(want.map((w) => [w.id, w.matched, w.rank, w.sizes]));
    }
  }, 60_000);

  it('pages cut out of the full answer: any limit and offset give exactly that slice, with the same total', () => {
    const all = make(120);
    const index = buildCatalogueIndex(all);
    for (let n = 0; n < 300; n++) {
      const q = pick(['', 'insecticide', 'کھاد', 'alpha', '500', 'zzz', 'bayer 1 l']);
      const full = searchIndex(index, q);
      const limit = 1 + next(30);
      const offset = next(full.total + 5);
      const page = searchIndex(index, q, { limit, offset });
      expect(page.total, `seed ${SEED}, #${n}`).toBe(full.total);
      expect(page.hits.map((h) => h.group.id), `seed ${SEED}, #${n}, ${q}, limit ${limit}, offset ${offset}`).toEqual(full.hits.slice(offset, offset + limit).map((h) => h.group.id));
    }
  });

  it('products are sorted by the NORMALISED name: "apple" comes before "Banana" even though "B" sorts before "a" in raw text', () => {
    const cat: GroupWithSizes[] = [
      { group: group('b', 'Banana', null), sizes: [size('b1', 'b', '', ['Banana', null])] },
      { group: group('a', 'apple', null), sizes: [size('a1', 'a', '', ['apple', null])] },
      { group: group('u', null, 'ٱکھاد'), sizes: [size('u1', 'u', '', [null, 'ٱکھاد'])] },
    ];
    expect(searchIndex(buildCatalogueIndex(cat), '').hits.map((h) => h.group.id).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('ranking sees "50 kg" in a product name as "50kg": typing 50kg ranks that product above one found only by its size label', () => {
    const cat: GroupWithSizes[] = [
      { group: group('alpha', 'Alpha', null), sizes: [size('s1', 'alpha', '50 kg', ['Alpha', null])] }, // matches 50kg through its label: rank 3
      { group: group('zed', 'Zed 50 kg', null), sizes: [size('s2', 'zed', '', ['Zed 50 kg', null])] }, // a word of its NAME starts with 50kg: rank 2
    ];
    const hits = searchIndex(buildCatalogueIndex(cat), '50kg').hits;
    expect(hits.map((h) => [h.group.id, h.rank])).toEqual([['zed', 2], ['alpha', 3]]); // rank beats the alphabet
  });

  it('the index is built once and not changed by searching it (searching twice gives the same answer)', () => {
    const all = make(60);
    const index = buildCatalogueIndex(all);
    const first = searchIndex(index, 'insecticide', { limit: 10 });
    searchIndex(index, 'کھاد');
    searchIndex(index, '', { include_inactive: true });
    expect(searchIndex(index, 'insecticide', { limit: 10 })).toEqual(first);
  });
});
