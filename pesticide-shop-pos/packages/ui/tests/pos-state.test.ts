// The POS bill without any React: the cart and the exact requests that are sent.
import { SaleCreateInput, SaleQuoteInput, ApprovalRequestInput } from '@pos/api-contract';
import { describe, expect, it } from 'vitest';
import {
  actionsFromParams,
  addDays,
  addSize,
  approvalSubject,
  groupDigits,
  groupTyped,
  groupedRupeesText,
  newRequestId,
  paidFromText,
  quoteKey,
  quoteRequest,
  saleLines,
  saleRequest,
  setBatch,
  setDiscount,
  stepOf,
  stepQty,
  tidyPaidText,
  type BillDraft,
  type SizePick,
} from '../src/pages/pos/pos-state.js';

const litre: SizePick = { productId: '11111111-1111-4111-8111-111111111111', nameEn: 'Insecticide', nameUr: null, label: '1 L', packSize: 1000, allowLoose: false, baseUnit: 'ml' };
const kilo: SizePick = { productId: '22222222-2222-4222-8222-222222222222', nameEn: 'Fertilizer', nameUr: null, label: '1 kg', packSize: 1000, allowLoose: true, baseUnit: 'g' };
const bill: BillDraft = { customerId: '33333333-3333-4333-8333-333333333333', priceType: 'retail', method: 'bank', reference: ' TX-9 ', dueDate: '2026-11-30' };

describe('the cart', () => {
  it('adds one pack, and one more pack of the same size on a second press', () => {
    const once = addSize([], litre);
    expect(once.map((l) => l.qty)).toEqual([1000]);
    const twice = addSize(once, litre);
    expect(twice).toHaveLength(1);
    expect(twice[0]!.qty).toBe(2000);
  });

  it('steps a sealed size by whole packs, a loose size in small steps, and never below one step', () => {
    expect(stepOf(litre)).toBe(1000);
    expect(stepOf(kilo)).toBe(50);
    const [line] = addSize([], kilo);
    expect(stepQty([line!], line!.key, -1)[0]!.qty).toBe(950);
    const one = addSize([], litre);
    expect(stepQty(one, one[0]!.key, -1)[0]!.qty).toBe(1000);
  });
});

describe('the requests', () => {
  const cart = (() => {
    let c = addSize(addSize([], litre), kilo);
    c = setDiscount(c, c[0]!.key, 2_500);
    c = setBatch(c, c[1]!.key, '44444444-4444-4444-8444-444444444444');
    return c;
  })();

  it('leave out a discount of 0 and the automatic batch, and send a hand-picked batch for the whole line', () => {
    expect(saleLines(cart)).toEqual([
      { product_id: litre.productId, qty: 1000, line_discount: 2_500 },
      { product_id: kilo.productId, qty: 1000, batches: [{ batch_id: '44444444-4444-4444-8444-444444444444', qty: 1000 }] },
    ]);
  });

  it('the quote and the sale pass the shell strict contract', () => {
    expect(() => SaleQuoteInput.parse(quoteRequest(cart, bill, null))).not.toThrow();
    expect(() => SaleQuoteInput.parse(quoteRequest(cart, bill, 10_000))).not.toThrow();
    expect(() => SaleCreateInput.parse(saleRequest(cart, bill, 10_000, { requestId: newRequestId(), approvalToken: 'a'.repeat(32), creditOverride: true }))).not.toThrow();
  });

  it('a reference is trimmed and sent only for a method that has one; a walk-in sale has no customer or due date', () => {
    expect(quoteRequest(cart, bill, null)).toMatchObject({ reference_no: 'TX-9', due_date: '2026-11-30', customer_id: bill.customerId });
    expect(quoteRequest(cart, { ...bill, method: 'cash' }, null)).not.toHaveProperty('reference_no');
    const walkIn = quoteRequest(cart, { ...bill, customerId: null }, null);
    expect(walkIn).not.toHaveProperty('customer_id');
    expect(walkIn).not.toHaveProperty('due_date');
  });

  it('an approval is for exactly the cart and the amount, and passes the shell strict contract', () => {
    const subject = approvalSubject(cart, bill, 10_000);
    expect(subject).toEqual({ customer_id: bill.customerId, price_type: 'retail', paid_amount: 10_000, lines: saleLines(cart) });
    expect(() => ApprovalRequestInput.parse({ username: 'owner', password: 'secret-pass', actions: ['credit_override'], sale: subject })).not.toThrow();
  });

  it('a quote is old as soon as anything it depends on changes', () => {
    const base = quoteKey(cart, bill, null);
    expect(quoteKey(cart, bill, null)).toBe(base);
    expect(quoteKey(cart, { ...bill, priceType: 'wholesale' }, null)).not.toBe(base);
    expect(quoteKey(cart, bill, '100')).not.toBe(base);
    expect(quoteKey(setDiscount(cart, cart[0]!.key, 0), bill, null)).not.toBe(base);
    expect(quoteKey(cart, { ...bill, customerId: null }, null)).not.toBe(base);
  });
});

