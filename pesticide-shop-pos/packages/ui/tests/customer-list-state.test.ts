import { describe, expect, it } from 'vitest';
import { buildListRequest } from '../src/pages/customers/list/customer-list-requests.js';
import { balanceView, creditChipKind, displayName, pageRange } from '../src/pages/customers/list/customer-list-state.js';

describe('customer list helpers', () => {
  it('a negative balance is an advance shown as a positive amount; zero is clear', () => {
    expect(balanceView(200_000)).toEqual({ kind: 'owes', amount: 200_000 });
    expect(balanceView(-100_000)).toEqual({ kind: 'advance', amount: 100_000 });
    expect(balanceView(0)).toEqual({ kind: 'clear', amount: 0 });
  });
  it('no limit wins over over limit, which wins over credit left', () => {
    expect(creditChipKind({ no_limit: true, over_limit: false })).toBe('no_limit');
    expect(creditChipKind({ no_limit: false, over_limit: true })).toBe('over_limit');
    expect(creditChipKind({ no_limit: false, over_limit: false })).toBe('left');
  });
  it('the name follows the language, falls back to the other, and is empty when neither exists', () => {
    expect(displayName({ name_en: 'Rashid', name_ur: 'راشد' }, 'ur')).toBe('راشد');
    expect(displayName({ name_en: 'Rashid', name_ur: null }, 'ur')).toBe('Rashid');
    expect(displayName({ name_en: null, name_ur: ' ' }, 'en')).toBe('');
  });
  it('the page range counts from 1', () => {
    expect(pageRange(0, 25, 60)).toEqual({ from: 1, to: 25, total: 60 });
    expect(pageRange(25, 25, 60)).toEqual({ from: 26, to: 50, total: 60 });
  });
  it('the request carries only what is set, trimmed', () => {
    expect(buildListRequest({ query: '  ', filter: 'all', sort: 'name', language: 'en', offset: 0 })).toEqual({ sort: 'name', name_language: 'en', limit: 25, offset: 0 });
    expect(buildListRequest({ query: ' ali ', filter: 'owes', sort: 'balance', language: 'ur', offset: 25 })).toEqual({ query: 'ali', filter: 'owes', sort: 'balance', name_language: 'ur', limit: 25, offset: 25 });
  });
});
