import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@pos/api-contract';
import { describe, expect, it } from 'vitest';
import { describeError, errorCodes, errorText, formatDate, formatMoney, formatQty, ltr, MESSAGES } from '../src/i18n/index.js';

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/** The shape of a messages object: every key, and whether it is text, a list or a function. */
function shapeOf(value: unknown): unknown {
  if (typeof value === 'function') return `fn/${value.length}`;
  if (Array.isArray(value)) return `list/${value.length}`;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]));
  return typeof value;
}

function* strings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

describe('English and Urdu messages', () => {
  it('have exactly the same keys, lists and functions (the compiler checks this too)', () => {
    expect(shapeOf(MESSAGES.ur)).toEqual(shapeOf(MESSAGES.en));
  });

  it('have no empty text', () => {
    for (const language of ['en', 'ur'] as const) {
      for (const [path, text] of strings(MESSAGES[language])) expect(text.trim(), `${language}.${path}`).not.toBe('');
    }
  });

  it('Urdu is really Urdu: every Urdu text uses Arabic script, except the EN button and the shop name', () => {
    const allowed = new Set(['language.en']);
    for (const [path, text] of strings(MESSAGES.ur)) {
      if (allowed.has(path)) continue;
      expect(ARABIC_SCRIPT.test(text), `ur.${path}: ${text}`).toBe(true);
    }
  });

  it('English has no Arabic script', () => {
    for (const [path, text] of strings(MESSAGES.en)) {
      if (path === 'language.ur') continue; // the Urdu button is always labelled in Urdu
      expect(ARABIC_SCRIPT.test(text), `en.${path}`).toBe(false);
    }
  });

  it('the page texts that take a phase say the same phase in both languages', () => {
    for (const key of Object.keys(MESSAGES.en.pages) as (keyof typeof MESSAGES.en.pages)[]) {
      expect(MESSAGES.ur.pages[key].phase).toBe(MESSAGES.en.pages[key].phase);
      expect(MESSAGES.en.placeholder.builtIn(MESSAGES.en.pages[key].phase)).toContain(String(MESSAGES.en.pages[key].phase));
      expect(MESSAGES.ur.placeholder.builtIn(MESSAGES.ur.pages[key].phase)).toContain(String(MESSAGES.ur.pages[key].phase));
    }
  });
});

