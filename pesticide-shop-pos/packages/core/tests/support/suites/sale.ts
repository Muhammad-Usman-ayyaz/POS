import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calcInvoiceTotals } from '../../../src/index.js';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineSaleTests(make: WorldFactory): void {
  describe('sale', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const bottles = (packs: number, extra: object = {}) => ({ product_id: ID.bottle, qty: packs * 1000, ...extra });
    const sale = (input: object) => s.sale.create({ created_by: ID.staff, paid_amount: 0, lines: [bottles(1)], ...input });
    const creditSale = (input: object = {}) => sale({ customer_id: ID.customer, ...input });
    const last = (table: Parameters<ServiceWorld['rows']>[0]) => w.rows(table).at(-1);
    const setLimit = (limit: number) => w.update('customers', ID.customer, { credit_limit: limit });

    describe('walk-in sale', () => {
      it('writes the invoice, the line and the stock movement, and nothing else', () => {
        const result = sale({ paid_amount: 100_000, lines: [bottles(2)] });

        expect(result.invoice).toMatchObject({
          invoice_no: 'INV-A-000001', customer_id: null, status: 'active', price_type: 'retail', payment_method: 'cash',
          subtotal: 100_000, tax_total: 0, total: 100_000, paid_amount: 100_000, due_date: null,
          void_reason: null, voided_by: null, shop_id: ID.scope.shop_id, device_id: ID.scope.device_id,
        });
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ batch_id: ID.bA, qty: 2000, unit_price: 50_000, cost_price: 40_000, line_total: 100_000 });

        expect(last('stock_movements')).toMatchObject({ batch_id: ID.bA, qty_delta: -2000, movement_type: 'sale', ref_type: 'invoice', ref_id: result.invoice.id, created_by: ID.staff });
        expect(w.stockOf(ID.bA)).toBe(6000);

        // The money lives on the invoice. No payment or ledger row without a customer.
        expect(w.rows('payments')).toHaveLength(0);
        expect(w.rows('ledger_entries')).toHaveLength(0);
        expect(result.payment_id).toBeNull();
      });

      it('is stored as the invoice the database holds', () => {
        const result = sale({ paid_amount: 100_000, lines: [bottles(2)] });
        expect(w.rows('invoices')).toEqual([expect.objectContaining({ id: result.invoice.id, invoice_no: 'INV-A-000001', total: 100_000, status: 'active' })]);
        expect(w.rows('invoice_items')).toEqual([expect.objectContaining({ invoice_id: result.invoice.id, batch_id: ID.bA, qty: 2000 })]);
      });

      it('must be paid in full', () => {
        expect(codeOf(() => sale({ paid_amount: 49_999 }))).toBe('CREDIT_NEEDS_CUSTOMER');
        expect(codeOf(() => sale({ paid_amount: 0 }))).toBe('CREDIT_NEEDS_CUSTOMER');
      });

      it('cannot be overpaid', () => {
        expect(codeOf(() => sale({ paid_amount: 50_001 }))).toBe('OVERPAID');
      });

      it('a loose quantity of fertilizer is priced by the pack: 250 g at Rs 200/kg is Rs 50', () => {
        const r = sale({ paid_amount: 5000, lines: [{ product_id: ID.fert, qty: 250 }] });
        expect(r.invoice.total).toBe(5000);
        expect(w.stockOf(ID.bFert)).toBe(9750);
      });

      it('keeps the payment method on the invoice and still writes no payment row', () => {
        const r = sale({ paid_amount: 50_000, payment_method: 'easypaisa' });
        expect(r.invoice.payment_method).toBe('easypaisa');
        expect(w.rows('invoices')[0]).toMatchObject({ payment_method: 'easypaisa' });
        expect(w.rows('payments')).toHaveLength(0);
        expect(w.rows('ledger_entries')).toHaveLength(0);
      });

      it('rejects a payment method that does not exist', () => {
        expect(codeOf(() => sale({ paid_amount: 50_000, payment_method: 'cheque' }))).toBe('INVALID_INPUT');
      });
    });

    describe('sale to a customer', () => {
      it('on credit with part paid now: invoice plus total, then payment in and ledger minus', () => {
        const r = creditSale({ paid_amount: 50_000, payment_method: 'easypaisa', reference_no: 'EP-1', lines: [bottles(4)] });
        expect(r.invoice).toMatchObject({ total: 200_000, paid_amount: 50_000, customer_id: ID.customer, payment_method: 'easypaisa' });

        // the payments row uses the same method as the invoice
        expect(w.rows('payments')).toEqual([
          expect.objectContaining({ id: r.payment_id, party_type: 'customer', party_id: ID.customer, method: 'easypaisa', reference_no: 'EP-1', amount: 50_000, direction: 'in' }),
        ]);
        expect(w.rows('payments')[0]!.method).toBe(w.rows('invoices')[0]!.payment_method);
        expect(w.rows('ledger_entries')).toEqual([
          expect.objectContaining({ entry_type: 'invoice', amount_delta: 200_000, ref_type: 'invoice', ref_id: r.invoice.id, party_id: ID.customer }),
          expect.objectContaining({ entry_type: 'payment', amount_delta: -50_000, ref_type: 'payment', ref_id: r.payment_id }),
        ]);
        expect(s.khata.balance(ID.customer)).toBe(150_000);
      });

      it('fully on credit writes no payment at all', () => {
        creditSale({ lines: [bottles(2)] });
        expect(w.rows('payments')).toHaveLength(0);
        expect(w.rows('ledger_entries').map((e) => e.entry_type)).toEqual(['invoice']);
      });

      it('paid in full by a customer still records both ledger rows, leaving a zero balance', () => {
        creditSale({ paid_amount: 100_000, lines: [bottles(2)] });
        expect(w.rows('ledger_entries').map((e) => e.entry_type)).toEqual(['invoice', 'payment']);
        expect(s.khata.balance(ID.customer)).toBe(0);
      });

      it('a free sale (100 percent discount) writes no zero-value ledger row', () => {
        const r = creditSale({ lines: [bottles(1, { line_discount: 50_000 })] });
        expect(r.invoice.total).toBe(0);
        expect(w.rows('ledger_entries')).toHaveLength(0);
        expect(w.stockOf(ID.bA)).toBe(7000);
      });
    });

    describe('price', () => {
      it('is looked up from the product by price type: retail, or wholesale when asked or when it is the customer default', () => {
        expect(creditSale({ lines: [bottles(2)] }).items[0]!.unit_price).toBe(50_000);
        expect(creditSale({ price_type: 'wholesale', lines: [bottles(2)] })).toMatchObject({ invoice: { price_type: 'wholesale', total: 90_000 }, items: [{ unit_price: 45_000 }] });
        w.update('customers', ID.customer, { default_price_type: 'wholesale' });
        expect(creditSale({ lines: [bottles(2)] }).invoice).toMatchObject({ price_type: 'wholesale', total: 90_000 });
        expect(creditSale({ price_type: 'retail', lines: [bottles(2)] }).invoice.total).toBe(100_000);
      });

      it('follows the product price at the time of the sale', () => {
        w.update('products', ID.bottle, { retail_price: 60_000 });
        expect(sale({ paid_amount: 60_000 }).items[0]!.unit_price).toBe(60_000);
      });

      it('the caller cannot supply a price: an unit_price on a line or on the sale is refused, not ignored', () => {
        const before = w.snapshot();
        expect(codeOf(() => sale({ paid_amount: 100, lines: [{ product_id: ID.bottle, qty: 1000, unit_price: 100 }] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => sale({ paid_amount: 100, unit_price: 100 }))).toBe('INVALID_INPUT');
        expect(w.snapshot()).toEqual(before);
      });

      describe('owner-approved price change (price_override)', () => {
        const owner = (unit_price: number) => ({ price_override: { unit_price, approved_by: ID.owner } });

        it('uses the approved price for that line only, and records who approved it', () => {
          const r = sale({ paid_amount: 40_000 + 20_000, lines: [bottles(1, owner(40_000)), { product_id: ID.fert, qty: 1000 }] });
          expect(r.items.map((i) => [i.product_id, i.unit_price, i.line_total])).toEqual([
            [ID.bottle, 40_000, 40_000],
            [ID.fert, 20_000, 20_000],
          ]);
          expect(r.invoice.total).toBe(60_000);
          expect(w.rows('audit_log')).toEqual([
            expect.objectContaining({ user_id: ID.owner, action: 'price_override', table_name: 'invoices', row_id: r.invoice.id }),
          ]);
          expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toMatchObject({ product_id: ID.bottle, price_type: 'retail', list_price: 50_000, unit_price: 40_000 });
        });

        it('works with tax, and the cost price still comes from the batch', () => {
          // 10 packs at the approved Rs 400 = 400000, tax included: 400000 * 1800 / 11800 = 61016.9 -> 61017
          const r = sale({ paid_amount: 400_000, lines: [{ product_id: ID.taxed, qty: 10_000, ...owner(40_000) }] });
          expect(r.items[0]).toMatchObject({ unit_price: 40_000, cost_price: 40_000, tax_amount: 61_017, line_total: 400_000 });
        });

        it('only an active owner can approve it', () => {
          const before = w.snapshot();
          const withApprover = (approved_by: string) => sale({ paid_amount: 40_000, lines: [bottles(1, { price_override: { unit_price: 40_000, approved_by } })] });
          expect(codeOf(() => withApprover(ID.staff))).toBe('NOT_AUTHORIZED');
          expect(codeOf(() => withApprover(ID.inactive))).toBe('NOT_AUTHORIZED');
          expect(codeOf(() => withApprover(uuid(999)))).toBe('NOT_FOUND');
          expect(w.snapshot()).toEqual(before);
        });

        it('does not need the cashier to be the owner', () => {
          expect(() => sale({ created_by: ID.staff, paid_amount: 40_000, lines: [bottles(1, owner(40_000))] })).not.toThrow();
        });

        it('an approved price of zero is allowed, a negative or fractional one is not', () => {
          expect(sale({ paid_amount: 0, customer_id: ID.customer, lines: [bottles(1, owner(0))] }).invoice.total).toBe(0);
          expect(codeOf(() => sale({ paid_amount: 0, lines: [bottles(1, owner(-1))] }))).toBe('INVALID_INPUT');
          expect(codeOf(() => sale({ paid_amount: 0, lines: [bottles(1, owner(10.5))] }))).toBe('INVALID_INPUT');
        });
      });
    });

    describe('credit limit', () => {
      it('a limit of 0 means no limit is set: nothing is checked', () => {
        setLimit(0);
        const r = creditSale({ lines: [bottles(18)] });
        expect(r.invoice.total).toBe(900_000);
        expect(w.rows('audit_log')).toHaveLength(0);
      });

      describe('with a limit set', () => {
        beforeEach(() => setLimit(150_000));

        it('blocks a sale that would take the customer over the limit', () => {
          const before = w.snapshot();
          expect(codeOf(() => creditSale({ lines: [bottles(4)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
          expect(w.snapshot()).toEqual(before);
        });

        it('only the unpaid part counts, and exactly the limit is allowed', () => {
          expect(() => creditSale({ paid_amount: 50_000, lines: [bottles(4)] })).not.toThrow(); // unpaid 150000
        });

        it('counts what the customer already owes', () => {
          creditSale({ paid_amount: 50_000, lines: [bottles(4)] }); // owes 150000
          expect(codeOf(() => creditSale({ lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
          expect(() => creditSale({ paid_amount: 50_000, lines: [bottles(1)] })).not.toThrow(); // pays in full
        });

        it('counts the opening balance', () => {
          s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 100_000, created_by: ID.owner });
          expect(codeOf(() => creditSale({ lines: [bottles(2)] }))).toBe('CREDIT_LIMIT_EXCEEDED'); // 100000 + 100000 > 150000
          expect(codeOf(() => creditSale({ lines: [bottles(1)] }))).not.toBe('CREDIT_LIMIT_EXCEEDED'); // 100000 + 50000 = 150000
          expect(s.khata.balance(ID.customer)).toBe(150_000);
          expect(codeOf(() => creditSale({ lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED'); // now at the limit
        });

        it('a customer already over the limit by their opening balance cannot take more on credit, but can pay in full', () => {
          s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 200_000, created_by: ID.owner });
          expect(codeOf(() => creditSale({ lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
          expect(() => creditSale({ paid_amount: 50_000, lines: [bottles(1)] })).not.toThrow();
        });

        it('a payment made earlier gives the room back', () => {
          creditSale({ paid_amount: 50_000, lines: [bottles(4)] }); // owes 150000, at the limit
          s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 100_000, method: 'cash', created_by: ID.staff });
          expect(() => creditSale({ lines: [bottles(2)] })).not.toThrow();
        });

        it('a walk-in sale has no limit to check', () => {
          expect(() => sale({ paid_amount: 200_000, lines: [bottles(4)] })).not.toThrow();
        });

        describe('owner override', () => {
          const over = (approved_by: string) => ({ credit_override: { approved_by } });

          it('lets the sale through and records who approved it', () => {
            const r = creditSale({ lines: [bottles(4)], ...over(ID.owner) }); // unpaid 200000 > 150000
            expect(r.invoice.total).toBe(200_000);
            expect(s.khata.balance(ID.customer)).toBe(200_000);
            expect(w.rows('audit_log')).toEqual([
              expect.objectContaining({ user_id: ID.owner, action: 'credit_limit_override', table_name: 'invoices', row_id: r.invoice.id }),
            ]);
            expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toEqual({ customer_id: ID.customer, credit_limit: 150_000, owed: 0, unpaid: 200_000 });
          });

          it('is only for the owner: staff, an inactive user or an unknown user are refused and nothing is written', () => {
            const before = w.snapshot();
            expect(codeOf(() => creditSale({ lines: [bottles(4)], ...over(ID.staff) }))).toBe('NOT_AUTHORIZED');
            expect(codeOf(() => creditSale({ lines: [bottles(4)], ...over(ID.inactive) }))).toBe('NOT_AUTHORIZED');
            expect(codeOf(() => creditSale({ lines: [bottles(4)], ...over(uuid(999)) }))).toBe('NOT_FOUND');
            expect(w.snapshot()).toEqual(before);
          });

          it('a bad override is refused even when the sale is under the limit', () => {
            expect(codeOf(() => creditSale({ paid_amount: 50_000, ...over(ID.staff) }))).toBe('NOT_AUTHORIZED');
          });

          it('is not recorded when it was not needed', () => {
            creditSale({ paid_amount: 50_000, ...over(ID.owner) });
            expect(w.rows('audit_log')).toHaveLength(0);
          });

          it('covers one sale only: the next one is refused again', () => {
            creditSale({ lines: [bottles(4)], ...over(ID.owner) });
            expect(codeOf(() => creditSale({ lines: [bottles(1)] }))).toBe('CREDIT_LIMIT_EXCEEDED');
          });

          it('does not override stock, expiry or the other rules', () => {
            expect(codeOf(() => creditSale({ lines: [bottles(19)], ...over(ID.owner) }))).toBe('INSUFFICIENT_STOCK');
          });
        });
      });
    });

    describe('errors carry what the UI needs to explain them', () => {
      it('out of stock says how much there is, in base units, with the pack size', () => {
        const e = errorOf(() => sale({ paid_amount: 950_000, lines: [bottles(19)] }));
        expect(e.code).toBe('INSUFFICIENT_STOCK');
        expect(e.params).toEqual({ available: 18_000, requested: 19_000, packSize: 1000, scope: 'product' });
      });

      it('a credit limit says the limit, what is owed and what the sale adds', () => {
        setLimit(150_000);
        s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 100_000, created_by: ID.owner });
        const e = errorOf(() => creditSale({ lines: [bottles(2)] }));
        expect(e.code).toBe('CREDIT_LIMIT_EXCEEDED');
        expect(e.params).toEqual({ limit: 150_000, owed: 100_000, adds: 100_000 });
      });

      it('overpaying and an oversized discount say the amounts', () => {
        expect(errorOf(() => sale({ paid_amount: 50_001 })).params).toEqual({ paid: 50_001, total: 50_000 });
        expect(errorOf(() => creditSale({ lines: [bottles(1, { line_discount: 50_001 })] })).params).toEqual({ discount: 50_001, linePrice: 50_000 });
      });

      it('a pack-only product says the pack size, and an expired manual batch says its expiry', () => {
        expect(errorOf(() => sale({ paid_amount: 25_000, lines: [{ product_id: ID.bottle, qty: 500 }] })).params).toEqual({ packSize: 1000 });
        expect(errorOf(() => sale({ paid_amount: 50_000, lines: [bottles(1, { batches: [{ batch_id: ID.bExpired, qty: 1000 }] })] })).params).toEqual({ expiry: '2020-01-01' });
      });
    });

    describe('due date', () => {
      it('is kept while something is unpaid and dropped when the sale is settled', () => {
        expect(creditSale({ due_date: w.day(30) }).invoice.due_date).toBe(w.day(30));
        expect(creditSale({ paid_amount: 50_000, due_date: w.day(30) }).invoice.due_date).toBeNull();
      });

      it('cannot be in the past', () => {
        expect(codeOf(() => creditSale({ due_date: w.day(-1) }))).toBe('INVALID_INPUT');
      });
    });

    describe('choosing batches', () => {
      it('12 packs with batch A holding 8 and B holding 10 gives two lines, A first (earliest expiry)', () => {
        const r = sale({ paid_amount: 600_000, lines: [bottles(12)] });
        expect(r.items.map((i) => [i.batch_id, i.qty, i.cost_price, i.line_total])).toEqual([
          [ID.bA, 8000, 40_000, 400_000],
          [ID.bB, 4000, 41_000, 200_000],
        ]);
        expect(w.stockOf(ID.bA)).toBe(0);
        expect(w.stockOf(ID.bB)).toBe(6000);
        // one stock movement per invoice line
        expect(w.rows('stock_movements').filter((m) => m.movement_type === 'sale').map((m) => [m.batch_id, m.qty_delta])).toEqual([
          [ID.bA, -8000],
          [ID.bB, -4000],
        ]);
      });

      it('lets the cashier override the batch by hand', () => {
        const r = sale({ paid_amount: 100_000, lines: [bottles(2, { batches: [{ batch_id: ID.bB, qty: 2000 }] })] });
        expect(r.items.map((i) => i.batch_id)).toEqual([ID.bB]);
        expect(w.stockOf(ID.bB)).toBe(8000);
        expect(w.stockOf(ID.bA)).toBe(8000);
      });

      it('refuses a manual choice of an expired batch', () => {
        expect(codeOf(() => sale({ paid_amount: 50_000, lines: [bottles(1, { batches: [{ batch_id: ID.bExpired, qty: 1000 }] })] }))).toBe('BATCH_EXPIRED');
      });

      it('never sells from an expired batch, so the last pack of OLD cannot be sold', () => {
        expect(codeOf(() => sale({ paid_amount: 950_000, lines: [bottles(19)] }))).toBe('INSUFFICIENT_STOCK'); // 18 sellable + 1 expired
        expect(() => sale({ paid_amount: 900_000, lines: [bottles(18)] })).not.toThrow();
      });

      it('follows the clock: once batch A has expired the sale comes from batch B', () => {
        w.setNow(w.at(121)); // A expires on day 120
        expect(sale({ paid_amount: 50_000 }).items.map((i) => i.batch_id)).toEqual([ID.bB]);
      });

      it('two cart lines for the same product cannot sell the same stock twice', () => {
        expect(codeOf(() => sale({ paid_amount: 1_000_000, lines: [bottles(10), bottles(10)] }))).toBe('INSUFFICIENT_STOCK');

        const r = sale({ paid_amount: 500_000, lines: [bottles(5), bottles(5)] });
        expect(r.items.map((i) => [i.batch_id, i.qty])).toEqual([
          [ID.bA, 5000],
          [ID.bA, 3000],
          [ID.bB, 2000],
        ]);
        expect(w.stockOf(ID.bA)).toBe(0);
        expect(w.stockOf(ID.bB)).toBe(8000);
      });

      it('out of stock is blocked and nothing is written', () => {
        const before = w.snapshot();
        expect(codeOf(() => sale({ paid_amount: 950_000, lines: [bottles(19)] }))).toBe('INSUFFICIENT_STOCK');
        expect(w.snapshot()).toEqual(before);
      });

      it('a loose quantity of a pack-only product is refused', () => {
        expect(codeOf(() => sale({ paid_amount: 25_000, lines: [{ product_id: ID.bottle, qty: 500 }] }))).toBe('WHOLE_PACKS_ONLY');
      });
    });

    describe('discount and tax', () => {
      it('discount is per item, the price already includes tax, and the tax is taken out of the discounted line', () => {
        // 10 packs at Rs 500 = 500000, less 10000 discount = 490000 paid. Tax inside: 490000 * 1800 / 11800 = 74745.8 -> 74746
        const r = sale({ paid_amount: 490_000, lines: [{ product_id: ID.taxed, qty: 10_000, line_discount: 10_000 }] });
        expect(r.items[0]).toMatchObject({ line_discount: 10_000, tax_rate_bp: 1800, tax_amount: 74_746, line_total: 490_000 });
        expect(r.invoice).toMatchObject({ subtotal: 415_254, tax_total: 74_746, total: 490_000 });
      });

      it('a taxed product costs exactly its list price: tax is never added on top', () => {
        const r = sale({ paid_amount: 50_000, lines: [{ product_id: ID.taxed, qty: 1000 }] });
        expect(r.invoice.total).toBe(50_000);
        expect(r.items[0]).toMatchObject({ line_total: 50_000, tax_amount: 7627, tax_rate_bp: 1800 }); // 50000 * 1800 / 11800 = 7627.1
      });

      it('the invoice total always equals the sum of its lines (the v_invoice_mismatch rule)', () => {
        const r = creditSale({ lines: [bottles(12, { line_discount: 3333 }), { product_id: ID.fert, qty: 333, line_discount: 7 }, { product_id: ID.taxed, qty: 3000 }] });
        expect(r.invoice.total).toBe(r.items.reduce((sum, i) => sum + i.line_total, 0));
        expect(calcInvoiceTotals(r.items)).toEqual({ subtotal: r.invoice.subtotal, tax_total: r.invoice.tax_total, total: r.invoice.total });
      });

      it('a discount bigger than the line is refused', () => {
        expect(codeOf(() => creditSale({ lines: [bottles(1, { line_discount: 50_001 })] }))).toBe('DISCOUNT_EXCEEDS_LINE');
      });
    });

    describe('who and what', () => {
      it('rejects unknown or inactive things', () => {
        const base = { created_by: ID.staff, paid_amount: 50_000, lines: [bottles(1)] };
        expect(codeOf(() => sale({ ...base, created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => sale({ ...base, created_by: uuid(999) }))).toBe('NOT_FOUND');
        expect(codeOf(() => sale({ ...base, customer_id: uuid(999) }))).toBe('NOT_FOUND');
        expect(codeOf(() => sale({ ...base, lines: [{ product_id: uuid(999), qty: 1000 }] }))).toBe('NOT_FOUND');
        expect(codeOf(() => sale({ ...base, lines: [{ product_id: ID.retired, qty: 1000 }] }))).toBe('PRODUCT_INACTIVE');
      });

      it('rejects a deleted customer', () => {
        w.update('customers', ID.customer, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(codeOf(() => creditSale())).toBe('NOT_FOUND');
      });

      it('rejects input that is the wrong shape, without opening a transaction', () => {
        const ok = { created_by: ID.staff, paid_amount: 0, lines: [bottles(1)] };
        expect(codeOf(() => s.sale.create({ ...ok, lines: [] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.sale.create({ ...ok, lines: [{ product_id: ID.bottle, qty: 0 }] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.sale.create({ ...ok, lines: [{ product_id: ID.bottle, qty: 1.5 }] }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.sale.create({ ...ok, paid_amount: -1 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.sale.create({ ...ok, paid_amount: 10.5 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.sale.create({ ...ok, created_by: 'not-a-uuid' }))).toBe('INVALID_INPUT');
        expect(w.runs()).toBe(0);
      });
    });

    describe('ports', () => {
      it('uses the injected clock, id generator and document numbers', () => {
        w.setNow(`${w.today}T08:30:00.000Z`);
        const r = sale({ paid_amount: 50_000 });
        expect(r.invoice.invoice_date).toBe(`${w.today}T08:30:00.000Z`);
        expect(r.invoice.id).toBe(uuid(10_000)); // the first id the generator hands out
        expect(r.items[0]!.id).toBe(uuid(10_001));
        expect(r.invoice.invoice_no).toBe('INV-A-000001');
        expect(sale({ paid_amount: 50_000 }).invoice.invoice_no).toBe('INV-A-000002');
      });

      it('does the whole sale in one unit of work', () => {
        creditSale({ paid_amount: 50_000, lines: [bottles(12)] });
        expect(w.runs()).toBe(1);
      });
    });
  });
}
