// The standard-units rule, as checks. Shared by the source scan and by the rendered-screen tests.
//
// RULE (owner's words): weight is kg, volume is litre (L), counted things are pieces. The letters/words 'g', 'ml', 'gm' and 'grams' (and the
// Urdu words گرام and ملی لیٹر) must NEVER be visible on any screen, receipt, report, CSV or print.

/** What a small unit looks like in visible text. */
export const SMALL_UNIT_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'number followed by g / ml / gm / gram(s)', pattern: /(?<![\p{L}\p{N}])\d+(?:\.\d+)?\s?(?:g|ml|gm|grams?)(?![\p{L}\p{N}])/iu },
  { name: 'the word ml', pattern: /(?<![\p{L}\p{N}])ml(?![\p{L}\p{N}])/iu },
  { name: 'the word gram(s)', pattern: /(?<![\p{L}\p{N}])grams?(?![\p{L}\p{N}])/iu },
  { name: 'a lone g', pattern: /(?:^|\s)g(?:\s|$)/ },
  { name: 'the Urdu word for gram', pattern: /گرام/ },
  { name: 'the Urdu words for millilitre', pattern: /ملی\s?لیٹر/ },
];

/** The marks that keep numbers left to right in Urdu text are not part of what is read. */
export const withoutMarks = (text: string): string => text.replace(/[⁦-⁩‎‏]/g, '');

/** The names of the rules this text breaks (empty: it is clean). */
export function smallUnitsIn(text: string): string[] {
  const clean = withoutMarks(text);
  return SMALL_UNIT_PATTERNS.filter((p) => p.pattern.test(clean)).map((p) => p.name);
}

/** Everything a person can read on a screen: its text and the values in its boxes. */
export function visibleText(root: ParentNode): string {
  const own = (root as Element).textContent ?? '';
  const values = [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')].map((el) => el.value);
  const labels = [...root.querySelectorAll<HTMLElement>('[aria-label], [title], [placeholder]')].flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder')].filter((v): v is string => !!v));
  return [own, ...values, ...labels].join(' \n ');
}

/** The unit words that must show up on a screen that has quantities: kg / L / piece(s) in English, کلو / لیٹر / عدد in Urdu. */
export const UNIT_WORDS: Record<'en' | 'ur', RegExp> = {
  en: /\d\s?(?:kg|L|pieces?)/,
  ur: /(?:کلو|لیٹر|عدد)/,
};
