import { addDays } from '../clock.js';
import type { SizeStatus, SizeWithStock } from '../ports/types.js';
import type { Product, ProductGroup } from '../schemas/index.js';
import { storedPackLabel } from '../units.js';

// Pure catalogue rules: how a size is named, and how a typed search is matched. No clock, no database.

/** A name or label as it is stored: no leading or trailing spaces, and runs of spaces collapsed to one. */
export function tidyText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * The display name of a size: the group name and the pack label ("Product A" + "500 ml" is "Product A 500 ml").
 * An empty label gives the group name alone. A group with no name in this language gives null, like the column.
 * The view v_product_group_mismatch computes the same thing in SQL, so any change here must change it there.
 */
export function sizeDisplayName(groupName: string | null, packLabel: string): string | null {
  if (groupName === null) return null;
  return packLabel === '' ? groupName : `${groupName} ${packLabel}`;
}

const EASTERN_ARABIC_DIGITS_START = 0x0660; // ٠ ... ٩
const EXTENDED_ARABIC_DIGITS_START = 0x06f0; // ۰ ... ۹ (the Urdu and Persian digits)

/** Letters that look the same but are typed differently on Arabic and Urdu keyboards, mapped to the Urdu one. */
const LETTER_VARIANTS: Readonly<Record<string, string>> = {
  'ي': 'ی', // ي Arabic yeh        -> ی Farsi yeh
  'ى': 'ی', // ى alef maksura      -> ی
  'ك': 'ک', // ك Arabic kaf        -> ک keheh
  'ه': 'ہ', // ه Arabic heh        -> ہ heh goal
  'ة': 'ہ', // ة teh marbuta       -> ہ
  'ۃ': 'ہ', // ۃ teh marbuta goal  -> ہ
  'أ': 'ا', // أ                   -> ا
  'إ': 'ا', // إ                   -> ا
};

/**
 * Makes two spellings of the same word equal, so a search finds a product however it was typed:
 *  - lower case, one space between words
 *  - Eastern Arabic digits (٠-٩) and Urdu/Persian digits (۰-۹) become 0-9
 *  - Arabic and Urdu letter variants become one letter (ي ى -> ی, ك -> ک, ه ة ۃ -> ہ, أ إ -> ا)
 *  - Urdu diacritics, tatweel, joiners and direction marks are dropped
 *  - a space between a number and a unit is dropped, so "500 ml" and "500ml" are the same
 */
export function normalizeSearchText(text: string): string {
  return glueNumberAndUnit(normalizeCore(text));
}

/** "500 ml" -> "500ml". Applied to a whole text, after the characters have been normalised. */
function glueNumberAndUnit(text: string): string {
  return text.replace(/(\d) (?=[a-z\u0600-\u06ff])/g, '$1');
}

/** Everything in normalizeSearchText except the number-and-unit rule. Joining normalised pieces with one space gives the same text as normalising the joined text. */
function normalizeCore(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC')) {
    const code = ch.codePointAt(0)!;
    if (code >= EASTERN_ARABIC_DIGITS_START && code <= EASTERN_ARABIC_DIGITS_START + 9) out += String(code - EASTERN_ARABIC_DIGITS_START);
    else if (code >= EXTENDED_ARABIC_DIGITS_START && code <= EXTENDED_ARABIC_DIGITS_START + 9) out += String(code - EXTENDED_ARABIC_DIGITS_START);
    else if (
      (code >= 0x064b && code <= 0x065f) || // harakat: fathatan ... hamza below
      code === 0x0670 || // superscript alef
      code === 0x0640 || // tatweel
      code === 0x200c || code === 0x200d || // zero-width non-joiner and joiner
      code === 0x200e || code === 0x200f || code === 0x061c // direction marks
    ) continue;
    else out += LETTER_VARIANTS[ch] ?? ch;
  }
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A product group with its sizes, in whatever form the sizes come (with stock, or without). */
export interface GroupOf<S extends Product> {
  group: ProductGroup;
  sizes: readonly S[];
}

export interface CatalogueHit<S extends Product = SizeWithStock> {
  group: ProductGroup;
  /** The sizes to show: active ones, unless inactive ones were asked for. */
  sizes: S[];
  /** The sizes that matched the words typed. When only the group's own name matched, that is all of them. */
  matched_size_ids: string[];
  /** 0 an exact barcode or SKU, 1 the name starts with what was typed, 2 a word of the name does, 3 anywhere. */
  rank: number;
}

export interface SearchOptions {
  /** Also show inactive sizes and inactive groups. Default false. */
  include_inactive?: boolean;
  /** Only return this many products (after sorting). Leave out for all of them. */
  limit?: number;
  /** Skip this many products first (for the next page). Default 0. */
  offset?: number;
}