describe('small helpers', () => {
  it('reads the amount paid: empty is paid in full, junk is invalid', () => {
    expect(paidFromText(null)).toBeNull();
    expect(paidFromText('  ')).toBeNull();
    expect(paidFromText('1,000')).toBe(100_000);
    expect(paidFromText('12.5')).toBe(1_250);
    expect(paidFromText('abc')).toBe('invalid');
    expect(paidFromText('-5')).toBe('invalid');
  });

  it('adds days on the calendar date', () => {
    expect(addDays('2026-10-12', 30)).toBe('2026-11-11');
    expect(addDays('2026-12-15', 30)).toBe('2027-01-14');
  });

  it('makes a different request id for each bill', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(8);
  });

  it('reads the actions out of an APPROVAL_REQUIRED reply', () => {
    expect(actionsFromParams('credit_override,discount_override')).toEqual(['credit_override', 'discount_override']);
    expect(actionsFromParams('nonsense')).toEqual([]);
    expect(actionsFromParams(undefined)).toEqual([]);
  });
});

describe('the Paid now text: thousands separators, as in the design ("1,000")', () => {
  it('groupedRupeesText: whole rupees get separators, paisa show only when there are some', () => {
    expect(groupedRupeesText(0)).toBe('0');
    expect(groupedRupeesText(99_900)).toBe('999');
    expect(groupedRupeesText(100_000)).toBe('1,000');
    expect(groupedRupeesText(105_050)).toBe('1,050.50');
    expect(groupedRupeesText(123_456_700)).toBe('1,234,567');
    expect(groupDigits(9750)).toBe('9,750');
  });

  it('groupTyped puts the separators in as the amount is typed and leaves the paisa and anything else as typed', () => {
    expect(groupTyped('1000')).toBe('1,000');
    expect(groupTyped('1,000')).toBe('1,000');
    expect(groupTyped('10000')).toBe('10,000');
    expect(groupTyped('1,0000')).toBe('10,000'); // a comma in the wrong place is mended
    expect(groupTyped('1000.')).toBe('1,000.');
    expect(groupTyped('1000.5')).toBe('1,000.5'); // not rewritten to .50 while typing
    expect(groupTyped('1000.50')).toBe('1,000.50');
    expect(groupTyped('')).toBe('');
    expect(groupTyped('12ab')).toBe('12ab');
    expect(groupTyped('1.234')).toBe('1.234');
    expect(groupTyped('Rs 1000')).toBe('Rs 1000');
  });

  it('tidyPaidText completes the paisa when the field is left, and leaves non-amounts and empty text alone', () => {
    expect(tidyPaidText('1000.5')).toBe('1,000.50');
    expect(tidyPaidText('1,000')).toBe('1,000');
    expect(tidyPaidText('abc')).toBe('abc');
    expect(tidyPaidText('')).toBe('');
    expect(tidyPaidText('  ')).toBe('  ');
  });

  it('1000 and 1,000 are the same bill: the quote key does not change when the text is tidied', () => {
    const cart = addSize([], litre);
    const draft: BillDraft = { customerId: null, priceType: 'retail', method: 'cash', reference: '', dueDate: '' };
    expect(quoteKey(cart, draft, '1000')).toBe(quoteKey(cart, draft, '1,000'));
    expect(quoteKey(cart, draft, '1000')).not.toBe(quoteKey(cart, draft, '1001'));
    expect(quoteKey(cart, draft, null)).not.toBe(quoteKey(cart, draft, '0'));
  });
});
