// A check, not part of printing: does a printed page (its HTML, or the text layer of its PDF) show a cost? Used by the deep scan in
// apps/desktop/tests/catalogue-api.test.ts and by `npm run check:pdf`. The owner-only rule: cost, margin and profit never reach a staff
// member, so they never reach a printed page either (a staff member prints receipts all day).

const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A cost in paisa, written the ways a page could write it: 7654321, 76,543.21, 76543.21, 76,543, 76543, Rs 76,543.21. */
export function costFormats(paisa: number): string[] {
  const whole = Math.trunc(paisa / 100);
  const cents = String(paisa % 100).padStart(2, '0');
  return [String(paisa), `${group(whole)}.${cents}`, `${whole}.${cents}`, group(whole), String(whole), `Rs ${group(whole)}.${cents}`];
}

/** Words that would label a cost, in English and Urdu (cost, cost price, margin, profit; لاگت, منافع, نفع, قیمت خرید). */
export const COST_WORDS = /cost|margin|profit|لاگت|منافع|نفع|قیمت\s*خرید/i;

/** The page with every embedded font address taken out (a font file is base64 and could hold any digits by chance). */
export const withoutFontData = (html: string): string => html.replace(/data:[a-z0-9/+.-]+;base64,[A-Za-z0-9+/=]+/g, 'data:');

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Everything in `page` that looks like the cost `paisa`, or a cost word. Empty means clean. The amount is looked for as a whole number
 * (not inside a longer one), in the text as it is and with spaces and direction marks removed (a PDF may split a number into pieces).
 */
export function findCostLeaks(page: string, paisa: number): string[] {
  const text = withoutFontData(page);
  const compact = text.replace(/[\s‎‏⁦-⁩]/g, '');
  const out: string[] = [];
  for (const format of costFormats(paisa)) {
    const re = new RegExp(`(?<!\\d)(?<!\\d[.,])${escapeRegExp(format)}(?!\\d)`);
    if (re.test(text) || re.test(compact)) out.push(`amount "${format}"`);
  }
  // The words are looked for in what a person would READ: not in the stylesheet ("margin:0") or in tag and attribute names.
  const word = text.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' ').match(COST_WORDS);
  if (word) out.push(`word "${word[0]}"`);
  return out;
}
