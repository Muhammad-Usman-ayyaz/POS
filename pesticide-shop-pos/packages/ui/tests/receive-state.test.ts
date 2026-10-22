// The rules behind Receive stock: parsing, clashes with existing batches and between lines, the next free batch number, totals,
// and the exact request that is sent (packs become base units).
import { describe, expect, it } from 'vitest';
import {
  blockerOf,
  buildReceiveRequest,
  checkHeader,
  checkLine,
  findClashes,
  isIsoDate,
  lineTotal,
  nextFreeBatchNo,
  parsePacks,
  takenBatchNumbers,
  todayText,
  totalsOf,
  type ExistingBatch,
  type LineDraft,
} from '../src/pages/purchases/receive-state.js';

const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1',
  productId: 'p1',
  nameEn: 'Insecticide',
  nameUr: null,
  packSize: 1000,
  baseUnit: 'ml',
  allowLoose: false,
  by: 'packs',
  batchNo: 'B-014',
  expiry: '2027-03-12',
  packs: '12',
  cost: '400',
  ...over,
});
const existing = (rows: Partial<ExistingBatch>[] = [{}]): Record<string, ExistingBatch[]> => ({
  p1: rows.map((r) => ({ batch_no: 'B-014', expiry_date: '2027-03-12', cost_price: 40_000, ...r })),
});

