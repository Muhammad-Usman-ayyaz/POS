import { describe, expect, it } from 'vitest';
import {
  ENGLISH_UNIT_WORDS,
  MAX_BASE_QTY,
  baseUnitOf,
  baseUnitsPerDisplayUnit,
  displayUnitFromText,
  displayUnitOf,
  formatNumber,
  legacyLabelToDisplay,
  looseStep,
  maxDecimals,
  packLabel,
  parseQuantity,
  priceForQty,
  pricePerUnit,
  pricePerUnitLabel,
  quantityFromText,
  quantityLabel,
  quantityParts,
  splitPacks,
  storedPackLabel,
  unitWord,
  type BaseUnitCode,
} from '../src/index.js';

const err = (base: BaseUnitCode, text: string) => {
  const r = parseQuantity(base, text);
  return r.ok ? 'ok' : r.error.code;
};

describe('units: which unit', () => {
  it('maps each base unit to its standard unit and back', () => {
    expect(displayUnitOf('g')).toBe('kg');
    expect(displayUnitOf('ml')).toBe('L');
    expect(displayUnitOf('piece')).toBe('piece');
    expect(baseUnitOf('kg')).toBe('g');
    expect(baseUnitOf('L')).toBe('ml');
    expect(baseUnitOf('piece')).toBe('piece');
  });
  it('knows how many decimals each unit allows', () => {
    expect(maxDecimals('g')).toBe(3);
    expect(maxDecimals('ml')).toBe(3);
    expect(maxDecimals('piece')).toBe(0);
    expect(baseUnitsPerDisplayUnit('g')).toBe(1000);
    expect(baseUnitsPerDisplayUnit('piece')).toBe(1);
  });
});

describe('units: base to text', () => {
  it('shows the display rule examples', () => {
    expect(formatNumber('g', 250)).toBe('0.25');
    expect(formatNumber('ml', 500)).toBe('0.5');
    expect(formatNumber('g', 1500)).toBe('1.5');
    expect(formatNumber('g', 1)).toBe('0.001');
    expect(formatNumber('g', 1_000_000)).toBe('1000');
    expect(formatNumber('piece', 7)).toBe('7');
    expect(quantityLabel('g', 250)).toBe('0.25 kg');
    expect(quantityLabel('ml', 500)).toBe('0.5 L');
    expect(quantityLabel('g', 1500)).toBe('1.5 kg');
    expect(quantityLabel('g', 1)).toBe('0.001 kg');
    expect(quantityLabel('g', 1_000_000)).toBe('1000 kg');
    expect(quantityLabel('ml', 3000)).toBe('3 L');
  });
  it('drops trailing zeros but never inner ones', () => {
    expect(formatNumber('g', 1200)).toBe('1.2');
    expect(formatNumber('g', 1020)).toBe('1.02');
    expect(formatNumber('g', 1002)).toBe('1.002');
    expect(formatNumber('g', 2000)).toBe('2');
    expect(formatNumber('g', 100)).toBe('0.1');
  });
  it('says piece and pieces', () => {
    expect(quantityLabel('piece', 1)).toBe('1 piece');
    expect(quantityLabel('piece', 2)).toBe('2 pieces');
    expect(quantityLabel('piece', 0)).toBe('0 pieces');
    expect(unitWord('piece', 1)).toBe('piece');
    expect(unitWord('piece', 5)).toBe('pieces');
    expect(unitWord('kg', 1)).toBe('kg');
    const urdu = { kg: 'کلو', L: 'لیٹر', piece: { one: 'عدد', other: 'عدد' } };
    expect(quantityLabel('g', 1500, urdu)).toBe('1.5 کلو');
    expect(quantityLabel('ml', 3000, urdu)).toBe('3 لیٹر');
    expect(quantityLabel('piece', 2, urdu)).toBe('2 عدد');
    expect(quantityParts('g', 250, urdu)).toEqual({ value: '0.25', unit: 'کلو' });
  });
  it('keeps the sign of a negative amount (a stock movement)', () => {
    expect(formatNumber('g', -250)).toBe('-0.25');
    expect(formatNumber('ml', -1000)).toBe('-1');
  });
  it('refuses a number that is not a whole count of base units', () => {
    expect(() => formatNumber('g', 1.5)).toThrow();
    expect(() => formatNumber('g', Number.NaN)).toThrow();
  });
  it('derives the pack label from the pack size and the base unit', () => {
    expect(packLabel('ml', 500)).toBe('0.5 L');
    expect(packLabel('ml', 1000)).toBe('1 L');
    expect(packLabel('ml', 250)).toBe('0.25 L');
    expect(packLabel('g', 250)).toBe('0.25 kg');
    expect(packLabel('g', 50_000)).toBe('50 kg');
    expect(packLabel('piece', 10)).toBe('10 pieces');
    expect(packLabel('piece', 1)).toBe('');
    expect(storedPackLabel('ml', 500)).toBe('0.5 L');
  });
  it('splits a quantity into packs and what is left', () => {
    expect(splitPacks(2500, 1000)).toEqual({ packs: 2, rest: 500 });
    expect(splitPacks(3, 1)).toEqual({ packs: 3, rest: 0 });
  });
});

