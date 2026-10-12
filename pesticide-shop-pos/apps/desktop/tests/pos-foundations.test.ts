// Phase 5, M1 in the main process: the quote channel, finding a customer, the owner's approval at the counter (one-use, bound to the exact cart and
// action, for one minute, with the same lock-out as sign-in), the discount limit for staff, and a sale that survives a double click and a restart.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError, systemClock } from '@pos/core';
import { contract } from '@pos/api-contract';
import { createUser, findActiveOwnerId, loadDeviceInfo } from '@pos/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime } from '../src/main/runtime.js';
import { THROTTLE } from '../src/main/throttle.js';
import { APPROVAL_TTL_MS as SHELL_TTL } from '../src/main/approvals.js';

// The minute is written out here on purpose: a test that reads the shell's own constant would agree with any value.
const APPROVAL_TTL_MS = 60_000;
import { fastHasher, makeShop, movableClock, OWNER, STAFF, type Shop } from './support.js';

type Handler = (input: unknown) => Promise<any>;
const failureOf = async (promise: Promise<unknown>): Promise<DomainError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError, but the call succeeded');
};

let shop: Shop;
let clock: ReturnType<typeof movableClock>;
let h: Record<string, Handler>;
let ins1l: string;
let sajid: string;
const footprint = () => Object.fromEntries(['invoices', 'invoice_items', 'stock_movements', 'ledger_entries', 'payments', 'audit_log'].map((t) => [t, shop.count(t)]));
const audits = (action: string) =>
  shop.runtime.db.prepare('SELECT user_id, table_name, row_id, details FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { user_id: string | null; table_name: string; row_id: string | null; details: string }[];

/** Sajid's limit is set to Rs 1,000 here, and he owes nothing: 3 packs at Rs 500 on credit is over it, 1 pack is not. */
const overLimit = (extra: object = {}) => ({ customer_id: sajid, paid_amount: 0, lines: [{ product_id: ins1l, qty: 3000 }], ...extra });
const withinLimit = (extra: object = {}) => ({ customer_id: sajid, paid_amount: 0, lines: [{ product_id: ins1l, qty: 1000 }], ...extra });
const requestApproval = (sale: object, actions: string[] = ['credit_override'], password: string = OWNER.password, username = 'owner') => h['approval:request']!({ username, password, actions, sale: toSubject(sale) });
/** What an approval is asked for: the cart and the amount (the screen sends the same fields it will send to sale:create). */
const toSubject = (sale: any) => ({ ...(sale.customer_id ? { customer_id: sale.customer_id } : {}), ...(sale.price_type ? { price_type: sale.price_type } : {}), paid_amount: sale.paid_amount, lines: sale.lines });
const newId = () => randomUUID();

beforeEach(async () => {
  clock = movableClock();
  shop = await makeShop({ clock });
  h = shop.runtime.handlers as unknown as Record<string, Handler>;
  ins1l = shop.demo.products['insecticide1l']!;
  sajid = shop.demo.customers['sajid']!;
  for (const id of [sajid, shop.demo.customers['tariq']!]) shop.runtime.db.prepare('UPDATE customers SET credit_limit = 100000 WHERE id = ?').run(id);
  fastHasher.verifyCalls = 0;
});
afterEach(() => shop.runtime.close());

describe('sale:quote', () => {
  it('is for anyone signed in, and gives staff and the owner the same numbers, with no cost for either', async () => {
    const input = { customer_id: shop.demo.customers['rashid']!, paid_amount: 20_000, lines: [{ product_id: ins1l, qty: 3000 }] };
    await shop.signInAs('staff');
    const staff = await h['sale:quote']!(input);
    await shop.signOut();
    await shop.signInAs('owner');
    const owner = await h['sale:quote']!(input);
    expect(owner).toEqual(staff);
    expect(staff).toMatchObject({ ok: true, total: 150_000, paid_amount: 20_000, unpaid: 130_000, requires_approval: [] });
    expect(staff.customer).toMatchObject({ balance: 200_000, after_sale: 330_000, credit_limit: 1_000_000, over_limit: false });
    expect(JSON.stringify(staff)).not.toMatch(/cost/i);
  });

  it('writes nothing, whoever asks and whatever the cart', async () => {
    await shop.signInAs('staff');
    const before = footprint();
    await h['sale:quote']!(overLimit({ lines: [{ product_id: ins1l, qty: 3000, line_discount: 50_000, price_override: { unit_price: 1 } }] }));
    expect(footprint()).toEqual(before);
  });

  it('tells staff what the owner would have to approve, and tells the owner nothing (the owner is their own approver)', async () => {
    await shop.signInAs('staff');
    const needs = async (input: object) => (await h['sale:quote']!(input)).requires_approval;
    expect(await needs({ paid_amount: 50_000, lines: [{ product_id: ins1l, qty: 1000 }] })).toEqual([]);
    expect(await needs({ paid_amount: 47_500, lines: [{ product_id: ins1l, qty: 1000, line_discount: 2500 }] })).toEqual([]); // exactly 5 percent
    expect(await needs({ paid_amount: 47_499, lines: [{ product_id: ins1l, qty: 1000, line_discount: 2501 }] })).toEqual(['discount_override']);
    expect(await needs({ paid_amount: 40_000, lines: [{ product_id: ins1l, qty: 1000, price_override: { unit_price: 40_000 } }] })).toEqual(['price_override']);
    expect(await needs(overLimit())).toEqual(['credit_override']);
    expect(await needs(overLimit({ lines: [{ product_id: ins1l, qty: 3000, line_discount: 20_000, price_override: { unit_price: 49_000 } }] }))).toEqual(['credit_override', 'discount_override', 'price_override']);
    await shop.signOut();
    await shop.signInAs('owner');
    expect((await h['sale:quote']!(overLimit({ lines: [{ product_id: ins1l, qty: 3000, line_discount: 20_000, price_override: { unit_price: 49_000 } }] }))).requires_approval).toEqual([]);
  });

  it('prices a different price for staff too (to show its effect), without writing and without letting them use it', async () => {
    await shop.signInAs('staff');
    const q = await h['sale:quote']!({ paid_amount: 40_000, lines: [{ product_id: ins1l, qty: 1000, price_override: { unit_price: 40_000 } }] });
    expect(q.lines[0]).toMatchObject({ unit_price: 40_000, line_total: 40_000 });
    expect(q.requires_approval).toEqual(['price_override']);
    expect((await failureOf(h['sale:create']!({ paid_amount: 40_000, lines: [{ product_id: ins1l, qty: 1000, price_override: { unit_price: 40_000 } }] }))).code).toBe('APPROVAL_REQUIRED');
  });

  it('reports what is wrong instead of failing: out of stock comes back as an issue', async () => {
    await shop.signInAs('staff');
    const q = await h['sale:quote']!({ lines: [{ product_id: ins1l, qty: 50_000 }] });
    expect(q.ok).toBe(false);
    expect(q.issues).toEqual([expect.objectContaining({ scope: 'line', code: 'INSUFFICIENT_STOCK', params: expect.objectContaining({ available: 12_000 }) })]);
  });
});

describe('customers:search', () => {
  it('finds a customer for staff, with what they owe and their limit', async () => {
    await shop.signInAs('staff');
    const found = await h['customers:search']!({ query: 'imran' });
    expect(found).toEqual([expect.objectContaining({ id: shop.demo.customers['imran']!, balance: 1_550_000, credit_limit: 2_000_000, default_price_type: expect.any(String) })]);
    expect((await h['customers:search']!({ query: 'راشد' })).map((c: any) => c.name_en)).toEqual(['Rashid']);
    expect((await h['customers:search']!({})).length).toBe(5);
    expect(JSON.stringify(found)).not.toMatch(/cost|password|created_by/i);
  });
});

describe('the owner\'s approval at the counter', () => {
  it('is one minute in the shell too', () => expect(SHELL_TTL).toBe(60_000));

  beforeEach(async () => {
    await shop.signInAs('staff');
  });

  it('lets staff sell over the limit: a one-use token for exactly this bill, an invoice made by the staff member, and the owner on record as the approver', async () => {
    const sale = overLimit({ request_id: newId() });
    expect((await failureOf(h['sale:create']!(sale))).code).toBe('APPROVAL_REQUIRED'); // without it, no
    const grant = await requestApproval(sale);
    expect(grant).toMatchObject({ actions: ['credit_override'], token: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(new Date(grant.expires_at).getTime()).toBe(clock.now().getTime() + APPROVAL_TTL_MS);
    const sold = await h['sale:create']!({ ...sale, approval_token: grant.token });
    expect(sold.invoice).toMatchObject({ customer_id: sajid, created_by: shop.staffId, total: 150_000, paid_amount: 0 });
    expect(audits('credit_limit_override')).toEqual([expect.objectContaining({ user_id: shop.ownerId, row_id: sold.invoice.id })]);
    expect(audits('approval_granted')).toEqual([expect.objectContaining({ user_id: shop.ownerId })]);
    expect(JSON.parse(audits('approval_granted')[0]!.details)).toMatchObject({ requested_by: shop.staffId, actions: ['credit_override'] });
    expect(audits('approval_used')).toEqual([expect.objectContaining({ user_id: shop.ownerId, table_name: 'invoices', row_id: sold.invoice.id })]);
    expect(JSON.stringify(audits('approval_granted'))).not.toContain(grant.token); // the token itself is never written down
  });

  it('is for exactly this cart and amount: any other quantity, product, discount, customer, price type, price, batch or amount paid is refused', async () => {
    const base = overLimit();
    const variants: Record<string, object> = {
      'another quantity': { lines: [{ product_id: ins1l, qty: 4000 }] },
      'another product': { lines: [{ product_id: shop.demo.products['insecticide500']!, qty: 3000 }] },
      'a discount added': { lines: [{ product_id: ins1l, qty: 3000, line_discount: 1 }] },
      'a price added': { lines: [{ product_id: ins1l, qty: 3000, price_override: { unit_price: 49_000 } }] },
      'another customer': { customer_id: shop.demo.customers['tariq']! },
      'another price type': { price_type: 'wholesale' },
      'another amount paid': { paid_amount: 1000 },
      'another batch choice': { lines: [{ product_id: ins1l, qty: 3000, batches: [{ batch_id: shop.demo.batches['insecticide1l']!, qty: 3000 }] }] },
      'a line added': { lines: [...base.lines, { product_id: shop.demo.products['fertilizer1kg']!, qty: 1000 }] },
    };
    for (const [name, change] of Object.entries(variants)) {
      const grant = await requestApproval(base);
      const before = footprint();
      const error = await failureOf(h['sale:create']!({ ...base, request_id: newId(), ...change, approval_token: grant.token }));
      // Some of these may need other approvals too: whatever the reason, it is refused and nothing is written.
      expect(['APPROVAL_INVALID', 'APPROVAL_REQUIRED'], name).toContain(error.code);
      expect(footprint(), name).toEqual(before);
    }
    // the exact cart works (the order of the fields does not matter)
    const grant = await requestApproval(base);
    const reordered = { lines: base.lines, paid_amount: 0, customer_id: sajid };
    await expect(h['sale:create']!({ ...reordered, request_id: newId(), approval_token: grant.token })).resolves.toBeTruthy();
  });

  it('a token used on a different cart is spent by the try: it then fails on the right cart too (it cannot be probed)', async () => {
    const grant = await requestApproval(overLimit());
    const wrong = await failureOf(h['sale:create']!(overLimit({ lines: [{ product_id: ins1l, qty: 4000 }], request_id: newId(), approval_token: grant.token })));
    expect(wrong).toMatchObject({ code: 'APPROVAL_INVALID', params: { reason: 'other_bill' } });
    const again = await failureOf(h['sale:create']!(overLimit({ request_id: newId(), approval_token: grant.token })));
    expect(again).toMatchObject({ code: 'APPROVAL_INVALID', params: { reason: 'unknown_or_expired' } });
    expect(shop.count('invoices')).toBe(0);
  });

  it('works once: a second sale with the same token is refused', async () => {
    const grant = await requestApproval(overLimit());
    await h['sale:create']!(overLimit({ request_id: newId(), approval_token: grant.token }));
    const second = await failureOf(h['sale:create']!(overLimit({ request_id: newId(), approval_token: grant.token })));
    expect(second.code).toBe('APPROVAL_INVALID');
    expect(shop.count('invoices')).toBe(1);
  });

  it('lasts one minute: fine at 59 seconds, refused from 60', async () => {
    const early = await requestApproval(overLimit());
    clock.advance(APPROVAL_TTL_MS - 1000);
    await expect(h['sale:create']!(overLimit({ request_id: newId(), approval_token: early.token }))).resolves.toBeTruthy();
    const lateOver = await requestApproval(overLimit());
    clock.advance(APPROVAL_TTL_MS);
    expect((await failureOf(h['sale:create']!(overLimit({ request_id: newId(), approval_token: lateOver.token })))).params).toEqual({ reason: 'unknown_or_expired' });
  });

  it('is for exactly the actions the sale needs: a token for the wrong action, or for more than is needed, is refused', async () => {
    const sale = overLimit();
    const priceOnly = await requestApproval(sale, ['price_override']);
    expect((await failureOf(h['sale:create']!({ ...sale, request_id: newId(), approval_token: priceOnly.token }))).params).toEqual({ reason: 'other_action' });
    const tooMuch = await requestApproval(sale, ['credit_override', 'discount_override']);
    expect((await failureOf(h['sale:create']!({ ...sale, request_id: newId(), approval_token: tooMuch.token }))).params).toEqual({ reason: 'other_action' });
    const both = overLimit({ lines: [{ product_id: ins1l, qty: 3000, line_discount: 20_000 }] });
    const creditOnly = await requestApproval(both, ['credit_override']);
    expect((await failureOf(h['sale:create']!({ ...both, request_id: newId(), approval_token: creditOnly.token }))).params).toEqual({ reason: 'other_action' }); // it needs the discount approved as well
    const bothTokens = await requestApproval(both, ['discount_override', 'credit_override']);
    expect(bothTokens.actions).toEqual(['credit_override', 'discount_override']);
    await expect(h['sale:create']!({ ...both, request_id: newId(), approval_token: bothTokens.token })).resolves.toBeTruthy();
    expect(audits('discount_override')).toEqual([expect.objectContaining({ user_id: shop.ownerId })]);
  });

  it('belongs to the person who asked: another staff member cannot use it', async () => {
    const sale = overLimit();
    const grant = await requestApproval(sale);
    const info = loadDeviceInfo(shop.runtime.db)!;
    createUser(shop.runtime.db, info.scope, { name: 'Second', username: 'staff2', passwordHash: await fastHasher.hash('second-secret-1'), role: 'staff' });
    await shop.signOut();
    await shop.runtime.handlers['auth:login']({ username: 'staff2', password: 'second-secret-1' });
    expect((await failureOf(h['sale:create']!({ ...sale, request_id: newId(), approval_token: grant.token }))).params).toEqual({ reason: 'other_user' });
  });

  it('a token nobody made, one that is garbage, and one that is missing, are all refused', async () => {
    expect((await failureOf(h['sale:create']!(overLimit({ request_id: newId(), approval_token: 'f'.repeat(64) })))).code).toBe('APPROVAL_INVALID');
    expect((await failureOf(h['sale:create']!(overLimit({ request_id: newId(), approval_token: 'garbage-garbage-garbage' })))).code).toBe('APPROVAL_INVALID');
    expect(await failureOf(h['sale:create']!(overLimit({ request_id: newId() })))).toMatchObject({ code: 'APPROVAL_REQUIRED', params: { actions: 'credit_override' } });
    expect(shop.count('invoices')).toBe(0);
  });

  it('is not needed, and not used, for a sale that needs none (a token sent anyway is ignored and stays valid)', async () => {
    const grant = await requestApproval(overLimit());
    await expect(h['sale:create']!(withinLimit({ request_id: newId(), approval_token: grant.token }))).resolves.toBeTruthy();
    expect(audits('approval_used')).toEqual([]);
    await expect(h['sale:create']!(overLimit({ request_id: newId(), approval_token: grant.token }))).resolves.toBeTruthy(); // still good for its own cart
  });

  it('asking for a credit override without the owner\'s approval changes nothing: staff cannot just say so', async () => {
    const error = await failureOf(h['sale:create']!(overLimit({ request_id: newId(), credit_override: true })));
    expect(error.code).toBe('APPROVAL_REQUIRED');
    expect(shop.count('invoices')).toBe(0);
  });

  it('a double click after an approved sale returns the same invoice: the spent token is not asked for again', async () => {
    const sale = overLimit({ request_id: newId() });
    const grant = await requestApproval(sale);
    const first = await h['sale:create']!({ ...sale, approval_token: grant.token });
    const second = await h['sale:create']!({ ...sale, approval_token: grant.token });
    expect(second.replayed).toBe(true);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(shop.count('invoices')).toBe(1);
    expect(audits('approval_used')).toHaveLength(1);
  });

  it('wrong passwords: the owner\'s name with the wrong password, a staff password, and an unknown name all get the same refusal, and each is written down', async () => {
    const sale = overLimit();
    for (const [username, password] of [['owner', 'wrong-password'], ['staff', STAFF.password], ['nobody', 'x']] as const) {
      const error = await failureOf(requestApproval(sale, ['credit_override'], password, username));
      expect(error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(audits('approval_failed')).toHaveLength(3);
    expect(audits('approval_granted')).toHaveLength(0);
  });

  it('a token for one override price is no good for another price, even though everything else is the same', async () => {
    const priced = (unit_price: number) => ({ paid_amount: 0, customer_id: sajid, lines: [{ product_id: ins1l, qty: 1000, price_override: { unit_price } }] });
    const grant = await requestApproval(priced(40_000), ['price_override']);
    const wrong = await failureOf(h['sale:create']!({ ...priced(1), request_id: newId(), approval_token: grant.token }));
    expect(wrong).toMatchObject({ code: 'APPROVAL_INVALID', params: { reason: 'other_bill' } });
    const second = await requestApproval(priced(40_000), ['price_override']);
    await expect(h['sale:create']!({ ...priced(40_000), request_id: newId(), approval_token: second.token })).resolves.toBeTruthy();
  });

  it('is made only from a real, active owner: one who was switched off or deleted cannot approve, and each token is different and unguessable', async () => {
    const first = await requestApproval(overLimit());
    const second = await requestApproval(overLimit());
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(second.token).toMatch(/^[0-9a-f]{64}$/);
    expect(second.token).not.toBe(first.token);
    shop.runtime.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(shop.ownerId);
    expect((await failureOf(requestApproval(overLimit()))).code).toBe('INVALID_CREDENTIALS');
    shop.runtime.db.prepare('UPDATE users SET is_active = 1, deleted_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', shop.ownerId);
    expect((await failureOf(requestApproval(overLimit()))).code).toBe('INVALID_CREDENTIALS');
    shop.runtime.db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(shop.ownerId);
    await expect(requestApproval(overLimit())).resolves.toBeTruthy();
  });

  it('an approval for one thing writes the record of that thing only: credit alone does not claim a discount or a price was approved', async () => {
    const sale = overLimit({ request_id: newId() });
    const grant = await requestApproval(sale, ['credit_override']);
    await h['sale:create']!({ ...sale, approval_token: grant.token });
    expect(audits('credit_limit_override')).toHaveLength(1);
    expect(audits('discount_override')).toEqual([]);
    expect(audits('price_override')).toEqual([]);
    const cheaper = { request_id: newId(), paid_amount: 40_000, lines: [{ product_id: ins1l, qty: 1000, price_override: { unit_price: 40_000 } }] };
    const priceGrant = await requestApproval(cheaper, ['price_override']);
    await h['sale:create']!({ ...cheaper, approval_token: priceGrant.token });
    expect(audits('price_override')).toHaveLength(1);
    expect(audits('discount_override')).toEqual([]);
    expect(audits('credit_limit_override')).toHaveLength(1); // still just the first sale's
  });

  describe('the same lock-out as sign-in', () => {
    const wrong = () => failureOf(requestApproval(overLimit(), ['credit_override'], 'wrong-password'));

    it('five wrong passwords lock the person asking out for 30 seconds, even for the right password, which is then not even checked', async () => {
      for (let i = 0; i < THROTTLE.maxFailures; i++) expect((await wrong()).code).toBe('INVALID_CREDENTIALS');
      const checked = fastHasher.verifyCalls;
      const locked = await failureOf(requestApproval(overLimit()));
      expect(locked).toMatchObject({ code: 'TOO_MANY_ATTEMPTS', params: { seconds: 30 } });
      expect(fastHasher.verifyCalls).toBe(checked); // refused without looking at the password
      clock.advance(10_000);
      expect((await failureOf(requestApproval(overLimit()))).params).toEqual({ seconds: 20 });
      clock.advance(20_000);
      await expect(requestApproval(overLimit())).resolves.toMatchObject({ token: expect.any(String) });
      expect(audits('approval_locked')).toEqual([expect.objectContaining({ user_id: shop.staffId })]);
    });

    it('each time the lock comes back it doubles (30 s, 60 s, 120 s ...), up to 15 minutes', async () => {
      const seconds: number[] = [];
      for (let round = 0; round < 7; round++) {
        for (let i = 0; i < THROTTLE.maxFailures; i++) await wrong();
        const locked = await failureOf(requestApproval(overLimit()));
        seconds.push(locked.params['seconds'] as number);
        clock.advance((locked.params['seconds'] as number) * 1000);
      }
      expect(seconds).toEqual([30, 60, 120, 240, 480, 900, 900]);
    });

    it('a right password clears the wrong ones, so four, a right one, and four more do not lock', async () => {
      for (let i = 0; i < 4; i++) await wrong();
      await requestApproval(overLimit());
      for (let i = 0; i < 4; i++) await wrong();
      await expect(requestApproval(overLimit())).resolves.toBeTruthy();
    });

    it('locks only the person who asked: another staff member can still ask, and the owner can still sign in', async () => {
      for (let i = 0; i < THROTTLE.maxFailures; i++) await wrong();
      expect((await failureOf(requestApproval(overLimit()))).code).toBe('TOO_MANY_ATTEMPTS');
      const info = loadDeviceInfo(shop.runtime.db)!;
      createUser(shop.runtime.db, info.scope, { name: 'Second', username: 'staff2', passwordHash: await fastHasher.hash('second-secret-1'), role: 'staff' });
      await shop.signOut();
      await shop.runtime.handlers['auth:login']({ username: 'staff2', password: 'second-secret-1' });
      await expect(requestApproval(overLimit())).resolves.toBeTruthy();
      await shop.signOut();
      await expect(shop.runtime.handlers['auth:login']({ username: 'owner', password: OWNER.password })).resolves.toBeTruthy(); // the owner's sign-in is untouched
    });
  });
});

describe('the discount staff may give without the owner', () => {
  beforeEach(async () => {
    await shop.signInAs('staff');
  });
  const oneBottle = (discount: number, extra: object = {}) => ({ paid_amount: 50_000 - discount, request_id: newId(), lines: [{ product_id: ins1l, qty: 1000, line_discount: discount }], ...extra });

  it('is 5 percent of the line: up to it needs nobody, one paisa more needs the owner', async () => {
    await expect(h['sale:create']!(oneBottle(2500))).resolves.toBeTruthy();
    const refused = await failureOf(h['sale:create']!(oneBottle(2501)));
    expect(refused).toMatchObject({ code: 'APPROVAL_REQUIRED', params: { actions: 'discount_override' } });
    expect(shop.count('invoices')).toBe(1);
  });

  it('with the owner\'s approval a bigger discount goes through, and the owner is on record as having allowed it', async () => {
    const sale = oneBottle(10_000);
    const grant = await requestApproval(sale, ['discount_override']);
    const sold = await h['sale:create']!({ ...sale, approval_token: grant.token });
    expect(sold.invoice.total).toBe(40_000);
    const [row] = audits('discount_override');
    expect(row).toMatchObject({ user_id: shop.ownerId, row_id: sold.invoice.id });
    expect(JSON.parse(row!.details)).toEqual({ lines: [{ product_id: ins1l, discount: 10_000, gross: 50_000 }] });
  });

  it('follows the setting the owner changes', async () => {
    shop.runtime.db.prepare("INSERT INTO settings (id, \"key\", value, shop_id, branch_id, device_id) SELECT ?, 'staff_max_discount_percent', '10', shops.id, branches.id, devices.id FROM shops, branches, devices LIMIT 1").run(randomUUID());
    await expect(h['sale:create']!(oneBottle(5000))).resolves.toBeTruthy();
    expect((await failureOf(h['sale:create']!(oneBottle(5001)))).code).toBe('APPROVAL_REQUIRED');
    expect((await h['sale:quote']!(oneBottle(5000))).staff_max_discount_percent).toBe(10);
  });

  it('the owner needs no approval for any discount, and no approval is recorded', async () => {
    await shop.signOut();
    await shop.signInAs('owner');
    await expect(h['sale:create']!(oneBottle(30_000))).resolves.toBeTruthy();
    expect(audits('approval_used')).toEqual([]);
  });
});

describe('the owner a quote is priced with', () => {
  it('is an active owner: never staff, never one switched off or deleted', async () => {
    const info = loadDeviceInfo(shop.runtime.db)!;
    expect(findActiveOwnerId(shop.runtime.db)).toBe(shop.ownerId);
    const second = createUser(shop.runtime.db, info.scope, { name: 'Second owner', username: 'owner2', passwordHash: await fastHasher.hash('second-secret-1'), role: 'owner' });
    shop.runtime.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(shop.ownerId);
    expect(findActiveOwnerId(shop.runtime.db)).toBe(second);
    shop.runtime.db.prepare('UPDATE users SET is_active = 1, deleted_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', shop.ownerId);
    expect(findActiveOwnerId(shop.runtime.db)).toBe(second);
    shop.runtime.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(second);
    expect(findActiveOwnerId(shop.runtime.db)).toBeUndefined(); // only staff is left, and staff is never an approver
  });
});

describe('the owner\'s own sales are as before', () => {
  beforeEach(async () => {
    await shop.signInAs('owner');
  });

  it('can sell over the limit, at another price, with a bigger discount, with no token and no extra step; each override is on record', async () => {
    const sold = await h['sale:create']!({ ...overLimit({ credit_override: true, request_id: newId() }), lines: [{ product_id: ins1l, qty: 3000, line_discount: 20_000, price_override: { unit_price: 49_000 } }] });
    expect(sold.invoice.created_by).toBe(shop.ownerId);
    expect(audits('credit_limit_override')).toEqual([expect.objectContaining({ user_id: shop.ownerId })]);
    expect(audits('price_override')).toEqual([expect.objectContaining({ user_id: shop.ownerId })]);
    expect(audits('approval_granted')).toEqual([]);
  });

  it('is still stopped by the limit when it does not ask to go over it', async () => {
    expect((await failureOf(h['sale:create']!(overLimit({ request_id: newId() })))).code).toBe('CREDIT_LIMIT_EXCEEDED');
  });
});

describe('the lock-out at sign-in', () => {
  const wrongLogin = (username = 'owner') => failureOf(h['auth:login']!({ username, password: 'wrong-password' }));

  it('five wrong passwords lock that name for 30 seconds; the right password is refused without being checked; then it works', async () => {
    for (let i = 0; i < THROTTLE.maxFailures; i++) expect((await wrongLogin()).code).toBe('INVALID_CREDENTIALS');
    const checked = fastHasher.verifyCalls;
    const locked = await failureOf(h['auth:login']!({ username: 'owner', password: OWNER.password }));
    expect(locked).toMatchObject({ code: 'TOO_MANY_ATTEMPTS', params: { seconds: 30 } });
    expect(fastHasher.verifyCalls).toBe(checked);
    expect(shop.runtime.session.current()).toBeNull();
    clock.advance(30_000);
    await expect(h['auth:login']!({ username: 'owner', password: OWNER.password })).resolves.toMatchObject({ role: 'owner' });
    expect(audits('login_locked')).toHaveLength(1);
  });

  it('doubles each time, and a right password clears the count', async () => {
    const seconds: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < THROTTLE.maxFailures; i++) await wrongLogin();
      const locked = await failureOf(h['auth:login']!({ username: 'owner', password: OWNER.password }));
      seconds.push(locked.params['seconds'] as number);
      clock.advance((locked.params['seconds'] as number) * 1000);
    }
    expect(seconds).toEqual([30, 60, 120]);
    await h['auth:login']!({ username: 'owner', password: OWNER.password });
    await h['auth:logout']!({});
    for (let i = 0; i < 4; i++) await wrongLogin();
    await expect(h['auth:login']!({ username: 'owner', password: OWNER.password })).resolves.toBeTruthy(); // four wrong after a success do not lock
  });

  it('a right password clears the wrong ones and the doubling: four wrong, a right one, four wrong do not lock, and the next lock is 30 seconds again', async () => {
    for (let i = 0; i < THROTTLE.maxFailures; i++) await wrongLogin();
    clock.advance(30_000);
    for (let i = 0; i < 4; i++) await wrongLogin();
    await h['auth:login']!({ username: 'owner', password: OWNER.password });
    await h['auth:logout']!({});
    for (let i = 0; i < 4; i++) await wrongLogin();
    await expect(h['auth:login']!({ username: 'owner', password: OWNER.password })).resolves.toBeTruthy();
    await h['auth:logout']!({});
    for (let i = 0; i < THROTTLE.maxFailures; i++) await wrongLogin();
    expect((await failureOf(h['auth:login']!({ username: 'owner', password: OWNER.password }))).params).toEqual({ seconds: 30 });
  });

  it('locks one name only, whatever its letter case, and an unknown name is locked the same way (so nothing shows which names exist)', async () => {
    for (let i = 0; i < THROTTLE.maxFailures; i++) await wrongLogin('Owner');
    expect((await failureOf(h['auth:login']!({ username: 'owner', password: OWNER.password }))).code).toBe('TOO_MANY_ATTEMPTS');
    await expect(h['auth:login']!({ username: 'staff', password: STAFF.password })).resolves.toMatchObject({ role: 'staff' });
    for (let i = 0; i < THROTTLE.maxFailures; i++) await wrongLogin('nobody-at-all');
    expect(await failureOf(h['auth:login']!({ username: 'nobody-at-all', password: 'x' }))).toMatchObject({ code: 'TOO_MANY_ATTEMPTS', params: { seconds: 30 } });
  });
});

describe('request_id across a restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pos-restart-'));
  });
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the folder is in the temp directory */
    }
  });

  it('a sale asked for again after the app was closed and opened again is the same invoice, not a second one', async () => {
    shop.runtime.close();
    const file = join(dir, 'shop.db');
    const first = await makeShop({ dbPath: file });
    const requestId = newId();
    const sale = { paid_amount: 50_000, request_id: requestId, lines: [{ product_id: first.demo.products['insecticide1l']!, qty: 1000 }] };
    await first.signInAs('staff');
    const sold = await (first.runtime.handlers as unknown as Record<string, Handler>)['sale:create']!(sale);
    first.runtime.close(); // the app is closed: every service, cache and connection is gone

    const reopened = await createRuntime({ dbPath: file, prefsPath: null, hasher: fastHasher });
    try {
      await reopened.handlers['auth:login']({ username: 'staff', password: STAFF.password });
      const again = await (reopened.handlers as unknown as Record<string, Handler>)['sale:create']!(sale);
      expect(again.replayed).toBe(true);
      expect(again.invoice.id).toBe(sold.invoice.id);
      expect(again.invoice.invoice_no).toBe(sold.invoice.invoice_no);
      const count = (table: string) => (reopened.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
      expect(count('invoices')).toBe(1);
      expect(count('invoice_items')).toBe(1);
      // the stock was taken once: 12 packs in, 1 sold
      expect((reopened.db.prepare("SELECT SUM(qty_delta) AS s FROM stock_movements WHERE batch_id = ?").get(first.demo.batches['insecticide1l']!) as { s: number }).s).toBe(11_000);
      // and a different sale with the same id is refused, after the restart too
      expect((await failureOf((reopened.handlers as unknown as Record<string, Handler>)['sale:create']!({ ...sale, paid_amount: 100_000, lines: [{ product_id: first.demo.products['insecticide1l']!, qty: 2000 }] }))).code).toBe('REQUEST_ID_REUSED');
    } finally {
      reopened.close();
    }
  });
});