describe('the error catalogue', () => {
  /** The real list of codes, read from the core, so adding a code there without a message here fails this test. */
  const coreCodes = [...readFileSync(join(__dirname, '..', '..', 'core', 'src', 'errors.ts'), 'utf8').matchAll(/\|\s*'([A-Z_]+)'/g)].map((m) => m[1]!);

  it('has a message for every DomainError code in the core, and for nothing else', () => {
    expect(coreCodes.length).toBeGreaterThanOrEqual(25);
    expect([...errorCodes].sort()).toEqual([...coreCodes].sort());
  });

  it.each(['en', 'ur'] as const)('every code has a title and a next step in %s, with no leftovers like "undefined" or "NaN"', (language) => {
    const params = { available: 3000, requested: 5000, packSize: 1000, scope: 'batch', returnable: 8000, limit: 1_000_000, owed: 200_000, adds: 550_000, paid: 60_000, total: 50_000, discount: 60_000, linePrice: 50_000, expiry: '2027-01-31', capability: 'stock.adjust' };
    for (const code of coreCodes) {
      const text = errorText(code as never, params, language);
      expect(text.title.trim().length, `${language} ${code} title`).toBeGreaterThan(5);
      expect(text.next.trim().length, `${language} ${code} next`).toBeGreaterThan(5);
      expect(`${text.title} ${text.next}`, `${language} ${code}`).not.toMatch(/undefined|NaN|\[object|\$\{/);
    }
  });

  it('every Urdu message is in Urdu script, and every English one is not', () => {
    for (const code of coreCodes) {
      expect(ARABIC_SCRIPT.test(errorText(code as never, {}, 'ur').title), `ur ${code}`).toBe(true);
      expect(ARABIC_SCRIPT.test(errorText(code as never, {}, 'en').title), `en ${code}`).toBe(false);
    }
  });

  it('says "Only 3 packs left in this batch" with the next step', () => {
    expect(errorText('INSUFFICIENT_STOCK', { available: 3000, requested: 5000, packSize: 1000, scope: 'batch' }, 'en')).toEqual({
      title: 'Only 3 packs left in this batch',
      next: 'Lower the quantity, or choose another batch.',
    });
  });

  it('says stock, not batch, when the whole product is short', () => {
    expect(errorText('INSUFFICIENT_STOCK', { available: 3000, requested: 5000, packSize: 1000, scope: 'product' }, 'en').title).toBe('Only 3 packs left in stock');
    expect(errorText('INSUFFICIENT_STOCK', { available: 1000, requested: 5000, packSize: 1000, scope: 'product' }, 'en').title).toBe('Only 1 pack left in stock');
    expect(errorText('INSUFFICIENT_STOCK', { available: 2250, requested: 5000, packSize: 1000, scope: 'product' }, 'en').title).toBe('Only 2 packs and 250 loose left in stock');
  });

  it('says it in Urdu, with the number kept left to right', () => {
    const text = errorText('INSUFFICIENT_STOCK', { available: 3000, requested: 5000, packSize: 1000, scope: 'batch' }, 'ur');
    expect(text.title).toBe(`اس بیچ میں صرف ${ltr('3 پیک')} باقی ہے`);
    expect(text.title).toContain('\u2066');
    expect(text.title).toContain('\u2069');
  });

  it('puts amounts in the credit-limit message: the limit, what is owed and what the sale adds', () => {
    const text = errorText('CREDIT_LIMIT_EXCEEDED', { limit: 150_000, owed: 100_000, adds: 100_000 }, 'en');
    expect(text.title).toBe('This sale is over the credit limit of Rs 1,500');
    expect(text.next).toContain('owes Rs 1,000');
    expect(text.next).toContain('adds Rs 1,000');
  });

  it('every owner-only message names the owner, and every sign-in message says what to do', () => {
    expect(errorText('NOT_AUTHORIZED', {}, 'en').title).toMatch(/owner/i);
    expect(errorText('INVALID_CREDENTIALS', {}, 'en').next).toMatch(/recovery code/i);
    expect(errorText('INVALID_RECOVERY_CODE', {}, 'en').next).toMatch(/20/);
  });

  it('an ApiError is described by its code and params; anything else is "something went wrong"', () => {
    const error = new ApiError('RETURN_EXCEEDS_SOLD', 'x', { returnable: 8000, requested: 9000, packSize: 1000 });
    expect(describeError(error, 'en')).toMatchObject({ code: 'RETURN_EXCEEDS_SOLD', title: 'Only 8 packs can still be returned' });
    expect(describeError(new TypeError('boom at line 3'), 'en')).toMatchObject({ code: 'INTERNAL', title: 'Something went wrong' });
    expect(JSON.stringify(describeError(new Error('secret path C:\\x'), 'en'))).not.toContain('secret');
    expect(describeError('a string', 'ur').code).toBe('INTERNAL');
  });

  it('an unknown code falls back to "something went wrong" instead of crashing', () => {
    expect(errorText('NOT_A_REAL_CODE' as never, {}, 'en').title).toBe('Something went wrong');
  });

  it('ignores params of the wrong type', () => {
    expect(errorText('INSUFFICIENT_STOCK', { available: 'lots' as never, packSize: 1000 }, 'en').title).toBe('Only 0 loose left in stock');
  });
});

describe('formatting', () => {
  it('money is "Rs 1,250" in both languages; in Urdu it is kept left to right', () => {
    expect(formatMoney(125_000)).toBe('Rs 1,250');
    expect(formatMoney(125_050, 'en')).toBe('Rs 1,250.50');
    expect(formatMoney(125_000, 'ur')).toBe(ltr('Rs 1,250'));
  });

  it.each([
    [3000, 1000, 'en', '3 packs'],
    [1000, 1000, 'en', '1 pack'],
    [250, 1000, 'en', '250 loose'],
    [2250, 1000, 'en', '2 packs and 250 loose'],
    [7, 1, 'en', '7'],
  ] as const)('quantity %i with pack size %i in %s is "%s"', (qty, packSize, language, expected) => {
    expect(formatQty(qty, packSize, language)).toBe(expected);
  });

  it('quantity in Urdu uses Urdu words and stays left to right', () => {
    expect(formatQty(2250, 1000, 'ur')).toBe(ltr('2 پیک اور 250 کھلا'));
  });

  it('dates are "30 Nov 2026" or "30 نومبر 2026", with Latin digits', () => {
    expect(formatDate('2026-11-30')).toBe('30 Nov 2026');
    expect(formatDate('2026-11-30', 'ur')).toBe('30 نومبر 2026');
    expect(formatDate('2026-01-05T10:00:00Z')).toBe('5 Jan 2026');
    expect(formatDate('garbage')).toBe('garbage');
  });
});
