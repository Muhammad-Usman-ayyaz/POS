import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function definePurchaseTests(make: WorldFactory): void {
  describe('purchase', () => {
    let w: ServiceWorld;
    let purchase: ReturnType<typeof services>['purchase'];
    beforeEach(async () => {
      w = await make();
      purchase = services(w).purchase;
    });
    afterEach(() => w.close());

    const item = (over: object = {}) => ({ product_id: ID.bottle, batch_no: 'N1', expiry_date: w.day(400), qty: 5000, cost_price: 42_000, ...over });
    const supplierBalance = () => w.rows('ledger_entries').filter((e) => e.party_type === 'supplier').reduce((sum, e) => sum + (e.amount_delta as number), 0);

    it('creates the batch, the purchase and its items, the stock movement, and the supplier ledger', () => {
      const r = purchase.record({ supplier_id: ID.supplier, supplier_invoice_no: 'S-77', created_by: ID.owner, paid_amount: 210_000, items: [item()] });

      // 5 packs at Rs 420 = Rs 2100
      expect(r.purchase).toMatchObject({ supplier_id: ID.supplier, supplier_invoice_no: 'S-77', purchase_date: w.today, discount: 0, total: 210_000, paid_amount: 210_000 });

      const created = w.rows('batches').find((b) => b.batch_no === 'N1')!;
      expect(created).toMatchObject({ product_id: ID.bottle, supplier_id: ID.supplier, expiry_date: w.day(400), cost_price: 42_000 });
      expect(r.items).toEqual([expect.objectContaining({ purchase_id: r.purchase.id, batch_id: created.id, qty: 5000, cost_price: 42_000 })]);

      expect(w.rows('stock_movements').at(-1)).toMatchObject({ batch_id: created.id, qty_delta: 5000, movement_type: 'purchase', ref_type: 'purchase', ref_id: r.purchase.id, created_by: ID.owner });
      expect(w.stockOf(created.id as string)).toBe(5000);

      expect(w.rows('payments')).toEqual([expect.objectContaining({ id: r.payment_id, party_type: 'supplier', party_id: ID.supplier, direction: 'out', amount: 210_000, method: 'cash' })]);
      expect(w.rows('ledger_entries')).toEqual([
        expect.objectContaining({ party_type: 'supplier', entry_type: 'purchase', amount_delta: 210_000, ref_id: r.purchase.id }),
        expect.objectContaining({ party_type: 'supplier', entry_type: 'payment', amount_delta: -210_000, ref_id: r.payment_id }),
      ]);
      expect(supplierBalance()).toBe(0);
    });

    it('bought on credit: we owe the supplier the total and no payment is written', () => {
      const r = purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item()] });
      expect(r.payment_id).toBeNull();
      expect(w.rows('payments')).toHaveLength(0);
      expect(supplierBalance()).toBe(210_000);
    });

    it('part paid by bank with a reference number', () => {
      purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 100_000, payment_method: 'bank', reference_no: 'TT-9', items: [item()] });
      expect(w.rows('payments')[0]).toMatchObject({ method: 'bank', reference_no: 'TT-9', amount: 100_000 });
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
        items: [item(), item({ product_id: ID.fert, batch_no: 'F2', qty: 4000, cost_price: 15_000, expiry_date: w.day(200) })],
      });
      expect(r.items).toHaveLength(2);
      expect(r.purchase.total).toBe(210_000 + 60_000);
      expect(w.rows('stock_movements').filter((m) => m.movement_type === 'purchase')).toHaveLength(2);
    });

    it('buying again under an existing batch number (same expiry and cost) adds to that batch', () => {
      const before = w.rows('batches').length;
      purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: w.day(120), cost_price: 40_000, qty: 2000 })] });
      expect(w.rows('batches')).toHaveLength(before);
      expect(w.stockOf(ID.bA)).toBe(10_000);
    });

    it('refuses to reuse a batch number with a different expiry or cost, and writes nothing', () => {
      const before = w.snapshot();
      expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: w.day(121), cost_price: 40_000 })] }))).toBe('BATCH_CONFLICT');
      expect(codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [item({ batch_no: 'A', expiry_date: w.day(120), cost_price: 99 })] }))).toBe('BATCH_CONFLICT');
      expect(w.snapshot()).toEqual(before);
    });

    it('a conflict on the SECOND item undoes the first item too', () => {
      const before = w.snapshot();
      expect(
        codeOf(() => purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 1000, items: [item(), item({ batch_no: 'A', cost_price: 99, expiry_date: w.day(120) })] })),
      ).toBe('BATCH_CONFLICT');
      expect(w.snapshot()).toEqual(before);
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
      expect(w.runs()).toBe(1);
    });
  });
}