/** One page of a search: the products on it, and how many products matched in all. */
export interface CataloguePage<S extends Product = SizeWithStock> {
  hits: CatalogueHit<S>[];
  total: number;
}

// The text work (normalising names, labels, codes) is the expensive part of a search, and it only changes when the
// catalogue does. So it is done ONCE per catalogue, into an index, and every search after that only compares strings.

interface IndexedSize<S extends Product> {
  size: S;
  /**
   * Normalised text a size can be found by typing words: the group's names in both languages, and the size's label.
   * (A size's own name is that group name plus the label, so it adds nothing.) Barcodes and SKUs are left out on
   * purpose: they only match when typed in full (or scanned), because a number such as "250" would otherwise match
   * every barcode that happens to contain it.
   */
  hay: string;
  /** Normalised barcode and SKU, for an exact match. */
  codes: string[];
}

interface IndexedGroup<S extends Product> {
  group: ProductGroup;
  rows: readonly IndexedSize<S>[];
  /** Normalised group names (English, Urdu), for ranking. */
  names: readonly string[];
  /** What products are sorted by. */
  sortKey: string;
}

/** A catalogue prepared for searching. Immutable: build a new one when the catalogue changes. */
export interface CatalogueIndex<S extends Product = SizeWithStock> {
  readonly groups: readonly IndexedGroup<S>[];
}

export function buildCatalogueIndex<S extends Product>(all: readonly GroupOf<S>[]): CatalogueIndex<S> {
  const present = (t: string | null): t is string => !!t;
  // Names and labels repeat a lot (every size of a product shares its names, many products share a label like "1 L").
  const memo = new Map<string, string>();
  const core = (text: string): string => {
    let done = memo.get(text);
    if (done === undefined) {
      done = normalizeCore(text);
      memo.set(text, done);
    }
    return done;
  };
  return {
    groups: all.map(({ group, sizes }) => {
      const names = [group.name_en, group.name_ur].filter(present).map(core);
      return {
        group,
        names,
        sortKey: glueNumberAndUnit(core(group.name_en ?? group.name_ur ?? '')),
        rows: sizes.map((size) => ({
          size,
          hay: glueNumberAndUnit([...names, core(size.pack_label), core(storedPackLabel(size.base_unit, size.pack_size))].filter((t) => t !== '').join(' ')),
          codes: [size.barcode, size.sku].filter(present).map(normalizeSearchText),
        })),
      };
    }),
  };
}

function nameRank(names: readonly string[], query: string, firstWord: string): number {
  const glued = names.map(glueNumberAndUnit);
  if (glued.some((n) => n.startsWith(query))) return 1;
  if (glued.some((n) => n.split(' ').some((w) => w.startsWith(firstWord)))) return 2;
  return 3;
}

interface Match<S extends Product> {
  entry: IndexedGroup<S>;
  rows: readonly IndexedSize<S>[];
  matched: readonly IndexedSize<S>[];
  rank: number;
}

/**
 * Finds product groups for what the cashier typed, in English or Urdu. Every word typed must appear in a size's
 * label or in its group's names. A barcode or SKU typed in full finds that one size first.
 * An empty search lists everything in name order. Results are sorted by rank, then by group name, then by id,
 * so the order never depends on the backend. `limit` and `offset` pick one page of the sorted list; `total` is
 * the number of matching products before paging.
 */
export function searchIndex<S extends Product>(index: CatalogueIndex<S>, text: string, options: SearchOptions = {}): CataloguePage<S> {
  const query = normalizeSearchText(text);
  const words = query === '' ? [] : query.split(' ');
  const includeInactive = options.include_inactive === true;
  const matches: Match<S>[] = [];

  for (const entry of index.groups) {
    if (!includeInactive && entry.group.is_active !== 1) continue;
    const rows = includeInactive ? entry.rows : entry.rows.filter((r) => r.size.is_active === 1);
    if (rows.length === 0 && (!includeInactive || words.length > 0)) continue;

    if (words.length === 0) {
      matches.push({ entry, rows, matched: rows, rank: 3 });
      continue;
    }
    const exact = rows.filter((r) => r.codes.includes(query));
    if (exact.length > 0) {
      matches.push({ entry, rows, matched: exact, rank: 0 });
      continue;
    }
    const matched = rows.filter((r) => words.every((w) => r.hay.includes(w)));
    if (matched.length === 0) continue;
    matches.push({ entry, rows, matched, rank: nameRank(entry.names, query, words[0]!) });
  }

  matches.sort((a, b) => a.rank - b.rank || (a.entry.sortKey < b.entry.sortKey ? -1 : a.entry.sortKey > b.entry.sortKey ? 1 : a.entry.group.id < b.entry.group.id ? -1 : 1));

  const offset = Math.max(0, options.offset ?? 0);
  const page = options.limit === undefined ? matches.slice(offset) : matches.slice(offset, offset + Math.max(0, options.limit));
  return {
    total: matches.length,
    hits: page.map((m) => ({ group: m.entry.group, sizes: m.rows.map((r) => r.size), matched_size_ids: m.matched.map((r) => r.size.id), rank: m.rank })),
  };
}

