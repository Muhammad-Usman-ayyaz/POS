// How the screens use the units module: cart text, loose receiving, legacy names and the quote request staying in integers.
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/i18n/index.js';
import { legacyText, perUnitPriceText, packText, quantityProblem, readQuantity } from '../src/i18n/units.js';
import { packSummary, qtyParts } from '../src/pages/pos/cart-table.js';
import { addSize, quoteRequest, saleLines, stepQty, type BillDraft, type CartLine, type SizePick } from '../src/pages/pos/pos-state.js';
import { buildReceiveRequest, checkLine, lineQty, lineTotal, totalsOf, type LineDraft } from '../src/pages/purchases/receive-state.js';

const en = MESSAGES.en;
const ur = MESSAGES.ur;
const half: SizePick = { productId: 'p-half', nameEn: 'Oil', nameUr: null, packSize: 500, allowLoose: false, baseUnit: 'ml' };
const fert: SizePick = { productId: 'p-fert', nameEn: 'Fert', nameUr: null, packSize: 1000, allowLoose: true, baseUnit: 'g' };
const bill: BillDraft = { customerId: null, priceType: 'retail', method: 'cash', reference: '', dueDate: '' };
const line = (pick: SizePick, qty: number): CartLine => ({ ...pick, key: 'k', qty, discount: 0, batchId: null, seenPrice: null });

describe('the cart says the unit', () => {
  it('a sealed line is packs, with "2 × 0.5 L" beside it', () => {
    expect(qtyParts(line(half, 1000), en)).toEqual({ value: '2', unit: 'packs' });
    expect(qtyParts(line(half, 500), en)).toEqual({ value: '1', unit: 'pack' });
    expect(packSummary(line(half, 1000), en, 'en')).toBe('2 × 0.5 L');
    expect(packSummary(line(half, 1000), ur, 'ur')).toContain('0.5');
    expect(packSummary(line(half, 1000), ur, 'ur')).toContain('لیٹر');
  });
  it('a loose line is the quantity in kg / L', () => {
    expect(qtyParts(line(fert, 1500), en)).toEqual({ value: '1.5', unit: 'kg' });
    expect(qtyParts(line(fert, 250), ur)).toEqual({ value: '0.25', unit: 'کلو' });
    expect(packSummary(line(fert, 1500), en, 'en')).toBe('');
  });
  it('the price is shown per unit', () => {
    expect(perUnitPriceText(en, 'en', 'g', 1000, 45_000)).toBe('Rs 450 / kg');
    expect(perUnitPriceText(en, 'en', 'ml', 500, 22_500)).toBe('Rs 450 / L');
  });
  it('the pack size is derived, never read from a stored label', () => {
    expect(packText(en, 'en', 'ml', 500)).toBe('0.5 L');
    expect(packText(en, 'en', 'piece', 1)).toBe('');
    expect(packText(ur, 'ur', 'g', 250)).toContain('کلو');
  });
});

describe('the requests keep sending whole base-unit integers', () => {
  it('quote lines carry the base quantity, not a display number', () => {
    const [l] = addSize([], fert);
    const stepped = stepQty([l!], l!.key, 1); // 1 kg + 0.5 kg
    expect(saleLines(stepped)[0]!.qty).toBe(1500);
    expect(Number.isInteger(saleLines(stepped)[0]!.qty)).toBe(true);
    expect(quoteRequest(stepped, bill, null).lines[0]!.qty).toBe(1500);
  });
});

describe('typed quantities are read strictly and the screen gets a sentence', () => {
  it('reads 2.5 kg and refuses the rest with the message in the language', () => {
    expect(readQuantity(en, 'g', '2.5')).toEqual({ ok: true, value: 2500 });
    expect(readQuantity(en, 'g', '2..5')).toEqual({ ok: false, message: en.units.problem.NOT_A_NUMBER });
    expect(readQuantity(en, 'piece', '1.5')).toEqual({ ok: false, message: en.units.problem.TOO_MANY_DECIMALS(0) });
    expect(quantityProblem(ur, { code: 'ZERO' })).toBe(ur.units.problem.ZERO);
  });
});

describe('old text is shown in kg and L', () => {
  it('converts a sale-time name in the words of the language on screen', () => {
    expect(legacyText(en, 'Insecticide 500 ml')).toBe('Insecticide 0.5 L');
    expect(legacyText(ur, 'کھاد 250 g')).toBe('کھاد 0.25 کلو');
  });
});

const recv = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l', productId: 'p', nameEn: 'Fert', nameUr: null, packSize: 1000, baseUnit: 'g', allowLoose: true, by: 'packs', batchNo: 'B-1', expiry: '2027-03-12', packs: '2', cost: '150', ...over,
});
describe('receiving a loose size by amount', () => {
  it('packs become base units; an amount typed in kg becomes grams', () => {
    expect(lineQty(recv())).toBe(2000);
    expect(lineQty(recv({ by: 'amount', packs: '25.5' }))).toBe(25_500);
    expect(lineQty(recv({ by: 'amount', packs: '25.5555' }))).toBeNull();
    expect(lineQty(recv({ by: 'packs', packs: '1.5' }))).toBeNull();
  });
  it('the line total uses the shared integer rounding on the cost per pack', () => {
    expect(lineTotal(recv({ by: 'amount', packs: '25.5' }))).toBe(Math.round(25_500 * 15_000 / 1000));
    expect(totalsOf([recv(), recv({ by: 'amount', packs: '0.5' })]).cost).toBe(30_000 + 7_500);
    expect(checkLine(recv({ by: 'amount', packs: '0' })).packs).toBe('amountInvalid');
  });
  it('the request carries base integers', () => {
    const request = buildReceiveRequest({ supplierId: 's', invoiceNo: '', date: '2026-10-12' }, [recv({ by: 'amount', packs: '25.5' })], false);
    expect(request.items[0]!.qty).toBe(25_500);
  });
});
