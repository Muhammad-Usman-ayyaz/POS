import { beforeEach, describe, expect, it } from 'vitest';
import { addStock, codeOf, ID, makeWorld, services, uuid, type World } from '../support/fakes.js';

let w: World;
let s: ReturnType<typeof services>;
beforeEach(() => {
  w = makeWorld();
  s = services(w);
});

/** 10 bottles (10000 ml) at Rs 500 on credit with Rs 2000 paid. Batch A gets 2 extra packs so one line covers it. */
function tenSold() {
  addStock(w, ID.bA, 2000);
  const r = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 200_000, lines: [{ product_id: ID.bottle, qty: 10_000 }] });
  expect(r.items).toHaveLength(1);
  return { invoice: r.invoice, item: r.items[0]! };
}

const ret = (invoiceId: string, itemId: string, qty: number, extra: object = {}) =>
  s.salesReturn.create({
    invoice_id: invoiceId, approved_by: ID.owner, refund_method: 'khata_credit',
    items: [{ invoice_item_id: itemId, qty, condition: 'resellable' }], ...extra,
  });

describe('10 sold, 2 returned', () => {
  it('writes the return, the line, the stock back on the same batch, and the Khata credit', () => {
    const { invoice, item } = tenSold();
    expect(s.khata.balance(ID.customer)).toBe(300_000); // owes Rs 3000
    const stockBefore = w.store.stockOf(ID.bA);

    const r = ret(invoice.id, item.id, 2000, { reason: 'wrong product' });

    expect(r.sales_return).toMatchObject({
      return_no: 'RET-A-000001', invoice_id: invoice.id, approved_by: ID.owner, return_date: '2026-10-01',
      reason: 'wrong product', refund_method: 'khata_credit', total: 100_000,
    });
    expect(r.items).toEqual([expect.objectContaining({ sales_return_id: r.sales_return.id, invoice_item_id: item.id, qty: 2000, refund_amount: 100_000, condition: 'resellable' })]);

    expect(w.store.data.stock_movements.at(-1)).toMatchObject({ batch_id: item.batch_id, qty_delta: 2000, movement_type: 'sale_return', ref_type: 'return', ref_id: r.sales_return.id });
    expect(w.store.stockOf(ID.bA)).toBe(stockBefore + 2000);

    expect(w.store.data.ledger_entries.at(-1)).toMatchObject({ party_id: ID.customer, entry_type: 'return', amount_delta: -100_000, ref_type: 'return', ref_id: r.sales_return.id });
    expect(s.khata.balance(ID.customer)).toBe(200_000); // now owes Rs 2000
  });

  it('then 9 more bottles cannot come back, but the last 8 can, and the refunds add up to the sale', () => {
    const { invoice, item } = tenSold();
    ret(invoice.id, item.id, 2000);

    const before = w.store.snapshot();
    expect(codeOf(() => ret(invoice.id, item.id, 9000))).toBe('RETURN_EXCEEDS_SOLD');
    expect(w.store.data).toEqual(before);

    const rest = ret(invoice.id, item.id, 8000);
    expect(rest.sales_return.total).toBe(400_000);
    expect(rest.sales_return.return_no).toBe('RET-A-000002');
    expect(codeOf(() => ret(invoice.id, item.id, 1))).toBe('RETURN_EXCEEDS_SOLD');
    // the customer paid 200000 of the 500000, got all 500000 credited back: they are Rs 2000 in credit
    expect(s.khata.balance(ID.customer)).toBe(-200_000);
  });
});

