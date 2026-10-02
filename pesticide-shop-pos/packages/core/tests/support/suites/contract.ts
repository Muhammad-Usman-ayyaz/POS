// The repository and unit-of-work contract, checked directly. Any behaviour the services rely on that one
// backend does differently from the other fails here with a clear name, before it shows up as a strange
// service failure.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../../../src/index.js';
import { ID, SCOPE, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineContractTests(make: WorldFactory): void {
  describe('repository contract', () => {
    let w: ServiceWorld;
    beforeEach(async () => {
      w = await make();
    });
    afterEach(() => w.close());

    const run = <T>(work: (tx: Repositories) => T): T => w.deps.uow.run(work);
    const stockRow = (batch_id: string, qty_delta: number, movement_type: 'opening' | 'sale', id: string) => ({
      id, batch_id, qty_delta, movement_type, ref_type: null, ref_id: null, created_by: ID.owner, ...SCOPE,
    });
    const ledgerRow = (id: string, party_id: string, party_type: 'customer' | 'supplier', amount_delta: number, entry_date: string) => ({
      id, party_type, party_id, entry_type: 'adjustment' as const, amount_delta, ref_type: null, ref_id: null, entry_date, created_by: ID.owner, ...SCOPE,
    });

    describe('unit of work', () => {
      it('returns what the work returns', () => {
        expect(run(() => 42)).toBe(42);
      });

      it('commits everything the work wrote when it returns', () => {
        run((tx) => tx.stock.insert(stockRow(ID.bA, 500, 'opening', 'c0000000-0000-4000-8000-000000000001')));
        expect(w.stockOf(ID.bA)).toBe(8500);
      });

      it('rolls everything back, and rethrows the SAME error, when the work throws', () => {
        const before = w.snapshot();
        const boom = new Error('boom');
        let caught: unknown;
        try {
          run((tx) => {
            tx.numbers.next('invoice');
            tx.stock.insert(stockRow(ID.bA, 500, 'opening', 'c0000000-0000-4000-8000-000000000002'));
            throw boom;
          });
        } catch (e) {
          caught = e;
        }
        expect(caught).toBe(boom);
        expect(w.snapshot()).toEqual(before);
        expect(w.inTransaction()).toBe(false);
      });

      it('can be used again after a failure', () => {
        expect(() => run(() => { throw new Error('first'); })).toThrow('first');
        expect(run(() => 'second')).toBe('second');
      });

      it('refuses to be nested', () => {
        expect(() => run(() => run(() => 1))).toThrow(/inside run/);
        expect(w.inTransaction()).toBe(false);
      });

      it('refuses a callback that returns a Promise, and undoes its writes', () => {
        const before = w.snapshot();
        expect(() => run(async (tx) => { tx.numbers.next('invoice'); })).toThrow(/synchronous/);
        expect(w.snapshot()).toEqual(before);
      });
    });

    describe('guards', () => {
      it('a repository used outside a unit of work refuses to work', () => {
        const repos = w.outsideTransaction();
        expect(() => repos.products.getById(ID.bottle)).toThrow(/outside a unit of work/);
        expect(() => repos.stock.stockOfBatch(ID.bA)).toThrow(/outside a unit of work/);
        expect(() => repos.numbers.next('invoice')).toThrow(/outside a unit of work/);
        expect(() => repos.stock.insert(stockRow(ID.bA, 1, 'opening', 'c0000000-0000-4000-8000-000000000003'))).toThrow(/outside a unit of work/);
      });

      it.each(['version', 'updated_at', 'created_at', 'deleted_at'])('refuses a row that sets %s: the database owns it', (column) => {
        const before = w.snapshot();
        expect(() =>
          run((tx) => tx.stock.insert({ ...stockRow(ID.bA, 1, 'opening', 'c0000000-0000-4000-8000-000000000004'), [column]: 'x' } as never)),
        ).toThrow(`service set ${column}`);
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses stock that would go below zero', () => {
        const before = w.snapshot();
        expect(() => run((tx) => tx.stock.insert(stockRow(ID.bA, -8001, 'sale', 'c0000000-0000-4000-8000-000000000005')))).toThrow(/insufficient stock/);
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses a zero ledger entry', () => {
        expect(() => run((tx) => tx.ledger.insert(ledgerRow('c0000000-0000-4000-8000-000000000006', ID.customer, 'customer', 0, w.at(0))))).toThrow();
      });
    });

    describe('reads', () => {
      it('products, customers, suppliers and users: found by id, undefined otherwise', () => {
        run((tx) => {
          expect(tx.products.getById(ID.bottle)).toMatchObject({ id: ID.bottle, pack_size: 1000, retail_price: 50_000, wholesale_price: 45_000, allow_loose: 0, is_active: 1, deleted_at: null });
          expect(tx.customers.getById(ID.customer)).toMatchObject({ id: ID.customer, credit_limit: 1_000_000, default_price_type: 'retail' });
          expect(tx.suppliers.getById(ID.supplier)).toMatchObject({ id: ID.supplier });
          expect(tx.products.getById('nope')).toBeUndefined();
          expect(tx.customers.getById('nope')).toBeUndefined();
          expect(tx.suppliers.getById('nope')).toBeUndefined();
          expect(tx.users.getById('nope')).toBeUndefined();
        });
      });

      it('a user is returned without the password hash', () => {
        run((tx) => {
          const owner = tx.users.getById(ID.owner)!;
          expect(owner).toMatchObject({ id: ID.owner, role: 'owner', is_active: 1 });
          expect(owner).not.toHaveProperty('password_hash');
          expect(tx.users.getById(ID.inactive)).toMatchObject({ is_active: 0 });
        });
      });

      it('batches: by id, by product and number, and listed with stock, soonest expiry first', () => {
        run((tx) => {
          expect(tx.batches.getById(ID.bA)).toMatchObject({ batch_no: 'A', product_id: ID.bottle, cost_price: 40_000 });
          expect(tx.batches.getByProductAndNo(ID.bottle, 'B')).toMatchObject({ id: ID.bB });
          expect(tx.batches.getByProductAndNo(ID.bottle, 'nope')).toBeUndefined();
          expect(tx.batches.getByProductAndNo(ID.fert, 'A')).toBeUndefined(); // same number, other product
          expect(tx.batches.listForProduct(ID.bottle).map((b) => [b.batch_no, b.stock])).toEqual([
            ['OLD', 1000],
            ['A', 8000],
            ['B', 10_000],
          ]);
          expect(tx.batches.listForProduct(ID.retired)).toEqual([]);
        });
      });

      it('a soft-deleted batch is not listed', () => {
        w.update('batches', ID.bB, { deleted_at: '2026-01-02T00:00:00.000Z' });
        run((tx) => expect(tx.batches.listForProduct(ID.bottle).map((b) => b.batch_no)).toEqual(['OLD', 'A']));
      });

      it('stock is the sum of the movements, and zero for a batch with none', () => {
        run((tx) => {
          tx.stock.insert(stockRow(ID.bA, -3000, 'sale', 'c0000000-0000-4000-8000-000000000007'));
          expect(tx.stock.stockOfBatch(ID.bA)).toBe(5000);
          expect(tx.batches.listForProduct(ID.bottle).find((b) => b.id === ID.bA)!.stock).toBe(5000);
          expect(tx.stock.stockOfBatch('nope')).toBe(0);
        });
      });

      it('the ledger: balance is the sum, per party; list is oldest first', () => {
        run((tx) => {
          tx.ledger.insert(ledgerRow('c0000000-0000-4000-8000-000000000011', ID.customer, 'customer', 500, w.at(0)));
          tx.ledger.insert(ledgerRow('c0000000-0000-4000-8000-000000000012', ID.customer, 'customer', -200, w.at(1)));
          tx.ledger.insert(ledgerRow('c0000000-0000-4000-8000-000000000013', ID.supplier, 'supplier', 9000, w.at(1)));
          expect(tx.ledger.balance('customer', ID.customer)).toBe(300);
          expect(tx.ledger.balance('supplier', ID.supplier)).toBe(9000);
          expect(tx.ledger.balance('customer', ID.supplier)).toBe(0); // a supplier id is not a customer
          expect(tx.ledger.list('customer', ID.customer).map((e) => e.amount_delta)).toEqual([500, -200]);
          expect(tx.ledger.list('customer', 'nope')).toEqual([]);
        });
      });

      it('a ledger entry is read back as the entity: nullable columns are null, not undefined', () => {
        run((tx) => {
          tx.ledger.insert(ledgerRow('c0000000-0000-4000-8000-000000000014', ID.customer, 'customer', 5, w.at(0)));
          expect(tx.ledger.list('customer', ID.customer)[0]).toMatchObject({ ref_type: null, ref_id: null, created_by: ID.owner });
        });
      });
    });

    describe('document numbers', () => {
      it('count up per sequence, independently, in the shop format', () => {
        run((tx) => {
          expect(tx.numbers.next('invoice')).toBe('INV-A-000001');
          expect(tx.numbers.next('invoice')).toBe('INV-A-000002');
          expect(tx.numbers.next('return')).toBe('RET-A-000001');
          expect(tx.numbers.next('purchase')).toBe('PUR-A-000001');
          expect(tx.numbers.next('invoice')).toBe('INV-A-000003');
        });
      });

      it('a number taken inside a unit of work that fails is handed out again', () => {
        expect(() => run((tx) => { tx.numbers.next('invoice'); throw new Error('x'); })).toThrow('x');
        expect(run((tx) => tx.numbers.next('invoice'))).toBe('INV-A-000001');
      });

      it('keep counting across units of work', () => {
        expect(run((tx) => tx.numbers.next('invoice'))).toBe('INV-A-000001');
        expect(run((tx) => tx.numbers.next('invoice'))).toBe('INV-A-000002');
      });
    });
  });
}