export function defineStockTests(make: WorldFactory): void {
  describe('stock', () => {
    let w: ServiceWorld;
    let stock: ReturnType<typeof services>['stock'];
    beforeEach(async () => {
      w = await make();
      stock = services(w).stock;
    });
    afterEach(() => w.close());

    describe('batchesOf', () => {
      it('lists batches soonest expiry first, with stock, and an expired batch sells nothing', () => {
        expect(stock.batchesOf(ID.bottle).map((b) => [b.batch_no, b.stock, b.expired, b.sellable])).toEqual([
          ['OLD', 1000, true, 0],
          ['A', 8000, false, 8000],
          ['B', 10_000, false, 10_000],
        ]);
      });

      it('follows the clock', () => {
        w.setNow(w.at(121));
        expect(stock.batchesOf(ID.bottle).find((b) => b.batch_no === 'A')).toMatchObject({ expired: true, sellable: 0 });
      });

      it('a batch expiring today is still sellable', () => {
        w.setNow(w.at(120, '23:00:00.000'));
        expect(stock.batchesOf(ID.bottle).find((b) => b.batch_no === 'A')).toMatchObject({ expired: false, sellable: 8000 });
      });

      it('refuses an unknown product', () => {
        expect(codeOf(() => stock.batchesOf(uuid(999)))).toBe('NOT_FOUND');
      });
    });

    describe('openingStock', () => {
      const input = () => ({ product_id: ID.fert, batch_no: 'OPEN-1', expiry_date: w.day(300), cost_price: 14_000, qty: 6000, created_by: ID.owner });

      it('creates the batch and one opening movement', () => {
        const batchId = stock.openingStock(input());
        expect(w.rows('batches').find((b) => b.id === batchId)).toMatchObject({ batch_no: 'OPEN-1', cost_price: 14_000, expiry_date: w.day(300), supplier_id: null });
        expect(w.rows('stock_movements').at(-1)).toMatchObject({ batch_id: batchId, qty_delta: 6000, movement_type: 'opening' });
        expect(stock.stockOfBatch(batchId)).toBe(6000);
      });

      it('can add opening stock to a batch that exists with the same expiry and cost', () => {
        const id = stock.openingStock(input());
        expect(stock.openingStock(input())).toBe(id);
        expect(stock.stockOfBatch(id)).toBe(12_000);
      });

      it('refuses a conflicting batch and a bad supplier', () => {
        stock.openingStock(input());
        expect(codeOf(() => stock.openingStock({ ...input(), cost_price: 1 }))).toBe('BATCH_CONFLICT');
        expect(codeOf(() => stock.openingStock({ ...input(), batch_no: 'X', supplier_id: uuid(999) }))).toBe('NOT_FOUND');
      });
    });

    describe('adjust and writeOff', () => {
      it('adjusts up and down with an adjustment movement', () => {
        stock.adjust({ batch_id: ID.bA, qty_delta: 500, created_by: ID.owner });
        stock.adjust({ batch_id: ID.bA, qty_delta: -1500, created_by: ID.owner });
        expect(stock.stockOfBatch(ID.bA)).toBe(7000);
        expect(w.rows('stock_movements').slice(-2).map((m) => [m.movement_type, m.qty_delta])).toEqual([
          ['adjustment', 500],
          ['adjustment', -1500],
        ]);
      });

      it('records an adjustment in the audit log: who, which batch, how much, and the stock before and after', () => {
        stock.adjust({ batch_id: ID.bA, qty_delta: -1500, created_by: ID.owner });
        const movement = w.rows('stock_movements').at(-1)!;
        expect(w.rows('audit_log')).toEqual([
          expect.objectContaining({ user_id: ID.owner, action: 'stock_adjustment', table_name: 'stock_movements', row_id: movement.id }),
        ]);
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toEqual({ batch_id: ID.bA, qty_delta: -1500, stock_before: 8000, stock_after: 6500 });
      });

      it('records a write-off in the audit log', () => {
        stock.writeOff({ batch_id: ID.bExpired, qty: 1000, kind: 'expired', created_by: ID.owner });
        const movement = w.rows('stock_movements').at(-1)!;
        expect(w.rows('audit_log')).toEqual([
          expect.objectContaining({ user_id: ID.owner, action: 'stock_write_off', table_name: 'stock_movements', row_id: movement.id }),
        ]);
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toEqual({ batch_id: ID.bExpired, qty: 1000, kind: 'expired', stock_before: 1000, stock_after: 0 });
      });

      it('a refused adjustment leaves no audit row, and says how much stock there is', () => {
        const e = errorOf(() => stock.adjust({ batch_id: ID.bA, qty_delta: -8001, created_by: ID.owner }));
        expect(e.code).toBe('INSUFFICIENT_STOCK');
        expect(e.params).toEqual({ available: 8000, requested: 8001, packSize: 1000, scope: 'batch' });
        expect(errorOf(() => stock.writeOff({ batch_id: ID.bA, qty: 9000, kind: 'damage', created_by: ID.owner })).params).toEqual({ available: 8000, requested: 9000, packSize: 1000, scope: 'batch' });
        expect(w.rows('audit_log')).toHaveLength(0);
      });

      it('never lets a batch go below zero', () => {
        const before = w.snapshot();
        expect(codeOf(() => stock.adjust({ batch_id: ID.bA, qty_delta: -8001, created_by: ID.owner }))).toBe('INSUFFICIENT_STOCK');
        expect(codeOf(() => stock.writeOff({ batch_id: ID.bA, qty: 8001, kind: 'damage', created_by: ID.owner }))).toBe('INSUFFICIENT_STOCK');
        expect(w.snapshot()).toEqual(before);
      });

      it('writes off damaged and expired goods as negative movements', () => {
        stock.writeOff({ batch_id: ID.bA, qty: 1000, kind: 'damage', created_by: ID.owner });
        stock.writeOff({ batch_id: ID.bExpired, qty: 1000, kind: 'expired', created_by: ID.owner });
        expect(w.rows('stock_movements').slice(-2).map((m) => [m.movement_type, m.qty_delta])).toEqual([
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
  });
}
