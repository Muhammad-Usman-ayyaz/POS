import { describe, expect, it } from 'vitest';
import { allocateBatches, buildInvoiceLines, calcInvoiceTotals, calcLine, checkInvoicePayment, DomainError, formatPaisa, type CartLine } from '../src/index.js';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : `not a DomainError: ${String(e)}`;
  }
  return undefined;
};

describe('calcLine', () => {
  const base = { pack_size: 1000, line_discount: 0, tax_rate_bp: 0 };

  it('10 bottles at Rs 500 is Rs 5000', () => {
    expect(calcLine({ ...base, qty: 10_000, unit_price: 50_000 })).toEqual({
      gross: 500_000,
      line_discount: 0,
      taxable: 500_000,
      tax_amount: 0,
      line_total: 500_000,
    });
  });

  it('250 g loose at Rs 200/kg is Rs 50', () => {
    expect(calcLine({ ...base, qty: 250, unit_price: 20_000 }).line_total).toBe(5000);
  });

  it('tax is charged on the price after the discount, then added', () => {
    // 500000 - 10000 = 490000 taxable; 18% = 88200; total 578200
    expect(calcLine({ qty: 10_000, unit_price: 50_000, pack_size: 1000, line_discount: 10_000, tax_rate_bp: 1800 })).toEqual({
      gross: 500_000,
      line_discount: 10_000,
      taxable: 490_000,
      tax_amount: 88_200,
      line_total: 578_200,
    });
  });

  it('follows the documented formula: ROUND(qty*price/pack) - discount + tax', () => {
    const r = calcLine({ qty: 333, unit_price: 12_345, pack_size: 1000, line_discount: 100, tax_rate_bp: 1800 });
    expect(r.gross).toBe(Math.round((333 * 12_345) / 1000));
    expect(r.line_total).toBe(r.gross - 100 + r.tax_amount);
  });

  it('allows a 100 percent discount', () => {
    expect(calcLine({ ...base, qty: 1000, unit_price: 20_000, line_discount: 20_000, tax_rate_bp: 1800 }).line_total).toBe(0);
  });

  it('rejects a discount bigger than the line, a negative discount, and a bad quantity', () => {
    expect(code(() => calcLine({ ...base, qty: 1000, unit_price: 20_000, line_discount: 20_001 }))).toBe('DISCOUNT_EXCEEDS_LINE');
    expect(code(() => calcLine({ ...base, qty: 1000, unit_price: 20_000, line_discount: -1 }))).toBe('DISCOUNT_EXCEEDS_LINE');
    expect(code(() => calcLine({ ...base, qty: 0, unit_price: 20_000 }))).toBe('INVALID_QUANTITY');
  });
});

