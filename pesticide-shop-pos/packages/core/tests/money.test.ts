import { describe, expect, it } from 'vitest';
import { DomainError, formatPaisa, mul, parseRupees, priceForQty, roundDiv, splitProportional, taxIncludedIn } from '../src/index.js';

describe('roundDiv', () => {
  it.each([
    [4, 2, 2],
    [5, 2, 3], // half rounds up
    [7, 3, 2],
    [1, 3, 0],
    [0, 7, 0],
    [-5, 2, -3], // half away from zero, like SQLite ROUND
    [-7, 3, -2],
  ])('roundDiv(%i, %i) = %i', (n, d, expected) => {
    expect(roundDiv(n, d)).toBe(expected);
  });

  it('is exact for large numbers where floating division is not', () => {
    // 2^53 - 3 is odd, so dividing by 2 leaves a half that must round up.
    expect(roundDiv(Number.MAX_SAFE_INTEGER - 2, 2)).toBe((Number.MAX_SAFE_INTEGER - 1) / 2);
  });

  it('rejects floats, unsafe integers and bad divisors', () => {
    expect(() => roundDiv(1.5, 2)).toThrow(DomainError);
    expect(() => roundDiv(1, 0)).toThrow(DomainError);
    expect(() => roundDiv(1, -2)).toThrow(DomainError);
    expect(() => roundDiv(2 ** 60, 2)).toThrow(DomainError);
  });
});

describe('mul', () => {
  it('refuses to lose precision', () => {
    expect(mul(1_000_000, 50_000)).toBe(50_000_000_000);
    expect(() => mul(2 ** 40, 2 ** 20)).toThrow(DomainError);
  });
});

describe('priceForQty (price is per pack, rounded once)', () => {
  it('whole packs', () => expect(priceForQty(10_000, 50_000, 1000)).toBe(500_000));
  it('loose: 250 g of a 1 kg pack at Rs 200', () => expect(priceForQty(250, 20_000, 1000)).toBe(5000));
  it('rounds down below half a paisa', () => expect(priceForQty(250, 50_001, 1000)).toBe(12_500)); // 12500.25
  it('rounds up from half a paisa', () => expect(priceForQty(250, 50_003, 1000)).toBe(12_501)); // 12500.75
  it('can be zero for a tiny quantity', () => expect(priceForQty(1, 5, 1000)).toBe(0));
});

describe('taxIncludedIn (tax taken out of a tax-inclusive amount, basis points)', () => {
  it('Rs 1,180 at 18 percent holds Rs 180 of tax', () => expect(taxIncludedIn(118_000, 1800)).toBe(18_000));
  it('zero rate is zero tax', () => expect(taxIncludedIn(123_456, 0)).toBe(0));
  it('is not 18 percent of the amount: that would be tax added on top', () => {
    expect(taxIncludedIn(100_000, 1800)).toBe(15_254); // 100000 * 1800 / 11800 = 15254.2, not 18000
  });
  it('rounds to the nearest paisa, halves up', () => {
    expect(taxIncludedIn(3000, 1800)).toBe(458); // 457.6 rounds up
    expect(taxIncludedIn(5, 1800)).toBe(1); // 0.76 rounds up
    expect(taxIncludedIn(1, 5000)).toBe(0); // 0.33 rounds down
    expect(taxIncludedIn(1, 4999)).toBe(0);
    expect(taxIncludedIn(1, 10_000)).toBe(1); // exactly 0.5 rounds up
    expect(taxIncludedIn(3, 5000)).toBe(1); // exactly 1
  });
});

describe('splitProportional', () => {
  it('shares always add up to the total', () => {
    expect(splitProportional(100, [1, 1, 1])).toEqual([33, 34, 33]);
    expect(splitProportional(1, [100, 100])).toEqual([1, 0]);
    expect(splitProportional(10_000, [150_000, 50_000])).toEqual([7500, 2500]);
  });

  it('a zero total gives zeros, and a non-zero total over zero weight is an error', () => {
    expect(splitProportional(0, [0, 0])).toEqual([0, 0]);
    expect(() => splitProportional(5, [0, 0])).toThrow(DomainError);
  });
});

describe('formatPaisa', () => {
  it.each([
    [125_000, 'Rs 1,250'],
    [125_050, 'Rs 1,250.50'],
    [5, 'Rs 0.05'],
    [0, 'Rs 0'],
    [100_000_000, 'Rs 1,000,000'],
    [-5000, '-Rs 50'],
  ])('%i -> %s', (paisa, text) => {
    expect(formatPaisa(paisa)).toBe(text);
  });

  it('refuses a float', () => {
    expect(() => formatPaisa(10.5)).toThrow(DomainError);
  });
});

describe('parseRupees', () => {
  it.each([
    ['1250', 125_000],
    ['1,250.5', 125_050],
    [' 0.05 ', 5],
    ['0', 0],
  ])('%s -> %i paisa', (text, paisa) => {
    expect(parseRupees(text)).toBe(paisa);
  });

  it.each(['', 'abc', '1.234', '-5', '1..5', 'Rs 5'])('rejects "%s"', (text) => {
    expect(() => parseRupees(text)).toThrow(DomainError);
  });

  it('round-trips with formatPaisa', () => {
    expect(parseRupees('1,250.50')).toBe(125_050);
    expect(formatPaisa(parseRupees('1,250.50'))).toBe('Rs 1,250.50');
  });
});