describe('what comes back', () => {
  it('damaged goods are credited to the customer but not put back in stock', () => {
    const { invoice, item } = tenSold();
    const stockBefore = w.store.stockOf(ID.bA);
    const movements = w.store.data.stock_movements.length;
    const r = s.salesReturn.create({
      invoice_id: invoice.id, approved_by: ID.owner, refund_method: 'khata_credit',
      items: [{ invoice_item_id: item.id, qty: 1000, condition: 'damaged' }],
    });
    expect(r.sales_return.total).toBe(50_000);
    expect(w.store.stockOf(ID.bA)).toBe(stockBefore);
    expect(w.store.data.stock_movements).toHaveLength(movements);
    expect(w.store.data.ledger_entries.at(-1)).toMatchObject({ entry_type: 'return', amount_delta: -50_000 });
  });

  it('a sale split over two batches returns to the batch each line came from', () => {
    const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 12_000 }] });
    const lineB = sold.items.find((i) => i.batch_id === ID.bB)!;
    const bBefore = w.store.stockOf(ID.bB);
    ret(sold.invoice.id, lineB.id, 1000);
    expect(w.store.stockOf(ID.bB)).toBe(bBefore + 1000);
    expect(w.store.stockOf(ID.bA)).toBe(0);
  });

  it('refunds at the price charged: discount and tax come back in proportion', () => {
    const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.taxed, qty: 10_000, line_discount: 10_000 }] });
    expect(sold.items[0]!.line_total).toBe(578_200);
    expect(ret(sold.invoice.id, sold.items[0]!.id, 2000).sales_return.total).toBe(115_640);
  });

  it('refunds ignore a price that changed after the sale', () => {
    const { invoice, item } = tenSold();
    w.store.data.products.find((p) => p.id === ID.bottle)!.retail_price = 99_999;
    expect(ret(invoice.id, item.id, 1000).sales_return.total).toBe(50_000);
  });

  it('can return several lines at once', () => {
    const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 2000 }, { product_id: ID.fert, qty: 500 }] });
    const r = s.salesReturn.create({
      invoice_id: sold.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit',
      items: sold.items.map((i) => ({ invoice_item_id: i.id, qty: i.qty, condition: 'resellable' as const })),
    });
    expect(r.sales_return.total).toBe(100_000 + 10_000);
    expect(r.items).toHaveLength(2);
  });
});

describe('who may return what', () => {
  it('needs an active owner to approve', () => {
    const { invoice, item } = tenSold();
    const before = w.store.snapshot();
    expect(codeOf(() => ret(invoice.id, item.id, 1000, { approved_by: ID.staff }))).toBe('NOT_AUTHORIZED');
    expect(codeOf(() => ret(invoice.id, item.id, 1000, { approved_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
    expect(codeOf(() => ret(invoice.id, item.id, 1000, { approved_by: uuid(999) }))).toBe('NOT_FOUND');
    expect(w.store.data).toEqual(before);
  });

  it('must link to a real, active invoice and an item on it', () => {
    const { invoice, item } = tenSold();
    const other = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.fert, qty: 1000 }] });
    expect(codeOf(() => ret(uuid(999), item.id, 1000))).toBe('NOT_FOUND');
    expect(codeOf(() => ret(invoice.id, other.items[0]!.id, 1000))).toBe('ITEM_NOT_ON_INVOICE');
    expect(codeOf(() => ret(invoice.id, uuid(999), 1000))).toBe('ITEM_NOT_ON_INVOICE');

    w.store.data.invoices.find((i) => i.id === invoice.id)!.status = 'voided';
    expect(codeOf(() => ret(invoice.id, item.id, 1000))).toBe('INVOICE_VOIDED');
  });

  it('a walk-in sale has no Khata, so it cannot be credited', () => {
    const walkIn = s.sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [{ product_id: ID.bottle, qty: 1000 }] });
    expect(codeOf(() => ret(walkIn.invoice.id, walkIn.items[0]!.id, 1000))).toBe('CREDIT_NEEDS_CUSTOMER');
  });

  it('cash refunds are not available yet and open no transaction', () => {
    const { invoice, item } = tenSold();
    const runs = w.store.runs;
    expect(codeOf(() => ret(invoice.id, item.id, 1000, { refund_method: 'cash' }))).toBe('NOT_SUPPORTED');
    expect(w.store.runs).toBe(runs);
  });

  it('rejects an empty or malformed request', () => {
    const { invoice, item } = tenSold();
    expect(codeOf(() => s.salesReturn.create({ invoice_id: invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => ret(invoice.id, item.id, 0))).toBe('INVALID_INPUT');
    expect(codeOf(() => ret(invoice.id, item.id, 1.5))).toBe('INVALID_INPUT');
    expect(codeOf(() => s.salesReturn.create({
      invoice_id: invoice.id, approved_by: ID.owner, refund_method: 'khata_credit',
      items: [{ invoice_item_id: item.id, qty: 1000, condition: 'resellable' }, { invoice_item_id: item.id, qty: 1000, condition: 'resellable' }],
    }))).toBe('DUPLICATE_LINE');
  });

  it('is one unit of work', () => {
    const { invoice, item } = tenSold();
    const runs = w.store.runs;
    ret(invoice.id, item.id, 1000);
    expect(w.store.runs).toBe(runs + 1);
  });
});