describe('units: exhaustive round trip', () => {
  it.each(['g', 'ml'] as const)('every value from 1 to 1,000,000 %s survives format then parse', (base) => {
    for (let n = 1; n <= 1_000_000; n++) {
      const text = formatNumber(base, n);
      const back = parseQuantity(base, text);
      if (!back.ok || back.value !== n) throw new Error(`${base} ${n} -> "${text}" -> ${JSON.stringify(back)}`);
    }
  });
  it('every piece count from 1 to 200,000 survives format then parse', () => {
    for (let n = 1; n <= 200_000; n++) {
      const back = parseQuantity('piece', formatNumber('piece', n));
      if (!back.ok || back.value !== n) throw new Error(`piece ${n}`);
    }
  });
  it('the text of every value has no trailing zero, no exponent and at most three decimals', () => {
    for (let n = 1; n <= 1_000_000; n += 7) {
      const text = formatNumber('g', n);
      if (!/^\d+(\.\d{0,2}[1-9])?$/.test(text)) throw new Error(`bad text "${text}" for ${n}`);
    }
  });
  it('property: parse(format(x)) === x for random values up to the limit, in every unit', () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < 20_000; i++) {
      const n = 1 + (next() % MAX_BASE_QTY);
      for (const base of ['g', 'ml', 'piece'] as const) {
        const r = parseQuantity(base, formatNumber(base, n));
        expect(r.ok && r.value).toBe(n);
      }
    }
  });
  it('property: format(parse(text)) is the canonical text for every typed value with up to three decimals', () => {
    for (let thousandths = 1; thousandths <= 5000; thousandths++) {
      const typed = (thousandths / 1000).toFixed(3);
      const r = parseQuantity('g', typed);
      expect(r.ok && r.value).toBe(thousandths);
      expect(formatNumber('g', thousandths)).toBe(String(Number(typed)));
    }
  });
});