/** Builds the index and searches it, in one go. Use `buildCatalogueIndex` and `searchIndex` when searching many times. */
export function searchCatalogue<S extends Product = SizeWithStock>(all: readonly GroupOf<S>[], text: string, options: SearchOptions = {}): CatalogueHit<S>[] {
  return searchIndex(buildCatalogueIndex(all), text, options).hits;
}

// ---------- the Products screen: what is wrong with a size, and a summary of a product ----------

/** A size with no batches at all. */
export const NO_STOCK: SizeStatus = {
  stock_total: 0,
  stock_sellable: 0,
  expired_stock: 0,
  next_expiry: null,
  next_sellable_expiry: null,
  batch_count: 0,
  stocked_batch_count: 0,
  next_cost: null,
};

export interface SizeFlags {
  /**
   * The size has a minimum (min_stock above 0) and sellable stock is at or under it. A size with minimum 0 has no alert set, so it is
   * never low, even with no stock. Only for a size that is switched on. (The database view v_low_stock does not have the "above 0"
   * part yet and lists such sizes: migration 005 will align it, see docs/build-plan.md.)
   */
  low: boolean;
  /** Its soonest batch with stock expires within `nearDays` days from today (the same rule as v_near_expiry). */
  near_expiry: boolean;
  /** Some stock is still in a batch that has expired (the same rule as v_expired_stock). */
  expired: boolean;
}

/** The last day that still counts as "near expiry": `today` plus the warning window (the setting near_expiry_days, 30 by default). */
export function nearExpiryLimit(today: string, nearDays: number): string {
  return addDays(today, nearDays);
}

/** The flags of one size, given the last near-expiry day (from nearExpiryLimit). Use this when flagging many sizes. */
export function sizeFlagsUpTo(size: { is_active: 0 | 1; min_stock: number }, status: SizeStatus, lastNearDay: string): SizeFlags {
  return {
    low: size.is_active === 1 && size.min_stock > 0 && status.stock_sellable <= size.min_stock,
    near_expiry: status.next_sellable_expiry !== null && status.next_sellable_expiry <= lastNearDay,
    expired: status.expired_stock > 0,
  };
}

/** `today` is YYYY-MM-DD. `nearDays` is the near-expiry warning window. */
export function sizeFlags(size: { is_active: 0 | 1; min_stock: number }, status: SizeStatus, today: string, nearDays: number): SizeFlags {
  return sizeFlagsUpTo(size, status, nearExpiryLimit(today, nearDays));
}

/** A size as the Products screen lists it. `cost_price` is only present when the caller asked for it (the owner). */
export type ListedSize = Product &
  Omit<SizeStatus, 'next_cost'> & {
    flags: SizeFlags;
    cost_price?: number | null;
  };

/** One line about a whole product, for its row when it is folded up. Quantities are in the base unit its sizes share. */
export interface GroupSummary {
  size_count: number;
  /** ml, g or piece (the unit all its sizes share), or null when it has no sizes. */
  base_unit: Product['base_unit'] | null;
  stock_total: number;
  stock_sellable: number;
  /** The lowest and highest retail price of its sizes, in paisa per pack. Null when it has no sizes. */
  retail_min: number | null;
  retail_max: number | null;
  wholesale_min: number | null;
  wholesale_max: number | null;
  low_sizes: number;
  near_expiry_sizes: number;
  expired_sizes: number;
}

export function summarizeSizes(sizes: readonly ListedSize[]): GroupSummary {
  const retail = sizes.map((s) => s.retail_price);
  const wholesale = sizes.map((s) => s.wholesale_price);
  return {
    size_count: sizes.length,
    base_unit: sizes[0]?.base_unit ?? null,
    stock_total: sizes.reduce((sum, s) => sum + s.stock_total, 0),
    stock_sellable: sizes.reduce((sum, s) => sum + s.stock_sellable, 0),
    retail_min: retail.length > 0 ? Math.min(...retail) : null,
    retail_max: retail.length > 0 ? Math.max(...retail) : null,
    wholesale_min: wholesale.length > 0 ? Math.min(...wholesale) : null,
    wholesale_max: wholesale.length > 0 ? Math.max(...wholesale) : null,
    low_sizes: sizes.filter((s) => s.flags.low).length,
    near_expiry_sizes: sizes.filter((s) => s.flags.near_expiry).length,
    expired_sizes: sizes.filter((s) => s.flags.expired).length,
  };
}
