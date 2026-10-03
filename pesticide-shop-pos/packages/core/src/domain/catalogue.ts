import type { GroupWithSizes, SizeWithStock } from '../ports/types.js';

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
  return out
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d) (?=[a-z؀-ۿ])/g, '$1');
}

export interface CatalogueHit {
  group: GroupWithSizes['group'];
  /** The sizes to show: active ones, unless inactive ones were asked for. */
  sizes: SizeWithStock[];
  /** The sizes that matched the words typed. When only the group's own name matched, that is all of them. */
  matched_size_ids: string[];
  /** 0 an exact barcode or SKU, 1 the name starts with what was typed, 2 a word of the name does, 3 anywhere. */
  rank: number;
}

export interface SearchOptions {
  /** Also show inactive sizes and inactive groups. Default false. */
  include_inactive?: boolean;
}

/**
 * Normalised text a size can be found by typing words: both languages of the group and the size, and its label.
 * Barcodes and SKUs are left out on purpose: they only match when typed in full (or scanned), because a number such as
 * "250" would otherwise match every barcode that happens to contain it.
 */
function haystack(group: GroupWithSizes['group'], size: SizeWithStock): string {
  return normalizeSearchText([group.name_en, group.name_ur, size.name_en, size.name_ur, size.pack_label].filter((t): t is string => !!t).join(' '));
}

function nameRank(group: GroupWithSizes['group'], query: string, words: readonly string[]): number {
  const names = [group.name_en, group.name_ur].filter((t): t is string => !!t).map(normalizeSearchText);
  if (names.some((n) => n.startsWith(query))) return 1;
  const first = words[0] ?? '';
  if (names.some((n) => n.split(' ').some((w) => w.startsWith(first)))) return 2;
  return 3;
}

/**
 * Finds product groups for what the cashier typed, in English or Urdu. Every word typed must appear in a size's
 * names or label (or in its group's names). A barcode or SKU typed in full finds that one size first.
 * An empty search lists everything in name order. Results are sorted by rank, then by group name, then by id,
 * so the order never depends on the backend.
 */
export function searchCatalogue(all: readonly GroupWithSizes[], text: string, options: SearchOptions = {}): CatalogueHit[] {
  const query = normalizeSearchText(text);
  const words = query === '' ? [] : query.split(' ');
  const includeInactive = options.include_inactive === true;
  const hits: CatalogueHit[] = [];

  for (const { group, sizes: allSizes } of all) {
    if (!includeInactive && group.is_active !== 1) continue;
    const sizes = includeInactive ? allSizes : allSizes.filter((s) => s.is_active === 1);
    if (sizes.length === 0 && (!includeInactive || words.length > 0)) continue;

    if (words.length === 0) {
      hits.push({ group, sizes, matched_size_ids: sizes.map((s) => s.id), rank: 3 });
      continue;
    }
    const exact = sizes.filter((s) => [s.barcode, s.sku].some((code) => code !== null && normalizeSearchText(code) === query));
    if (exact.length > 0) {
      hits.push({ group, sizes, matched_size_ids: exact.map((s) => s.id), rank: 0 });
      continue;
    }
    const matched = sizes.filter((s) => {
      const text = haystack(group, s);
      return words.every((w) => text.includes(w));
    });
    if (matched.length === 0) continue;
    hits.push({ group, sizes, matched_size_ids: matched.map((s) => s.id), rank: nameRank(group, query, words) });
  }

  const sortKey = (h: CatalogueHit) => normalizeSearchText(h.group.name_en ?? h.group.name_ur ?? '');
  return hits.sort((a, b) => a.rank - b.rank || (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a.group.id < b.group.id ? -1 : 1));
}