describe('buildInvoiceLines', () => {
  const cart: CartLine = { product_id: 'p1', qty: 4000, unit_price: 50_000, pack_size: 1000, line_discount: 0, tax_rate_bp: 0 };
  const twoBatches = [
    { batch_id: 'B', qty: 3000, cost_price: 40_000 },
    { batch_id: 'A', qty: 1000, cost_price: 42_000 },
  ];

  it('makes one row per batch and copies each batch cost onto its row', () => {
    const lines = buildInvoiceLines(cart, twoBatches);
    expect(lines.map((l) => [l.batch_id, l.qty, l.cost_price, l.line_total])).toEqual([
      ['B', 3000, 40_000, 150_000],
      ['A', 1000, 42_000, 50_000],
    ]);
  });

  it('shares the discount between rows by price and loses no paisa', () => {
    const lines = buildInvoiceLines({ ...cart, line_discount: 10_000 }, twoBatches);
    expect(lines.map((l) => l.line_discount)).toEqual([7500, 2500]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(200_000 - 10_000);
  });

  it('an odd discount still adds up exactly', () => {
    const equal = [
      { batch_id: 'A', qty: 1000, cost_price: 1 },
      { batch_id: 'B', qty: 1000, cost_price: 1 },
    ];
    const lines = buildInvoiceLines({ ...cart, qty: 2000, unit_price: 100_000, line_discount: 1 }, equal);
    expect(lines.map((l) => l.line_discount)).toEqual([1, 0]);
  });

  it('a full discount across rows never pushes one row below zero', () => {
    // rows round to 333 + 167 = 500; the discount is the whole 500
    const rows = [
      { batch_id: 'A', qty: 1000, cost_price: 1 },
      { batch_id: 'B', qty: 500, cost_price: 1 },
    ];
    const lines = buildInvoiceLines({ ...cart, qty: 1500, unit_price: 333, line_discount: 500, tax_rate_bp: 1800 }, rows);
    expect(lines.map((l) => l.line_discount)).toEqual([333, 167]);
    expect(lines.every((l) => l.line_total === 0)).toBe(true);
  });

  it('applies the product tax rate to every row', () => {
    const lines = buildInvoiceLines({ ...cart, tax_rate_bp: 1800 }, twoBatches);
    expect(lines.map((l) => l.tax_amount)).toEqual([27_000, 9000]);
    expect(lines.every((l) => l.tax_rate_bp === 1800)).toBe(true);
  });

  it('rejects batches that do not add up to the line, and a discount over the price', () => {
    expect(code(() => buildInvoiceLines(cart, [{ batch_id: 'A', qty: 1000, cost_price: 1 }]))).toBe('ALLOCATION_MISMATCH');
    expect(code(() => buildInvoiceLines({ ...cart, line_discount: 200_001 }, twoBatches))).toBe('DISCOUNT_EXCEEDS_LINE');
  });
});

describe('calcInvoiceTotals', () => {
  it('subtotal is the lines without tax, total adds the tax', () => {
    expect(
      calcInvoiceTotals([
        { line_total: 578_200, tax_amount: 88_200 },
        { line_total: 5000, tax_amount: 0 },
      ]),
    ).toEqual({ subtotal: 495_000, tax_total: 88_200, total: 583_200 });
  });

  it('an empty invoice is all zeros', () => {
    expect(calcInvoiceTotals([])).toEqual({ subtotal: 0, tax_total: 0, total: 0 });
  });

  it('total equals the sum of line totals, as v_invoice_mismatch requires', () => {
    const cart: CartLine = { product_id: 'p', qty: 2500, unit_price: 12_345, pack_size: 1000, line_discount: 333, tax_rate_bp: 1800 };
    const lines = buildInvoiceLines(cart, [
      { batch_id: 'A', qty: 1500, cost_price: 1 },
      { batch_id: 'B', qty: 1000, cost_price: 1 },
    ]);
    expect(calcInvoiceTotals(lines).total).toBe(lines.reduce((s, l) => s + l.line_total, 0));
  });
});

describe('checkInvoicePayment', () => {
  it('accepts full payment, part payment with a customer, and credit with a customer', () => {
    expect(() => checkInvoicePayment({ total: 1000, paid_amount: 1000, has_customer: false })).not.toThrow();
    expect(() => checkInvoicePayment({ total: 1000, paid_amount: 200, has_customer: true })).not.toThrow();
    expect(() => checkInvoicePayment({ total: 1000, paid_amount: 0, has_customer: true })).not.toThrow();
  });

  it('refuses overpaying and a walk-in credit sale', () => {
    expect(code(() => checkInvoicePayment({ total: 1000, paid_amount: 1001, has_customer: true }))).toBe('OVERPAID');
    expect(code(() => checkInvoicePayment({ total: 1000, paid_amount: 999, has_customer: false }))).toBe('CREDIT_NEEDS_CUSTOMER');
  });
});

describe('worked examples', () => {
  it('250 ml of a 1000 ml pack priced at Rs 200 comes to Rs 50', () => {
    const line = calcLine({ qty: 250, unit_price: 20_000, pack_size: 1000, line_discount: 0, tax_rate_bp: 0 });
    expect(line.line_total).toBe(5000);
    expect(formatPaisa(line.line_total)).toBe('Rs 50');
  });

  it('12 packs with batch A holding 8 and batch B holding 10 gives two lines, A first', () => {
    // A expires before B, so the earliest-expiry rule puts A first. B is listed first on purpose.
    const batches = [
      { batch_id: 'B', expiry_date: '2027-06-30', stock: 10_000, cost_price: 41_000 },
      { batch_id: 'A', expiry_date: '2027-01-31', stock: 8000, cost_price: 40_000 },
    ];
    const allocations = allocateBatches({ qty: 12_000, pack_size: 1000, allow_loose: false, today: '2026-10-01', batches });
    expect(allocations).toEqual([
      { batch_id: 'A', qty: 8000 },
      { batch_id: 'B', qty: 4000 },
    ]);

    const costOf = (id: string) => batches.find((b) => b.batch_id === id)!.cost_price;
    const lines = buildInvoiceLines(
      { product_id: 'p', qty: 12_000, unit_price: 50_000, pack_size: 1000, line_discount: 0, tax_rate_bp: 0 },
      allocations.map((a) => ({ ...a, cost_price: costOf(a.batch_id) })),
    );
    expect(lines.map((l) => [l.batch_id, l.qty, l.cost_price, l.line_total])).toEqual([
      ['A', 8000, 40_000, 400_000],
      ['B', 4000, 41_000, 200_000],
    ]);
    expect(calcInvoiceTotals(lines).total).toBe(600_000); // 12 packs at Rs 500
  });
});
