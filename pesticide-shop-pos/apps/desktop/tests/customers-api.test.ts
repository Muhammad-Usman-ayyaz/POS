// Phase 6 M2: customers, payments and the statement through the REAL handlers on a real SQLite database.
// The user always comes from the session (created_by, actor, privileged), terms and settings are the owner's, and every M1 error code
// reaches the caller through the error envelope.
import { randomUUID } from 'node:crypto';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerIpc, type IpcEventLike, type IpcMainLike } from '../src/main/ipc.js';
import { day, makeShop, movableClock, type Shop } from './support.js';

const failureOf = async (promise: Promise<unknown>): Promise<DomainError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError, but the call succeeded');
};

function fakeIpc(shop: Shop) {
  const listeners = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
  const ipcMain: IpcMainLike = { handle: (channel, listener) => void listeners.set(channel, listener) };
  registerIpc(ipcMain, shop.runtime.handlers, () => true, () => undefined);
  const trusted: IpcEventLike = { sender: { id: 1 }, senderFrame: { url: 'file:///app/index.html', parent: null } };
  return (channel: string, payload: unknown) =>
    Promise.resolve(listeners.get(channel)!(trusted, payload)) as Promise<{ ok: boolean; data?: any; error?: { code: string; message: string; params: Record<string, unknown>; issues?: unknown[] } }>;
}

