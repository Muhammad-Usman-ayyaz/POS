import { beforeEach, describe, expect, it } from 'vitest';
import { codeOf, ID, makeWorld, services, uuid, type World } from '../support/fakes.js';

let w: World;
let purchase: ReturnType<typeof services>['purchase'];
beforeEach(() => {
  w = makeWorld();
  purchase = services(w).purchase;
});

const item = (over: object = {}) => ({ product_id: ID.bottle, batch_no: 'N1', expiry_date: '2027-12-31', qty: 5000, cost_price: 42_000, ...over });
const supplierBalance = () => w.store.data.ledger_entries.filter((e) => e.party_type === 'supplier').reduce((s, e) => s + e.amount_delta, 0);

describe('purchase.record', () => {
  it('creates the batch, the purchase and its items, the stock movement, and the supplier ledger', () => {
    const r = purchase.record({ supplier_id: ID.supplier, supplier_invoice_no: 'S-77', created_by: ID.owner, paid_amount: 210_000, items: [item()] });

    // 5 packs at Rs 420 = Rs 2100
    expect(r.purchase).toMatchObject({ supplier_id: ID.supplier, supplier_invoice_no: 'S-77', purchase_date: '2026-10-01', discount: 0, total: 210_000, paid_amount: 210_000 });

    const created = w.store.data.batches.find((b) => b.batch_no === 'N1');
    expect(created).toMatchObject({ product_id: ID.bottle, supplier_id: ID.supplier, expiry_date: '2027-12-31', cost_price: 42_000 });
    expect(r.items).toEqual([expect.objectContaining({ purchase_id: r.purchase.id, batch_id: created!.id, qty: 5000, cost_price: 42_000 })]);

    expect(w.store.data.stock_movements.at(-1)).toMatchObject({ batch_id: created!.id, qty_delta: 5000, movement_type: 'purchase', ref_type: 'purchase', ref_id: r.purchase.id, created_by: ID.owner });
    expect(w.store.stockOf(created!.id)).toBe(5000);

    expect(w.store.data.payments).toEqual([expect.objectContaining({ id: r.payment_id, party_type: 'supplier', party_id: ID.supplier, direction: 'out', amount: 210_000, method: 'cash' })]);
    expect(w.store.data.ledger_entries).toEqual([
      expect.objectContaining({ party_type: 'supplier', entry_type: 'purchase', amount_delta: 210_000, ref_id: r.purchase.id }),
      expect.objectContaining({ party_type: 'supplier', entry_type: 'payment', amount_delta: -210_000, ref_id: r.payment_id }),
    ]);
    expect(supplierBalance()).toBe(0);
  });

  it('bought on credit: we owe the supplier the total and no payment is written', () => {
    const r = purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item()] });
    expect(r.payment_id).toBeNull();
    expect(w.store.data.payments).toHaveLength(0);
    expect(supplierBalance()).toBe(210_000);
  });

  it('part paid by bank with a reference number', () => {
    purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 100_000, payment_method: 'bank', reference_no: 'TT-9', items: [item()] });
    expect(w.store.data.payments[0]).toMatchObject({ method: 'bank', reference_no: 'TT-9', amount: 100_000 });
    expect(supplierBalance()).toBe(110_000);
  });

  it('the discount comes off the total', () => {
    const r = purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, discount: 10_000, items: [item()] });
    expect(r.purchase).toMatchObject({ discount: 10_000, total: 200_000 });
    expect(supplierBalance()).toBe(200_000);
  });

  it('several items make several batches and a total that adds up', () => {
    const r = purchase.record({
      supplier_id: ID.supplier, created_by: ID.owner,
      items: [item(), item({ product_id: ID.fert, batch_no: 'F2', qty: 4000, cost_price: 15_000, expiry_date: '2027-05-01' })],
    });
    expect(r.items).toHaveLength(2);
    expect(r.purchase.total).toBe(210_000 + 60_000);
    expect(w.store.data.stock_movements.filter((m) => m.movement_type === 'purchase')).toHaveLength(2);
  });

  it('buying again under an existing batch number (same expiry and cost) adds to that batch', () => {
    const before = w.store.data.batches.length;
    purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: '2027-01-31', cost_price: 40_000, qty: 2000 })] });
    expect(w.store.data.batches).toHaveLength(before);
    expect(w.store.stockOf(ID.bA)).toBe(10_000);
  });

  it('refuses to reuse a batch number with a different expiry or cost, and writes nothing', () => {
    const before = w.store.snapshot();
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: '2027-02-28', cost_price: 40_000 })] }))).toBe('BATCH_CONFLICT');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: '2027-01-31', cost_price: 99 })] }))).toBe('BATCH_CONFLICT');
    expect(w.store.data).toEqual(before);
  });

  it('a conflict on the SECOND item undoes the first item too', () => {
    const before = w.store.snapshot();
    expect(
      codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 1000, items: [item(), item({ batch_no: 'A', cost_price: 99, expiry_date: '2027-01-31' })] })),
    ).toBe('BATCH_CONFLICT');
    expect(w.store.data).toEqual(before);
  });

  it('refuses the same batch twice in one purchase, overpaying, and a discount bigger than the goods', () => {
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item(), item()] }))).toBe('DUPLICATE_LINE');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 210_001, items: [item()] }))).toBe('OVERPAID');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, discount: 210_001, items: [item()] }))).toBe('DISCOUNT_EXCEEDS_LINE');
  });

  it('refuses an unknown supplier, an inactive product and an inactive user', () => {
    expect(codeOf(() => purchase.record({ supplier_id: uuid(999), created_by: ID.owner, items: [item()] }))).toBe('NOT_FOUND');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ product_id: ID.retired })] }))).toBe('PRODUCT_INACTIVE');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.inactive, items: [item()] }))).toBe('NOT_AUTHORIZED');
  });

  it('rejects a bad shape', () => {
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ expiry_date: '31/12/2027' })] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ qty: 0 })] }))).toBe('INVALID_INPUT');
  });

  it('is one unit of work', () => {
    purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 100_000, items: [item(), item({ batch_no: 'N2' })] });
    expect(w.store.runs).toBe(1);
  });
});
