import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function definePaymentKhataTests(make: WorldFactory): void {
  describe('payments and khata', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const creditSale = (packs: number, extra: object = {}) =>
      s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: packs * 1000 }], ...extra });

    describe('payments', () => {
      it('a customer payment writes payments (in) and a ledger payment row with a minus', () => {
        creditSale(4); // owes 200000
        const id = s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 120_000, method: 'jazzcash', reference_no: 'JC-5', created_by: ID.staff });

        expect(w.rows('payments')).toEqual([
          expect.objectContaining({ id, party_type: 'customer', party_id: ID.customer, method: 'jazzcash', reference_no: 'JC-5', amount: 120_000, direction: 'in' }),
        ]);
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ entry_type: 'payment', amount_delta: -120_000, ref_type: 'payment', ref_id: id });
        expect(s.khata.balance(ID.customer)).toBe(80_000);
      });

      it('reduces the overall balance, not one invoice', () => {
        creditSale(2);
        creditSale(2);
        s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 50_000, method: 'cash', created_by: ID.staff });
        expect(s.khata.balance(ID.customer)).toBe(150_000);
        expect(w.rows('payments')).toHaveLength(1);
      });

      it('paying more than is owed leaves the customer in credit', () => {
        creditSale(1);
        s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 80_000, method: 'cash', created_by: ID.staff });
        expect(s.khata.balance(ID.customer)).toBe(-30_000);
      });

      it('paying a supplier writes payments (out) and a supplier ledger minus', () => {
        s.purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [{ product_id: ID.bottle, batch_no: 'N1', expiry_date: w.day(400), qty: 5000, cost_price: 42_000 }] });
        const id = s.payment.payToSupplier({ party_id: ID.supplier, amount: 100_000, method: 'bank', created_by: ID.owner });
        expect(w.rows('payments').at(-1)).toMatchObject({ id, party_type: 'supplier', direction: 'out', amount: 100_000 });
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ party_type: 'supplier', entry_type: 'payment', amount_delta: -100_000 });
      });

      it('rejects the wrong party, a zero amount and a bad user', () => {
        const ok = { party_id: ID.customer, amount: 1000, method: 'cash' as const, created_by: ID.staff };
        expect(codeOf(() => s.payment.receiveFromCustomer({ ...ok, party_id: uuid(999) }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.payment.payToSupplier({ ...ok, party_id: ID.customer }))).toBe('NOT_FOUND'); // a customer is not a supplier
        expect(codeOf(() => s.payment.receiveFromCustomer({ ...ok, amount: 0 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.payment.receiveFromCustomer({ ...ok, amount: 10.5 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.payment.receiveFromCustomer({ ...ok, method: 'cheque' as never }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.payment.receiveFromCustomer({ ...ok, created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
        expect(w.rows('payments')).toHaveLength(0);
      });

      it('is one unit of work', () => {
        s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 1000, method: 'cash', created_by: ID.staff });
        expect(w.runs()).toBe(1);
      });
    });

    describe('khata', () => {
      it('the balance is the sum of the ledger: plus means the customer owes', () => {
        expect(s.khata.balance(ID.customer)).toBe(0);
        creditSale(4);
        expect(s.khata.balance(ID.customer)).toBe(200_000);
      });

      it('the statement lists every row with a running balance', () => {
        s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 30_000, created_by: ID.owner });
        creditSale(2, { paid_amount: 40_000 });
        s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 10_000, method: 'cash', created_by: ID.staff });

        expect(s.khata.statement(ID.customer).map((l) => [l.entry.entry_type, l.entry.amount_delta, l.running_balance])).toEqual([
          ['opening', 30_000, 30_000],
          ['invoice', 100_000, 130_000],
          ['payment', -40_000, 90_000],
          ['payment', -10_000, 80_000],
        ]);
      });

      describe('opening balance', () => {
        it('is one opening ledger row', () => {
          s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 250_000, created_by: ID.owner });
          expect(w.rows('ledger_entries')).toEqual([expect.objectContaining({ entry_type: 'opening', amount_delta: 250_000, party_id: ID.customer })]);
          expect(s.khata.balance(ID.customer)).toBe(250_000);
        });

        it('can only be set once per customer', () => {
          s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 250_000, created_by: ID.owner });
          expect(codeOf(() => s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 1, created_by: ID.owner }))).toBe('OPENING_BALANCE_EXISTS');
          expect(w.rows('ledger_entries')).toHaveLength(1);
        });

        it('rejects zero and unknown customers', () => {
          expect(codeOf(() => s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 0, created_by: ID.owner }))).toBe('INVALID_INPUT');
          expect(codeOf(() => s.khata.setOpeningBalance({ customer_id: uuid(999), amount: 5, created_by: ID.owner }))).toBe('NOT_FOUND');
        });
      });

      describe('overdue', () => {
        it('lists invoices past their due date that are still unpaid', () => {
          const a = creditSale(2, { due_date: w.day(9) });
          w.setNow(w.at(8));
          expect(s.khata.overdue(ID.customer)).toEqual([]); // not due yet
          w.setNow(w.at(9));
          expect(s.khata.overdue(ID.customer)).toEqual([]); // due today is not overdue
          w.setNow(w.at(19));
          expect(s.khata.overdue(ID.customer)).toEqual([
            { invoice_id: a.invoice.id, invoice_no: a.invoice.invoice_no, due_date: w.day(9), days_overdue: 10, outstanding: 100_000 },
          ]);
        });

        it('payments pay the oldest invoice first', () => {
          w.setNow(w.at(0));
          const first = creditSale(2, { due_date: w.day(9) });
          w.setNow(w.at(1));
          const second = creditSale(2, { due_date: w.day(11) });
          w.setNow(w.at(4));
          s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 60_000, method: 'cash', created_by: ID.staff });

          w.setNow(w.at(29));
          expect(s.khata.overdue(ID.customer).map((o) => [o.invoice_id, o.outstanding])).toEqual([
            [first.invoice.id, 40_000],
            [second.invoice.id, 100_000],
          ]);

          w.setNow(w.at(30));
          s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 40_000, method: 'cash', created_by: ID.staff });
          expect(s.khata.overdue(ID.customer).map((o) => [o.invoice_id, o.outstanding])).toEqual([[second.invoice.id, 100_000]]);
        });

        it('a customer who has paid everything has nothing overdue, and an invoice with no due date never is', () => {
          creditSale(2, { due_date: w.day(9) });
          s.payment.receiveFromCustomer({ party_id: ID.customer, amount: 100_000, method: 'cash', created_by: ID.staff });
          creditSale(1);
          w.setNow(w.at(60));
          expect(s.khata.overdue(ID.customer)).toEqual([]);
        });
      });
    });
  });
}
