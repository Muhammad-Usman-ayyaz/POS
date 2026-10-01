import { describe, expect, it } from 'vitest';
import { buildInvoiceLines, DomainError, planReturn, refundFor, returnableQty, type SoldLine } from '../src/index.js';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : `not a DomainError: ${String(e)}`;
  }
  return undefined;
};

// The worked example from the schema checks: 10 bottles (10000 ml) sold at Rs 500 each.
const tenSold: SoldLine = { invoice_item_id: 'ii1', qty: 10_000, line_total: 500_000, qty_returned: 0 };

describe('10 sold, 2 returned', () => {
  it('2 bottles come back: Rs 1000 refunded, 8 bottles still returnable', () => {
    const plan = planReturn({
      invoice_status: 'active',
      lines: [tenSold],
      requested: [{ invoice_item_id: 'ii1', qty: 2000, condition: 'resellable' }],
    });
    expect(plan).toEqual({
      lines: [{ invoice_item_id: 'ii1', qty: 2000, refund_amount: 100_000, condition: 'resellable', restock: true }],
      total: 100_000,
    });
    expect(returnableQty({ ...tenSold, qty_returned: 2000 })).toBe(8000);
  });

  it('after that, returning 9 bottles is blocked and returning the last 8 is allowed', () => {
    const afterFirst = { ...tenSold, qty_returned: 2000 };
    expect(
      code(() => planReturn({ invoice_status: 'active', lines: [afterFirst], requested: [{ invoice_item_id: 'ii1', qty: 9000, condition: 'resellable' }] })),
    ).toBe('RETURN_EXCEEDS_SOLD');

    const rest = planReturn({ invoice_status: 'active', lines: [afterFirst], requested: [{ invoice_item_id: 'ii1', qty: 8000, condition: 'resellable' }] });
    expect(rest.total).toBe(400_000);
    // Rs 1000 + Rs 4000 = the full Rs 5000 the customer paid for the line
    expect(100_000 + rest.total).toBe(tenSold.line_total);
  });

  it('the error says how many can still be returned', () => {
    const afterFirst = { ...tenSold, qty_returned: 2000 };
    expect(() =>
      planReturn({ invoice_status: 'active', lines: [afterFirst], requested: [{ invoice_item_id: 'ii1', qty: 9000, condition: 'damaged' }] }),
    ).toThrow(/only 8000 can still be returned/);
  });
});

describe('refundFor', () => {
  it('refunds at the price charged, with discount and tax coming back in proportion', () => {
    // 10 bottles, Rs 100 discount, 18% tax: the customer paid 578200 for the line
    const [row] = buildInvoiceLines(
      { product_id: 'p', qty: 10_000, unit_price: 50_000, pack_size: 1000, line_discount: 10_000, tax_rate_bp: 1800 },
      [{ batch_id: 'A', qty: 10_000, cost_price: 40_000 }],
    );
    const line: SoldLine = { invoice_item_id: 'x', qty: row!.qty, line_total: row!.line_total, qty_returned: 0 };
    expect(line.line_total).toBe(578_200);
    expect(refundFor(line, 2000)).toBe(115_640); // one fifth
    expect(refundFor(line, 10_000)).toBe(578_200);
  });

  it('several partial returns add up to exactly the line total, never a paisa more', () => {
    const line: SoldLine = { invoice_item_id: 'x', qty: 3, line_total: 1000, qty_returned: 0 };
    const refunds: number[] = [];
    for (let i = 0; i < 3; i++) {
      refunds.push(refundFor({ ...line, qty_returned: i }, 1));
    }
    expect(refunds).toEqual([333, 334, 333]);
    expect(refunds.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('returning everything in one go or in two steps gives the same total', () => {
    const line: SoldLine = { invoice_item_id: 'x', qty: 7000, line_total: 12_345, qty_returned: 0 };
    const oneGo = refundFor(line, 7000);
    const first = refundFor(line, 2500);
    const second = refundFor({ ...line, qty_returned: 2500 }, 4500);
    expect(first + second).toBe(oneGo);
    expect(oneGo).toBe(12_345);
  });
});

describe('planReturn', () => {
  const lines: SoldLine[] = [
    { invoice_item_id: 'a', qty: 2000, line_total: 100_000, qty_returned: 0 },
    { invoice_item_id: 'b', qty: 1000, line_total: 20_000, qty_returned: 0 },
  ];

  it('totals several lines and marks only resellable goods for restocking', () => {
    const plan = planReturn({
      invoice_status: 'active',
      lines,
      requested: [
        { invoice_item_id: 'a', qty: 1000, condition: 'resellable' },
        { invoice_item_id: 'b', qty: 1000, condition: 'damaged' },
      ],
    });
    expect(plan.lines.map((l) => [l.invoice_item_id, l.refund_amount, l.restock])).toEqual([
      ['a', 50_000, true],
      ['b', 20_000, false],
    ]);
    expect(plan.total).toBe(70_000);
  });

  it('expired goods are not restocked either', () => {
    const plan = planReturn({ invoice_status: 'active', lines, requested: [{ invoice_item_id: 'a', qty: 500, condition: 'expired' }] });
    expect(plan.lines[0]?.restock).toBe(false);
  });

  it('refuses a voided invoice, an empty return, an item from another invoice, a repeated item and a bad quantity', () => {
    const ok = [{ invoice_item_id: 'a', qty: 1000, condition: 'resellable' as const }];
    expect(code(() => planReturn({ invoice_status: 'voided', lines, requested: ok }))).toBe('INVOICE_VOIDED');
    expect(code(() => planReturn({ invoice_status: 'active', lines, requested: [] }))).toBe('EMPTY_RETURN');
    expect(code(() => planReturn({ invoice_status: 'active', lines, requested: [{ ...ok[0]!, invoice_item_id: 'zzz' }] }))).toBe('ITEM_NOT_ON_INVOICE');
    expect(code(() => planReturn({ invoice_status: 'active', lines, requested: [...ok, ...ok] }))).toBe('DUPLICATE_LINE');
    expect(code(() => planReturn({ invoice_status: 'active', lines, requested: [{ ...ok[0]!, qty: 0 }] }))).toBe('INVALID_QUANTITY');
    expect(code(() => planReturn({ invoice_status: 'active', lines, requested: [{ ...ok[0]!, qty: 1.5 }] }))).toBe('INVALID_QUANTITY');
  });

  it('a fully returned line cannot be returned again', () => {
    const done: SoldLine[] = [{ invoice_item_id: 'a', qty: 2000, line_total: 100_000, qty_returned: 2000 }];
    expect(
      code(() => planReturn({ invoice_status: 'active', lines: done, requested: [{ invoice_item_id: 'a', qty: 1, condition: 'resellable' }] })),
    ).toBe('RETURN_EXCEEDS_SOLD');
  });
});
