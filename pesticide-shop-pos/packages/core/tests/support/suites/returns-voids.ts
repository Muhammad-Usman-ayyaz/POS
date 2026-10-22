// Phase 7: returns (full or partial by line, in the line's own unit), the Q8 money rule, resaleable or written off, and voiding a whole invoice.
// One suite for both backends (the in-memory fakes and SQLite): the same test passing on both is the point.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineReturnsVoidsTests(make: WorldFactory): void {
  describe('returns and voids (Phase 7)', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const sell = (qty: number, paid: number, product: string = ID.bottle, customer: string | null = ID.customer) => {
      const r = s.sale.create({ ...(customer ? { customer_id: customer } : {}), created_by: ID.staff, paid_amount: paid, lines: [{ product_id: product, qty }] });
      return { invoice: r.invoice, item: r.items[0]! };
    };
    const back = (invoiceId: string, itemId: string, qty: number, over: Record<string, unknown> = {}) =>
      s.salesReturn.create({
        invoice_id: invoiceId, approved_by: ID.owner,
        items: [{ invoice_item_id: itemId, qty, condition: 'resellable', reason: 'changed_mind', ...over }],
      });
    const settingOn = () => s.customerSettings.set({ refund_paid_part_to_khata: true, actor_id: ID.owner });

    describe('Q8: who gets the money back', () => {
      it('a sale paid in full by a customer: cash back, and NO ledger row for the return', () => {
        const { invoice, item } = sell(2000, 100_000);
        const ledger = w.rows('ledger_entries').length;
        const r = back(invoice.id, item.id, 1000);
        expect(r.sales_return).toMatchObject({ refund_method: 'cash', total: 50_000, cash_amount: 50_000, khata_amount: 0 });
        expect(w.rows('ledger_entries')).toHaveLength(ledger);
        expect(s.khata.balance(ID.customer)).toBe(0);
      });

      it('a credit sale: the Khata is reduced by a new ledger row, and no cash changes hands', () => {
        const { invoice, item } = sell(2000, 0);
        expect(s.khata.balance(ID.customer)).toBe(100_000);
        const ledger = w.rows('ledger_entries').length;
        const r = back(invoice.id, item.id, 1000);
        expect(r.sales_return).toMatchObject({ refund_method: 'khata_credit', cash_amount: 0, khata_amount: 50_000 });
        expect(w.rows('ledger_entries')).toHaveLength(ledger + 1); // appended, nothing edited
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ entry_type: 'return', amount_delta: -50_000, ref_type: 'return', ref_id: r.sales_return.id });
        expect(s.khata.balance(ID.customer)).toBe(50_000);
      });

      it('a part-paid sale: the Khata part comes off first, then the rest is cash (Rs 1000 paid of Rs 2500)', () => {
        const { invoice, item } = sell(5000, 100_000); // total 250000, owes 150000
        const first = back(invoice.id, item.id, 2000); // refund 100000: all of it still on Khata
        expect(first.sales_return).toMatchObject({ cash_amount: 0, khata_amount: 100_000 });
        const second = back(invoice.id, item.id, 3000); // refund 150000: 50000 left on Khata, 100000 was paid
        expect(second.sales_return).toMatchObject({ refund_method: 'khata_credit', cash_amount: 100_000, khata_amount: 50_000 });
        expect(s.khata.balance(ID.customer)).toBe(0);
      });

      it('the cash and Khata parts always add up to the refund, whatever the split', () => {
        const { invoice, item } = sell(3000, 70_001);
        for (const q of [1000, 1000, 1000]) {
          const r = back(invoice.id, item.id, q).sales_return;
          expect(r.cash_amount + r.khata_amount).toBe(r.total);
        }
      });

      it('with the owner setting on, what the customer paid also goes to their Khata as credit', () => {
        settingOn();
        const { invoice, item } = sell(2000, 100_000);
        const r = back(invoice.id, item.id, 1000);
        expect(r.sales_return).toMatchObject({ refund_method: 'khata_credit', cash_amount: 0, khata_amount: 50_000 });
        expect(s.khata.balance(ID.customer)).toBe(-50_000); // an advance
      });

      it('a walk-in sale is always cash, even with the setting on', () => {
        settingOn();
        const { invoice, item } = sell(1000, 50_000, ID.bottle, null);
        const ledger = w.rows('ledger_entries').length;
        expect(back(invoice.id, item.id, 1000).sales_return).toMatchObject({ refund_method: 'cash', cash_amount: 50_000, khata_amount: 0 });
        expect(w.rows('ledger_entries')).toHaveLength(ledger);
      });

      it('only the owner can change the setting', () => {
        expect(codeOf(() => s.customerSettings.set({ refund_paid_part_to_khata: true, actor_id: ID.staff }))).toBe('NOT_AUTHORIZED');
        expect(s.customerSettings.get().refund_paid_part_to_khata).toBe(false);
        settingOn();
        expect(w.rows('audit_log').at(-1)).toMatchObject({ action: 'customer_setting_changed', user_id: ID.owner });
      });
    });

    describe('what happens to the goods', () => {
      it('resellable goods go back to the batch they were sold from, and ONLY that batch', () => {
        const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 10_000 }] });
        const lineB = sold.items.find((i) => i.batch_id === ID.bB)!;
        const a = w.stockOf(ID.bA);
        const b = w.stockOf(ID.bB);
        back(sold.invoice.id, lineB.id, 1000);
        expect(w.stockOf(ID.bB)).toBe(b + 1000);
        expect(w.stockOf(ID.bA)).toBe(a);
      });

      it('goods that are not resellable are written off with a damage movement, and the batch stock does not grow', () => {
        const { invoice, item } = sell(2000, 0);
        const before = w.stockOf(item.batch_id);
        const r = back(invoice.id, item.id, 1000, { condition: 'damaged', reason: 'leaked' });
        expect(w.stockOf(item.batch_id)).toBe(before);
        expect(w.rows('stock_movements').slice(-2).map((m) => [m.movement_type, m.qty_delta, m.ref_id])).toEqual([['sale_return', 1000, r.sales_return.id], ['damage', -1000, r.sales_return.id]]);
      });

      it('goods that came back expired are written off with an expired movement', () => {
        const { invoice, item } = sell(1000, 0);
        back(invoice.id, item.id, 1000, { condition: 'expired', reason: 'expired' });
        expect(w.rows('stock_movements').at(-1)).toMatchObject({ movement_type: 'expired', qty_delta: -1000 });
      });

      it('every line needs a reason, and an unknown one is refused', () => {
        const { invoice, item } = sell(2000, 0);
        const before = w.snapshot();
        for (const reason of [undefined, '', 'because', 'OTHER']) {
          const items = [{ invoice_item_id: item.id, qty: 1000, condition: 'resellable' as const, ...(reason === undefined ? {} : { reason }) }];
          expect(errorOf(() => s.salesReturn.create({ invoice_id: invoice.id, approved_by: ID.owner, items })).code).toBe('RETURN_REASON_REQUIRED');
        }
        expect(codeOf(() => back(invoice.id, item.id, 1000, { condition: 'damaged', reason: undefined }))).toBe('RETURN_REASON_REQUIRED');
        expect(w.snapshot()).toEqual(before);
      });

      it('a batch that has expired since the sale cannot be marked resellable, but can be written off', () => {
        const { invoice, item } = sell(2000, 0);
        w.setNow(w.at(130)); // batch A expires in 120 days
        const before = w.snapshot();
        expect(codeOf(() => back(invoice.id, item.id, 1000))).toBe('EXPIRED_NOT_RESELLABLE');
        expect(w.snapshot()).toEqual(before);
        const r = back(invoice.id, item.id, 1000, { condition: 'expired', reason: 'expired' });
        expect(r.items[0]).toMatchObject({ condition: 'expired' });
        expect(w.rows('stock_movements').at(-1)).toMatchObject({ movement_type: 'expired' });
      });

      it('the day a batch expires is still a good day: it expires AFTER its date', () => {
        const { invoice, item } = sell(2000, 0);
        w.setNow(`${w.day(120)}T12:00:00.000Z`);
        expect(back(invoice.id, item.id, 1000).items).toHaveLength(1);
      });
    });

    describe('in the line\'s own unit', () => {
      it('returns 0.5 kg from a 2.5 kg loose line: Rs 100 back and 500 g (0.5 kg) onto the shelf', () => {
        const { invoice, item } = sell(2500, 0, ID.fert);
        expect(item.line_total).toBe(50_000);
        const stock = w.stockOf(ID.bFert);
        const r = back(invoice.id, item.id, 500);
        expect(r.items[0]).toMatchObject({ qty: 500, refund_amount: 10_000 });
        expect(w.stockOf(ID.bFert)).toBe(stock + 500);
      });

      it('a sealed size comes back in whole packs only: half a pack is refused, a pack is fine', () => {
        const { invoice, item } = sell(2000, 0);
        const e = errorOf(() => back(invoice.id, item.id, 500));
        expect(e.code).toBe('WHOLE_PACKS_ONLY');
        expect(e.params).toMatchObject({ packSize: 1000 });
        expect(back(invoice.id, item.id, 1000).items[0]!.qty).toBe(1000);
      });

      it('never more than was sold, even in loose units, and the error says how much is left', () => {
        const { invoice, item } = sell(2500, 0, ID.fert);
        back(invoice.id, item.id, 500);
        const e = errorOf(() => back(invoice.id, item.id, 2001));
        expect(e.code).toBe('RETURN_EXCEEDS_SOLD');
        expect(e.params).toMatchObject({ returnable: 2000, requested: 2001 });
      });

      it('double return: the cap counts every earlier return of the line, not just the last', () => {
        const { invoice, item } = sell(2000, 0);
        back(invoice.id, item.id, 1000);
        const before = w.snapshot();
        expect(codeOf(() => back(invoice.id, item.id, 2000))).toBe('RETURN_EXCEEDS_SOLD');
        expect(w.snapshot()).toEqual(before);
        back(invoice.id, item.id, 1000);
        expect(codeOf(() => back(invoice.id, item.id, 1000))).toBe('RETURN_EXCEEDS_SOLD');
      });
    });

    describe('money to the paisa', () => {
      it('a discounted line: a partial return gives back its share of the DISCOUNTED price, and the parts add up to the line', () => {
        const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 3000, line_discount: 10_000 }] });
        const item = sold.items[0]!;
        expect(item.line_total).toBe(140_000);
        const parts = [1000, 1000, 1000].map((q) => back(sold.invoice.id, item.id, q).sales_return.total);
        expect(parts).toEqual([46_667, 46_666, 46_667]); // 140000 / 3, running difference
        expect(parts.reduce((a, b) => a + b, 0)).toBe(140_000);
      });

      it('odd prices round halves up once per line and the running difference never drifts', () => {
        const sold = s.sale.create({
          customer_id: ID.customer, created_by: ID.staff, paid_amount: 0,
          lines: [{ product_id: ID.fert, qty: 2500, price_override: { unit_price: 33_333, approved_by: ID.owner } }],
        });
        const item = sold.items[0]!;
        expect(item.line_total).toBe(83_333); // 2.5 x 33333 = 83332.5, halves up
        const parts = [1000, 1500].map((q) => back(sold.invoice.id, item.id, q).sales_return.total);
        expect(parts).toEqual([33_333, 50_000]);
        expect(parts[0]! + parts[1]!).toBe(83_333);
        expect(w.rows('sales_returns').every((r) => Number.isInteger(r.total))).toBe(true);
      });

      it('the refund uses the price on the invoice, not the price today', () => {
        const { invoice, item } = sell(2000, 0);
        w.update('products', ID.bottle, { retail_price: 70_000 });
        expect(back(invoice.id, item.id, 1000).sales_return.total).toBe(50_000);
      });

      it('the tax inside the refund is stored per line, in integers, halves up, and never passes the tax charged', () => {
        const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.taxed, qty: 3000, line_discount: 1 }] });
        const item = sold.items[0]!;
        const taxes = [1000, 1000, 1000].map((q) => back(sold.invoice.id, item.id, q).items[0]!.tax_refund);
        expect(taxes.reduce((a, b) => a + b, 0)).toBe(item.tax_amount);
        expect(taxes.every((t) => Number.isInteger(t) && t >= 0)).toBe(true);
      });

      it('preview says exactly what create then does: totals, tax, split and Khata before / after', () => {
        const { invoice, item } = sell(5000, 100_000);
        const input = { invoice_id: invoice.id, items: [{ invoice_item_id: item.id, qty: 2000, condition: 'resellable' as const, reason: 'changed_mind' }] };
        const before = w.snapshot();
        const preview = s.salesReturn.preview(input);
        expect(w.snapshot()).toEqual(before); // writes nothing
        expect(preview).toMatchObject({ total: 100_000, tax_total: 0, cash_amount: 0, khata_amount: 100_000, khata_before: 150_000, khata_after: 50_000, restock_lines: 1, write_off_lines: 0, issues: [] });
        const made = s.salesReturn.create({ ...input, approved_by: ID.owner });
        expect(made.sales_return).toMatchObject({ total: preview.total, cash_amount: preview.cash_amount, khata_amount: preview.khata_amount });
        expect(s.khata.balance(ID.customer)).toBe(preview.khata_after);
      });

      it('preview lists what create would refuse, without throwing, and still throws for a quantity that cannot be', () => {
        const { invoice, item } = sell(2000, 0);
        const p = s.salesReturn.preview({ invoice_id: invoice.id, items: [{ invoice_item_id: item.id, qty: 500, condition: 'resellable' }] });
        expect(p.issues.map((i) => i.code).sort()).toEqual(['RETURN_REASON_REQUIRED']);
        expect(codeOf(() => s.salesReturn.preview({ invoice_id: invoice.id, items: [{ invoice_item_id: item.id, qty: 9000, condition: 'resellable', reason: 'other' }] }))).toBe('RETURN_EXCEEDS_SOLD');
      });
    });

    describe('who stands behind a return', () => {
      it('staff can be the one who started it; the owner approves; both are recorded', () => {
        const { invoice, item } = sell(2000, 0);
        const r = s.salesReturn.create({
          invoice_id: invoice.id, approved_by: ID.owner, requested_by: ID.staff, approval_used: { approved_by: ID.owner, requested_by: ID.staff },
          items: [{ invoice_item_id: item.id, qty: 1000, condition: 'resellable', reason: 'changed_mind' }],
        });
        expect(r.sales_return).toMatchObject({ approved_by: ID.owner, requested_by: ID.staff });
        expect(w.rows('stock_movements').at(-1)).toMatchObject({ created_by: ID.staff });
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ created_by: ID.staff });
        const audit = w.rows('audit_log').map((a) => [a.action, a.user_id]);
        expect(audit).toEqual([['return_approved', ID.owner], ['approval_used', ID.owner]]);
      });

      it('the approver must be an active owner: staff, inactive and unknown users are refused and nothing is written', () => {
        const { invoice, item } = sell(2000, 0);
        const before = w.snapshot();
        for (const [who, code] of [[ID.staff, 'NOT_AUTHORIZED'], [ID.inactive, 'NOT_AUTHORIZED'], [uuid(999), 'NOT_FOUND']] as const) {
          expect(codeOf(() => s.salesReturn.create({ invoice_id: invoice.id, approved_by: who, items: [{ invoice_item_id: item.id, qty: 1000, condition: 'resellable', reason: 'other' }] }))).toBe(code);
        }
        expect(w.snapshot()).toEqual(before);
      });

      it('a return against a voided invoice is refused', () => {
        const { invoice, item } = sell(2000, 0);
        s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'wrong customer' });
        expect(codeOf(() => back(invoice.id, item.id, 1000))).toBe('INVOICE_VOIDED');
      });
    });

    describe('void a whole invoice', () => {
      it('owner only: staff and inactive users are refused and nothing is written', () => {
        const { invoice } = sell(2000, 0);
        const before = w.snapshot();
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.staff, reason: 'x' }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.inactive, reason: 'x' }))).toBe('NOT_AUTHORIZED');
        expect(w.snapshot()).toEqual(before);
      });

      it('a reason is required: empty and blank are refused', () => {
        const { invoice } = sell(2000, 0);
        const before = w.snapshot();
        for (const reason of ['', '   ']) expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason }))).toBe('VOID_REASON_REQUIRED');
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner } as never))).toBe('INVALID_INPUT');
        expect(w.snapshot()).toEqual(before);
      });

      it('marks the invoice voided (it stays on record), puts the stock back on each batch with new void rows, and audits', () => {
        const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: 10_000 }, { product_id: ID.fert, qty: 2500 }] });
        const a = w.stockOf(ID.bA);
        const b = w.stockOf(ID.bB);
        const f = w.stockOf(ID.bFert);
        const movements = w.rows('stock_movements').length;
        const out = s.salesReturn.voidInvoice({ invoice_id: sold.invoice.id, voided_by: ID.owner, reason: '  entered for the wrong customer ' });

        expect(w.rows('invoices').find((i) => i.id === sold.invoice.id)).toMatchObject({ status: 'voided', void_reason: 'entered for the wrong customer', voided_by: ID.owner });
        expect(w.rows('invoice_items').filter((i) => i.invoice_id === sold.invoice.id)).toHaveLength(sold.items.length); // the lines are still there
        const added = w.rows('stock_movements').slice(movements);
        expect(added).toHaveLength(sold.items.length);
        expect(added.every((m) => m.movement_type === 'void' && m.ref_type === 'invoice' && m.ref_id === sold.invoice.id && (m.qty_delta as number) > 0)).toBe(true);
        for (const item of sold.items) expect(added.find((m) => m.batch_id === item.batch_id)).toMatchObject({ qty_delta: item.qty });
        expect([w.stockOf(ID.bA) + w.stockOf(ID.bB), w.stockOf(ID.bFert)]).toEqual([a + b + 10_000, f + 2500]);
        expect(out).toMatchObject({ invoice_no: sold.invoice.invoice_no, khata_reversed: 550_000, cash_back: 0, stock_lines: sold.items.length });
        expect(w.rows('audit_log').at(-1)).toMatchObject({ action: 'invoice_voided', user_id: ID.owner, table_name: 'invoices', row_id: sold.invoice.id });
        expect(JSON.parse(w.rows('audit_log').at(-1)!.details as string)).toMatchObject({ reason: 'entered for the wrong customer', khata_reversed: 550_000 });
      });

      it('a credit sale: a compensating Khata row takes the debt off; the original rows stay (append-only)', () => {
        const { invoice } = sell(2000, 0);
        const before = w.rows('ledger_entries').slice();
        s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' });
        const rows = w.rows('ledger_entries');
        expect(rows.slice(0, before.length)).toEqual(before);
        expect(rows).toHaveLength(before.length + 1);
        expect(rows.at(-1)).toMatchObject({ party_id: ID.customer, entry_type: 'return', amount_delta: -100_000, ref_type: 'void', ref_id: invoice.id });
        expect(s.khata.balance(ID.customer)).toBe(0);
      });

      it('a sale paid in full (customer or walk-in): cash back and NO ledger row', () => {
        const paid = sell(2000, 100_000);
        const walkIn = sell(1000, 50_000, ID.bottle, null);
        const ledger = w.rows('ledger_entries').length;
        expect(s.salesReturn.voidInvoice({ invoice_id: paid.invoice.id, voided_by: ID.owner, reason: 'a' })).toMatchObject({ khata_reversed: 0, cash_back: 100_000 });
        expect(s.salesReturn.voidInvoice({ invoice_id: walkIn.invoice.id, voided_by: ID.owner, reason: 'b' })).toMatchObject({ khata_reversed: 0, cash_back: 50_000 });
        expect(w.rows('ledger_entries')).toHaveLength(ledger);
      });

      it('a part-paid sale: the Khata part is taken off and the part that was paid is cash back (Rs 400 paid of Rs 1000)', () => {
        const { invoice } = sell(2000, 40_000);
        expect(s.khata.balance(ID.customer)).toBe(60_000);
        expect(s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' })).toMatchObject({ khata_reversed: 60_000, cash_back: 40_000 });
        expect(s.khata.balance(ID.customer)).toBe(0);
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ amount_delta: -60_000 });
      });

      it('with the setting on, the paid part of a void is credited to Khata instead of cash', () => {
        settingOn();
        const { invoice } = sell(2000, 40_000);
        expect(s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' })).toMatchObject({ khata_reversed: 100_000, cash_back: 0 });
        expect(s.khata.balance(ID.customer)).toBe(-40_000);
      });

      it('voiding twice is refused', () => {
        const { invoice } = sell(2000, 0);
        s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' });
        const before = w.snapshot();
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'again' }))).toBe('INVOICE_VOIDED');
        expect(w.snapshot()).toEqual(before);
      });

      it('after a partial return the void is refused (the owner returns the rest instead) and nothing changes', () => {
        const { invoice, item } = sell(2000, 0);
        back(invoice.id, item.id, 1000);
        const before = w.snapshot();
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' }))).toBe('VOID_HAS_RETURNS');
        expect(w.snapshot()).toEqual(before);
        expect(back(invoice.id, item.id, 1000).sales_return.total).toBe(50_000); // returning the rest still works
      });

      it('an unknown invoice is NOT_FOUND', () => {
        expect(codeOf(() => s.salesReturn.voidInvoice({ invoice_id: uuid(999), voided_by: ID.owner, reason: 'x' }))).toBe('NOT_FOUND');
      });

      it('is one unit of work, and a failure half-way leaves nothing behind', () => {
        const { invoice } = sell(2000, 0);
        const runs = w.runs();
        w.failOnInsert('ledger_entries', 1);
        const before = w.snapshot();
        expect(() => s.salesReturn.voidInvoice({ invoice_id: invoice.id, voided_by: ID.owner, reason: 'mistake' })).toThrow();
        expect(w.runs()).toBe(runs + 1);
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
        expect(w.rows('invoices').find((i) => i.id === invoice.id)!.status).toBe('active');
      });
    });

    describe('a return is one unit of work', () => {
      it('a failure while writing the ledger leaves no return, no stock movement and no audit row', () => {
        const { invoice, item } = sell(2000, 0);
        w.failOnInsert('ledger_entries', 1);
        const before = w.snapshot();
        expect(() => back(invoice.id, item.id, 1000)).toThrow();
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
      });
    });
  });
}
