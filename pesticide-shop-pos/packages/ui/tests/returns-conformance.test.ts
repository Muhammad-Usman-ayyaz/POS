// The Returns screen against docs/design/Returns.dc.html. The wording of the design is READ from the file (not copied here as a second truth) and each phrase
// must be found in the English texts of the screen; what the screen deliberately does differently is listed in `DIFFERENCES` and in docs/decisions.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en.js';

const DESIGN = readFileSync(join(__dirname, '../../../docs/design/Returns.dc.html'), 'utf8');
const tokens = new Set(
  DESIGN.replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<br\s*\/?>/g, '|')
    .replace(/<[^>]+>/g, '|')
    .replace(/&amp;/g, '&')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean),
);
const attrs = [...DESIGN.matchAll(/(?:aria-label|placeholder)="([^"]+)"/g)].map((m) => m[1]!);

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : typeof value === 'function' ? [String((value as (...a: string[]) => string)('{a}', '{b}', '{c}', '{d}'))] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const ours = strings(en.returns).concat(strings(en.pages.returns), [en.invoices.print.savePdf]); // the PDF button's text is shared with the invoice screen

/** Phrases of the design that the screen must say, word for word. */
const MUST_SAY = [
  'Find invoice', 'Recent invoices', 'Invoice number or customer name', 'Nothing returned yet', 'Item', 'Sold', 'Already returned', 'Return qty', 'Refund',
  'Resellable', 'Back to stock', 'Damaged', 'Written off', 'Customer changed mind', 'Leaked in transit', 'Choose reason',
  'Void a whole invoice (owner only)', 'Use this when the entire sale was a mistake.', 'Owner only', 'Reason (required)', 'Cancel', 'Void invoice',
  'Refund summary', 'Refund method', 'Cash back', "Reduce customer's Khata balance", 'Khata before', 'Khata after', 'Returns need owner approval.', 'Owner approval', 'Complete return',
  'Return complete', 'Refund total', 'Included tax', 'Refunded to', 'Save PDF', 'Print credit note',
  'Less', 'More', 'Search invoices', 'Void reason',
];

/** What the screen says differently from the design, on purpose (each is a row in docs/decisions.md). */
const DIFFERENCES: Record<string, string> = {
  'Worked out from the original price, with the discount shared across the line.': 'kept as designed (shared)',
  'packs': 'the unit word comes from the units module (kg, L, packs, pieces): the design shows g and ml, which are never shown',
  'Per kg · Rs 50 for 250 g': 'the price per unit is said by the units module: "Rs 200/kg"',
  '250 g': 'a quantity is said in kg / L / pieces: "0.25 kg"',
  'g': 'never a small unit as visible text',
  'Hand Rs 833 to the customer': 'kept as designed (with the amount of cash that is really owed back)',
};

describe('Returns.dc.html', () => {
  it('the design file is the one this test was written against (it still says what it said)', () => {
    for (const phrase of MUST_SAY) {
      const found = tokens.has(phrase) || attrs.includes(phrase);
      expect(found, `the design no longer has "${phrase}"`).toBe(true);
    }
  });

  it.each(MUST_SAY)('the screen says "%s" as designed', (phrase) => {
    const found = ours.some((text) => text === phrase || text.includes(phrase));
    expect(found, `no English text of the Returns screen says "${phrase}"`).toBe(true);
  });

  it('the screen does not show the design\'s small units: every difference is listed here with its reason', () => {
    for (const [phrase, why] of Object.entries(DIFFERENCES)) expect(why.length, phrase).toBeGreaterThan(5);
    const units = [...tokens].filter((t) => /(^|\s)\d*\s?(g|ml)$/.test(t) || t === 'g');
    for (const unit of units) expect(Object.keys(DIFFERENCES), unit).toContain(unit); // a new small unit in the design must be considered, not copied
    for (const text of ours) expect(text, 'a small unit in the Returns texts').not.toMatch(/(?<![\p{L}\p{N}])(?:\d+\s?)?(?:g|ml)(?![\p{L}\p{N}])/u);
  });
});
