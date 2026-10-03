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

  it('0 percent tax: 10 bottles at Rs 500 is Rs 5000, with no tax in it (the same as before tax was included)', () => {
    expect(calcLine({ ...base, qty: 10_000, unit_price: 50_000 })).toEqual({
      gross: 500_000,
      line_discount: 0,
      line_total: 500_000,
      tax_amount: 0,
      net: 500_000,
    });
  });

  it('a line of Rs 1,180 at 18 percent is Rs 1,180: Rs 180 tax and Rs 1,000 without it', () => {
    expect(calcLine({ qty: 1000, unit_price: 118_000, pack_size: 1000, line_discount: 0, tax_rate_bp: 1800 })).toEqual({
      gross: 118_000,
      line_discount: 0,
      line_total: 118_000, // tax is NOT added on top
      tax_amount: 18_000,
      net: 100_000,
    });
  });

  it('250 g loose at Rs 200/kg is Rs 50', () => {
    expect(calcLine({ ...base, qty: 250, unit_price: 20_000 }).line_total).toBe(5000);
  });

  it('a discounted taxed line: the discount comes off the price, and the tax is taken out of what is left', () => {
    // 500000 - 10000 = 490000 paid. Tax inside: 490000 * 1800 / 11800 = 74745.76 -> 74746. Without tax: 415254.
    expect(calcLine({ qty: 10_000, unit_price: 50_000, pack_size: 1000, line_discount: 10_000, tax_rate_bp: 1800 })).toEqual({
      gross: 500_000,
      line_discount: 10_000,
      line_total: 490_000,
      tax_amount: 74_746,
      net: 415_254,
    });
  });

  it('follows the documented formula: line_total = ROUND(qty*price/pack) - discount, tax_amount = ROUND(line_total*rate/(10000+rate))', () => {
    const r = calcLine({ qty: 333, unit_price: 12_345, pack_size: 1000, line_discount: 100, tax_rate_bp: 1800 });
    expect(r.gross).toBe(Math.round((333 * 12_345) / 1000)); // 4110.885 -> 4111
    expect(r.line_total).toBe(r.gross - 100); // 4011: no tax added
    expect(r.tax_amount).toBe(Math.round((r.line_total * 1800) / 11_800)); // 611.8 -> 612
    expect(r.tax_amount).toBe(612);
    expect(r.net).toBe(r.line_total - r.tax_amount);
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

  it('applies the product tax rate to every row, and tax does not change what the rows cost', () => {
    const lines = buildInvoiceLines({ ...cart, tax_rate_bp: 1800 }, twoBatches);
    expect(lines.map((l) => l.line_total)).toEqual([150_000, 50_000]); // the same as at 0 percent
    expect(lines.map((l) => l.tax_amount)).toEqual([22_881, 7627]); // 150000*1800/11800 = 22881.4, 50000*1800/11800 = 7627.1
    expect(lines.every((l) => l.tax_rate_bp === 1800)).toBe(true);
  });

  it('a taxed line over two batches: each row takes its share of the discount, then its tax out of its own total', () => {
    // 4 packs at Rs 1,180: rows 3 packs (354000) and 1 pack (118000). Discount 1000 shared 750 / 250.
    const taxed: CartLine = { ...cart, unit_price: 118_000, line_discount: 1000, tax_rate_bp: 1800 };
    const lines = buildInvoiceLines(taxed, twoBatches);
    expect(lines.map((l) => [l.batch_id, l.line_discount, l.line_total, l.tax_amount])).toEqual([
      ['B', 750, 353_250, 53_886], // 353250 * 1800 / 11800 = 53885.6
      ['A', 250, 117_750, 17_962], // 117750 * 1800 / 11800 = 17961.9
    ]);
    expect(calcInvoiceTotals(lines)).toEqual({ subtotal: 399_152, tax_total: 71_848, total: 471_000 });
    expect(471_000).toBe(4 * 118_000 - 1000); // the customer pays the price less the discount, whatever the split
  });

  it('rejects batches that do not add up to the line, and a discount over the price', () => {
    expect(code(() => buildInvoiceLines(cart, [{ batch_id: 'A', qty: 1000, cost_price: 1 }]))).toBe('ALLOCATION_MISMATCH');
    expect(code(() => buildInvoiceLines({ ...cart, line_discount: 200_001 }, twoBatches))).toBe('DISCOUNT_EXCEEDS_LINE');
  });
});

describe('calcInvoiceTotals', () => {
  it('subtotal is the lines without their tax, tax_total is the tax inside them, and the total is the lines as priced', () => {
    expect(
      calcInvoiceTotals([
        { line_total: 490_000, tax_amount: 74_746 },
        { line_total: 5000, tax_amount: 0 },
      ]),
    ).toEqual({ subtotal: 420_254, tax_total: 74_746, total: 495_000 });
  });

  it('rounding each line cannot make subtotal + tax_total differ from the sum of the line totals', () => {
    // Three lines of 5 paisa at 18 percent: each holds 0.76 paisa of tax, rounded to 1. Taking the tax of the whole 15 paisa
    // instead would give 2, not 3. Only the per-line figures are stored, so they are what the invoice adds up.
    const lines = [1, 2, 3].map(() => calcLine({ qty: 1, unit_price: 5, pack_size: 1, line_discount: 0, tax_rate_bp: 1800 }));
    expect(lines.map((l) => [l.line_total, l.tax_amount, l.net])).toEqual([[5, 1, 4], [5, 1, 4], [5, 1, 4]]);
    const totals = calcInvoiceTotals(lines);
    expect(totals).toEqual({ subtotal: 12, tax_total: 3, total: 15 });
    expect(totals.subtotal + totals.tax_total).toBe(lines.reduce((s, l) => s + l.line_total, 0));
  });

  it('the line without its tax is the line total minus the tax, never rounded separately (it would invent a paisa)', () => {
    // At 100 percent a 1 paisa line holds 0.5 paisa of tax and 0.5 without: both would round up to 1, making 2 paisa.
    const line = calcLine({ qty: 1, unit_price: 1, pack_size: 1, line_discount: 0, tax_rate_bp: 10_000 });
    expect(line).toMatchObject({ line_total: 1, tax_amount: 1, net: 0 });
    expect(calcInvoiceTotals([line])).toEqual({ subtotal: 0, tax_total: 1, total: 1 });
  });

  it('holds for 2000 odd invoices: the total is always the sum of the line totals, and each tax is part of its own line', () => {
    let seed = 12_345;
    const next = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    const rates = [0, 500, 1800, 2500, 10_000];
    for (let n = 0; n < 2000; n++) {
      const lines = Array.from({ length: 1 + next(4) }, () => {
        const gross = 1 + next(300_000);
        return calcLine({ qty: 1, unit_price: gross, pack_size: 1, line_discount: next(gross + 1), tax_rate_bp: rates[next(rates.length)]! });
      });
      const t = calcInvoiceTotals(lines);
      const sum = lines.reduce((s, l) => s + l.line_total, 0);
      expect(t.subtotal + t.tax_total).toBe(sum);
      expect(t.total).toBe(sum);
      for (const l of lines) expect(l.tax_amount >= 0 && l.tax_amount <= l.line_total && l.net === l.line_total - l.tax_amount).toBe(true);
    }
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