describe('what the screen may and may not send', () => {
  beforeEach(async () => {
    await shop.signInAs('staff');
  });

  it('refuses the keys that are not its to send: who approved, a name, a false override, a short id or token', () => {
    const base = { paid_amount: 50_000, lines: [{ product_id: ins1l, qty: 1000 }] };
    const ok = (channel: 'sale:create' | 'sale:quote', extra: object) => contract[channel].input.safeParse({ ...base, ...extra }).success;
    expect(ok('sale:create', {})).toBe(true);
    expect(ok('sale:create', { request_id: 'req-0000-0001', approval_token: 'a'.repeat(64) })).toBe(true);
    expect(ok('sale:create', { approved_by: shop.ownerId })).toBe(false);
    expect(ok('sale:create', { discount_override: { approved_by: shop.ownerId } })).toBe(false);
    expect(ok('sale:create', { credit_override: false })).toBe(false);
    expect(ok('sale:create', { request_id: 'short' })).toBe(false);
    expect(ok('sale:create', { approval_token: 'short' })).toBe(false);
    expect(ok('sale:create', { name_en: 'Fake' })).toBe(false);
    expect(ok('sale:quote', { request_id: 'req-0000-0001' })).toBe(false); // a quote is not a request to sell
    const approval = (extra: object) => contract['approval:request'].input.safeParse({ username: 'owner', password: 'x', actions: ['credit_override'], sale: toSubject(base), ...extra }).success;
    expect(approval({})).toBe(true);
    expect(approval({ actions: [] })).toBe(false);
    expect(approval({ actions: ['everything'] })).toBe(false);
    expect(approval({ sale: { lines: base.lines } })).toBe(false); // the amount is part of it
    expect(approval({ sale: { ...toSubject(base), approved_by: shop.ownerId } })).toBe(false);
  });

  it('the answers carry no cost, no password and no hash anywhere (a deep scan of every reply of the new channels)', async () => {
    const replies = [
      await h['sale:quote']!({ lines: [{ product_id: ins1l, qty: 2000 }] }),
      await h['customers:search']!({ query: 'a' }),
      await requestApproval(overLimit()),
    ];
    const text = JSON.stringify(replies);
    expect(text).not.toMatch(/cost|password|hash|recovery/i);
    expect(text).not.toContain('40000'); // the batch cost of the demo bottle
  });
});

void systemClock;
void randomUUID;
