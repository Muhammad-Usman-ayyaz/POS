// Phase 5, M1: what the POS screen stands on. The quote (a cart priced and checked by the core without selling it), a sale that can be requested
// twice without being made twice (request_id), and finding a customer at the counter. Runs on every backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineSaleQuoteTests(make: WorldFactory): void {
  describe('POS foundations', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const bottles = (packs: number, extra: object = {}) => ({ product_id: ID.bottle, qty: packs * 1000, ...extra });
    const quote = (input: object) => s.sale.quote({ created_by: ID.staff, lines: [bottles(1)], ...input });
    const sell = (input: object) => s.sale.create({ created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)], ...input });

    /** The same small deterministic generator as the other property tests: set POS_SEED to repeat a failure. */
    const generator = (seed: number) => {
      let state = seed;
      const random = (): number => {
        state = (state + 0x6d2b79f5) | 0;
        let x = Math.imul(state ^ (state >>> 15), 1 | state);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
      };
      return { random, int: (low: number, high: number) => low + Math.floor(random() * (high - low + 1)) };
    };

    describe('the quote is the sale, to the paisa', () => {
      it('writes nothing: no invoice number used, no stock, no ledger, no audit row, not even a unit of work that changes anything', () => {
        const before = w.snapshot();
        const result = quote({ lines: [bottles(2), { product_id: ID.taxed, qty: 3000 }] });
        expect(result.ok).toBe(true);
        expect(w.snapshot()).toEqual(before);
        expect(sell({}).invoice.invoice_no).toBe('INV-A-000001'); // the quote did not take a number
      });

      it('over 60 random carts (several lines, loose quantities, discounts, taxed goods, batches that split), the quote equals the sale it was made for', () => {
        const seed = Number(process.env['POS_SEED'] ?? 20_261_012);
        const { int, random } = generator(seed);
        w.update('customers', ID.customer, { credit_limit: 0 }); // no limit: the sales are on credit, so any payment is possible
        for (const batch of [ID.bA, ID.bB, ID.bFert, ID.bTaxed]) w.addStock(batch, 1_000_000);
        for (let i = 0; i < 60; i++) {
          const lines: { product_id: string; qty: number; line_discount?: number }[] = [];
          for (let n = int(1, 3); n > 0; n--) {
            const pick = int(0, 2);
            lines.push(pick === 0 ? { product_id: ID.bottle, qty: int(1, 12) * 1000 } : pick === 1 ? { product_id: ID.taxed, qty: int(1, 6) * 1000 } : { product_id: ID.fert, qty: int(1, 3000) });
          }
          // first ask without discounts, to learn each line's price, then give a random discount on some lines
          const plain = quote({ customer_id: ID.customer, lines });
          const discounted = lines.map((l, idx) => (random() < 0.5 ? { ...l, line_discount: int(0, plain.lines[idx]!.gross) } : l));
          const priced = quote({ customer_id: ID.customer, lines: discounted });
          expect(priced.ok, `seed ${seed}, round ${i}`).toBe(true);

          const paid = int(0, priced.total);
          const sold = sell({ customer_id: ID.customer, paid_amount: paid, lines: discounted });
          const where = `seed ${seed}, round ${i}`;
          expect(sold.invoice.subtotal, where).toBe(priced.subtotal);
          expect(sold.invoice.tax_total, where).toBe(priced.tax_total);
          expect(sold.invoice.total, where).toBe(priced.total);
          // every cart line, added up over the invoice rows its batches became
          const quotedBy = new Map<string, { total: number; tax: number; discount: number; qty: number }>();
          for (const l of priced.lines) {
            const e = quotedBy.get(l.product_id) ?? { total: 0, tax: 0, discount: 0, qty: 0 };
            quotedBy.set(l.product_id, { total: e.total + l.line_total, tax: e.tax + l.tax_amount, discount: e.discount + l.line_discount, qty: e.qty + l.qty });
          }
          const soldBy = new Map<string, { total: number; tax: number; discount: number; qty: number }>();
          for (const it of sold.items) {
            const e = soldBy.get(it.product_id) ?? { total: 0, tax: 0, discount: 0, qty: 0 };
            soldBy.set(it.product_id, { total: e.total + it.line_total, tax: e.tax + it.tax_amount, discount: e.discount + it.line_discount, qty: e.qty + it.qty });
          }
          expect(soldBy, where).toEqual(quotedBy);
          // the batches the quote said it would use are the ones the sale used
          const quotedBatches = priced.lines.flatMap((l) => l.batches.map((b) => `${l.product_id}:${b.batch_id}:${b.qty}`)).sort();
          const soldBatches = sold.items.map((it) => `${it.product_id}:${it.batch_id}:${it.qty}`).sort();
          expect(soldBatches, where).toEqual(quotedBatches);
          expect(priced.unpaid, where).toBe(priced.total - priced.paid_amount === 0 ? 0 : priced.unpaid);
        }
      });

      it('a quote with a customer and a payment shows what they would owe afterwards, to the paisa', () => {
        const q = quote({ customer_id: ID.customer, paid_amount: 20_000, lines: [bottles(3)] });
        expect(q).toMatchObject({ total: 150_000, paid_amount: 20_000, unpaid: 130_000 });
        expect(q.customer).toMatchObject({ id: ID.customer, balance: 0, unpaid: 130_000, after_sale: 130_000 });
      });

      it('leaving paid_amount out means paid in full', () => {
        expect(quote({ lines: [bottles(2)] })).toMatchObject({ paid_amount: 100_000, unpaid: 0, ok: true });
      });

      it('never carries a cost, anywhere in the answer', () => {
        const text = JSON.stringify(quote({ customer_id: ID.customer, lines: [bottles(2), { product_id: ID.taxed, qty: 2000 }] }));
        expect(text).not.toMatch(/cost/i);
        expect(text).not.toContain('40000'); // the batches cost 40,000 and 41,000 a pack
        expect(text).not.toContain('41000');
      });
    });

    describe('what is wrong comes back as issues, line by line, not as an error', () => {
      it('a line with not enough stock is an issue on that line, and only the other lines are priced', () => {
        const q = quote({ lines: [bottles(1), bottles(19)] }); // 18 packs are sellable
        expect(q.ok).toBe(false);
        expect(q.issues).toEqual([expect.objectContaining({ scope: 'line', line_index: 1, code: 'INSUFFICIENT_STOCK' })]);
        expect(q.lines.map((l) => l.index)).toEqual([0]);
        expect(q.total).toBe(50_000);
      });

      it('the same codes as the sale would throw: unknown product, switched-off product, part of a pack, an expired batch', () => {
        const q = quote({
          paid_amount: 0,
          customer_id: ID.customer,
          lines: [{ product_id: uuid(999), qty: 1000 }, { product_id: ID.retired, qty: 1000 }, { product_id: ID.bottle, qty: 500 }, bottles(1, { batches: [{ batch_id: ID.bExpired, qty: 1000 }] })],
        });
        expect(q.issues.map((i) => [i.line_index, i.code])).toEqual([[0, 'NOT_FOUND'], [1, 'PRODUCT_INACTIVE'], [2, 'WHOLE_PACKS_ONLY'], [3, 'BATCH_EXPIRED']]);
        expect(q.lines).toEqual([]);
        // and the sale refuses the first of them with the very same code
        expect(codeOf(() => sell({ lines: [{ product_id: uuid(999), qty: 1000 }] }))).toBe('NOT_FOUND');
      });

      it('two lines for the same product cannot both take the same stock: the second one is the issue', () => {
        const q = quote({ lines: [bottles(10), bottles(10)] }); // 18 sellable
        expect(q.issues).toEqual([expect.objectContaining({ line_index: 1, code: 'INSUFFICIENT_STOCK' })]);
      });

      it('a walk-in that does not pay in full, and a payment over the total, are payment issues', () => {
        expect(quote({ paid_amount: 10_000 }).issues).toEqual([expect.objectContaining({ scope: 'payment', code: 'CREDIT_NEEDS_CUSTOMER' })]);
        expect(quote({ paid_amount: 50_001, customer_id: ID.customer }).issues).toEqual([expect.objectContaining({ scope: 'payment', code: 'OVERPAID' })]);
        expect(quote({ paid_amount: 10_000, customer_id: ID.customer }).issues).toEqual([]); // on credit: fine
      });

      it('an unknown customer, a pay-by date in the past, and a manual batch that does not add up are issues too', () => {
        expect(quote({ customer_id: uuid(998) }).issues).toEqual([expect.objectContaining({ scope: 'customer', code: 'NOT_FOUND' })]);
        expect(quote({ customer_id: ID.customer, paid_amount: 0, due_date: w.day(-1) }).issues).toEqual([expect.objectContaining({ scope: 'due_date' })]);
        expect(quote({ lines: [bottles(2, { batches: [{ batch_id: ID.bB, qty: 1000 }] })] }).issues).toEqual([expect.objectContaining({ scope: 'line', line_index: 0, code: 'ALLOCATION_MISMATCH' })]);
      });

      it('a pay-by date of today is fine; yesterday is not', () => {
        expect(quote({ customer_id: ID.customer, paid_amount: 0, due_date: w.day(0) }).issues).toEqual([]);
        expect(quote({ customer_id: ID.customer, paid_amount: 0, due_date: w.day(1) }).issues).toEqual([]);
        expect(quote({ customer_id: ID.customer, paid_amount: 0, due_date: w.day(-1) }).issues).toHaveLength(1);
      });

      it('a bad request is still thrown: an unknown key (a name, a price) and an empty cart are INVALID_INPUT', () => {
        expect(codeOf(() => quote({ lines: [{ ...bottles(1), name_en: 'Fake' }] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => quote({ lines: [{ ...bottles(1), unit_price: 1 }] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => quote({ lines: [] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => quote({ request_id: 'req-00000001' }))).toBe('INVALID_INPUT'); // a quote is not a request to sell
        expect(codeOf(() => s.sale.quote({ created_by: ID.inactive, lines: [bottles(1)] }))).toBe('NOT_AUTHORIZED');
      });
    });

    describe('credit: what they owe, the limit, and what it will be after this sale', () => {
      const owe = (amount: number) => sell({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(amount / 50_000)] });

      it('is over the limit only when the balance plus the unpaid part is MORE than the limit; exactly at it is fine', () => {
        w.update('customers', ID.customer, { credit_limit: 100_000 });
        owe(50_000); // owes 50,000
        const exactly = quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] });
        expect(exactly.customer).toMatchObject({ balance: 50_000, unpaid: 50_000, after_sale: 100_000, credit_limit: 100_000, over_limit: false });
        expect(exactly.issues).toEqual([]);
        const over = quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1), { product_id: ID.fert, qty: 1 }] }); // 1 g more
        expect(over.customer).toMatchObject({ after_sale: 100_020, over_limit: true });
        expect(over.issues).toEqual([expect.objectContaining({ scope: 'credit', code: 'CREDIT_LIMIT_EXCEEDED', params: { limit: 100_000, owed: 50_000, adds: 50_020 } })]);
      });

      it('only the part NOT paid now counts: paying part of it can bring a sale back under the limit', () => {
        w.update('customers', ID.customer, { credit_limit: 100_000 });
        owe(50_000);
        const q = quote({ customer_id: ID.customer, paid_amount: 10_000, lines: [bottles(2)] }); // total 100,000, unpaid 90,000, after 140,000
        expect(q.customer).toMatchObject({ unpaid: 90_000, after_sale: 140_000, over_limit: true });
        const ok = quote({ customer_id: ID.customer, paid_amount: 50_000, lines: [bottles(2)] }); // unpaid 50,000, after 100,000
        expect(ok.customer).toMatchObject({ unpaid: 50_000, after_sale: 100_000, over_limit: false });
      });

      it('a limit of 0 means no limit, and a sale paid in full is never over', () => {
        w.update('customers', ID.customer, { credit_limit: 0 });
        expect(quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(10)] }).customer).toMatchObject({ over_limit: false, credit_limit: 0 });
        w.update('customers', ID.customer, { credit_limit: 10 });
        expect(quote({ customer_id: ID.customer, paid_amount: 100_000, lines: [bottles(2)] }).customer).toMatchObject({ unpaid: 0, over_limit: false });
      });

      it('someone already over their limit who pays this bill in full is not flagged: nothing is added to what they owe', () => {
        w.update('customers', ID.customer, { credit_limit: 100_000 });
        owe(50_000);
        w.update('customers', ID.customer, { credit_limit: 10_000 }); // the limit was lowered after
        const q = quote({ customer_id: ID.customer, paid_amount: 50_000, lines: [bottles(1)] });
        expect(q.customer).toMatchObject({ balance: 50_000, unpaid: 0, after_sale: 50_000, over_limit: false });
        expect(q.issues).toEqual([]);
        expect(() => sell({ customer_id: ID.customer, paid_amount: 50_000, lines: [bottles(1)] })).not.toThrow();
        // paying nothing is flagged, of course
        expect(quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] }).customer!.over_limit).toBe(true);
      });

      it('an opening balance counts, like any other', () => {
        w.update('customers', ID.customer, { credit_limit: 100_000 });
        s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 80_000, created_by: ID.owner });
        const q = quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] });
        expect(q.customer).toMatchObject({ balance: 80_000, after_sale: 130_000, over_limit: true });
      });

      it('the sale agrees with the quote: it refuses exactly when the quote says over the limit', () => {
        w.update('customers', ID.customer, { credit_limit: 60_000 });
        expect(quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(2)] }).customer!.over_limit).toBe(true);
        expect(codeOf(() => sell({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(2)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
        expect(quote({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] }).customer!.over_limit).toBe(false);
        expect(() => sell({ customer_id: ID.customer, paid_amount: 0, lines: [bottles(1)] })).not.toThrow();
      });
    });

    describe('the price type', () => {
      it('is retail by default, wholesale when asked, and the customer\'s own when there is a customer and none was asked', () => {
        expect(quote({}).lines[0]).toMatchObject({ unit_price: 50_000 });
        expect(quote({ price_type: 'wholesale' }).lines[0]).toMatchObject({ unit_price: 45_000 });
        w.update('customers', ID.customer, { default_price_type: 'wholesale' });
        const q = quote({ customer_id: ID.customer, paid_amount: 0 });
        expect(q.price_type).toBe('wholesale');
        expect(q.lines[0]!.unit_price).toBe(45_000);
        expect(quote({ customer_id: ID.customer, paid_amount: 0, price_type: 'retail' }).lines[0]!.unit_price).toBe(50_000);
      });
    });

    describe('batches', () => {
      it('earliest expiry first, naming each batch and how many days it has left', () => {
        const q = quote({ lines: [bottles(10)] }); // 8 from A (120 days), 2 from B (270 days)
        expect(q.lines[0]!.batches.map((b) => [b.batch_no, b.qty, b.days_to_expiry])).toEqual([['A', 8000, 120], ['B', 2000, 270]]);
      });

      it('flags a batch that is near its expiry (within near_expiry_days, 30 by default) and not the others', () => {
        w.update('batches', ID.bA, { expiry_date: w.day(10) });
        const q = quote({ lines: [bottles(10)] });
        expect(q.near_expiry_days).toBe(30);
        expect(q.lines[0]!.batches.map((b) => [b.batch_no, b.near_expiry])).toEqual([['A', true], ['B', false]]);
        w.setSetting('near_expiry_days', '5');
        expect(quote({ lines: [bottles(10)] }).lines[0]!.batches.map((b) => b.near_expiry)).toEqual([false, false]);
        w.setSetting('near_expiry_days', '10');
        expect(quote({ lines: [bottles(1)] }).lines[0]!.batches[0]!.near_expiry).toBe(true); // exactly the last day counts
      });

      it('a manual choice is followed and shown; an expired batch cannot be chosen', () => {
        const q = quote({ lines: [bottles(2, { batches: [{ batch_id: ID.bB, qty: 2000 }] })] });
        expect(q.lines[0]!.batches.map((b) => [b.batch_no, b.qty])).toEqual([['B', 2000]]);
        expect(quote({ lines: [bottles(1, { batches: [{ batch_id: ID.bExpired, qty: 1000 }] })] }).issues[0]).toMatchObject({ code: 'BATCH_EXPIRED' });
      });
    });

    describe('the discount staff may give without the owner', () => {
      const discounted = (discount: number) => quote({ lines: [bottles(1, { line_discount: discount })] }).lines[0]!;

      it('is 5 percent of the line by default; exactly 5 percent is allowed, one paisa more is not', () => {
        expect(quote({}).staff_max_discount_percent).toBe(5);
        expect(discounted(2500)).toMatchObject({ gross: 50_000, line_discount: 2500, discount_over_limit: false });
        expect(discounted(2501).discount_over_limit).toBe(true);
        expect(discounted(0).discount_over_limit).toBe(false);
      });

      it('follows the setting, including 0 (no discount without the owner) and 100', () => {
        w.setSetting('staff_max_discount_percent', '10');
        expect(quote({}).staff_max_discount_percent).toBe(10);
        expect(discounted(5000).discount_over_limit).toBe(false);
        expect(discounted(5001).discount_over_limit).toBe(true);
        w.setSetting('staff_max_discount_percent', '0');
        expect(discounted(1).discount_over_limit).toBe(true);
        w.setSetting('staff_max_discount_percent', '100');
        expect(discounted(50_000).discount_over_limit).toBe(false);
      });

      it('is judged on the price BEFORE the discount, for the whole line, loose or in packs, at the price in force', () => {
        // 500 g of fertilizer at Rs 200 a kg is Rs 100 (10,000 paisa): 5 percent is 500
        const fert = (d: number) => quote({ lines: [{ product_id: ID.fert, qty: 500, line_discount: d }] }).lines[0]!;
        expect(fert(500)).toMatchObject({ gross: 10_000, discount_over_limit: false });
        expect(fert(501).discount_over_limit).toBe(true);
        expect(quote({ price_type: 'wholesale', lines: [bottles(1, { line_discount: 2250 })] }).lines[0]!.discount_over_limit).toBe(false); // 5 percent of 45,000
        expect(quote({ price_type: 'wholesale', lines: [bottles(1, { line_discount: 2251 })] }).lines[0]!.discount_over_limit).toBe(true);
      });

      it('a discount above the whole line is refused by the sale (the line cannot be given away for less than nothing)', () => {
        expect(quote({ lines: [bottles(1, { line_discount: 50_001 })] }).issues[0]).toMatchObject({ code: 'DISCOUNT_EXCEEDS_LINE' });
        expect(codeOf(() => sell({ lines: [bottles(1, { line_discount: 50_001 })] }))).toBe('DISCOUNT_EXCEEDS_LINE');
      });

      it('the owner\'s approval is checked and written to the audit log when it is given', () => {
        const owner = sell({ paid_amount: 40_000, lines: [bottles(1, { line_discount: 10_000 })], discount_override: { approved_by: ID.owner } });
        const row = w.rows('audit_log').find((a) => a.action === 'discount_override')!;
        expect(row).toMatchObject({ user_id: ID.owner, table_name: 'invoices', row_id: owner.invoice.id });
        expect(JSON.parse(row.details as string)).toEqual({ lines: [{ product_id: ID.bottle, discount: 10_000, gross: 50_000 }] });
        // only an active owner can stand behind it
        expect(codeOf(() => sell({ paid_amount: 40_000, lines: [bottles(1, { line_discount: 10_000 })], discount_override: { approved_by: ID.staff } }))).toBe('NOT_AUTHORIZED');
      });
    });

    describe('request_id: the same request twice is one sale', () => {
      const REQ = 'req-0000-0001';
      const counts = () => ({
        invoices: w.rows('invoices').length,
        items: w.rows('invoice_items').length,
        movements: w.rows('stock_movements').length,
        ledger: w.rows('ledger_entries').length,
        payments: w.rows('payments').length,
        audit: w.rows('audit_log').length,
      });

      it('a second request with the same id returns the invoice already made, marked as a replay, and writes nothing', () => {
        const movementsBefore = counts().movements;
        const first = sell({ request_id: REQ });
        const written = w.snapshot();
        const second = sell({ request_id: REQ });
        expect(second.replayed).toBe(true);
        expect(first.replayed).toBeUndefined();
        expect(second.invoice.id).toBe(first.invoice.id);
        expect(second.invoice.invoice_no).toBe('INV-A-000001');
        expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
        expect(second.items[0]).toMatchObject({ name_en: 'Insecticide 1L' }); // the lines and their names come back too, for the receipt
        expect(w.snapshot()).toEqual(written);
        expect(counts()).toMatchObject({ invoices: 1, items: 1, movements: movementsBefore + 1 });
        expect(w.stockOf(ID.bA)).toBe(7000); // sold once
      });

      it('a sale on credit is not made twice either: one ledger entry, one payment', () => {
        const input = { request_id: REQ, customer_id: ID.customer, paid_amount: 20_000, lines: [bottles(2)] };
        sell(input);
        const after = counts();
        const again = sell(input);
        expect(again.replayed).toBe(true);
        expect(again.payment_id).toBeNull(); // not recoverable for a replay; the receipt is built from the invoice
        expect(counts()).toEqual(after);
        expect(s.khata.balance(ID.customer)).toBe(80_000);
      });

      it('a retry after the price changed is still the same sale', () => {
        const first = sell({ request_id: REQ });
        w.update('products', ID.bottle, { retail_price: 60_000 });
        const again = sell({ request_id: REQ });
        expect(again.replayed).toBe(true);
        expect(again.invoice.total).toBe(first.invoice.total);
        expect(counts().invoices).toBe(1);
      });

      it('the same id for a DIFFERENT sale is refused (REQUEST_ID_REUSED) and nothing is written: different goods, amount, customer or seller', () => {
        sell({ request_id: REQ, customer_id: ID.customer, paid_amount: 0 });
        const written = w.snapshot();
        const attempts: Record<string, object> = {
          'other quantity': { lines: [bottles(2)] },
          'other product': { lines: [{ product_id: ID.taxed, qty: 1000 }] },
          'an extra line': { lines: [bottles(1), { product_id: ID.fert, qty: 250 }] },
          'other amount paid': { paid_amount: 1000 },
          'no customer': { customer_id: undefined, paid_amount: 50_000 },
          'other seller': { created_by: ID.owner },
        };
        for (const [name, change] of Object.entries(attempts)) {
          const error = errorOf(() => sell({ request_id: REQ, customer_id: ID.customer, paid_amount: 0, ...change }));
          expect(error.code, name).toBe('REQUEST_ID_REUSED');
          expect(error.params, name).toEqual({ invoice_no: 'INV-A-000001' });
        }
        expect(w.snapshot()).toEqual(written);
      });

      it('the same id with another customer, or with only some of the goods, is also a different sale (not handed back as the first)', () => {
        const other = w.addCustomer({ name_en: 'Other' });
        sell({ request_id: REQ, customer_id: ID.customer, paid_amount: 0, lines: [bottles(1), { product_id: ID.fert, qty: 250 }] });
        const written = w.snapshot();
        const same = { request_id: REQ, customer_id: ID.customer, paid_amount: 0 };
        expect(codeOf(() => sell({ ...same, customer_id: other, lines: [bottles(1), { product_id: ID.fert, qty: 250 }] }))).toBe('REQUEST_ID_REUSED');
        expect(codeOf(() => sell({ ...same, lines: [bottles(1)] }))).toBe('REQUEST_ID_REUSED'); // only part of what was sold
        expect(codeOf(() => sell({ ...same, lines: [{ product_id: ID.fert, qty: 250 }] }))).toBe('REQUEST_ID_REUSED');
        expect(sell({ ...same, lines: [bottles(1), { product_id: ID.fert, qty: 250 }] }).replayed).toBe(true); // the real repeat still works
        expect(w.snapshot()).toEqual(written);
      });

      it('without a request id there is no such protection: the same sale twice is two sales (the screen always sends one)', () => {
        sell({});
        sell({});
        expect(counts().invoices).toBe(2);
      });

      it('two different ids are two sales', () => {
        sell({ request_id: 'req-0000-0001' });
        sell({ request_id: 'req-0000-0002' });
        expect(counts().invoices).toBe(2);
      });

      it('an id that is too short or too long is refused', () => {
        expect(codeOf(() => sell({ request_id: 'short' }))).toBe('INVALID_INPUT');
        expect(codeOf(() => sell({ request_id: 'x'.repeat(101) }))).toBe('INVALID_INPUT');
      });

      it('a sale that fails leaves no id behind: the retry with the same id goes through', () => {
        expect(codeOf(() => sell({ request_id: REQ, lines: [bottles(19)] }))).toBe('INSUFFICIENT_STOCK');
        expect(counts().invoices).toBe(0);
        w.addStock(ID.bA, 5000);
        expect(sell({ request_id: REQ, lines: [bottles(19)], paid_amount: 950_000 }).replayed).toBeUndefined();
        expect(counts().invoices).toBe(1);
      });

      it('the invoice keeps its request id, and the id of a different sale is not confused with it', () => {
        const first = sell({ request_id: REQ });
        expect(w.rows('invoices')[0]).toMatchObject({ id: first.invoice.id, request_id: REQ });
        expect(sell({}).invoice.request_id).toBeNull();
      });
    });

    describe('finding a customer at the counter', () => {
      beforeEach(() => {
        w.update('customers', ID.customer, { name_en: 'Rashid', name_ur: 'راشد', village: 'Chak 12', phone: '0300-1111111', credit_limit: 1_000_000 });
        w.addCustomer({ name_en: 'Imran Ali', name_ur: 'عمران', village: 'Chak 45', phone: '0301-7654321', credit_limit: 2_000_000, default_price_type: 'wholesale' });
        w.addCustomer({ name_en: 'Bashir', name_ur: 'بشیر', village: 'Chak 7', credit_limit: 0 });
        w.addCustomer({ name_en: null, name_ur: 'ساجد', village: null });
      });
      const names = (query: string, limit?: number) => s.customers.search({ query, ...(limit ? { limit } : {}) }).map((c) => c.name_en ?? c.name_ur);

      it('by name in English or Urdu, by village, by phone, ignoring case, spaces and Arabic-Indic digits', () => {
        expect(names('rash')).toEqual(['Rashid']);
        expect(names('راشد')).toEqual(['Rashid']);
        expect(names('CHAK 45')).toEqual(['Imran Ali']);
        expect(names('7654321')).toEqual(['Imran Ali']);
        expect(names('۰۳۰۰')).toEqual(['Rashid']); // Urdu digits
        expect(names('٠٣٠١')).toEqual(['Imran Ali']); // Eastern Arabic digits
        expect(names('ali imran')).toEqual(['Imran Ali']); // every word, in any order
        expect(names('nobody')).toEqual([]);
      });

      it('a customer with only an Urdu name is found and listed', () => {
        expect(names('ساجد')).toEqual(['ساجد']);
      });

      it('an empty search lists customers by name; the limit is kept; a name starting with the word comes before one that merely contains it', () => {
        expect(names('')).toEqual(['Bashir', 'Imran Ali', 'Rashid', 'ساجد']);
        expect(names('', 2)).toEqual(['Bashir', 'Imran Ali']);
        w.addCustomer({ name_en: 'Abdul Rashid' });
        expect(names('rashid')).toEqual(['Rashid', 'Abdul Rashid']);
      });

      it('each answer says the usual price type, the limit, and what they owe now (opening balance and sales on credit included)', () => {
        s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 120_000, created_by: ID.owner });
        sell({ customer_id: ID.customer, paid_amount: 10_000, lines: [bottles(1)] }); // owes 40,000 more
        const [rashid] = s.customers.search({ query: 'rashid' });
        expect(rashid).toMatchObject({ id: ID.customer, village: 'Chak 12', phone: '0300-1111111', default_price_type: 'retail', credit_limit: 1_000_000, balance: 160_000 });
        expect(s.customers.search({ query: 'imran' })[0]).toMatchObject({ default_price_type: 'wholesale', credit_limit: 2_000_000, balance: 0 });
      });

      it('without a limit it lists 20, no more, no fewer', () => {
        for (let i = 0; i < 25; i++) w.addCustomer({ name_en: `Extra ${String(i).padStart(2, '0')}` });
        expect(s.customers.search({}).length).toBe(20);
        expect(s.customers.search({ limit: 50 }).length).toBe(29);
      });

      it('a customer that has been deleted is not offered', () => {
        w.update('customers', ID.customer, { deleted_at: '2026-01-01T00:00:00.000Z' });
        expect(names('rashid')).toEqual([]);
      });

      it('is read-only and strict: nothing is written, and an unknown key or a silly limit is refused', () => {
        const before = w.snapshot();
        s.customers.search({ query: 'a' });
        expect(w.snapshot()).toEqual(before);
        expect(codeOf(() => s.customers.search({ query: 'a', balance: 1 } as never))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.search({ limit: 0 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.search({ limit: 51 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.search({ query: 'x'.repeat(101) }))).toBe('INVALID_INPUT');
      });

      it('is one unit of work', () => {
        const before = w.runs();
        s.customers.search({ query: 'a' });
        expect(w.runs()).toBe(before + 1);
      });
    });
  });
}