describe('dates, packs and today', () => {
  it('a real calendar date only', () => {
    expect(isIsoDate('2027-03-12')).toBe(true);
    for (const bad of ['', '2027-3-12', '2027-02-30', '2027-13-01', '12/03/2027', 'abc', '2027-00-10']) expect(isIsoDate(bad), bad).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true); // a leap year
    expect(isIsoDate('2027-02-29')).toBe(false);
  });
  it('packs are whole numbers above 0', () => {
    expect(parsePacks('12')).toBe(12);
    for (const bad of ['0', '', '-3', '2.5', 'x', '12 ']) expect(parsePacks(bad), bad === '12 ' ? 'trailing space is trimmed' : bad).toBe(bad === '12 ' ? 12 : null);
  });
  it('today is the UTC date, as the shell counts it', () => {
    expect(todayText(new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-09');
    expect(todayText(new Date('2026-10-10T00:10:00Z'))).toBe('2026-10-10');
  });
});

describe('checking a line', () => {
  it('a filled line has no problems', () => {
    expect(checkLine(line())).toEqual({});
  });
  it('names the field that is wrong', () => {
    expect(checkLine(line({ batchNo: ' ' }))).toEqual({ batchNo: 'batchRequired' });
    expect(checkLine(line({ expiry: '' }))).toEqual({ expiry: 'expiryInvalid' });
    expect(checkLine(line({ packs: '0' }))).toEqual({ packs: 'packsInvalid' });
    expect(checkLine(line({ cost: 'abc' }))).toEqual({ cost: 'costInvalid' });
  });
});

describe('the header', () => {
  const today = '2026-10-09';
  it('needs a supplier and a real date that is not in the future', () => {
    expect(checkHeader({ supplierId: 's1', invoiceNo: '', date: today }, today)).toBeNull();
    expect(checkHeader({ supplierId: 's1', invoiceNo: '', date: '2026-10-01' }, today)).toBeNull(); // a past date is fine
    expect(checkHeader({ supplierId: '', invoiceNo: '', date: today }, today)).toBe('supplier');
    expect(checkHeader({ supplierId: 's1', invoiceNo: '', date: '' }, today)).toBe('dateInvalid');
    expect(checkHeader({ supplierId: 's1', invoiceNo: '', date: '2026-10-10' }, today)).toBe('dateFuture');
  });
});

describe('batch clashes with batches that already exist', () => {
  it('a new batch number clashes with nothing', () => {
    expect(findClashes([line({ batchNo: 'B-099' })], existing())).toEqual({ l1: null });
  });
  it('the same number, expiry and cost: no clash (the stock is added to that batch)', () => {
    expect(findClashes([line()], existing())).toEqual({ l1: null });
  });
  it('a DIFFERENT EXPIRY with the same cost is an expiry clash, naming both dates', () => {
    expect(findClashes([line({ expiry: '2027-06-30' })], existing())).toEqual({
      l1: { kind: 'expiry', batchNo: 'B-014', existingExpiry: '2027-03-12', typedExpiry: '2027-06-30' },
    });
  });
  it('a DIFFERENT COST is a cost clash, even when the expiry also differs (cost first, as the shell does)', () => {
    const expected = { l1: { kind: 'cost', batchNo: 'B-014', existingCost: 40_000, typedCost: 43_000 } };
    expect(findClashes([line({ cost: '430' })], existing())).toEqual(expected);
    expect(findClashes([line({ cost: '430', expiry: '2027-06-30' })], existing())).toEqual(expected);
  });
  it('cost is compared in paisa: 400 and 400.00 are the same, 400.01 is not', () => {
    expect(findClashes([line({ cost: '400.00' })], existing())).toEqual({ l1: null });
    expect(findClashes([line({ cost: '400.01' })], existing())).toMatchObject({ l1: { kind: 'cost' } });
  });
  it('is judged per size: the same number on another size is not a clash', () => {
    expect(findClashes([line({ productId: 'p2', expiry: '2027-06-30' })], existing())).toEqual({ l1: null });
  });
  it('an empty batch number, or values not typed yet, are not judged', () => {
    expect(findClashes([line({ batchNo: '' })], existing())).toEqual({ l1: null });
    expect(findClashes([line({ expiry: '', cost: '400' })], existing())).toEqual({ l1: null });
    expect(findClashes([line({ cost: '' })], existing())).toEqual({ l1: null });
  });
  it('an empty (zero-stock) batch still clashes: only the batch row matters', () => {
    expect(findClashes([line({ expiry: '2027-06-30' })], existing([{ cost_price: 40_000 }]))).toMatchObject({ l1: { kind: 'expiry' } });
  });
});

describe('the same batch number twice on one receipt', () => {
  it('flags the SECOND line as a duplicate, not the first', () => {
    expect(findClashes([line({ batchNo: 'B-099' }), line({ key: 'l2', batchNo: 'B-099' })], {})).toEqual({ l1: null, l2: { kind: 'duplicate', batchNo: 'B-099' } });
  });
  it('it is the same SIZE and number that count: another size may reuse the number', () => {
    expect(findClashes([line({ batchNo: 'B-099' }), line({ key: 'l2', productId: 'p2', batchNo: 'B-099' })], {})).toEqual({ l1: null, l2: null });
  });
  it('spaces around the number do not hide a duplicate', () => {
    expect(findClashes([line({ batchNo: 'B-099' }), line({ key: 'l2', batchNo: ' B-099 ' })], {}).l2).toMatchObject({ kind: 'duplicate' });
  });
});

describe('the next free batch number', () => {
  const none = new Set<string>();
  it('adds one to the number at the end and keeps its width', () => {
    expect(nextFreeBatchNo('B-014', none)).toBe('B-015');
    expect(nextFreeBatchNo('B-009', none)).toBe('B-010');
    expect(nextFreeBatchNo('LOT7', none)).toBe('LOT8');
    expect(nextFreeBatchNo('B-099', none)).toBe('B-100');
    expect(nextFreeBatchNo('001', none)).toBe('002');
  });
  it('skips numbers that are taken', () => {
    expect(nextFreeBatchNo('B-014', new Set(['B-015', 'B-016']))).toBe('B-017');
  });
  it('a number with no digits at the end gets -2, then -3', () => {
    expect(nextFreeBatchNo('NEW', none)).toBe('NEW-2');
    expect(nextFreeBatchNo('NEW', new Set(['NEW-2']))).toBe('NEW-3');
    expect(nextFreeBatchNo('A1B', none)).toBe('A1B-2');
  });
  it('never returns the number it started from', () => {
    expect(nextFreeBatchNo('B-014', new Set(['B-014']))).not.toBe('B-014');
  });
  it('takes the size\'s existing numbers and the other lines\' numbers into account', () => {
    const a = line({ key: 'a', batchNo: 'B-014' });
    const b = line({ key: 'b', batchNo: 'B-015' });
    const taken = takenBatchNumbers(a, [a, b], existing([{ batch_no: 'B-014' }, { batch_no: 'B-016' }]));
    expect([...taken].sort()).toEqual(['B-014', 'B-015', 'B-016']);
    expect(nextFreeBatchNo('B-014', taken)).toBe('B-017');
  });
});

describe('totals', () => {
  it('a line is whole packs times the cost per pack, in paisa', () => {
    expect(lineTotal(line())).toBe(480_000); // 12 x Rs 400
    expect(lineTotal(line({ packs: '20', cost: '215' }))).toBe(430_000);
    expect(lineTotal(line({ cost: '19.99', packs: '3' }))).toBe(5_997);
    expect(lineTotal(line({ packs: '' }))).toBe(0);
  });
  it('the receipt counts lines, packs and the total cost', () => {
    expect(totalsOf([line(), line({ key: 'l2', packs: '20', cost: '215' })])).toEqual({ lines: 2, packs: 32, cost: 910_000 });
    expect(totalsOf([])).toEqual({ lines: 0, packs: 0, cost: 0 });
  });
});

describe('the request', () => {
  const header = { supplierId: 's1', invoiceNo: ' GV-20418 ', date: '2026-10-08' };
  it('turns packs into BASE UNITS: 12 packs of a 1000 ml bottle is 12000, and keeps the cost per pack in paisa', () => {
    expect(buildReceiveRequest(header, [line()], false)).toEqual({
      supplier_id: 's1',
      supplier_invoice_no: 'GV-20418',
      purchase_date: '2026-10-08',
      items: [{ product_id: 'p1', batch_no: 'B-014', expiry_date: '2027-03-12', qty: 12_000, cost_price: 40_000 }],
    });
  });
  it('uses each line\'s own pack size', () => {
    const request = buildReceiveRequest(header, [line({ packSize: 250, packs: '4' }), line({ key: 'l2', packSize: 50_000, packs: '2', batchNo: 'X' })], false);
    expect(request.items.map((i) => i.qty)).toEqual([1000, 100_000]);
  });
  it('leaves the invoice number out when it is empty, and says confirm_old_date only when it was confirmed', () => {
    const plain = buildReceiveRequest({ ...header, invoiceNo: '  ' }, [line()], false);
    expect(Object.keys(plain)).not.toContain('supplier_invoice_no');
    expect(Object.keys(plain)).not.toContain('confirm_old_date');
    expect(buildReceiveRequest(header, [line()], true).confirm_old_date).toBe(true);
  });
  it('never carries who is receiving, or a payment (the shell pays in full)', () => {
    expect(JSON.stringify(buildReceiveRequest(header, [line()], false))).not.toMatch(/created_by|actor|user|paid|payment|pay_in_full|cost_total/);
  });
});

describe('what stops the Receive button', () => {
  const ok = { header: null, clashes: { l1: null }, loadedProducts: new Set(['p1']) };
  it('nothing: it can be pressed', () => {
    expect(blockerOf({ lines: [line()], ...ok })).toBeNull();
  });
  it('no lines, a bad header, a line to fix, an open clash, batches still loading: in that order', () => {
    expect(blockerOf({ lines: [], ...ok })).toBe('noLines');
    expect(blockerOf({ lines: [line()], ...ok, header: 'supplier' })).toBe('header');
    expect(blockerOf({ lines: [line({ packs: '' })], ...ok })).toBe('fix');
    expect(blockerOf({ lines: [line()], ...ok, clashes: { l1: { kind: 'cost', batchNo: 'B', existingCost: 1, typedCost: 2 } } })).toBe('clash');
    expect(blockerOf({ lines: [line()], ...ok, loadedProducts: new Set() })).toBe('loading');
  });
  it('a duplicate counts as an open clash', () => {
    expect(blockerOf({ lines: [line()], ...ok, clashes: { l1: { kind: 'duplicate', batchNo: 'B' } } })).toBe('clash');
  });
});
