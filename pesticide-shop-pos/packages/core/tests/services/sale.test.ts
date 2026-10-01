import { beforeEach, describe, expect, it } from 'vitest';
import { calcInvoiceTotals } from '../../src/index.js';
import { codeOf, ID, makeWorld, services, uuid, type World } from '../support/fakes.js';

let w: World;
let sale: ReturnType<typeof services>['sale'];
beforeEach(() => {
  w = makeWorld();
  sale = services(w).sale;
});

const bottles = (packs: number, extra: object = {}) => ({ product_id: ID.bottle, qty: packs * 1000, ...extra });
const stockOf = (batch: string) => w.store.stockOf(batch);

describe('walk-in sale', () => {
  it('writes the invoice, the line and the stock movement, and nothing else', () => {
    const result = sale.create({ created_by: ID.staff, paid_amount: 100_000, lines: [bottles(2)] });

    expect(result.invoice).toMatchObject({
      invoice_no: 'INV-A-000001', customer_id: null, status: 'active', price_type: 'retail',
      subtotal: 100_000, tax_total: 0, total: 100_000, paid_amount: 100_000, due_date: null,
      void_reason: null, voided_by: null, shop_id: ID.scope.shop_id, device_id: ID.scope.device_id,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ batch_id: ID.bA, qty: 2000, unit_price: 50_000, cost_price: 40_000, line_total: 100_000 });

    const movement = w.store.data.stock_movements.at(-1);
    expect(movement).toMatchObject({ batch_id: ID.bA, qty_delta: -2000, movement_type: 'sale', ref_type: 'invoice', ref_id: result.invoice.id, created_by: ID.staff });
    expect(stockOf(ID.bA)).toBe(6000);

    // The cash lives on the invoice. No payment or ledger row without a customer.
    expect(w.store.data.payments).toHaveLength(0);
    expect(w.store.data.ledger_entries).toHaveLength(0);
    expect(result.payment_id).toBeNull();
  });

  it('must be paid in full', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 99_999, lines: [bottles(2)] }))).toBe('CREDIT_NEEDS_CUSTOMER');
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 0, lines: [bottles(2)] }))).toBe('CREDIT_NEEDS_CUSTOMER');
  });

  it('cannot be overpaid', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 100_001, lines: [bottles(2)] }))).toBe('OVERPAID');
  });

  it('a loose quantity of fertilizer is priced by the pack: 250 g at Rs 200/kg is Rs 50', () => {
    const r = sale.create({ created_by: ID.staff, paid_amount: 5000, lines: [{ product_id: ID.fert, qty: 250 }] });
    expect(r.invoice.total).toBe(5000);
    expect(stockOf(ID.bFert)).toBe(9750);
  });
});

describe('sale to a customer', () => {
  it('on credit with part paid now: invoice plus total, then payment in and ledger minus', () => {
    const r = sale.create({
      customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, payment_method: 'easypaisa', reference_no: 'EP-1',
      lines: [bottles(4)],
    });
    expect(r.invoice).toMatchObject({ total: 200_000, paid_amount: 50_000, customer_id: ID.customer });

    expect(w.store.data.payments).toEqual([
      expect.objectContaining({ id: r.payment_id, party_type: 'customer', party_id: ID.customer, method: 'easypaisa', reference_no: 'EP-1', amount: 50_000, direction: 'in' }),
    ]);
    expect(w.store.data.ledger_entries).toEqual([
      expect.objectContaining({ entry_type: 'invoice', amount_delta: 200_000, ref_type: 'invoice', ref_id: r.invoice.id, party_id: ID.customer }),
      expect.objectContaining({ entry_type: 'payment', amount_delta: -50_000, ref_type: 'payment', ref_id: r.payment_id }),
    ]);
    expect(w.store.data.ledger_entries.reduce((s, e) => s + e.amount_delta, 0)).toBe(150_000);
  });

  it('fully on credit writes no payment at all', () => {
    sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(2)] });
    expect(w.store.data.payments).toHaveLength(0);
    expect(w.store.data.ledger_entries.map((e) => e.entry_type)).toEqual(['invoice']);
  });

  it('paid in full by a customer still records both ledger rows, leaving a zero balance', () => {
    sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 100_000, lines: [bottles(2)] });
    expect(w.store.data.ledger_entries.map((e) => e.entry_type)).toEqual(['invoice', 'payment']);
    expect(w.store.data.ledger_entries.reduce((s, e) => s + e.amount_delta, 0)).toBe(0);
  });

  it('a free sale (100 percent discount) writes no zero-value ledger row', () => {
    const r = sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(1, { line_discount: 50_000 })] });
    expect(r.invoice.total).toBe(0);
    expect(w.store.data.ledger_entries).toHaveLength(0);
    expect(stockOf(ID.bA)).toBe(7000);
  });

  it('uses the wholesale price when asked, or when it is the customer default', () => {
    expect(sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, price_type: 'wholesale', lines: [bottles(2)] }).invoice).toMatchObject({ price_type: 'wholesale', total: 90_000 });
    w.store.data.customers[0]!.default_price_type = 'wholesale';
    expect(sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(2)] }).invoice).toMatchObject({ price_type: 'wholesale', total: 90_000 });
    expect(sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, price_type: 'retail', lines: [bottles(2)] }).invoice.total).toBe(100_000);
  });

  describe('credit limit', () => {
    beforeEach(() => {
      w.store.data.customers[0]!.credit_limit = 150_000;
    });

    it('blocks a sale that would take the customer over the limit', () => {
      expect(codeOf(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(4)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
    });

    it('only the unpaid part counts, and exactly the limit is allowed', () => {
      expect(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, lines: [bottles(4)] })).not.toThrow(); // unpaid 150000
    });

    it('counts what the customer already owes', () => {
      sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, lines: [bottles(4)] }); // owes 150000
      expect(codeOf(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
      expect(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] })).not.toThrow(); // pays in full
    });

    it('a customer with a limit of zero cannot buy on credit', () => {
      w.store.data.customers[0]!.credit_limit = 0;
      expect(codeOf(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
    });
  });

  describe('due date', () => {
    it('is kept while something is unpaid and dropped when the sale is settled', () => {
      expect(sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, due_date: '2026-11-01', lines: [bottles(1)] }).invoice.due_date).toBe('2026-11-01');
      expect(sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 50_000, due_date: '2026-11-01', lines: [bottles(1)] }).invoice.due_date).toBeNull();
    });

    it('cannot be in the past', () => {
      expect(codeOf(() => sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, due_date: '2026-09-30', lines: [bottles(1)] }))).toBe('INVALID_INPUT');
    });
  });
});

