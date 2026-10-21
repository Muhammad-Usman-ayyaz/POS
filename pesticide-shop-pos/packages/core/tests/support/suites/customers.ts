// Customers (Phase 6, M1): create, update, terms, duplicates, the Khata list and summaries, phone search, shop settings.
// Runs on every backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';

// The same Urdu name typed with an Arabic yeh (U+064A) and with a Persian/Urdu yeh (U+06CC): one name to a reader.
const ALI_ARABIC_YEH = 'علي';
const ALI_URDU_YEH = 'علی';

export function defineCustomerTests(make: WorldFactory): void {
  describe('customers', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const staffCreate = (fields: object, extra: object = {}) => s.customers.create({ fields, created_by: ID.staff, ...extra });
    const ownerCreate = (fields: object, extra: object = {}) => s.customers.create({ fields, created_by: ID.owner, privileged: true, ...extra });
    const row = (id: string) => w.rows('customers').find((r) => r.id === id)!;
    const version = (id: string) => row(id).version as number;
    const creditSale = (customer: string, packs: number, extra: object = {}) =>
      s.sale.create({ customer_id: customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: ID.bottle, qty: packs * 1000 }], ...extra });
    const owes = (customer: string, amount: number) => s.khata.setOpeningBalance({ customer_id: customer, amount, created_by: ID.owner });
    /** Runs `fn` with the machine time zone set to `zone` (and checks it took effect), then puts the old zone back. */
    const withTimeZone = (zone: string, fn: () => void) => {
      const saved = process.env.TZ;
      process.env.TZ = zone;
      try {
        const evening = new Date('2026-03-10T23:30:00.000Z');
        const early = new Date('2026-03-11T00:30:00.000Z');
        expect(evening.getDate() !== evening.getUTCDate() || early.getDate() !== early.getUTCDate(), `${zone} is in effect`).toBe(true);
        fn();
      } finally {
        if (saved === undefined) delete process.env.TZ;
        else process.env.TZ = saved;
      }
    };
    const expectUnchanged = (action: () => unknown, code: string) => {
      const before = w.snapshot();
      expect(codeOf(action)).toBe(code);
      expect(w.snapshot()).toEqual(before);
    };

    describe('create', () => {
      it('a staff member adds a customer with contact fields: shop scope, retail, no limit, balance 0', () => {
        const made = staffCreate({ name_en: '  Aslam   Khan ', phone: '0300-1111111', village: 'Kot Addu', notes: 'pays on harvest' });
        expect(made.customer).toMatchObject({
          name_en: 'Aslam Khan', name_ur: null, phone: '0300-1111111', village: 'Kot Addu', notes: 'pays on harvest',
          credit_limit: 0, default_price_type: 'retail', father_name: null, cnic: null, phone2: null, guarantor: null, version: 1, ...w.deps.scope,
        });
        expect(made).toMatchObject({ balance: 0, no_limit: true, credit_left: null, over_limit: false, next_due: null, overdue_amount: 0, overdue_days: 0 });
        expect(row(made.customer.id)).toMatchObject({ name_en: 'Aslam Khan', credit_limit: 0 });
        expect(w.rows('ledger_entries')).toHaveLength(0); // a customer starts with no ledger row
      });

      it('an Urdu-only customer is fine, and one name is required', () => {
        expect(staffCreate({ name_ur: ALI_URDU_YEH }).customer).toMatchObject({ name_en: null, name_ur: ALI_URDU_YEH });
        expect(codeOf(() => staffCreate({}))).toBe('INVALID_INPUT');
        expect(codeOf(() => staffCreate({ name_en: '   ', name_ur: '' }))).toBe('INVALID_INPUT');
        expect(codeOf(() => staffCreate({ phone: '0300' }))).toBe('INVALID_INPUT');
      });

      it('a new customer starts with the shop setting default_credit_limit (code default 0)', () => {
        expect(staffCreate({ name_en: 'Zero' }).customer.credit_limit).toBe(0);
        w.setSetting('default_credit_limit', '2500000');
        expect(staffCreate({ name_en: 'Limited' })).toMatchObject({ customer: { credit_limit: 2_500_000 }, credit_left: 2_500_000, no_limit: false });
        w.setSetting('default_credit_limit', 'garbage');
        expect(staffCreate({ name_en: 'Back to zero' }).customer.credit_limit).toBe(0);
        w.setSetting('default_credit_limit', '-5');
        expect(staffCreate({ name_en: 'Never negative' }).customer.credit_limit).toBe(0);
      });

      it('the owner who sends a limit of 0 gets 0 (no limit) even when the shop default is not 0; staff and an owner who sends none get the default', () => {
        w.setSetting('default_credit_limit', '500000');
        const zero = ownerCreate({ name_en: 'Owner Zero', credit_limit: 0 });
        expect(zero.customer.credit_limit).toBe(0);
        expect(zero).toMatchObject({ no_limit: true, credit_left: null });
        expect(row(zero.customer.id).credit_limit).toBe(0);
        expect(ownerCreate({ name_en: 'Owner Default' }).customer.credit_limit).toBe(500_000);
        expect(ownerCreate({ name_en: 'Owner Own', credit_limit: 70_000 }).customer.credit_limit).toBe(70_000);
        expect(staffCreate({ name_en: 'Staff Default' }).customer.credit_limit).toBe(500_000);
      });

      it('village, notes and phone are tidied at create (spaces collapsed, blank becomes null), like the names', () => {
        const made = staffCreate({ name_en: 'Tidy', village: '  Kot   Addu ', notes: '  pays   on  harvest  ', phone: '  0300-1  ' });
        expect(made.customer).toMatchObject({ village: 'Kot Addu', notes: 'pays on harvest', phone: '0300-1' });
        expect(row(made.customer.id)).toMatchObject({ village: 'Kot Addu', notes: 'pays on harvest' });
        expect(staffCreate({ name_en: 'Blank', village: '   ', notes: '' }).customer).toMatchObject({ village: null, notes: null });
      });

      it('a staff create that carries a credit limit, price type or farmer field is REFUSED, not quietly dropped', () => {
        const attempts: object[] = [
          { name_en: 'X', credit_limit: 500_000 },
          { name_en: 'X', credit_limit: 0 },
          { name_en: 'X', default_price_type: 'wholesale' },
          { name_en: 'X', default_price_type: 'retail' },
          { name_en: 'X', father_name: 'Y' },
          { name_en: 'X', cnic: '12345-1234567-1' },
          { name_en: 'X', phone2: '0301' },
          { name_en: 'X', guarantor: 'Z' },
        ];
        const before = w.snapshot();
        for (const fields of attempts) {
          const e = errorOf(() => staffCreate(fields));
          expect(e.code).toBe('FIELD_NOT_ALLOWED');
          expect(String(e.params.fields)).toContain(Object.keys(fields).find((k) => k !== 'name_en')!);
        }
        expect(w.snapshot()).toEqual(before);
      });

      it('the owner (privileged) sets the limit, price type and farmer details at creation', () => {
        const made = ownerCreate({ name_en: 'Big Farmer', credit_limit: 9_000_000, default_price_type: 'wholesale', father_name: 'Haji Bashir', cnic: '35202-1234567-1', phone2: '0321-2222222', guarantor: 'Naeem' });
        expect(made.customer).toMatchObject({ credit_limit: 9_000_000, default_price_type: 'wholesale', father_name: 'Haji Bashir', cnic: '35202-1234567-1', phone2: '0321-2222222', guarantor: 'Naeem' });
      });

      it('privileged is checked against the real user: a staff member cannot claim it, an inactive user cannot create', () => {
        expect(codeOf(() => s.customers.create({ fields: { name_en: 'A', credit_limit: 1 }, created_by: ID.staff, privileged: true }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.customers.create({ fields: { name_en: 'A' }, created_by: ID.inactive }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.customers.create({ fields: { name_en: 'A' }, created_by: uuid(999) }))).toBe('NOT_FOUND');
        expect(w.rows('customers')).toHaveLength(1);
      });

      it('rejects bad values and unknown keys (including identity fields sent in the fields)', () => {
        expect(codeOf(() => ownerCreate({ name_en: 'A', credit_limit: -1 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => ownerCreate({ name_en: 'A', credit_limit: 10.5 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => ownerCreate({ name_en: 'A', default_price_type: 'gold' }))).toBe('INVALID_INPUT');
        expect(codeOf(() => staffCreate({ name_en: 'A', created_by: ID.owner }))).toBe('INVALID_INPUT');
        expect(codeOf(() => staffCreate({ name_en: 'A', version: 9 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.create({ fields: { name_en: 'A' }, created_by: ID.staff, actor_id: ID.owner } as never))).toBe('INVALID_INPUT');
        expect(w.rows('customers')).toHaveLength(1);
      });
    });

    describe('duplicates', () => {
      const existing = () => {
        const first = ownerCreate({ name_en: 'Rashid Ali', phone: '0300-1234567', village: 'Kot', credit_limit: 100 });
        owes(first.customer.id, 40_000);
        return first.customer.id;
      };

      it('the same name (case, spacing) needs confirm_duplicate; the error carries the matches with village, phone and balance', () => {
        const first = existing();
        const before = w.snapshot();
        const e = errorOf(() => staffCreate({ name_en: ' rashid   ALI ' }));
        expect(e.code).toBe('DUPLICATE_CUSTOMER');
        expect(e.params.count).toBe(1);
        expect(JSON.parse(String(e.params.matches))).toEqual([
          { customer_id: first, name_en: 'Rashid Ali', name_ur: null, village: 'Kot', phone: '0300-1234567', balance: 40_000, same_name: true, same_phone: false },
        ]);
        expect(w.snapshot()).toEqual(before);

        const saved = staffCreate({ name_en: 'rashid ali' }, { confirm_duplicate: true });
        expect(saved.customer.id).not.toBe(first);
        expect(w.rows('customers')).toHaveLength(3);
      });

      it('the same phone typed another way (+92, dashes, spaces, leading 0) is a duplicate even with a different name', () => {
        existing();
        for (const phone of ['+92 300 1234567', '03001234567', '300-1234567', '0092 300 1234567']) {
          const e = errorOf(() => staffCreate({ name_en: 'Somebody Else', phone }));
          expect(e.code, phone).toBe('DUPLICATE_CUSTOMER');
          expect(JSON.parse(String(e.params.matches))[0]).toMatchObject({ same_phone: true, same_name: false });
        }
        expect(staffCreate({ name_en: 'Somebody Else', phone: '+92 300 1234567' }, { confirm_duplicate: true }).customer.phone).toBe('+92 300 1234567');
      });

      it('confirm_duplicate is also needed when ONLY the phone matches, and a different name and phone is never a duplicate', () => {
        existing();
        expectUnchanged(() => staffCreate({ name_en: 'Another', phone: '0300 1234567' }), 'DUPLICATE_CUSTOMER');
        expect(staffCreate({ name_en: 'Another', phone: '0300 7654321' }).customer.name_en).toBe('Another');
      });

      it('the same name with a DIFFERENT phone is still a duplicate (the name alone is enough)', () => {
        existing();
        const e = errorOf(() => staffCreate({ name_en: 'Rashid Ali', phone: '0345 9999999' }));
        expect(e.code).toBe('DUPLICATE_CUSTOMER');
        expect(JSON.parse(String(e.params.matches))[0]).toMatchObject({ same_name: true, same_phone: false });
        expect(s.customers.findDuplicates({ name_en: 'Rashid Ali', phone: '0345 9999999' })).toEqual([expect.objectContaining({ same_name: true, same_phone: false })]);
      });

      it('a match on the SECOND phone alone is a duplicate', () => {
        const farmer = ownerCreate({ name_en: 'Two Phones', phone: '0300-1111111', phone2: '0333-5556677' });
        const e = errorOf(() => staffCreate({ name_en: 'Different Person', phone: '+92 333 5556677' }));
        expect(e.code).toBe('DUPLICATE_CUSTOMER');
        expect(JSON.parse(String(e.params.matches))).toEqual([expect.objectContaining({ customer_id: farmer.customer.id, same_phone: true, same_name: false })]);
        expect(s.customers.findDuplicates({ phone: '03335556677' })).toEqual([expect.objectContaining({ customer_id: farmer.customer.id, same_phone: true })]);
      });

      it('the owner is refused too without confirm_duplicate, and can confirm', () => {
        existing();
        expectUnchanged(() => ownerCreate({ name_en: 'Rashid Ali' }), 'DUPLICATE_CUSTOMER');
        expectUnchanged(() => ownerCreate({ name_en: 'Other', phone: '03001234567', credit_limit: 5 }), 'DUPLICATE_CUSTOMER');
        expect(ownerCreate({ name_en: 'Rashid Ali' }, { confirm_duplicate: true }).customer.name_en).toBe('Rashid Ali');
      });

      it('alef with hamza and plain alef read as the same Urdu name', () => {
        const first = staffCreate({ name_ur: 'أحمد' });
        expect(errorOf(() => staffCreate({ name_ur: 'احمد' })).code).toBe('DUPLICATE_CUSTOMER');
        expect(s.customers.findDuplicates({ name_ur: 'احمد' }).map((m) => m.customer_id)).toEqual([first.customer.id]);
        expect(s.customers.findDuplicates({ name_ur: 'إحمد' }).map((m) => m.customer_id)).toEqual([first.customer.id]);
      });

      it('two customers with no phone are not duplicates of each other on phone', () => {
        staffCreate({ name_en: 'No Phone One' });
        expect(staffCreate({ name_en: 'No Phone Two' }).customer.name_en).toBe('No Phone Two');
      });

      it('Urdu spellings that read alike (Arabic yeh and Urdu yeh) are the same name', () => {
        const first = staffCreate({ name_ur: ALI_ARABIC_YEH });
        const e = errorOf(() => staffCreate({ name_ur: ALI_URDU_YEH }));
        expect(e.code).toBe('DUPLICATE_CUSTOMER');
        expect(JSON.parse(String(e.params.matches))[0]).toMatchObject({ customer_id: first.customer.id, same_name: true });
        expect(s.customers.findDuplicates({ name_ur: ALI_URDU_YEH }).map((m) => m.customer_id)).toEqual([first.customer.id]);
      });

      it('an English name matches an Urdu-name column too (either language against either)', () => {
        const first = staffCreate({ name_ur: 'Khan' });
        expect(s.customers.findDuplicates({ name_en: 'khan' }).map((m) => m.customer_id)).toEqual([first.customer.id]);
      });

      it('a soft-deleted customer is not a duplicate', () => {
        const first = existing();
        w.update('customers', first, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(staffCreate({ name_en: 'Rashid Ali', phone: '0300-1234567' }).customer.name_en).toBe('Rashid Ali');
      });

      it('findDuplicates never blocks: it lists the matches with the flags, balance, village and phone, and nothing for an empty probe', () => {
        const first = existing();
        const byName = s.customers.findDuplicates({ name_en: 'rashid ali' });
        expect(byName).toEqual([{ customer_id: first, name_en: 'Rashid Ali', name_ur: null, village: 'Kot', phone: '0300-1234567', balance: 40_000, same_name: true, same_phone: false }]);
        expect(s.customers.findDuplicates({ phone: '+923001234567' })).toEqual([expect.objectContaining({ customer_id: first, same_phone: true, same_name: false })]);
        expect(s.customers.findDuplicates({ name_en: 'rashid ali', phone: '3001234567' })).toEqual([expect.objectContaining({ same_phone: true, same_name: true })]);
        expect(s.customers.findDuplicates({ name_en: 'Nobody Here' })).toEqual([]);
        expect(s.customers.findDuplicates({})).toEqual([]);
        expect(s.customers.findDuplicates()).toEqual([]);
      });
    });

    describe('update (contact fields only)', () => {
      it('changes contact fields, moves the version and returns the summary', () => {
        const made = staffCreate({ name_en: 'Aslam', village: 'Kot' });
        const done = s.customers.update({ customer_id: made.customer.id, fields: { name_en: 'Aslam Khan', phone: '0300-5', notes: 'n' }, expected_version: 1, actor: ID.staff });
        expect(done.customer).toMatchObject({ name_en: 'Aslam Khan', village: 'Kot', phone: '0300-5', notes: 'n', version: 2 });
        expect(version(made.customer.id)).toBe(2);
      });

      it('credit limit, price type and farmer fields are NOT accepted here: they go through setTerms', () => {
        const made = ownerCreate({ name_en: 'Aslam', credit_limit: 500 });
        for (const fields of [{ credit_limit: 9_999_999 }, { default_price_type: 'wholesale' }, { father_name: 'X' }, { cnic: '1' }, { phone2: '1' }, { guarantor: 'g' }]) {
          expect(codeOf(() => s.customers.update({ customer_id: made.customer.id, fields: fields as never, expected_version: 1, actor: ID.owner }))).toBe('INVALID_INPUT');
        }
        expect(row(made.customer.id)).toMatchObject({ credit_limit: 500, default_price_type: 'retail', father_name: null, version: 1 });
      });

      it('a stale expected_version is VERSION_CONFLICT and changes nothing; the fresh one works', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        const id = made.customer.id;
        s.customers.update({ customer_id: id, fields: { village: 'A' }, expected_version: 1, actor: ID.staff });
        const e = errorOf(() => s.customers.update({ customer_id: id, fields: { village: 'B' }, expected_version: 1, actor: ID.owner }));
        expect(e.code).toBe('VERSION_CONFLICT');
        expect(e.params).toMatchObject({ expected_version: 1, current_version: 2 });
        expect(row(id)).toMatchObject({ village: 'A', version: 2 });
        expect(s.customers.update({ customer_id: id, fields: { village: 'B' }, expected_version: 2, actor: ID.owner }).customer.village).toBe('B');
        // a version from the future is no better than a stale one
        expect(codeOf(() => s.customers.update({ customer_id: id, fields: { village: 'C' }, expected_version: 9, actor: ID.owner }))).toBe('VERSION_CONFLICT');
      });

      it('a field left out keeps its value; null clears it; the last name cannot be cleared', () => {
        const made = staffCreate({ name_en: 'Aslam', name_ur: ALI_URDU_YEH, village: 'Kot', phone: '1' });
        const id = made.customer.id;
        const a = s.customers.update({ customer_id: id, fields: { village: null }, expected_version: 1, actor: ID.staff });
        expect(a.customer).toMatchObject({ village: null, phone: '1', name_en: 'Aslam' });
        const b = s.customers.update({ customer_id: id, fields: { name_en: null }, expected_version: 2, actor: ID.staff });
        expect(b.customer).toMatchObject({ name_en: null, name_ur: ALI_URDU_YEH });
        expectUnchanged(() => s.customers.update({ customer_id: id, fields: { name_ur: '  ' }, expected_version: 3, actor: ID.staff }), 'INVALID_INPUT');
      });

      it('village and notes are tidied at update too, and a blank clears them', () => {
        const made = staffCreate({ name_en: 'Aslam', village: 'Kot', notes: 'x' });
        const done = s.customers.update({ customer_id: made.customer.id, fields: { village: '  Chak   5  ', notes: ' new   note ' }, expected_version: 1, actor: ID.staff });
        expect(done.customer).toMatchObject({ village: 'Chak 5', notes: 'new note', version: 2 });
        expect(row(made.customer.id)).toMatchObject({ village: 'Chak 5', notes: 'new note' });
        expect(s.customers.update({ customer_id: made.customer.id, fields: { village: '   ', notes: '' }, expected_version: 2, actor: ID.staff }).customer).toMatchObject({ village: null, notes: null, version: 3 });
      });

      it('an expected_version exactly one AHEAD of the current one is refused too (it must match, not just be new enough)', () => {
        const made = ownerCreate({ name_en: 'Aslam' });
        const id = made.customer.id;
        expectUnchanged(() => s.customers.update({ customer_id: id, fields: { village: 'A' }, expected_version: 2, actor: ID.staff }), 'VERSION_CONFLICT');
        expectUnchanged(() => s.customers.setTerms({ customer_id: id, credit_limit: 5, default_price_type: 'retail', expected_version: 2, actor: ID.owner }), 'VERSION_CONFLICT');
        expect(version(id)).toBe(1);
      });

      it('a change that changes nothing writes nothing (the version stays)', () => {
        const made = staffCreate({ name_en: 'Aslam', village: 'Kot' });
        const again = s.customers.update({ customer_id: made.customer.id, fields: { name_en: ' Aslam ', village: 'Kot' }, expected_version: 1, actor: ID.staff });
        expect(again.customer.version).toBe(1);
      });

      it('refuses a soft-deleted or unknown customer and an inactive actor', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        expect(codeOf(() => s.customers.update({ customer_id: uuid(999), fields: { village: 'x' }, expected_version: 1, actor: ID.staff }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.customers.update({ customer_id: made.customer.id, fields: { village: 'x' }, expected_version: 1, actor: ID.inactive }))).toBe('NOT_AUTHORIZED');
        w.update('customers', made.customer.id, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(codeOf(() => s.customers.update({ customer_id: made.customer.id, fields: { village: 'x' }, expected_version: 2, actor: ID.staff }))).toBe('NOT_FOUND');
      });
    });

    describe('setTerms (owner only, audited)', () => {
      const terms = (id: string, over: object = {}) => ({ customer_id: id, credit_limit: 500_000, default_price_type: 'wholesale' as const, expected_version: 1, actor: ID.owner, ...over });

      it('sets the limit, price type and farmer details, and writes ONE audit row with before and after in the same transaction', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        const done = s.customers.setTerms(terms(made.customer.id, { father_name: 'Haji', cnic: '35202', phone2: '0301', guarantor: 'Naeem' }));
        expect(done.changed.sort()).toEqual(['cnic', 'credit_limit', 'default_price_type', 'father_name', 'guarantor', 'phone2']);
        expect(done.customer.customer).toMatchObject({ credit_limit: 500_000, default_price_type: 'wholesale', father_name: 'Haji', cnic: '35202', phone2: '0301', guarantor: 'Naeem', version: 2 });
        const audit = w.rows('audit_log').filter((r) => r.action === 'customer_terms_changed');
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ user_id: ID.owner, table_name: 'customers', row_id: made.customer.id });
        const details = JSON.parse(audit[0]!.details as string);
        expect(details.before).toMatchObject({ credit_limit: 0, default_price_type: 'retail', father_name: null });
        expect(details.after).toMatchObject({ credit_limit: 500_000, default_price_type: 'wholesale', father_name: 'Haji' });
        expect(details.fields.sort()).toEqual(done.changed.sort());
        expect(details.customer_id).toBe(made.customer.id);
        expect(details).not.toHaveProperty('below_balance');
      });

      it('lists only the fields that really changed', () => {
        const made = ownerCreate({ name_en: 'Aslam', credit_limit: 500_000 });
        s.customers.setTerms(terms(made.customer.id, { credit_limit: 700_000, default_price_type: 'retail' }));
        const details = JSON.parse(w.rows('audit_log').find((r) => r.action === 'customer_terms_changed')!.details as string);
        expect(details.fields).toEqual(['credit_limit']);
        expect(details.before).toEqual({ credit_limit: 500_000 });
        expect(details.after).toEqual({ credit_limit: 700_000 });
      });

      it('staff may not (NOT_AUTHORIZED), and nothing is written', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        expectUnchanged(() => s.customers.setTerms(terms(made.customer.id, { actor: ID.staff })), 'NOT_AUTHORIZED');
        expectUnchanged(() => s.customers.setTerms(terms(made.customer.id, { actor: ID.inactive })), 'NOT_AUTHORIZED');
      });

      it('the audit row and the change are one unit: if the audit row cannot be written the terms are not changed', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        const before = w.snapshot();
        w.failOnInsert('audit_log', 1);
        expect(() => s.customers.setTerms(terms(made.customer.id))).toThrow('injected failure');
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
        expect(row(made.customer.id)).toMatchObject({ credit_limit: 0, version: 1 });
      });

      it('lowering the limit below what is owed is allowed but flagged below_balance', () => {
        const made = ownerCreate({ name_en: 'Aslam', credit_limit: 1_000_000 });
        owes(made.customer.id, 300_000);
        const a = s.customers.setTerms(terms(made.customer.id, { credit_limit: 200_000 }));
        expect(a.below_balance).toBe(true);
        expect(a.customer).toMatchObject({ balance: 300_000, credit_left: 0, over_limit: true });
        expect(JSON.parse(w.rows('audit_log').find((r) => r.action === 'customer_terms_changed')!.details as string)).toMatchObject({ below_balance: true, balance: 300_000, customer_id: made.customer.id });
        // exactly the balance is not below it; raising it is not
        expect(s.customers.setTerms(terms(made.customer.id, { credit_limit: 300_000, expected_version: 2 })).below_balance).toBe(false);
        expect(s.customers.setTerms(terms(made.customer.id, { credit_limit: 400_000, expected_version: 3 })).below_balance).toBe(false);
      });

      it('limit 0 (no limit) is never below the balance; and an untouched limit that is already under the balance is not flagged again', () => {
        const made = ownerCreate({ name_en: 'Aslam', credit_limit: 100 });
        owes(made.customer.id, 300_000);
        expect(s.customers.setTerms(terms(made.customer.id, { credit_limit: 0 })).below_balance).toBe(false);
        const again = s.customers.setTerms(terms(made.customer.id, { credit_limit: 0, default_price_type: 'retail', expected_version: 2 }));
        expect(again.below_balance).toBe(false);
        const over = ownerCreate({ name_en: 'Over', credit_limit: 100 });
        owes(over.customer.id, 300_000);
        expect(s.customers.setTerms(terms(over.customer.id, { credit_limit: 100, default_price_type: 'retail' })).below_balance).toBe(false); // nothing changed
      });

      it('setting the same terms again writes nothing: no audit row, no new version', () => {
        const made = ownerCreate({ name_en: 'Aslam', credit_limit: 500_000, default_price_type: 'wholesale' });
        const before = w.snapshot();
        const done = s.customers.setTerms(terms(made.customer.id));
        expect(done.changed).toEqual([]);
        expect(w.snapshot()).toEqual(before);
      });

      it('farmer fields left out keep their value; null clears them', () => {
        const made = ownerCreate({ name_en: 'Aslam', father_name: 'Haji', guarantor: 'N' });
        s.customers.setTerms(terms(made.customer.id, { credit_limit: 0, default_price_type: 'retail' }));
        expect(row(made.customer.id)).toMatchObject({ father_name: 'Haji', guarantor: 'N' });
        s.customers.setTerms(terms(made.customer.id, { credit_limit: 0, default_price_type: 'retail', father_name: null, expected_version: 1 }));
        expect(row(made.customer.id)).toMatchObject({ father_name: null, guarantor: 'N' });
      });

      it('a stale expected_version is VERSION_CONFLICT and changes nothing', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        s.customers.update({ customer_id: made.customer.id, fields: { village: 'A' }, expected_version: 1, actor: ID.staff }); // someone else edits
        expectUnchanged(() => s.customers.setTerms(terms(made.customer.id, { expected_version: 1 })), 'VERSION_CONFLICT');
        expect(s.customers.setTerms(terms(made.customer.id, { expected_version: 2 })).customer.customer.version).toBe(3);
      });

      it('rejects a negative or fractional limit, a bad price type, unknown keys, and a deleted customer', () => {
        const made = staffCreate({ name_en: 'Aslam' });
        for (const bad of [{ credit_limit: -1 }, { credit_limit: 1.5 }, { default_price_type: 'free' }, { actor_id: ID.owner }, { created_by: ID.owner }]) {
          expect(codeOf(() => s.customers.setTerms(terms(made.customer.id, bad)))).toBe('INVALID_INPUT');
        }
        w.update('customers', made.customer.id, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(codeOf(() => s.customers.setTerms(terms(made.customer.id, { expected_version: 2 })))).toBe('NOT_FOUND');
      });
    });

    describe('credit left', () => {
      const credit = (limit: number, balance: number) => {
        const made = ownerCreate({ name_en: `C${limit}-${balance}`, credit_limit: limit });
        if (balance !== 0) owes(made.customer.id, balance);
        return s.customers.get(made.customer.id);
      };

      it('limit minus balance, with a limit', () => {
        expect(credit(1_000_000, 250_000)).toMatchObject({ credit_left: 750_000, no_limit: false, over_limit: false, balance: 250_000 });
      });

      it('a limit of 0 is NO LIMIT: never 0 and never negative, with or without a balance', () => {
        expect(credit(0, 0)).toMatchObject({ credit_left: null, no_limit: true, over_limit: false });
        expect(credit(0, 900_000)).toMatchObject({ credit_left: null, no_limit: true, over_limit: false });
        expect(credit(0, -50_000)).toMatchObject({ credit_left: null, no_limit: true, over_limit: false });
      });

      it('over the limit is over_limit with credit_left 0, not a negative number; exactly at the limit is 0 left but not over', () => {
        expect(credit(100_000, 250_000)).toMatchObject({ credit_left: 0, over_limit: true, no_limit: false });
        expect(credit(100_000, 100_000)).toMatchObject({ credit_left: 0, over_limit: false, no_limit: false });
        expect(credit(100_000, 99_999)).toMatchObject({ credit_left: 1, over_limit: false });
      });

      it('a customer in credit (an advance) has more than the whole limit left', () => {
        expect(credit(100_000, -30_000)).toMatchObject({ credit_left: 130_000, over_limit: false, balance: -30_000 });
      });

      it('get refuses an unknown or deleted customer', () => {
        expect(codeOf(() => s.customers.get(uuid(999)))).toBe('NOT_FOUND');
        const made = staffCreate({ name_en: 'Gone' });
        w.update('customers', made.customer.id, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(codeOf(() => s.customers.get(made.customer.id))).toBe('NOT_FOUND');
        expect(codeOf(() => s.customers.get({ customer_id: made.customer.id }))).toBe('NOT_FOUND');
      });
    });

    describe('next due and overdue on the summary', () => {
      it('next_due is the due date of the oldest unpaid invoice; an opening balance has no due date and is never overdue', () => {
        const id = w.addCustomer({ name_en: 'Due', credit_limit: 0 });
        owes(id, 20_000);
        expect(s.customers.get(id)).toMatchObject({ next_due: null, overdue_amount: 0, overdue_days: 0, balance: 20_000 });
        w.setNow(w.at(0));
        creditSale(id, 2, { due_date: w.day(9) });
        w.setNow(w.at(1));
        creditSale(id, 2, { due_date: w.day(5) });
        // the OLDEST unpaid invoice decides, not the soonest date: the first invoice is due on day 9, the second (newer) on day 5
        expect(s.customers.get(id).next_due).toBe(w.day(9));

        w.setNow(w.at(29));
        // both are overdue; overdue_days is how late the worst one is (the second: day 5 to day 29)
        expect(s.customers.get(id)).toMatchObject({ overdue_amount: 200_000, overdue_days: 24 });
      });

      it('payments pay the OLDEST first: after the first invoice is covered the second one is next due and the overdue amount drops', () => {
        const id = w.addCustomer({ name_en: 'Due', credit_limit: 0 });
        w.setNow(w.at(0));
        creditSale(id, 2, { due_date: w.day(9) });
        w.setNow(w.at(1));
        creditSale(id, 2, { due_date: w.day(11) });
        w.setNow(w.at(2));
        s.payment.receiveFromCustomer({ party_id: id, amount: 100_000, method: 'cash', created_by: ID.staff });
        w.setNow(w.at(20));
        expect(s.customers.get(id)).toMatchObject({ next_due: w.day(11), overdue_amount: 100_000, overdue_days: 9, balance: 100_000 });
      });

      it('a customer who owes nothing, or is in credit, has nothing due', () => {
        const id = w.addCustomer({ name_en: 'Paid', credit_limit: 0 });
        creditSale(id, 1, { due_date: w.day(3) });
        s.payment.receiveFromCustomer({ party_id: id, amount: 50_000, method: 'cash', created_by: ID.staff });
        w.setNow(w.at(30));
        expect(s.customers.get(id)).toMatchObject({ next_due: null, overdue_amount: 0, overdue_days: 0, balance: 0 });
      });
    });

    describe('overdue edges, ties and the opening balance', () => {
      const fresh = () => w.addCustomer({ name_en: 'Edge', credit_limit: 0 });
      const overdueIds = () => s.customers.list({ filter: 'overdue' }).rows.map((r) => r.customer.id);

      it('due today is NOT overdue (all day, to the last millisecond); one day later it is overdue by 1 day, in get, khata.overdue, the filter and the card', () => {
        const id = fresh();
        w.setNow(w.at(0));
        creditSale(id, 2, { due_date: w.day(5) });
        for (const moment of [w.at(4), w.at(5, '00:00:00.000'), w.at(5, '23:59:59.999')]) {
          w.setNow(moment);
          expect(s.customers.get(id), moment).toMatchObject({ overdue_amount: 0, overdue_days: 0, next_due: w.day(5) });
          expect(s.khata.overdue(id), moment).toEqual([]);
          expect(overdueIds(), moment).not.toContain(id);
          expect(s.customers.list().totals.overdue_total, moment).toBe(0);
        }
        w.setNow(w.at(6, '00:00:00.000'));
        expect(s.customers.get(id)).toMatchObject({ overdue_amount: 100_000, overdue_days: 1, next_due: w.day(5) });
        expect(s.khata.overdue(id)).toEqual([expect.objectContaining({ due_date: w.day(5), days_overdue: 1, outstanding: 100_000 })]);
        expect(overdueIds()).toContain(id);
        expect(s.customers.list().totals.overdue_total).toBe(100_000);
      });

      it('the "overdue" filter follows overdue_amount: an invoice one day late is listed, one that is not late yet is not', () => {
        const late = fresh();
        const notYet = fresh();
        w.setNow(w.at(0));
        creditSale(late, 1, { due_date: w.day(4) });
        creditSale(notYet, 1, { due_date: w.day(5) });
        w.setNow(w.at(5));
        expect(overdueIds()).toEqual([late]);
        expect(s.customers.list({ filter: 'owes' }).rows.map((r) => r.customer.id).sort()).toEqual([late, notYet].sort());
      });

      it('"today" for overdue is the UTC day, whatever the machine time zone is', () => {
        const id = fresh();
        w.setNow(w.at(0));
        creditSale(id, 1, { due_date: w.day(5) });
        for (const zone of ['Asia/Karachi', 'America/Los_Angeles', 'Pacific/Auckland']) {
          withTimeZone(zone, () => {
            w.setNow(w.at(5, '23:30:00.000')); // already the next day in Karachi and Auckland
            expect(s.customers.get(id), zone).toMatchObject({ overdue_amount: 0, overdue_days: 0 });
            w.setNow(w.at(6, '00:30:00.000')); // still the previous day in Los Angeles
            expect(s.customers.get(id), zone).toMatchObject({ overdue_amount: 50_000, overdue_days: 1 });
          });
        }
      });

      it('two invoices written at the same moment: the one written first is the oldest, in ledger.list and in who is paid first', () => {
        const id = fresh();
        w.setNow(w.at(0));
        const first = creditSale(id, 2, { due_date: w.day(9) }); // 100,000
        const second = creditSale(id, 1, { due_date: w.day(3) }); // 50,000, the very same moment
        const entries = w.deps.uow.run((tx) => tx.ledger.list('customer', id));
        expect(entries.map((e) => e.ref_id)).toEqual([first.invoice.id, second.invoice.id]);
        expect(entries[0]!.entry_date).toBe(entries[1]!.entry_date);
        s.payment.receiveFromCustomer({ party_id: id, amount: 100_000, method: 'cash', created_by: ID.staff });
        // the money pays the first-written invoice (100,000); what is left is the second, due on day 3
        w.setNow(w.at(10));
        expect(s.customers.get(id)).toMatchObject({ balance: 50_000, next_due: w.day(3), overdue_amount: 50_000, overdue_days: 7 });
        expect(s.khata.overdue(id)).toEqual([expect.objectContaining({ invoice_id: second.invoice.id, outstanding: 50_000 })]);
      });

      it('an opening balance recorded AFTER an invoice is the newer debt: payments go to the invoice first, and the opening balance is never overdue', () => {
        const id = fresh();
        w.setNow(w.at(0));
        creditSale(id, 2, { due_date: w.day(5) }); // 100,000
        w.setNow(w.at(1));
        owes(id, 20_000);
        w.setNow(w.at(2));
        s.payment.receiveFromCustomer({ party_id: id, amount: 40_000, method: 'cash', created_by: ID.staff });
        w.setNow(w.at(10));
        // balance 80,000 = invoice 60,000 + opening 20,000; only the invoice can be overdue
        expect(s.customers.get(id)).toMatchObject({ balance: 80_000, overdue_amount: 60_000, overdue_days: 5, next_due: w.day(5) });
        expect(s.customers.list().totals).toMatchObject({ overdue_total: 60_000, total_outstanding: 80_000 + s.customers.get(ID.customer).balance });
        // paying the whole invoice leaves only the opening balance: nothing is overdue
        s.payment.receiveFromCustomer({ party_id: id, amount: 60_000, method: 'cash', created_by: ID.staff });
        expect(s.customers.get(id)).toMatchObject({ balance: 20_000, overdue_amount: 0, overdue_days: 0, next_due: null });
        expect(overdueIds()).not.toContain(id);
      });

      it('an opening balance recorded BEFORE an invoice is paid first, so the invoice stays overdue for the rest', () => {
        const id = fresh();
        w.setNow(w.at(-1));
        owes(id, 20_000);
        w.setNow(w.at(0));
        creditSale(id, 2, { due_date: w.day(5) });
        w.setNow(w.at(1));
        s.payment.receiveFromCustomer({ party_id: id, amount: 30_000, method: 'cash', created_by: ID.staff });
        w.setNow(w.at(10));
        expect(s.customers.get(id)).toMatchObject({ balance: 90_000, overdue_amount: 90_000, overdue_days: 5 });
      });
    });

    describe('list', () => {
      // A small shop. Rashid (the seeded customer) starts at 0 with a Rs 10,000 limit.
      function shop() {
        const a = w.addCustomer({ name_en: 'Alpha', name_ur: 'الف', village: 'Kot', phone: '0300-1111111', credit_limit: 0 });
        const b = w.addCustomer({ name_en: 'Bravo', village: 'Basti', phone: '0301-2222222', credit_limit: 100_000 });
        const c = w.addCustomer({ name_en: 'Charlie', village: 'Kot', credit_limit: 0 });
        const d = w.addCustomer({ name_en: 'Delta', credit_limit: 0 });
        w.setNow(w.at(0));
        creditSale(a, 2, { due_date: w.day(5) }); // owes 100,000, overdue from day 5
        creditSale(b, 1, { due_date: w.day(40) }); // owes 50,000, not due for a long time
        owes(c, 30_000); // owes 30,000, never overdue
        s.payment.receiveFromCustomer({ party_id: d, amount: 70_000, method: 'cash', confirm_advance: true, created_by: ID.staff }); // advance 70,000
        w.setNow(w.at(20));
        return { a, b, c, d };
      }

      it('rows carry the customer, balance, credit left (or no_limit), next due and overdue', () => {
        const { a, b } = shop();
        const list = s.customers.list();
        const ra = list.rows.find((r) => r.customer.id === a)!;
        const rb = list.rows.find((r) => r.customer.id === b)!;
        expect(ra).toMatchObject({ balance: 100_000, no_limit: true, credit_left: null, over_limit: false, next_due: w.day(5), overdue_amount: 100_000, overdue_days: 15 });
        expect(rb).toMatchObject({ balance: 50_000, no_limit: false, credit_left: 50_000, over_limit: false, next_due: w.day(40), overdue_amount: 0, overdue_days: 0 });
      });

      it('totals: outstanding counts POSITIVE balances only; overdue sums the overdue amounts; count is the matching rows', () => {
        shop();
        const list = s.customers.list();
        expect(list.totals).toEqual({ total_outstanding: 100_000 + 50_000 + 30_000, overdue_total: 100_000, count: 5 });
        // the advance of 70,000 did not hide anybody's debt
        expect(s.customers.list({ filter: 'owes' }).totals.count).toBe(3);
        expect(s.customers.list({ filter: 'owes' }).totals.total_outstanding).toBe(180_000); // shop-wide figures do not move with the filter
      });

      it('the two cards are shop-wide under the overdue filter and under a search; only count follows the filter', () => {
        shop();
        const shopWide = { total_outstanding: 180_000, overdue_total: 100_000 };
        expect(s.customers.list({ filter: 'overdue' }).totals).toEqual({ ...shopWide, count: 1 });
        expect(s.customers.list({ filter: 'advance' }).totals).toEqual({ ...shopWide, count: 1 });
        expect(s.customers.list({ query: 'bravo' }).totals).toEqual({ ...shopWide, count: 1 });
        expect(s.customers.list({ query: 'bravo', filter: 'overdue' }).totals).toEqual({ ...shopWide, count: 0 });
        expect(s.customers.list({ query: 'kot', limit: 1 }).totals).toEqual({ ...shopWide, count: 2 });
      });

      it('an advance customer present does not reduce total_outstanding (it counts positive balances only)', () => {
        const { d } = shop();
        expect(s.customers.get(d).balance).toBe(-70_000);
        expect(s.customers.list().totals.total_outstanding).toBe(180_000);
      });

      it('filters: owes, overdue, advance', () => {
        const { a, b, c, d } = shop();
        const ids = (filter: 'all' | 'owes' | 'overdue' | 'advance') => s.customers.list({ filter }).rows.map((r) => r.customer.id).sort();
        expect(ids('owes')).toEqual([a, b, c].sort());
        expect(ids('overdue')).toEqual([a]);
        expect(ids('advance')).toEqual([d]);
        expect(ids('all')).toHaveLength(5);
      });

      it('search by name in either language, village and phone digits; sorting; paging', () => {
        const { a, b, c } = shop();
        const names = (input: object) => s.customers.list(input).rows.map((r) => r.customer.name_en);
        expect(names({ query: 'alp' })).toEqual(['Alpha']);
        expect(names({ query: 'الف' })).toEqual(['Alpha']);
        expect(names({ query: 'kot' })).toEqual(['Alpha', 'Charlie']);
        expect(names({ query: '0301 2222222' })).toEqual(['Bravo']);
        expect(names({ query: '+92 301-2222222' })).toEqual(['Bravo']);
        expect(names({ query: 'zzz' })).toEqual([]);
        expect(s.customers.list({ query: 'zzz' }).totals.count).toBe(0);
        expect(s.customers.list({ query: 'zzz' }).totals.total_outstanding).toBe(180_000);

        expect(names({ sort: 'balance', filter: 'owes' })).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(names({ sort: 'overdue', filter: 'owes' })[0]).toBe('Alpha');
        expect(names({ sort: 'next_due', filter: 'owes' })).toEqual(['Alpha', 'Bravo', 'Charlie']); // Charlie has no due date: last
        expect(names({ sort: 'name' })).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Rashid']);
        expect(names({ sort: 'name', limit: 2, offset: 1 })).toEqual(['Bravo', 'Charlie']);
        expect(s.customers.list({ limit: 2, offset: 1 }).totals.count).toBe(5);
        expect([a, b, c]).toHaveLength(3);
      });

      it('sorts by the displayed language: differing English and Urdu orders, the other name as a fallback, equal names by id', () => {
        // English order Aaa < Bbb < Ccc; Urdu order (alef < zay < yeh) is the REVERSE: Ccc, Bbb, Aaa
        const aaa = w.addCustomer({ id: uuid(7501), name_en: 'Aaa', name_ur: 'یاسین' });
        const bbb = w.addCustomer({ id: uuid(7502), name_en: 'Bbb', name_ur: 'زاہد' });
        const ccc = w.addCustomer({ id: uuid(7503), name_en: 'Ccc', name_ur: 'احمد' });
        const onlyEn = w.addCustomer({ id: uuid(7504), name_en: 'Mmm', name_ur: null }); // Latin letters sort before Arabic ones
        const onlyUr = w.addCustomer({ id: uuid(7505), name_en: null, name_ur: 'بابا' });
        const twinHigh = w.addCustomer({ id: uuid(7599), name_en: 'Twin' }); // inserted first, but the higher id
        const twinLow = w.addCustomer({ id: uuid(7550), name_en: 'Twin' });
        const label: Record<string, string> = { [aaa]: 'aaa', [bbb]: 'bbb', [ccc]: 'ccc', [onlyEn]: 'mmm', [onlyUr]: 'baba', [twinHigh]: 'twin-high', [twinLow]: 'twin-low', [ID.customer]: 'rashid' };
        const order = (name_language: 'en' | 'ur') => s.customers.list({ sort: 'name', name_language }).rows.map((r) => label[r.customer.id]);
        // English: the English name, else the Urdu one (which sorts after every Latin name)
        expect(order('en')).toEqual(['aaa', 'bbb', 'ccc', 'mmm', 'rashid', 'twin-low', 'twin-high', 'baba']);
        // Urdu: the Urdu name, else the English one (Latin sorts before Arabic letters)
        expect(order('ur')).toEqual(['mmm', 'rashid', 'twin-low', 'twin-high', 'ccc', 'baba', 'bbb', 'aaa']);
        expect(s.customers.list().rows.map((r) => label[r.customer.id])).toEqual(order('en')); // English is the default
      });

      it('leaves out soft-deleted customers from rows and totals', () => {
        const { a } = shop();
        w.update('customers', a, { deleted_at: '2026-01-02T00:00:00.000Z' });
        const list = s.customers.list();
        expect(list.rows.map((r) => r.customer.id)).not.toContain(a);
        expect(list.totals).toMatchObject({ total_outstanding: 80_000, overdue_total: 0, count: 4 });
      });

      it('rejects a bad filter, sort or page', () => {
        expect(codeOf(() => s.customers.list({ filter: 'rich' as never }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.list({ sort: 'size' as never }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.list({ limit: 0 }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.customers.list({ offset: -1 }))).toBe('INVALID_INPUT');
      });
    });

    describe('balances are the CUSTOMER\'s: a supplier with the same id never leaks in (search, list, get)', () => {
      it('search, list rows, list totals and get all use the customer ledger only', () => {
        const id = w.addCustomer({ name_en: 'Shared Id', credit_limit: 0 });
        owes(id, 40_000);
        // ids are unique per table only: a supplier row with the same id, owed 777,777 by the shop
        w.deps.uow.run((tx) => {
          tx.suppliers.insert({ id, name_en: 'Same Id Supplier', name_ur: null, phone: null, address: null, ...w.deps.scope });
          tx.ledger.insert({ id: uuid(61_001), party_type: 'supplier', party_id: id, entry_type: 'purchase', amount_delta: 777_777, ref_type: null, ref_id: null, entry_date: w.at(0), created_by: ID.owner, ...w.deps.scope });
        });
        expect(s.customers.search({ query: 'shared id' })).toEqual([expect.objectContaining({ id, balance: 40_000 })]);
        expect(s.customers.list({ query: 'shared id' }).rows[0]).toMatchObject({ balance: 40_000 });
        expect(s.customers.list().totals.total_outstanding).toBe(40_000);
        expect(s.customers.get(id).balance).toBe(40_000);
        expect(s.customers.findDuplicates({ name_en: 'shared id' })).toEqual([expect.objectContaining({ customer_id: id, balance: 40_000 })]);
      });
    });

    describe('search by phone digits', () => {
      beforeEach(() => {
        w.addCustomer({ name_en: 'Phoned', phone: '0300-1234567' });
        w.addCustomer({ name_en: 'Plus', phone: '+92 321 7654321' });
        w.addCustomer({ name_en: 'Spaced', phone: '0345 111 2233' });
      });
      const found = (query: string) => s.customers.search({ query }).map((m) => m.name_en);

      it('matches however the number is typed or stored: spaces, dashes, leading 0, +92, 0092', () => {
        for (const q of ['03001234567', '0300 1234567', '0300-1234567', '+923001234567', '+92 300 1234567', '00923001234567', '3001234567', '300 1234567', '1234567']) {
          expect(found(q), q).toEqual(['Phoned']);
        }
        for (const q of ['03217654321', '+92-321-7654321', '321 7654321', '7654321']) expect(found(q), q).toEqual(['Plus']);
        expect(found('03451112233')).toEqual(['Spaced']);
        expect(found('111 2233')).toEqual(['Spaced']);
      });

      it('Urdu digits read as digits, and a number that is nobody\'s finds nobody', () => {
        expect(found('۰۳۰۰۱۲۳۴۵۶۷')).toEqual(['Phoned']);
        expect(found('0399 9999999')).toEqual([]);
      });

      it('a second phone is searched too; a name search still works; a name with digits is not mistaken for a phone', () => {
        w.addCustomer({ name_en: 'Farmer', phone: null, phone2: '0333-5556677' });
        expect(found('0333 5556677')).toEqual(['Farmer']);
        expect(found('phon')).toEqual(['Phoned']);
        w.addCustomer({ name_en: 'Ali 5 Brothers' });
        expect(found('ali 5')).toEqual(['Ali 5 Brothers']);
      });
    });

    describe('shop settings for customers', () => {
      it('default to 0 and off, and are read back after the owner sets them', () => {
        expect(s.customerSettings.get()).toEqual({ default_credit_limit: 0, show_farmer_fields: false });
        const set = s.customerSettings.set({ default_credit_limit: 750_000, show_farmer_fields: true, actor_id: ID.owner });
        expect(set).toEqual({ default_credit_limit: 750_000, show_farmer_fields: true });
        expect(s.customerSettings.get()).toEqual(set);
        // and a new customer picks the limit up
        expect(staffCreate({ name_en: 'Fresh' }).customer.credit_limit).toBe(750_000);
      });

      it('writes one audit row per setting that really changed, and none for an unchanged value', () => {
        s.customerSettings.set({ default_credit_limit: 100, actor_id: ID.owner });
        s.customerSettings.set({ default_credit_limit: 100, show_farmer_fields: false, actor_id: ID.owner }); // both unchanged
        s.customerSettings.set({ default_credit_limit: 200, show_farmer_fields: true, actor_id: ID.owner });
        const rows = w.rows('audit_log').filter((r) => r.action === 'customer_setting_changed');
        expect(rows.map((r) => JSON.parse(r.details as string))).toEqual([
          { field: 'default_credit_limit', from: 0, to: 100 },
          { field: 'default_credit_limit', from: 100, to: 200 },
          { field: 'show_farmer_fields', from: 0, to: 1 },
        ]);
        expect(rows.every((r) => r.user_id === ID.owner)).toBe(true);
        // each row says which setting it is about: the table and the setting key
        expect(rows.map((r) => [r.table_name, r.row_id])).toEqual([
          ['settings', 'default_credit_limit'],
          ['settings', 'default_credit_limit'],
          ['settings', 'customers.show_farmer_fields'],
        ]);
      });

      it('a setting left out is not touched: sending only the farmer switch keeps the default limit', () => {
        s.customerSettings.set({ default_credit_limit: 640_000, actor_id: ID.owner });
        s.customerSettings.set({ show_farmer_fields: true, actor_id: ID.owner });
        expect(s.customerSettings.get()).toEqual({ default_credit_limit: 640_000, show_farmer_fields: true });
        s.customerSettings.set({ actor_id: ID.owner });
        expect(s.customerSettings.get()).toEqual({ default_credit_limit: 640_000, show_farmer_fields: true });
      });

      it('a stored value is read the way parseInt reads it: "12abc" is 12, text with no number and a negative one fall back to the default', () => {
        w.setSetting('default_credit_limit', '12abc');
        expect(s.customerSettings.get().default_credit_limit).toBe(12);
        expect(staffCreate({ name_en: 'Twelve' }).customer.credit_limit).toBe(12);
        for (const value of ['abc', '', '-5', '-1']) {
          w.setSetting('default_credit_limit', value);
          expect(s.customerSettings.get().default_credit_limit, value).toBe(0);
        }
        w.setSetting('customers.show_farmer_fields', '12abc');
        expect(s.customerSettings.get().show_farmer_fields).toBe(false); // only exactly 1 turns it on
        w.setSetting('customers.show_farmer_fields', '1');
        expect(s.customerSettings.get().show_farmer_fields).toBe(true);
      });

      it('is the owner\'s: staff and inactive users are refused, nothing changes', () => {
        expectUnchanged(() => s.customerSettings.set({ default_credit_limit: 5, actor_id: ID.staff }), 'NOT_AUTHORIZED');
        expectUnchanged(() => s.customerSettings.set({ default_credit_limit: 5, actor_id: ID.inactive }), 'NOT_AUTHORIZED');
      });

      it('the limit must be a whole, non-negative number of paisa', () => {
        for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
          expect(codeOf(() => s.customerSettings.set({ default_credit_limit: bad, actor_id: ID.owner }))).toBe('INVALID_INPUT');
        }
        expect(codeOf(() => s.customerSettings.set({ default_credit_limit: 5, actor_id: ID.owner, extra: 1 } as never))).toBe('INVALID_INPUT');
        expect(s.customerSettings.get().default_credit_limit).toBe(0);
        expect(s.customerSettings.set({ default_credit_limit: 0, actor_id: ID.owner }).default_credit_limit).toBe(0);
      });

      it('a setting row that is turned back to the default is read as the default', () => {
        s.customerSettings.set({ show_farmer_fields: true, actor_id: ID.owner });
        s.customerSettings.set({ show_farmer_fields: false, actor_id: ID.owner });
        expect(s.customerSettings.get().show_farmer_fields).toBe(false);
      });
    });

    describe('soft-deleted customers are refused everywhere', () => {
      it('get, update, terms, payment, statement and balance say NOT_FOUND; list and search skip them', () => {
        const made = staffCreate({ name_en: 'Gone Soon', phone: '0311-0000001' });
        const id = made.customer.id;
        w.update('customers', id, { deleted_at: '2026-01-02T00:00:00.000Z' });
        expect(codeOf(() => s.customers.get(id))).toBe('NOT_FOUND');
        expect(codeOf(() => s.customers.update({ customer_id: id, fields: { village: 'x' }, expected_version: 2, actor: ID.staff }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.customers.setTerms({ customer_id: id, credit_limit: 1, default_price_type: 'retail', expected_version: 2, actor: ID.owner }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.payment.receiveFromCustomer({ party_id: id, amount: 1, method: 'cash', confirm_advance: true, created_by: ID.staff }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.khata.statement({ customer_id: id }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.khata.balance(id))).toBe('NOT_FOUND');
        expect(s.customers.search({ query: 'gone' })).toEqual([]);
        expect(s.customers.search({ query: '0311 0000001' })).toEqual([]);
        expect(s.customers.list().rows.map((r) => r.customer.id)).not.toContain(id);
        expect(w.rows('payments')).toHaveLength(0);
      });
    });
  });
}