describe('units: strict parse', () => {
  it('accepts plain decimals in kg and L', () => {
    expect(quantityFromText('g', '2.5')).toBe(2500);
    expect(quantityFromText('g', '2')).toBe(2000);
    expect(quantityFromText('g', '0.25')).toBe(250);
    expect(quantityFromText('ml', '0.5')).toBe(500);
    expect(quantityFromText('ml', '1.001')).toBe(1001);
    expect(quantityFromText('g', '0.001')).toBe(1);
    expect(quantityFromText('piece', '12')).toBe(12);
  });
  it('accepts a leading dot (documented: ".5" can only mean 0.5) and spaces around the text', () => {
    expect(quantityFromText('g', '.5')).toBe(500);
    expect(quantityFromText('g', '  2.5  ')).toBe(2500);
    expect(quantityFromText('g', '007')).toBe(7000);
  });
  it('refuses empty and whitespace-only text', () => {
    expect(err('g', '')).toBe('EMPTY');
    expect(err('g', '   ')).toBe('EMPTY');
  });
  it('refuses junk', () => {
    for (const bad of ['2..5', '2,5', '1,000', 'abc', '2 kg', 'kg', '1e3', '1E3', '0x10', '+2', '2.', '.', '5.5.5', '1 000', '٣', '2٫5', '2/3', '--2']) {
      expect(err('g', bad), bad).toBe('NOT_A_NUMBER');
    }
    expect(err('g', 'x2')).toBe('NOT_A_NUMBER');
    expect(err('g', '2x')).toBe('NOT_A_NUMBER');
  });
  it('refuses negative amounts', () => {
    expect(err('g', '-2')).toBe('NEGATIVE');
    expect(err('g', '-0.5')).toBe('NEGATIVE');
    expect(err('piece', '-1')).toBe('NEGATIVE');
  });
  it('refuses zero unless asked', () => {
    expect(err('g', '0')).toBe('ZERO');
    expect(err('g', '0.0')).toBe('ZERO');
    expect(err('g', '0.000')).toBe('ZERO');
    expect(err('piece', '0')).toBe('ZERO');
    expect(parseQuantity('g', '0', { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
  it('refuses more decimals than the unit allows instead of rounding', () => {
    expect(parseQuantity('g', '0.2501')).toEqual({ ok: false, error: { code: 'TOO_MANY_DECIMALS', maxDecimals: 3 } });
    expect(err('ml', '1.0001')).toBe('TOO_MANY_DECIMALS');
    expect(err('g', '0.5000')).toBe('TOO_MANY_DECIMALS');
    expect(parseQuantity('piece', '2.5')).toEqual({ ok: false, error: { code: 'TOO_MANY_DECIMALS', maxDecimals: 0 } });
    expect(err('piece', '2.0')).toBe('TOO_MANY_DECIMALS');
  });
  it('refuses an amount over the limit', () => {
    expect(err('g', '100001')).toBe('TOO_LARGE');
    expect(quantityFromText('g', '100000')).toBe(MAX_BASE_QTY);
    expect(err('g', '99999999999999999999')).toBe('TOO_LARGE');
    expect(err('piece', '100000001')).toBe('TOO_LARGE');
  });
  it('returns null from quantityFromText for any refusal', () => {
    expect(quantityFromText('g', '2..5')).toBeNull();
    expect(quantityFromText('piece', '1.5')).toBeNull();
  });
});

describe('units: steppers and unit names', () => {
  it('steps a loose quantity by 0.5 kg, 0.1 L or 1 piece', () => {
    expect(looseStep('g')).toBe(500);
    expect(looseStep('ml')).toBe(100);
    expect(looseStep('piece')).toBe(1);
  });
  it('reads unit names for an import', () => {
    expect(displayUnitFromText('KG')).toBe('kg');
    expect(displayUnitFromText(' litre ')).toBe('L');
    expect(displayUnitFromText('L')).toBe('L');
    expect(displayUnitFromText('pcs')).toBe('piece');
    expect(displayUnitFromText('g')).toBeNull();
    expect(displayUnitFromText('ml')).toBeNull();
    expect(displayUnitFromText('')).toBeNull();
  });
  it('has English words that never name a base unit', () => {
    expect(JSON.stringify(ENGLISH_UNIT_WORDS)).not.toMatch(/\bg\b|\bml\b|gram/i);
  });
});

describe('units: price per unit (integers only)', () => {
  it('prices a kg and a L from the pack price', () => {
    expect(pricePerUnit('ml', 500, 22_500)).toEqual({ paisa: 45_000, unit: 'L' });
    expect(pricePerUnit('g', 250, 11_250)).toEqual({ paisa: 45_000, unit: 'kg' });
    expect(pricePerUnit('g', 1000, 45_000)).toEqual({ paisa: 45_000, unit: 'kg' });
    expect(pricePerUnit('piece', 1, 12_000)).toEqual({ paisa: 12_000, unit: 'piece' });
    expect(pricePerUnit('piece', 10, 12_000)).toEqual({ paisa: 1_200, unit: 'piece' });
  });
  it('rounds once, halves up, in integers', () => {
    expect(pricePerUnit('g', 3000, 1_001).paisa).toBe(334); // 1001/3 = 333.67
    expect(pricePerUnit('g', 2000, 1).paisa).toBe(1); // 0.5 rounds up
    expect(pricePerUnit('g', 3, 1).paisa).toBe(333); // 1000/3 = 333.33
    expect(pricePerUnit('ml', 7, 5).paisa).toBe(714); // 5000/7 = 714.28
  });
  it('is exact where a float would not be', () => {
    // 0.1 + 0.2 style trouble: a float division would give 14.499999 here and round the other way.
    expect(pricePerUnit('g', 8000, 116).paisa).toBe(15); // 116/8 = 14.5 -> 15
  });
  it('writes the label', () => {
    expect(pricePerUnitLabel('g', 1000, 45_000)).toBe('Rs 450 / kg');
    expect(pricePerUnitLabel('ml', 500, 22_500)).toBe('Rs 450 / L');
    expect(pricePerUnitLabel('piece', 1, 12_000)).toBe('Rs 120 / piece');
    expect(pricePerUnitLabel('g', 1000, 45_050)).toBe('Rs 450.50 / kg');
  });
  it('refuses a bad pack size', () => {
    expect(() => pricePerUnit('g', 0, 100)).toThrow();
    expect(() => pricePerUnit('g', 1.5, 100)).toThrow();
  });
});

describe('units: the line total does not change (old rule vs new)', () => {
  // The sale has always priced a loose line as roundDiv(qty * price, packSize). Moving to kg/L display must not change one paisa:
  // the screen sends the same integer base quantity. `old` is that rule written out with BigInt, independent of the helper.
  const old = (qty: number, price: number, pack: number): number => {
    const num = BigInt(qty) * BigInt(price);
    const d = BigInt(pack);
    return Number((num * 2n + d) / (d * 2n));
  };
  it.each([
    [250, 1000, 45_000],
    [1500, 1000, 45_000],
    [750, 1000, 32_050],
    [250, 500, 22_500],
    [1, 1000, 45_099],
    [999, 1000, 12_345],
    [100, 250, 9_999],
    [2500, 5000, 777_777],
    [333, 750, 10_001],
  ])('qty %i of a %i pack at %i paisa', (qty, pack, price) => {
    expect(priceForQty(qty, price, pack)).toBe(old(qty, price, pack));
    // and the quantity the screen would type for it gives the same integer back
    const base = pack >= 1000 ? 'g' : 'ml';
    expect(quantityFromText(base, formatNumber(base, qty))).toBe(qty);
  });
  it('holds for a grid of quantities and prices', () => {
    for (const qty of [1, 50, 100, 250, 500, 750, 1000, 1500, 2500, 12_345]) {
      for (const price of [1, 99, 12_345, 45_000, 100_000, 999_999]) {
        for (const pack of [250, 500, 1000, 5000]) expect(priceForQty(qty, price, pack)).toBe(old(qty, price, pack));
      }
    }
  });
});

describe('units: old text (legacyLabelToDisplay)', () => {
  it.each([
    ['500 ml', '0.5 L'],
    ['250 g', '0.25 kg'],
    ['1500 g', '1.5 kg'],
    ['1000 ml', '1 L'],
    ['1 g', '0.001 kg'],
    ['750ml', '0.75 L'],
    ['Insecticide X 500 ml', 'Insecticide X 0.5 L'],
    ['Fungicide 250 ml (box of 12)', 'Fungicide 0.25 L (box of 12)'],
    ['DAP 50 kg', 'DAP 50 kg'],
    ['Insecticide 1 L', 'Insecticide 1 L'],
    ['250 gm', '0.25 kg'],
    ['100 grams', '0.1 kg'],
    ['2.5 ml', '0.0025 L'],
    ['12.5 g', '0.0125 kg'],
    ['5000 ml and 250 g', '5 L and 0.25 kg'],
    ['500 ملی لیٹر', '0.5 لیٹر'],
    ['250 گرام', '0.25 کلو'],
    ['کیڑے مار دوا 1 لیٹر', 'کیڑے مار دوا 1 لیٹر'],
    ['Gold 500mL', 'Gold 0.5 L'],
  ])('%s -> %s', (from, to) => {
    expect(legacyLabelToDisplay(from)).toBe(to);
  });
  it('leaves words that merely contain the letters alone', () => {
    expect(legacyLabelToDisplay('Tag 5 gold')).toBe('Tag 5 gold');
    expect(legacyLabelToDisplay('Model A5g')).toBe('Model A5g');
    expect(legacyLabelToDisplay('Grams of care')).toBe('Grams of care');
    expect(legacyLabelToDisplay('')).toBe('');
  });
  it('uses the words of the language it is given', () => {
    expect(legacyLabelToDisplay('Insecticide 500 ml', { kg: 'کلو', L: 'لیٹر' })).toBe('Insecticide 0.5 لیٹر');
    expect(legacyLabelToDisplay('Seed 250 g', { kg: 'کلو', L: 'لیٹر' })).toBe('Seed 0.25 کلو');
  });
  it('agrees with formatNumber for every whole amount of ml and g up to 20,000', () => {
    for (let n = 1; n <= 20_000; n++) {
      expect(legacyLabelToDisplay(`${n} ml`)).toBe(quantityLabel('ml', n));
      expect(legacyLabelToDisplay(`${n} g`)).toBe(quantityLabel('g', n));
    }
  });
});
