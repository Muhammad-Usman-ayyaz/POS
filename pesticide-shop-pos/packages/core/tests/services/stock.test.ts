import { beforeEach, describe, expect, it } from 'vitest';
import { codeOf, ID, makeWorld, services, uuid, type World } from '../support/fakes.js';

let w: World;
let stock: ReturnType<typeof services>['stock'];
beforeEach(() => {
  w = makeWorld();
  stock = services(w).stock;
});

describe('batchesOf', () => {
  it('lists batches soonest expiry first, with stock, and an expired batch sells nothing', () => {
    expect(stock.batchesOf(ID.bottle).map((b) => [b.batch_no, b.stock, b.expired, b.sellable])).toEqual([
      ['OLD', 1000, true, 0],
      ['A', 8000, false, 8000],
      ['B', 10_000, false, 10_000],
    ]);
  });

  it('follows the clock', () => {
    w.clock.set('2027-02-01T00:00:00.000Z');
    expect(stock.batchesOf(ID.bottle).find((b) => b.batch_no === 'A')).toMatchObject({ expired: true, sellable: 0 });
  });

  it('a batch expiring today is still sellable', () => {
    w.clock.set('2027-01-31T23:00:00.000Z');
    expect(stock.batchesOf(ID.bottle).find((b) => b.batch_no === 'A')).toMatchObject({ expired: false, sellable: 8000 });
  });

  it('refuses an unknown product', () => {
    expect(codeOf(() => stock.batchesOf(uuid(999)))).toBe('NOT_FOUND');
  });
});

describe('openingStock', () => {
  const input = { product_id: ID.fert, batch_no: 'OPEN-1', expiry_date: '2027-09-30', cost_price: 14_000, qty: 6000, created_by: ID.owner };

  it('creates the batch and one opening movement', () => {
    const batchId = stock.openingStock(input);
    expect(w.store.data.batches.find((b) => b.id === batchId)).toMatchObject({ batch_no: 'OPEN-1', cost_price: 14_000, expiry_date: '2027-09-30', supplier_id: null });
    expect(w.store.data.stock_movements.at(-1)).toMatchObject({ batch_id: batchId, qty_delta: 6000, movement_type: 'opening' });
    expect(stock.stockOfBatch(batchId)).toBe(6000);
  });

  it('can add opening stock to a batch that exists with the same expiry and cost', () => {
    const id = stock.openingStock(input);
    expect(stock.openingStock(input)).toBe(id);
    expect(stock.stockOfBatch(id)).toBe(12_000);
  });

  it('refuses a conflicting batch and a bad supplier', () => {
    stock.openingStock(input);
    expect(codeOf(() => stock.openingStock({ ...input, cost_price: 1 }))).toBe('BATCH_CONFLICT');
    expect(codeOf(() => stock.openingStock({ ...input, batch_no: 'X', supplier_id: uuid(999) }))).toBe('NOT_FOUND');
  });
});

describe('adjust and writeOff', () => {
  it('adjusts up and down with an adjustment movement', () => {
    stock.adjust({ batch_id: ID.bA, qty_delta: 500, created_by: ID.owner });
    stock.adjust({ batch_id: ID.bA, qty_delta: -1500, created_by: ID.owner });
    expect(stock.stockOfBatch(ID.bA)).toBe(7000);
    expect(w.store.data.stock_movements.slice(-2).map((m) => [m.movement_type, m.qty_delta])).toEqual([
      ['adjustment', 500],
      ['adjustment', -1500],
    ]);
  });

  it('never lets a batch go below zero', () => {
    const before = w.store.snapshot();
    expect(codeOf(() => stock.adjust({ batch_id: ID.bA, qty_delta: -8001, created_by: ID.owner }))).toBe('INSUFFICIENT_STOCK');
    expect(codeOf(() => stock.writeOff({ batch_id: ID.bA, qty: 8001, kind: 'damage', created_by: ID.owner }))).toBe('INSUFFICIENT_STOCK');
    expect(w.store.data).toEqual(before);
  });

  it('writes off damaged and expired goods as negative movements', () => {
    stock.writeOff({ batch_id: ID.bA, qty: 1000, kind: 'damage', created_by: ID.owner });
    stock.writeOff({ batch_id: ID.bExpired, qty: 1000, kind: 'expired', created_by: ID.owner });
    expect(w.store.data.stock_movements.slice(-2).map((m) => [m.movement_type, m.qty_delta])).toEqual([
      ['damage', -1000],
      ['expired', -1000],
    ]);
    expect(stock.stockOfBatch(ID.bExpired)).toBe(0);
  });

  it('rejects zero, unknown batches, and inactive users', () => {
    expect(codeOf(() => stock.adjust({ batch_id: ID.bA, qty_delta: 0, created_by: ID.owner }))).toBe('INVALID_INPUT');
    expect(codeOf(() => stock.adjust({ batch_id: uuid(999), qty_delta: 1, created_by: ID.owner }))).toBe('NOT_FOUND');
    expect(codeOf(() => stock.adjust({ batch_id: ID.bA, qty_delta: 1, created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
  });
});