let shop: Shop;
const h = () => shop.runtime.handlers;
const sql = (text: string, ...args: unknown[]) => shop.runtime.db.prepare(text);
const audits = (action: string) =>
  sql('SELECT user_id, row_id, details FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { user_id: string; row_id: string; details: string }[];
const ledgerBalance = (customerId: string) =>
  (sql("SELECT COALESCE(SUM(amount_delta), 0) AS b FROM ledger_entries WHERE party_type = 'customer' AND party_id = ?").get(customerId) as { b: number }).b;
const viewBalance = (customerId: string) =>
  (sql('SELECT balance FROM v_customer_balance WHERE customer_id = ?').get(customerId) as { balance: number } | undefined)?.balance ?? 0;
/** Row counts of what a refused customer or payment call must not touch. */
const footprint = () => Object.fromEntries(['customers', 'payments', 'ledger_entries', 'audit_log', 'settings', 'number_sequences'].map((t) => [t, shop.count(t)]));

beforeEach(async () => {
  shop = await makeShop();
});
afterEach(() => shop.runtime.close());

const rashid = () => shop.demo.customers['rashid']!; // owes Rs 2,000, limit Rs 10,000
const sajid = () => shop.demo.customers['sajid']!; // owes nothing, limit Rs 5,000

describe('nobody signed in', () => {
  it('every new channel says NOT_SIGNED_IN and writes nothing', async () => {
    const before = footprint();
    const id = rashid();
    const calls: [string, () => Promise<unknown>][] = [
      ['customers:list', () => h()['customers:list']({})],
      ['customers:get', () => h()['customers:get']({ customer_id: id })],
      ['customers:findDuplicates', () => h()['customers:findDuplicates']({ name_en: 'Rashid' })],
      ['customers:create', () => h()['customers:create']({ fields: { name_en: 'Ghost' } })],
      ['customers:update', () => h()['customers:update']({ customer_id: id, fields: { village: 'x' }, expected_version: 1 })],
      ['customers:setTerms', () => h()['customers:setTerms']({ customer_id: id, credit_limit: 1, default_price_type: 'retail', expected_version: 1 })],
      ['customers:getSettings', () => h()['customers:getSettings']({})],
      ['customers:setSettings', () => h()['customers:setSettings']({ default_credit_limit: 1 })],
      ['payments:receive', () => h()['payments:receive']({ customer_id: id, amount: 100, method: 'cash' })],
      ['khata:statement', () => h()['khata:statement']({ customer_id: id })],
    ];
    for (const [name, call] of calls) expect((await failureOf(call())).code, name).toBe('NOT_SIGNED_IN');
    expect(footprint()).toEqual(before);
  });
});

describe('terms and shop settings are the owner\'s', () => {
  it('staff cannot set terms: NOT_AUTHORIZED naming customers.terms, nothing written, the customer unchanged', async () => {
    await shop.signInAs('owner');
    const mine = await h()['customers:get']({ customer_id: rashid() });
    await shop.signOut();
    await shop.signInAs('staff');
    const before = footprint();
    const error = await failureOf(h()['customers:setTerms']({ customer_id: rashid(), credit_limit: 99_000_000, default_price_type: 'wholesale', expected_version: mine.customer.version }));
    expect(error.code).toBe('NOT_AUTHORIZED');
    expect(error.params).toEqual({ capability: 'customers.terms' });
    expect(footprint()).toEqual(before);
    expect((await h()['customers:get']({ customer_id: rashid() })).customer.credit_limit).toBe(1_000_000);
  });

  it('staff cannot change the shop settings: NOT_AUTHORIZED naming customers.settings, nothing written', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    const error = await failureOf(h()['customers:setSettings']({ default_credit_limit: 99_000_000, show_farmer_fields: true }));
    expect(error.code).toBe('NOT_AUTHORIZED');
    expect(error.params).toEqual({ capability: 'customers.settings' });
    expect(footprint()).toEqual(before);
    expect(await h()['customers:getSettings']({})).toEqual({ default_credit_limit: 0, show_farmer_fields: false }); // staff can read them
  });

  it('the owner sets terms: the change is audited with the OWNER from the session (before and after), an unchanged save writes nothing', async () => {
    await shop.signInAs('owner');
    const mine = await h()['customers:get']({ customer_id: rashid() });
    const done = await h()['customers:setTerms']({
      customer_id: rashid(), credit_limit: 2_500_000, default_price_type: 'wholesale', father_name: 'Ali Khan', cnic: '35202-1234567-1', guarantor: 'Bashir', expected_version: mine.customer.version,
    });
    expect(done.changed.sort()).toEqual(['cnic', 'credit_limit', 'default_price_type', 'father_name', 'guarantor']);
    expect(done.below_balance).toBe(false);
    expect(done.customer.customer).toMatchObject({ credit_limit: 2_500_000, default_price_type: 'wholesale', father_name: 'Ali Khan', guarantor: 'Bashir' });
    expect(done.customer.customer.version).toBe(mine.customer.version + 1);
    const rows = audits('customer_terms_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: shop.ownerId, row_id: rashid() });
    expect(JSON.parse(rows[0]!.details)).toMatchObject({ before: { credit_limit: 1_000_000, default_price_type: 'retail' }, after: { credit_limit: 2_500_000, default_price_type: 'wholesale' } });

    // the same terms again, with the new version: nothing changed, nothing audited
    const again = await h()['customers:setTerms']({ customer_id: rashid(), credit_limit: 2_500_000, default_price_type: 'wholesale', expected_version: done.customer.customer.version });
    expect(again.changed).toEqual([]);
    expect(audits('customer_terms_changed')).toHaveLength(1);
  });

  it('lowering the limit under the balance is allowed and says below_balance', async () => {
    await shop.signInAs('owner');
    const mine = await h()['customers:get']({ customer_id: rashid() }); // owes Rs 2,000
    const done = await h()['customers:setTerms']({ customer_id: rashid(), credit_limit: 100_000, default_price_type: 'retail', expected_version: mine.customer.version });
    expect(done.below_balance).toBe(true);
    expect(done.customer).toMatchObject({ over_limit: true, credit_left: 0 });
  });

  it('expected_version is passed through: a stale terms edit is VERSION_CONFLICT (with the current version) and changes nothing', async () => {
    await shop.signInAs('owner');
    const mine = await h()['customers:get']({ customer_id: rashid() });
    await h()['customers:update']({ customer_id: rashid(), fields: { village: 'Chak 99' }, expected_version: mine.customer.version }); // someone else edits first
    const before = footprint();
    const error = await failureOf(h()['customers:setTerms']({ customer_id: rashid(), credit_limit: 5_000_000, default_price_type: 'retail', expected_version: mine.customer.version }));
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.params).toEqual({ expected_version: mine.customer.version, current_version: mine.customer.version + 1 });
    expect(footprint()).toEqual(before);
  });

  it('the owner changes the settings: audited once per setting that really changed, with the owner; an unchanged value writes nothing', async () => {
    await shop.signInAs('owner');
    expect(await h()['customers:getSettings']({})).toEqual({ default_credit_limit: 0, show_farmer_fields: false });
    const set = await h()['customers:setSettings']({ default_credit_limit: 750_000, show_farmer_fields: true });
    expect(set).toEqual({ default_credit_limit: 750_000, show_farmer_fields: true });
    expect(await h()['customers:getSettings']({})).toEqual(set);
    const rows = audits('customer_setting_changed');
    expect(rows.map((r) => [r.user_id, JSON.parse(r.details)])).toEqual([
      [shop.ownerId, { field: 'default_credit_limit', from: 0, to: 750_000 }],
      [shop.ownerId, { field: 'show_farmer_fields', from: 0, to: 1 }],
    ]);
    await h()['customers:setSettings']({ default_credit_limit: 750_000 });
    expect(audits('customer_setting_changed')).toHaveLength(2);
  });

  it('a negative or fractional default limit never reaches the service (refused with INVALID_INPUT)', async () => {
    await shop.signInAs('owner');
    const ipc = fakeIpc(shop);
    for (const bad of [-1, -100_000, 1.5]) expect(await ipc('customers:setSettings', { default_credit_limit: bad }), String(bad)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect((await h()['customers:getSettings']({})).default_credit_limit).toBe(0);
    expect(audits('customer_setting_changed')).toEqual([]);
  });
});

describe('adding and editing customers', () => {
  it('a customer added by STAFF gets the owner\'s default credit limit and the retail price type', async () => {
    await shop.signInAs('owner');
    await h()['customers:setSettings']({ default_credit_limit: 750_000 });
    await shop.signOut();
    await shop.signInAs('staff');
    const made = await h()['customers:create']({ fields: { name_en: 'Quick Farmer', phone: '0312 9998887', village: 'Chak 3' } });
    expect(made.customer).toMatchObject({ name_en: 'Quick Farmer', credit_limit: 750_000, default_price_type: 'retail', village: 'Chak 3' });
    expect(made).toMatchObject({ balance: 0, no_limit: false, credit_left: 750_000 });
    expect((sql('SELECT credit_limit FROM customers WHERE id = ?').get(made.customer.id) as { credit_limit: number }).credit_limit).toBe(750_000);
  });

  it('with no default set, a staff-added customer has no limit (0) and the reply says so', async () => {
    await shop.signInAs('staff');
    const made = await h()['customers:create']({ fields: { name_en: 'Open Account' } });
    expect(made.customer.credit_limit).toBe(0);
    expect(made).toMatchObject({ no_limit: true, credit_left: null });
  });

  it('a staff create with ANY owner-only field is refused with FIELD_NOT_ALLOWED and writes nothing (it is not quietly dropped)', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    for (const extra of [{ credit_limit: 9_000_000 }, { credit_limit: 0 }, { default_price_type: 'wholesale' as const }, { father_name: 'X' }, { cnic: '1' }, { phone2: '2' }, { guarantor: 'G' }]) {
      const error = await failureOf(h()['customers:create']({ fields: { name_en: 'Sneaky', ...extra } }));
      expect(error.code, JSON.stringify(extra)).toBe('FIELD_NOT_ALLOWED');
    }
    expect(footprint()).toEqual(before);
  });

  it('privileged comes from the SESSION: the owner\'s create honours the terms, a renderer cannot claim it', async () => {
    await shop.signInAs('owner');
    const made = await h()['customers:create']({ fields: { name_en: 'Big Landlord', credit_limit: 5_000_000, default_price_type: 'wholesale', father_name: 'Haji Sahib' } });
    expect(made.customer).toMatchObject({ credit_limit: 5_000_000, default_price_type: 'wholesale', father_name: 'Haji Sahib' });
    await shop.signOut();
    await shop.signInAs('staff');
    const ipc = fakeIpc(shop);
    const before = footprint();
    expect(await ipc('customers:create', { fields: { name_en: 'Pretender', credit_limit: 5_000_000 }, privileged: true })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await ipc('customers:create', { fields: { name_en: 'Pretender', privileged: true } })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await ipc('customers:create', { fields: { name_en: 'Pretender', credit_limit: 5_000_000 } })).toMatchObject({ ok: false, error: { code: 'FIELD_NOT_ALLOWED' } });
    expect(footprint()).toEqual(before);
  });

  it('defence in depth: a `privileged` flag smuggled straight into the handler changes nothing, in either direction', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    const claim = await failureOf(h()['customers:create']({ fields: { name_en: 'Claimant', credit_limit: 5_000_000 }, privileged: true } as never));
    expect(claim.code).toBe('FIELD_NOT_ALLOWED'); // the staff session is not privileged, whatever the request says
    expect(footprint()).toEqual(before);
    await shop.signOut();
    await shop.signInAs('owner');
    const denied = await h()['customers:create']({ fields: { name_en: 'Modest Owner', credit_limit: 5_000_000 }, privileged: false } as never);
    expect(denied.customer.credit_limit).toBe(5_000_000); // the owner's session is privileged, whatever the request says
  });

  it('a name or phone already in the shop is DUPLICATE_CUSTOMER; confirm_duplicate is passed through and saves it', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    const byName = await failureOf(h()['customers:create']({ fields: { name_en: '  RASHID ' } }));
    expect(byName.code).toBe('DUPLICATE_CUSTOMER');
    expect(byName.params).toMatchObject({ count: 1 });
    expect(JSON.parse(String(byName.params['matches']))).toEqual([expect.objectContaining({ customer_id: rashid(), same_name: true, balance: 200_000 })]);
    const byUrdu = await failureOf(h()['customers:create']({ fields: { name_ur: 'راشد' } }));
    expect(byUrdu.code).toBe('DUPLICATE_CUSTOMER');
    expect(footprint()).toEqual(before);

    const saved = await h()['customers:create']({ fields: { name_en: 'Rashid', village: 'Chak 99' }, confirm_duplicate: true });
    expect(saved.customer.village).toBe('Chak 99');
    expect(shop.count('customers')).toBe(before['customers']! + 1);

    // by phone: the same number written differently
    await h()['customers:update']({ customer_id: saved.customer.id, fields: { phone: '0300-1234567' }, expected_version: saved.customer.version });
    const samePhone = await failureOf(h()['customers:create']({ fields: { name_en: 'Somebody Else', phone: '+92 300 1234567' } }));
    expect(samePhone.code).toBe('DUPLICATE_CUSTOMER');
  });

  it('findDuplicates lists the matches with their balances, and never blocks', async () => {
    await shop.signInAs('staff');
    const found = await h()['customers:findDuplicates']({ name_en: 'rashid' });
    expect(found).toEqual([expect.objectContaining({ customer_id: rashid(), balance: 200_000, same_name: true, same_phone: false })]);
    expect(await h()['customers:findDuplicates']({ name_en: 'Nobody Like This', phone: '0399 0000000' })).toEqual([]);
    expect(await h()['customers:findDuplicates']({})).toEqual([]);
  });

  it('update changes contact fields for staff too; expected_version is passed through and a stale edit is VERSION_CONFLICT', async () => {
    await shop.signInAs('staff');
    const mine = await h()['customers:get']({ customer_id: rashid() });
    const v = mine.customer.version;
    const changed = await h()['customers:update']({ customer_id: rashid(), fields: { village: 'Chak 77', phone: '0301 5550000', notes: 'pays after harvest' }, expected_version: v });
    expect(changed.customer).toMatchObject({ village: 'Chak 77', phone: '0301 5550000', notes: 'pays after harvest', version: v + 1 });
    expect(changed.customer.credit_limit).toBe(1_000_000); // terms untouched

    const before = footprint();
    const stale = await failureOf(h()['customers:update']({ customer_id: rashid(), fields: { village: 'Lost update' }, expected_version: v }));
    expect(stale.code).toBe('VERSION_CONFLICT');
    expect(stale.params).toEqual({ expected_version: v, current_version: v + 1 });
    expect(footprint()).toEqual(before);
    expect((await h()['customers:get']({ customer_id: rashid() })).customer.village).toBe('Chak 77');
  });

  it('update refuses terms: a credit limit or farmer field is not a contact field (INVALID_INPUT before any handler runs)', async () => {
    await shop.signInAs('staff');
    const ipc = fakeIpc(shop);
    const v = (await h()['customers:get']({ customer_id: rashid() })).customer.version;
    for (const fields of [{ credit_limit: 9_000_000 }, { default_price_type: 'wholesale' }, { cnic: '1' }, { guarantor: 'G' }]) {
      expect(await ipc('customers:update', { customer_id: rashid(), fields, expected_version: v }), JSON.stringify(fields)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect((await h()['customers:get']({ customer_id: rashid() })).customer.credit_limit).toBe(1_000_000);
  });

  it('one name must remain, and an unknown customer is NOT_FOUND', async () => {
    await shop.signInAs('staff');
    const mine = await h()['customers:get']({ customer_id: rashid() });
    const gone = await failureOf(h()['customers:update']({ customer_id: rashid(), fields: { name_en: null, name_ur: null }, expected_version: mine.customer.version }));
    expect(gone.code).toBe('INVALID_INPUT');
    expect((await failureOf(h()['customers:get']({ customer_id: randomUUID() }))).code).toBe('NOT_FOUND');
  });

  it('customers:search still finds a customer by a phone number typed with spaces, dashes or +92', async () => {
    await shop.signInAs('staff');
    const made = await h()['customers:create']({ fields: { name_en: 'Phone Test', phone: '0300-1234567' } });
    for (const typed of ['03001234567', '0300 1234567', '+92 300 1234567', '300-1234567']) {
      const hits = await h()['customers:search']({ query: typed });
      expect(hits.map((x) => x.id), typed).toContain(made.customer.id);
    }
  });
});