describe('choosing batches', () => {
  it('12 packs with batch A holding 8 and B holding 10 gives two lines, A first (earliest expiry)', () => {
    const r = sale.create({ created_by: ID.staff, paid_amount: 600_000, lines: [bottles(12)] });
    expect(r.items.map((i) => [i.batch_id, i.qty, i.cost_price, i.line_total])).toEqual([
      [ID.bA, 8000, 40_000, 400_000],
      [ID.bB, 4000, 41_000, 200_000],
    ]);
    expect(stockOf(ID.bA)).toBe(0);
    expect(stockOf(ID.bB)).toBe(6000);
    // one stock movement per invoice line
    expect(w.store.data.stock_movements.filter((m) => m.movement_type === 'sale').map((m) => [m.batch_id, m.qty_delta])).toEqual([
      [ID.bA, -8000],
      [ID.bB, -4000],
    ]);
  });

  it('copies each batch cost onto its line', () => {
    const r = sale.create({ created_by: ID.staff, paid_amount: 600_000, lines: [bottles(12)] });
    expect(r.items.map((i) => i.cost_price)).toEqual([40_000, 41_000]);
  });

  it('lets the cashier override the batch by hand', () => {
    const r = sale.create({ created_by: ID.staff, paid_amount: 100_000, lines: [bottles(2, { batches: [{ batch_id: ID.bB, qty: 2000 }] })] });
    expect(r.items.map((i) => i.batch_id)).toEqual([ID.bB]);
    expect(stockOf(ID.bB)).toBe(8000);
    expect(stockOf(ID.bA)).toBe(8000);
  });

  it('refuses a manual choice of an expired batch', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1, { batches: [{ batch_id: ID.bExpired, qty: 1000 }] })] }))).toBe('BATCH_EXPIRED');
  });

  it('never sells from an expired batch, so the last pack of OLD cannot be sold', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 950_000, lines: [bottles(19)] }))).toBe('INSUFFICIENT_STOCK'); // 18 sellable + 1 expired
    expect(() => sale.create({ created_by: ID.staff, paid_amount: 900_000, lines: [bottles(18)] })).not.toThrow();
  });

  it('follows the clock: once batch A has expired the sale comes from batch B', () => {
    w.clock.set('2027-02-01T09:00:00.000Z');
    const r = sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] });
    expect(r.items.map((i) => i.batch_id)).toEqual([ID.bB]);
  });

  it('two cart lines for the same product cannot sell the same stock twice', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 1_000_000, lines: [bottles(10), bottles(10)] }))).toBe('INSUFFICIENT_STOCK');

    const r = sale.create({ created_by: ID.staff, paid_amount: 500_000, lines: [bottles(5), bottles(5)] });
    expect(r.items.map((i) => [i.batch_id, i.qty])).toEqual([
      [ID.bA, 5000],
      [ID.bA, 3000],
      [ID.bB, 2000],
    ]);
    expect(stockOf(ID.bA)).toBe(0);
    expect(stockOf(ID.bB)).toBe(8000);
  });

  it('out of stock is blocked and nothing is written', () => {
    const before = w.store.snapshot();
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 950_000, lines: [bottles(19)] }))).toBe('INSUFFICIENT_STOCK');
    expect(w.store.data).toEqual(before);
  });

  it('a loose quantity of a pack-only product is refused', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: ID.bottle, qty: 500 }] }))).toBe('WHOLE_PACKS_ONLY');
  });
});

