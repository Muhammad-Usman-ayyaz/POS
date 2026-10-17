// Customer payments (receipt numbers, references, advances) and the statement (Phase 6, M1). Runs on every backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineCustomerKhataTests(make: WorldFactory): void {
  describe('customer payments and statement', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const creditSale = (packs: number, extra: object = {}) =>
      s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: packs * 1000 }], ...extra });
    const pay = (amount: number, extra: object = {}) =>
      s.payment.receiveFromCustomer({ party_id: ID.customer, amount, method: 'cash', created_by: ID.staff, ...extra });
    let rawNo = 0;
    /** A ledger row written the way another module or an admin tool could: straight into the repository. */
    const rawLedger = (entry: { party_type?: 'customer' | 'supplier'; party_id?: string; entry_type: 'adjustment' | 'purchase'; amount_delta: number; entry_date: string }) =>
      w.deps.uow.run((tx) =>
        tx.ledger.insert({
          id: uuid(60_000 + rawNo++), party_type: entry.party_type ?? 'customer', party_id: entry.party_id ?? ID.customer, entry_type: entry.entry_type, amount_delta: entry.amount_delta,
          ref_type: null, ref_id: null, entry_date: entry.entry_date, created_by: ID.owner, ...w.deps.scope,
        }),
      );
    const ledgerSum = (upToDay?: string) =>
      w.rows('ledger_entries').filter((r) => r.party_type === 'customer' && r.party_id === ID.customer && (upToDay === undefined || String(r.entry_date).slice(0, 10) <= upToDay)).reduce((sum, r) => sum + (r.amount_delta as number), 0);

    describe('receiving a payment', () => {
      it('returns the payment, a receipt number, the balance after and whether it is an advance; and writes the payment and ledger rows', () => {
        creditSale(4); // owes 200,000
        w.setNow(w.at(0, '15:30:00.000'));
        const done = pay(120_000, { method: 'jazzcash', reference_no: 'JC-5', note: 'for the wheat' });
        expect(done).toMatchObject({ receipt_no: 'RCP-A-000001', balance_after: 80_000, advance: false });
        expect(done.payment).toMatchObject({ party_type: 'customer', party_id: ID.customer, method: 'jazzcash', reference_no: 'JC-5', note: 'for the wheat', amount: 120_000, direction: 'in', receipt_no: 'RCP-A-000001', created_by: ID.staff });
        expect(w.rows('payments')).toEqual([expect.objectContaining({ id: done.payment.id, receipt_no: 'RCP-A-000001', note: 'for the wheat', paid_at: `${w.today}T15:30:00.000Z` })]);
        expect(w.rows('ledger_entries').at(-1)).toMatchObject({ entry_type: 'payment', amount_delta: -120_000, ref_type: 'payment', ref_id: done.payment.id, entry_date: `${w.today}T15:30:00.000Z` });
        expect(s.khata.balance(ID.customer)).toBe(80_000);
      });

      it('the ledger row is a MINUS (the customer owes less)', () => {
        creditSale(2);
        pay(30_000);
        expect(w.rows('ledger_entries').at(-1)!.amount_delta).toBe(-30_000);
        expect(s.khata.balance(ID.customer)).toBe(70_000);
      });

      it('receipt numbers count up and are never reused', () => {
        creditSale(4);
        const numbers = [pay(1000), pay(1000), pay(1000)].map((r) => r.receipt_no);
        expect(numbers).toEqual(['RCP-A-000001', 'RCP-A-000002', 'RCP-A-000003']);
        expect(new Set(w.rows('payments').map((r) => r.receipt_no)).size).toBe(3);
      });

      it('a payment taken at the counter with a sale is not numbered by the payment sequence (it belongs to the invoice)', () => {
        creditSale(2, { paid_amount: 40_000 });
        expect(w.rows('payments')).toHaveLength(1);
        expect(w.rows('payments')[0]!.receipt_no).toBeNull();
        expect(pay(1000).receipt_no).toBe('RCP-A-000001');
      });

      it('the payment is dated now: there is no back-dating', () => {
        creditSale(1);
        expect(codeOf(() => pay(1000, { paid_at: '2020-01-01T00:00:00.000Z' }))).toBe('INVALID_INPUT');
        expect(codeOf(() => pay(1000, { entry_date: '2020-01-01' }))).toBe('INVALID_INPUT');
        w.setNow(w.at(3, '08:00:00.000'));
        pay(1000);
        expect(w.rows('payments').at(-1)!.paid_at).toBe(`${w.day(3)}T08:00:00.000Z`);
      });

      it('who took it comes from the caller, never from the input: an unknown key is refused', () => {
        creditSale(1);
        expect(codeOf(() => pay(1000, { actor_id: ID.owner }))).toBe('INVALID_INPUT');
        expect(codeOf(() => pay(1000, { receipt_no: 'RCP-A-999999' }))).toBe('INVALID_INPUT');
      });

      it('is one unit of work', () => {
        creditSale(1);
        const before = w.runs();
        pay(1000);
        expect(w.runs() - before).toBe(1);
      });

      describe('the amount', () => {
        it('must be a whole number of paisa above zero', () => {
          creditSale(1);
          for (const amount of [0, -1, -50_000, 10.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
            expect(codeOf(() => pay(amount, { confirm_advance: true })), String(amount)).toBe('INVALID_INPUT');
          }
          expect(codeOf(() => pay('500' as never))).toBe('INVALID_INPUT');
          expect(w.rows('payments')).toHaveLength(0);
          expect(w.rows('ledger_entries')).toHaveLength(1); // only the sale
        });
      });

      describe('the reference number', () => {
        it.each(['bank', 'easypaisa', 'jazzcash'] as const)('%s needs one: without it (or with only spaces) the payment is REFUSED and nothing is written', (method) => {
          creditSale(2);
          const before = w.snapshot();
          expect(codeOf(() => pay(1000, { method }))).toBe('REFERENCE_REQUIRED');
          expect(codeOf(() => pay(1000, { method, reference_no: '' }))).toBe('REFERENCE_REQUIRED');
          expect(codeOf(() => pay(1000, { method, reference_no: '   ' }))).toBe('REFERENCE_REQUIRED');
          expect(w.snapshot()).toEqual(before);
          expect(pay(1000, { method, reference_no: ' TX-77 ' }).payment.reference_no).toBe('TX-77');
        });

        it('cash does not need one, and may carry one', () => {
          creditSale(2);
          expect(pay(1000).payment.reference_no).toBeNull();
          expect(pay(1000, { reference_no: '' }).payment.reference_no).toBeNull();
          expect(pay(1000, { reference_no: 'slip 9' }).payment.reference_no).toBe('slip 9');
        });

        it('a reference longer than 100 characters is refused', () => {
          creditSale(2);
          expect(codeOf(() => pay(1000, { method: 'bank', reference_no: 'x'.repeat(101) }))).toBe('INVALID_INPUT');
          expect(pay(1000, { method: 'bank', reference_no: 'x'.repeat(100) }).payment.reference_no).toHaveLength(100);
        });
      });

      describe('the note', () => {
        it('is optional, tidied, and at most 200 characters', () => {
          creditSale(2);
          expect(pay(1000).payment.note).toBeNull();
          expect(pay(1000, { note: '   ' }).payment.note).toBeNull();
          expect(pay(1000, { note: '  half now  ' }).payment.note).toBe('half now');
          expect(pay(1000, { note: 'n'.repeat(200) }).payment.note).toHaveLength(200);
          expect(codeOf(() => pay(1000, { note: 'n'.repeat(201) }))).toBe('INVALID_INPUT');
        });
      });

      describe('advance (paying more than is owed)', () => {
        it('needs confirm_advance: without it ADVANCE_NOT_CONFIRMED, with the amounts, and nothing is written or numbered', () => {
          creditSale(1); // owes 50,000
          const before = w.snapshot();
          const e = errorOf(() => pay(50_001));
          expect(e.code).toBe('ADVANCE_NOT_CONFIRMED');
          expect(e.params).toMatchObject({ amount: 50_001, balance: 50_000 });
          expect(codeOf(() => pay(50_001, { confirm_advance: false }))).toBe('ADVANCE_NOT_CONFIRMED');
          expect(w.snapshot()).toEqual(before);
          expect(pay(1000).receipt_no).toBe('RCP-A-000001'); // the refused ones used no number
        });

        it('confirmed, it is taken: the balance goes negative and the result says advance', () => {
          creditSale(1);
          const done = pay(80_000, { confirm_advance: true });
          expect(done).toMatchObject({ balance_after: -30_000, advance: true });
          expect(s.khata.balance(ID.customer)).toBe(-30_000);
        });

        it('paying exactly what is owed needs no confirmation and is not an advance', () => {
          creditSale(1);
          expect(pay(50_000)).toMatchObject({ balance_after: 0, advance: false });
        });

        it('a customer who owes nothing, or is already in credit, can only pay as an advance', () => {
          expect(codeOf(() => pay(1000))).toBe('ADVANCE_NOT_CONFIRMED'); // balance 0
          expect(pay(1000, { confirm_advance: true })).toMatchObject({ balance_after: -1000, advance: true });
          expect(codeOf(() => pay(1))).toBe('ADVANCE_NOT_CONFIRMED'); // balance -1000
          expect(pay(1, { confirm_advance: true })).toMatchObject({ balance_after: -1001, advance: true });
        });

        it('the confirmation does not lift the other rules: still a positive amount, still a reference for a wallet', () => {
          expect(codeOf(() => pay(0, { confirm_advance: true }))).toBe('INVALID_INPUT');
          expect(codeOf(() => pay(100, { method: 'bank', confirm_advance: true }))).toBe('REFERENCE_REQUIRED');
        });

        it('an opening balance counts: a customer who owes it can pay it off without a confirmation', () => {
          s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 25_000, created_by: ID.owner });
          expect(pay(25_000)).toMatchObject({ balance_after: 0, advance: false });
        });
      });

      describe('one unit of work: the payment, its ledger row and its receipt number come together or not at all', () => {
        it.each([['ledger_entries'], ['payments']] as const)('a failure on the insert into %s leaves no payment, no ledger row and no used-up receipt number', (table) => {
          creditSale(4);
          const before = w.snapshot();
          w.failOnInsert(table, 1);
          expect(() => pay(1000)).toThrow(`injected failure on insert #1 into ${table}`);
          w.clearFailure();
          expect(w.snapshot()).toEqual(before); // every table AND the number counters
          expect(w.inTransaction()).toBe(false);
          expect(pay(1000).receipt_no).toBe('RCP-A-000001'); // the failed attempt did not burn a number
          expect(pay(1000).receipt_no).toBe('RCP-A-000002');
        });

        it('a refused payment (reference, advance, bad amount, bad user) uses no number either', () => {
          creditSale(1);
          expect(codeOf(() => pay(1000, { method: 'bank' }))).toBe('REFERENCE_REQUIRED');
          expect(codeOf(() => pay(999_999))).toBe('ADVANCE_NOT_CONFIRMED');
          expect(codeOf(() => pay(1000, { created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
          expect(codeOf(() => pay(1000, { party_id: uuid(999) }))).toBe('NOT_FOUND');
          expect(pay(1000).receipt_no).toBe('RCP-A-000001');
        });

        it('writes no audit row: the payments table is the record of a payment', () => {
          creditSale(1);
          const auditBefore = w.rows('audit_log').length;
          pay(1000);
          expect(w.rows('audit_log')).toHaveLength(auditBefore);
        });
      });

      it('supplier payments are unchanged: they return the payment id and take no receipt number', () => {
        s.purchase.record({ supplier_id: ID.supplier, created_by: ID.owner, items: [{ product_id: ID.bottle, batch_no: 'N1', expiry_date: w.day(400), qty: 5000, cost_price: 42_000 }] });
        const id = s.payment.payToSupplier({ party_id: ID.supplier, amount: 1000, method: 'bank', created_by: ID.owner });
        expect(w.rows('payments').at(-1)).toMatchObject({ id, receipt_no: null, note: null });
      });
    });

    describe('statement', () => {
      /** Opening 30,000 (day -10); a sale of 100,000 with 40,000 paid (day -8); a Jazzcash payment (day -5); a return (day -3); an adjustment (day -2); cash (today). */
      function history() {
        w.setNow(w.at(-10));
        s.khata.setOpeningBalance({ customer_id: ID.customer, amount: 30_000, created_by: ID.owner });
        w.setNow(w.at(-8));
        const sale = creditSale(2, { paid_amount: 40_000 });
        w.setNow(w.at(-5));
        const received = pay(10_000, { method: 'jazzcash', reference_no: 'JC-9', note: 'part payment' });
        w.setNow(w.at(-3));
        const ret = s.salesReturn.create({ invoice_id: sale.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: sale.items[0]!.id, qty: 1000, condition: 'resellable' }] });
        w.setNow(w.at(-2));
        rawLedger({ entry_type: 'adjustment', amount_delta: 1234, entry_date: `${w.day(-2)}T09:00:00.000Z` });
        w.setNow(w.at(0));
        const cash = pay(5000);
        return { sale, received, ret, cash };
      }

      it('every line has its label, amounts, running balance and the display data: invoice number, return number, method, reference, receipt number, note', () => {
        const { sale, received, ret, cash } = history();
        const st = s.khata.statement({ customer_id: ID.customer });
        expect(st.customer).toEqual({ id: ID.customer, name_en: 'Rashid', name_ur: null, phone: null, village: null });
        expect(st.from).toBeNull();
        expect(st.to).toBeNull();
        expect(st.lines.map((l) => [l.kind, l.label, l.amount_delta])).toEqual([
          ['entry', 'opening', 30_000],
          ['entry', 'sale', 100_000],
          ['entry', 'payment', -40_000],
          ['entry', 'payment', -10_000],
          ['entry', 'return', -50_000],
          ['entry', 'adjustment', 1234],
          ['entry', 'payment', -5000],
        ]);
        expect(st.lines.map((l) => l.running_balance)).toEqual([30_000, 130_000, 90_000, 80_000, 30_000, 31_234, 26_234]);
        const [opening, saleLine, atSale, jazz, returnLine, adjustment, cashLine] = st.lines;
        expect(opening).toMatchObject({ invoice_no: null, return_no: null, payment_method: null, reference_no: null, receipt_no: null, note: null });
        expect(saleLine).toMatchObject({ invoice_no: sale.invoice.invoice_no, return_no: null, payment_method: null });
        expect(atSale).toMatchObject({ payment_method: 'cash', receipt_no: null, invoice_no: null });
        expect(jazz).toMatchObject({ payment_method: 'jazzcash', reference_no: 'JC-9', receipt_no: received.receipt_no, note: 'part payment' });
        expect(returnLine).toMatchObject({ return_no: ret.sales_return.return_no, invoice_no: null, payment_method: null });
        expect(adjustment).toMatchObject({ invoice_no: null, return_no: null, payment_method: null, receipt_no: null });
        expect(cashLine).toMatchObject({ payment_method: 'cash', receipt_no: cash.receipt_no, reference_no: null, note: null });
        expect(st.lines.every((l) => l.entry !== null)).toBe(true);
      });

      it('without a range: nothing brought forward, totals are the plus rows and the minus rows, and the closing balance is the ledger sum', () => {
        history();
        const st = s.khata.statement({ customer_id: ID.customer });
        expect(st.brought_forward).toBe(0);
        expect(st.totals).toEqual({ owes_more: 30_000 + 100_000 + 1234, owes_less: 40_000 + 10_000 + 50_000 + 5000 });
        expect(st.closing_balance).toBe(26_234);
        expect(st.closing_balance).toBe(ledgerSum());
        expect(st.closing_balance).toBe(s.khata.balance(ID.customer));
        expect(st.brought_forward + st.totals.owes_more - st.totals.owes_less).toBe(st.closing_balance);
      });

      it('with from: the first line is "brought forward", equal to the balance before that day, and the running balance starts from it', () => {
        history();
        const st = s.khata.statement({ customer_id: ID.customer, from: w.day(-5) });
        expect(st.brought_forward).toBe(30_000 + 100_000 - 40_000);
        expect(st.lines[0]).toMatchObject({ kind: 'brought_forward', label: 'brought_forward', entry: null, amount_delta: 90_000, running_balance: 90_000 });
        expect(st.lines.slice(1).map((l) => [l.label, l.running_balance])).toEqual([['payment', 80_000], ['return', 30_000], ['adjustment', 31_234], ['payment', 26_234]]);
        expect(st.totals).toEqual({ owes_more: 1234, owes_less: 10_000 + 50_000 + 5000 });
        expect(st.closing_balance).toBe(26_234);
        expect(st.closing_balance).toBe(s.khata.balance(ID.customer));
      });

      it('with to: later rows are left out and the closing balance is the ledger sum up to the end of that day', () => {
        history();
        const st = s.khata.statement({ customer_id: ID.customer, to: w.day(-3) });
        expect(st.lines.map((l) => l.label)).toEqual(['opening', 'sale', 'payment', 'payment', 'return']);
        expect(st.closing_balance).toBe(30_000);
        expect(st.closing_balance).toBe(ledgerSum(w.day(-3)));
        expect(st.totals).toEqual({ owes_more: 130_000, owes_less: 100_000 });
      });

      it('both ends are included, and from = to shows one day with the balance before it brought forward', () => {
        history();
        const st = s.khata.statement({ customer_id: ID.customer, from: w.day(-8), to: w.day(-8) });
        expect(st.brought_forward).toBe(30_000);
        expect(st.lines.map((l) => [l.label, l.running_balance])).toEqual([['brought_forward', 30_000], ['sale', 130_000], ['payment', 90_000]]);
        expect(st.closing_balance).toBe(ledgerSum(w.day(-8)));
      });

      it('a range with no rows shows only the brought-forward line, and the closing balance equals it', () => {
        history();
        const future = s.khata.statement({ customer_id: ID.customer, from: w.day(5) });
        expect(future.lines).toHaveLength(1);
        expect(future).toMatchObject({ brought_forward: 26_234, closing_balance: 26_234, totals: { owes_more: 0, owes_less: 0 } });
        const early = s.khata.statement({ customer_id: ID.customer, to: w.day(-20) });
        expect(early).toMatchObject({ lines: [], brought_forward: 0, closing_balance: 0, totals: { owes_more: 0, owes_less: 0 } });
      });

      it('adjustment and return rows are counted in the closing balance (it never disagrees with the ledger)', () => {
        history();
        for (const range of [{}, { from: w.day(-3) }, { from: w.day(-2), to: w.day(-2) }, { to: w.day(-1) }, { from: w.day(-9), to: w.day(-2) }]) {
          const st = s.khata.statement({ customer_id: ID.customer, ...range });
          const upTo = 'to' in range ? ledgerSum((range as { to: string }).to) : ledgerSum();
          expect(st.closing_balance, JSON.stringify(range)).toBe(upTo);
        }
      });

      it('rows are in (entry_date, insertion) order: a row dated earlier but written later sits where its date puts it; ties keep insertion order', () => {
        history();
        rawLedger({ entry_type: 'adjustment', amount_delta: -7, entry_date: `${w.day(-9)}T00:00:00.000Z` }); // written last, dated between opening and the sale
        rawLedger({ entry_type: 'adjustment', amount_delta: 11, entry_date: `${w.day(-9)}T00:00:00.000Z` }); // same moment: after the one above
        const st = s.khata.statement({ customer_id: ID.customer });
        expect(st.lines.map((l) => l.amount_delta).slice(0, 4)).toEqual([30_000, -7, 11, 100_000]);
        expect(st.lines.map((l) => l.running_balance).slice(0, 4)).toEqual([30_000, 29_993, 30_004, 130_004]);
        expect(st.closing_balance).toBe(26_238);
      });

      it('shows only this CUSTOMER\'s rows: a supplier row that carries the same party id never leaks in', () => {
        history();
        // the database refuses a ledger row for a party that does not exist, so make a supplier whose id equals the customer's id (ids are only unique per table)
        w.deps.uow.run((tx) => tx.suppliers.insert({ id: ID.customer, name_en: 'Same Id Supplier', name_ur: null, phone: null, address: null, ...w.deps.scope }));
        rawLedger({ party_type: 'supplier', entry_type: 'purchase', amount_delta: 777_777, entry_date: `${w.day(-4)}T00:00:00.000Z` });
        const st = s.khata.statement({ customer_id: ID.customer });
        expect(st.lines).toHaveLength(7);
        expect(st.lines.some((l) => l.amount_delta === 777_777)).toBe(false);
        expect(st.closing_balance).toBe(26_234);
        expect(st.closing_balance).toBe(s.khata.balance(ID.customer));
      });

      it('a customer with no history has an empty statement', () => {
        const st = s.khata.statement({ customer_id: ID.customer });
        expect(st).toMatchObject({ lines: [], brought_forward: 0, closing_balance: 0, totals: { owes_more: 0, owes_less: 0 } });
      });

      it('rejects a from after the to, a date that is not a date, unknown keys, and an unknown or deleted customer', () => {
        expect(codeOf(() => s.khata.statement({ customer_id: ID.customer, from: w.day(2), to: w.day(1) }))).toBe('INVALID_INPUT');
        for (const bad of ['yesterday', '2026-13-01', '2026-02-30', '26-01-01', '2026-1-1']) {
          expect(codeOf(() => s.khata.statement({ customer_id: ID.customer, from: bad })), bad).toBe('INVALID_INPUT');
          expect(codeOf(() => s.khata.statement({ customer_id: ID.customer, to: bad })), bad).toBe('INVALID_INPUT');
        }
        expect(codeOf(() => s.khata.statement({ customer_id: ID.customer, party_type: 'supplier' } as never))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.khata.statement({ customer_id: uuid(999) }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.khata.statement({ customer_id: ID.supplier }))).toBe('NOT_FOUND'); // a supplier is not a customer
      });

      it('reads only: a statement writes nothing', () => {
        history();
        const before = w.snapshot();
        s.khata.statement({ customer_id: ID.customer, from: w.day(-5), to: w.day(0) });
        expect(w.snapshot()).toEqual(before);
      });
    });
  });
}