describe('the list and one customer', () => {
  it('lists with figures and shop totals; the filters, sort and paging pass through; totals ignore the filter', async () => {
    await shop.signInAs('staff');
    const all = await h()['customers:list']({});
    expect(all.rows).toHaveLength(5);
    expect(all.totals).toEqual({ total_outstanding: 200_000 + 1_550_000 + 820_000 + 475_000, overdue_total: 0, count: 5 });

    const owes = await h()['customers:list']({ filter: 'owes', sort: 'balance' });
    expect(owes.rows.map((r) => r.customer.name_en)).toEqual(['Imran', 'Bashir', 'Tariq', 'Rashid']);
    expect(owes.totals.count).toBe(4);
    expect(owes.totals.total_outstanding).toBe(all.totals.total_outstanding);

    const page = await h()['customers:list']({ sort: 'name', limit: 2, offset: 1 });
    expect(page.rows.map((r) => r.customer.name_en)).toEqual(['Imran', 'Rashid']);
    expect(page.totals.count).toBe(5);

    expect((await h()['customers:list']({ query: 'راشد' })).rows.map((r) => r.customer.name_en)).toEqual(['Rashid']);
    expect((await h()['customers:list']({ filter: 'advance' })).rows).toEqual([]);
    expect((await h()['customers:list']({ filter: 'overdue' })).rows).toEqual([]);
  });

  it('get gives the balance, credit left, and a limit of 0 is "no limit" (never 0 or negative credit left)', async () => {
    await shop.signInAs('staff');
    expect(await h()['customers:get']({ customer_id: rashid() })).toMatchObject({ balance: 200_000, credit_left: 800_000, no_limit: false, over_limit: false });
    const open = await h()['customers:create']({ fields: { name_en: 'Unlimited' } });
    expect(await h()['customers:get']({ customer_id: open.customer.id })).toMatchObject({ no_limit: true, credit_left: null, over_limit: false });
  });

  it('a credit sale past its due date shows up as overdue in the list and on the customer', async () => {
    shop.runtime.close();
    const clock = movableClock();
    shop = await makeShop({ clock });
    await shop.signInAs('owner');
    await h()['sale:create']({ customer_id: sajid(), paid_amount: 0, due_date: day(5), lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
    expect((await h()['customers:list']({ filter: 'overdue' })).rows).toEqual([]); // not due yet
    clock.advance(15 * 24 * 3600 * 1000); // ten days past the due date
    const list = await h()['customers:list']({ filter: 'overdue' });
    expect(list.rows.map((r) => r.customer.id)).toEqual([sajid()]);
    expect(list.rows[0]).toMatchObject({ overdue_amount: 50_000, overdue_days: 10, next_due: day(5) });
    expect(list.totals.overdue_total).toBe(50_000);
    expect(await h()['customers:get']({ customer_id: sajid() })).toMatchObject({ overdue_amount: 50_000 });
  });
});

describe('receiving a payment', () => {
  it('records the SESSION user: payments.created_by and the ledger row are staff, then owner; the reply has the receipt number and the balance after', async () => {
    await shop.signInAs('staff');
    const first = await h()['payments:receive']({ customer_id: rashid(), amount: 50_000, method: 'cash', note: 'part payment' });
    expect(first.receipt_no).toMatch(/^RCP-[A-Z0-9]+-000001$/);
    expect(first).toMatchObject({ balance_after: 150_000, advance: false, payment: { amount: 50_000, direction: 'in', method: 'cash', party_id: rashid(), note: 'part payment', created_by: shop.staffId } });
    await shop.signOut();
    await shop.signInAs('owner');
    const second = await h()['payments:receive']({ customer_id: rashid(), amount: 25_000, method: 'cash' });
    expect(second.receipt_no).toMatch(/-000002$/);
    expect(second.balance_after).toBe(125_000);

    const rows = sql("SELECT created_by, amount, receipt_no FROM payments WHERE party_id = ? ORDER BY rowid").all(rashid()) as { created_by: string; amount: number; receipt_no: string }[];
    expect(rows.map((r) => [r.created_by, r.amount, r.receipt_no])).toEqual([[shop.staffId, 50_000, first.receipt_no], [shop.ownerId, 25_000, second.receipt_no]]);
    const ledger = sql("SELECT created_by, amount_delta FROM ledger_entries WHERE party_type = 'customer' AND party_id = ? AND entry_type = 'payment' ORDER BY rowid").all(rashid());
    expect(ledger).toEqual([{ created_by: shop.staffId, amount_delta: -50_000 }, { created_by: shop.ownerId, amount_delta: -25_000 }]);
    expect(viewBalance(rashid())).toBe(125_000);
    expect((await h()['customers:get']({ customer_id: rashid() })).balance).toBe(125_000);
  });

  it('defence in depth: even a created_by smuggled past the schema (straight into the handler) is ignored; the session user is recorded', async () => {
    await shop.signInAs('staff');
    const smuggled = { customer_id: rashid(), amount: 5_000, method: 'cash', created_by: shop.ownerId } as never;
    const done = await h()['payments:receive'](smuggled);
    expect(done.payment.created_by).toBe(shop.staffId);
    expect((sql('SELECT created_by FROM payments WHERE id = ?').get(done.payment.id) as { created_by: string }).created_by).toBe(shop.staffId);
    expect(sql("SELECT created_by FROM ledger_entries WHERE ref_id = ?").get(done.payment.id)).toEqual({ created_by: shop.staffId });
  });

  it('the renderer cannot say who took the payment: created_by / user_id / actor are refused, nothing written', async () => {
    await shop.signInAs('staff');
    const ipc = fakeIpc(shop);
    const before = footprint();
    for (const key of ['created_by', 'user_id', 'actor', 'actor_id', 'approved_by', 'privileged']) {
      expect(await ipc('payments:receive', { customer_id: rashid(), amount: 100, method: 'cash', [key]: shop.ownerId }), key).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect(footprint()).toEqual(before);
  });

  it('bank, Easypaisa and JazzCash need a reference (REFERENCE_REQUIRED); cash does not; nothing is written, not even a receipt number', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    for (const method of ['bank', 'easypaisa', 'jazzcash'] as const) {
      const error = await failureOf(h()['payments:receive']({ customer_id: rashid(), amount: 1_000, method }));
      expect(error.code, method).toBe('REFERENCE_REQUIRED');
      expect((await failureOf(h()['payments:receive']({ customer_id: rashid(), amount: 1_000, method, reference_no: '   ' }))).code, `${method} blank`).toBe('REFERENCE_REQUIRED');
    }
    expect(footprint()).toEqual(before);
    const ok = await h()['payments:receive']({ customer_id: rashid(), amount: 1_000, method: 'jazzcash', reference_no: 'JC-123' });
    expect(ok.receipt_no).toMatch(/-000001$/); // the refused attempts used no number
    expect(ok.payment.reference_no).toBe('JC-123');
  });

  it('more than the balance is ADVANCE_NOT_CONFIRMED until confirm_advance is passed through; then the customer is in credit', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    const error = await failureOf(h()['payments:receive']({ customer_id: rashid(), amount: 300_000, method: 'cash' }));
    expect(error.code).toBe('ADVANCE_NOT_CONFIRMED');
    expect(error.params).toEqual({ amount: 300_000, balance: 200_000 });
    expect((await failureOf(h()['payments:receive']({ customer_id: sajid(), amount: 1_000, method: 'cash' }))).code).toBe('ADVANCE_NOT_CONFIRMED'); // owes nothing: any payment is an advance
    expect((await failureOf(h()['payments:receive']({ customer_id: rashid(), amount: 300_000, method: 'cash', confirm_advance: false }))).code).toBe('ADVANCE_NOT_CONFIRMED');
    expect(footprint()).toEqual(before);

    const done = await h()['payments:receive']({ customer_id: rashid(), amount: 300_000, method: 'cash', confirm_advance: true });
    expect(done).toMatchObject({ balance_after: -100_000, advance: true });
    expect(viewBalance(rashid())).toBe(-100_000);
    expect(await h()['customers:list']({ filter: 'advance' }).then((l) => l.rows.map((r) => r.customer.id))).toEqual([rashid()]);
  });

  it('a payment for an unknown customer is NOT_FOUND and writes nothing; amounts of 0 or less never get past the contract', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    expect((await failureOf(h()['payments:receive']({ customer_id: randomUUID(), amount: 1_000, method: 'cash' }))).code).toBe('NOT_FOUND');
    expect(footprint()).toEqual(before);
    const ipc = fakeIpc(shop);
    for (const amount of [0, -1, 1.5]) expect(await ipc('payments:receive', { customer_id: rashid(), amount, method: 'cash' }), String(amount)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});

describe('the statement', () => {
  const ownerSellsAndPaysSupplier = async () => {
    // Supplier activity (a purchase and its payment) must never appear on a customer's statement.
    await shop.signInAs('owner');
    await h()['stock:receive']({
      supplier_id: shop.demo.supplierId, items: [{ product_id: shop.demo.products['insecticide1l']!, batch_no: 'SUP-1', expiry_date: day(300), qty: 12_000, cost_price: 40_000 }],
    });
    await h()['sale:create']({ customer_id: rashid(), paid_amount: 10_000, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
    await shop.signOut();
    await shop.signInAs('staff');
  };

  it('the closing balance equals the ledger, the view and customers:get; the running balance adds up line by line', async () => {
    await ownerSellsAndPaysSupplier();
    await h()['payments:receive']({ customer_id: rashid(), amount: 50_000, method: 'bank', reference_no: 'TRX-9', note: 'after harvest' });
    const s = await h()['khata:statement']({ customer_id: rashid() });
    const expected = ledgerBalance(rashid());
    expect(expected).toBe(200_000 + 40_000 - 50_000);
    expect(s.closing_balance).toBe(expected);
    expect(s.closing_balance).toBe(viewBalance(rashid()));
    expect(s.closing_balance).toBe((await h()['customers:get']({ customer_id: rashid() })).balance);
    expect(s.lines.map((l) => l.label)).toEqual(['opening', 'sale', 'payment', 'payment']); // the sale's own Rs 100 part-payment, then this one
    expect(s.lines.map((l) => l.running_balance)).toEqual([200_000, 250_000, 240_000, 190_000]);
    expect(s.lines[1]!.invoice_no).toMatch(/^INV-/);
    expect(s.lines[3]).toMatchObject({ payment_method: 'bank', reference_no: 'TRX-9', note: 'after harvest', amount_delta: -50_000 });
    expect(s.lines[3]!.receipt_no).toMatch(/^RCP-/);
    expect(s.totals).toEqual({ owes_more: 250_000, owes_less: 60_000 });
    expect(s.customer).toMatchObject({ id: rashid(), name_en: 'Rashid' });
  });

  it('a date range starts with brought forward, and the closing balance is still the ledger up to `to`', async () => {
    await ownerSellsAndPaysSupplier();
    const tomorrow = await h()['khata:statement']({ customer_id: rashid(), from: day(1) });
    expect(tomorrow.lines.map((l) => l.label)).toEqual(['brought_forward']);
    expect(tomorrow).toMatchObject({ brought_forward: 240_000, closing_balance: 240_000 });
    const yesterdayOnly = await h()['khata:statement']({ customer_id: rashid(), to: day(-1) });
    expect(yesterdayOnly).toMatchObject({ closing_balance: 0, lines: [] });
    const today = await h()['khata:statement']({ customer_id: rashid(), from: day(0), to: day(0) });
    expect(today.closing_balance).toBe(240_000);
  });

  it('supplier rows are never in a customer statement, and a supplier id is not a customer (NOT_FOUND)', async () => {
    await ownerSellsAndPaysSupplier();
    const supplierRows = (sql("SELECT COUNT(*) AS c FROM ledger_entries WHERE party_type = 'supplier'").get() as { c: number }).c;
    expect(supplierRows).toBeGreaterThan(0); // the purchase really wrote supplier ledger rows
    const mine = (sql("SELECT COUNT(*) AS c FROM ledger_entries WHERE party_type = 'customer' AND party_id = ?").get(rashid()) as { c: number }).c;
    const s = await h()['khata:statement']({ customer_id: rashid() });
    const entries = s.lines.filter((l) => l.entry !== null).map((l) => l.entry!);
    expect(entries).toHaveLength(mine);
    for (const e of entries) expect([e.party_type, e.party_id]).toEqual(['customer', rashid()]);
    expect((await failureOf(h()['khata:statement']({ customer_id: shop.demo.supplierId }))).code).toBe('NOT_FOUND');
  });

  it('dates must be real days and from not after to (refused before any handler runs)', async () => {
    await shop.signInAs('staff');
    const ipc = fakeIpc(shop);
    for (const bad of [{ from: '2026-10-06', to: '2026-10-05' }, { from: '2026-02-30' }, { to: 'tomorrow' }]) {
      expect(await ipc('khata:statement', { customer_id: rashid(), ...bad }), JSON.stringify(bad)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
  });
});

describe('what staff are told', () => {
  it('no reply to a staff session on these channels holds a cost, margin or profit word', async () => {
    await shop.signInAs('owner');
    await h()['sale:create']({ customer_id: rashid(), paid_amount: 0, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 1000 }] });
    await shop.signOut();
    await shop.signInAs('staff');
    const replies = [
      await h()['customers:list']({}),
      await h()['customers:get']({ customer_id: rashid() }),
      await h()['customers:getSettings']({}),
      await h()['khata:statement']({ customer_id: rashid() }),
      await h()['payments:receive']({ customer_id: rashid(), amount: 1_000, method: 'cash' }),
    ];
    expect(JSON.stringify(replies)).not.toMatch(/cost|margin|profit/i);
  });
});