describe('discount and tax', () => {
  it('discount is per item, tax is charged on the discounted price', () => {
    const r = sale.create({ created_by: ID.staff, paid_amount: 578_200, lines: [{ product_id: ID.taxed, qty: 10_000, line_discount: 10_000 }] });
    expect(r.items[0]).toMatchObject({ line_discount: 10_000, tax_rate_bp: 1800, tax_amount: 88_200, line_total: 578_200 });
    expect(r.invoice).toMatchObject({ subtotal: 490_000, tax_total: 88_200, total: 578_200 });
  });

  it('the invoice total always equals the sum of its lines (the v_invoice_mismatch rule)', () => {
    const r = sale.create({
      created_by: ID.staff, paid_amount: 0, customer_id: ID.customer,
      lines: [bottles(12, { line_discount: 3333 }), { product_id: ID.fert, qty: 333, line_discount: 7 }, { product_id: ID.taxed, qty: 3000 }],
    });
    expect(r.invoice.total).toBe(r.items.reduce((s, i) => s + i.line_total, 0));
    expect(calcInvoiceTotals(r.items)).toEqual({ subtotal: r.invoice.subtotal, tax_total: r.invoice.tax_total, total: r.invoice.total });
  });

  it('a discount bigger than the line is refused', () => {
    expect(codeOf(() => sale.create({ created_by: ID.staff, paid_amount: 0, customer_id: ID.customer, lines: [bottles(1, { line_discount: 50_001 })] }))).toBe('DISCOUNT_EXCEEDS_LINE');
  });
});

describe('who and what', () => {
  it('rejects unknown or inactive things', () => {
    const base = { created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] };
    expect(codeOf(() => sale.create({ ...base, created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
    expect(codeOf(() => sale.create({ ...base, created_by: uuid(999) }))).toBe('NOT_FOUND');
    expect(codeOf(() => sale.create({ ...base, customer_id: uuid(999) }))).toBe('NOT_FOUND');
    expect(codeOf(() => sale.create({ ...base, lines: [{ product_id: uuid(999), qty: 1000 }] }))).toBe('NOT_FOUND');
    expect(codeOf(() => sale.create({ ...base, lines: [{ product_id: ID.retired, qty: 1000 }] }))).toBe('PRODUCT_INACTIVE');
  });

  it('rejects a deleted customer', () => {
    w.store.data.customers[0]!.deleted_at = '2026-01-02T00:00:00.000Z';
    expect(codeOf(() => sale.create({ created_by: ID.staff, customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] }))).toBe('NOT_FOUND');
  });

  it('rejects input that is the wrong shape', () => {
    const ok = { created_by: ID.staff, paid_amount: 0, lines: [bottles(1)] };
    expect(codeOf(() => sale.create({ ...ok, lines: [] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => sale.create({ ...ok, lines: [{ product_id: ID.bottle, qty: 0 }] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => sale.create({ ...ok, lines: [{ product_id: ID.bottle, qty: 1.5 }] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => sale.create({ ...ok, paid_amount: -1 }))).toBe('INVALID_INPUT');
    expect(codeOf(() => sale.create({ ...ok, paid_amount: 10.5 }))).toBe('INVALID_INPUT');
    expect(codeOf(() => sale.create({ ...ok, created_by: 'not-a-uuid' }))).toBe('INVALID_INPUT');
    expect(w.store.runs).toBe(0); // never even opened a transaction
  });
});

describe('ports', () => {
  it('uses the injected clock, id generator and document numbers', () => {
    w.clock.set('2026-10-01T08:30:00.000Z');
    const r = sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] });
    expect(r.invoice.invoice_date).toBe('2026-10-01T08:30:00.000Z');
    expect(r.invoice.id).toBe(uuid(10_000)); // first id the generator hands out
    expect(r.items[0]!.id).toBe(uuid(10_001));
    expect(r.invoice.invoice_no).toBe('INV-A-000001');
    expect(sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] }).invoice.invoice_no).toBe('INV-A-000002');
  });

  it('does the whole sale in one unit of work', () => {
    sale.create({ created_by: ID.staff, customer_id: ID.customer, paid_amount: 50_000, lines: [bottles(12)] });
    expect(w.store.runs).toBe(1);
  });
});
