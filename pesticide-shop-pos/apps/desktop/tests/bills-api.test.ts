// Held bills through the main process: any signed-in user, the holder comes from the session (never the request), no price is stored,
// a bill is resumed or discarded once, and every step leaves an audit row.
import { channels, contract } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerIpc, type IpcEventLike, type IpcMainLike } from '../src/main/ipc.js';
import { makeShop, type Shop } from './support.js';

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
let product: string;
let other: string;
const h = () => shop.runtime.handlers;
const held = () => shop.runtime.db.prepare('SELECT id, held_by, status, resolved_by, payload FROM held_bills ORDER BY rowid').all() as { id: string; held_by: string; status: string; resolved_by: string | null; payload: string }[];
const audits = (action: string) => shop.runtime.db.prepare('SELECT user_id, row_id FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { user_id: string; row_id: string }[];

beforeEach(async () => {
  shop = await makeShop();
  product = shop.demo.products['insecticide1l']!;
  other = shop.demo.products['fertilizer50kg']!;
});
afterEach(() => shop.runtime.close());

describe('who may use the held-bills channels', () => {
  it('nobody signed out: all four say NOT_SIGNED_IN and nothing is written', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const call of [() => h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] }), () => h()['bills:list']({}), () => h()['bills:resume']({ id }), () => h()['bills:discard']({ id })]) {
      expect((await failureOf(call())).code).toBe('NOT_SIGNED_IN');
    }
    expect(held()).toEqual([]);
  });

  it.each(['owner', 'staff'] as const)('%s can hold, list, resume and discard', async (who) => {
    await shop.signInAs(who);
    const a = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    const b = await h()['bills:hold']({ lines: [{ product_id: other, qty: 1000 }] });
    expect((await h()['bills:list']({})).map((x) => x.id)).toEqual([a.id, b.id]);
    expect((await h()['bills:resume']({ id: a.id })).lines).toHaveLength(1);
    await h()['bills:discard']({ id: b.id });
    expect(await h()['bills:list']({})).toEqual([]);
  });
});

describe('the holder is the session, never the request', () => {
  it('records the signed-in user as holder, and the list names them (the owner sees staff bills and the other way round)', async () => {
    await shop.signInAs('staff');
    const mine = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    await shop.signOut();
    await shop.signInAs('owner');
    const owners = await h()['bills:hold']({ lines: [{ product_id: other, qty: 1000 }] });
    expect(held().map((r) => [r.id, r.held_by])).toEqual([[mine.id, shop.staffId], [owners.id, shop.ownerId]]);
    expect((await h()['bills:list']({})).map((b) => [b.id, b.held_by_name])).toEqual([[mine.id, 'Salesman'], [owners.id, 'Owner']]);
  });

  it('the renderer cannot name the holder: held_by, actor_id, created_by, user_id and status are refused before any handler runs', async () => {
    const listeners = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
    const ipcMain: IpcMainLike = { handle: (channel, listener) => void listeners.set(channel, listener) };
    registerIpc(ipcMain, h(), () => true, () => undefined);
    await shop.signInAs('staff');
    const trusted: IpcEventLike = { sender: { id: 1 }, senderFrame: { url: 'file:///app/index.html', parent: null } };
    const call = (payload: unknown) => Promise.resolve(listeners.get('bills:hold')!(trusted, payload)) as Promise<{ ok: boolean; error?: { code: string } }>;
    for (const key of ['held_by', 'actor_id', 'created_by', 'user_id', 'status', 'resolved_by']) {
      expect(await call({ lines: [{ product_id: product, qty: 1000 }], [key]: shop.ownerId }), key).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect(held()).toEqual([]);
    expect(await call({ lines: [{ product_id: product, qty: 1000 }] })).toMatchObject({ ok: true });
    expect(held()[0]!.held_by).toBe(shop.staffId);
  });

  it('resuming records who resumed it, which can be someone other than the holder, and the reply still says who HELD it', async () => {
    await shop.signInAs('staff');
    const bill = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    await shop.signOut();
    await shop.signInAs('owner');
    const resumed = await h()['bills:resume']({ id: bill.id });
    expect(resumed.held_by_name).toBe('Salesman');
    expect(held()[0]).toMatchObject({ status: 'resumed', resolved_by: shop.ownerId });
  });
});

describe('no price is stored or returned', () => {
  it('the stored payload and every reply hold only choices: product, quantity, discount as entered, batch, customer, price type, note', async () => {
    await shop.signInAs('staff');
    const batch = shop.demo.batches['insecticide1l']!;
    const bill = await h()['bills:hold']({
      customer_id: shop.demo.customers['rashid']!, price_type: 'wholesale', note: 'wife is fetching the card',
      lines: [{ product_id: product, qty: 2000, discount: { kind: 'amount', value: 700 }, batch_id: batch }],
    });
    const stored = JSON.parse(held()[0]!.payload) as Record<string, unknown>;
    expect(stored).toEqual({ note: 'wife is fetching the card', lines: [{ product_id: product, qty: 2000, discount: { kind: 'amount', value: 700 }, batch_id: batch }] });
    const listed = await h()['bills:list']({});
    const resumed = await h()['bills:resume']({ id: bill.id });
    const keys = (value: unknown): string[] => (value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]) : []);
    for (const key of [...keys(listed), ...keys(resumed)]) expect(key, key).not.toMatch(/price(?!_type)|total|cost|tax/i);
    expect(resumed).toMatchObject({ price_type: 'wholesale', note: 'wife is fetching the card', customer: { name_en: 'Rashid' }, lines: [{ product_id: product, qty: 2000, discount: 700, batch_id: batch }] });
  });

  it('an unknown product is refused and nothing is held', async () => {
    await shop.signInAs('staff');
    expect((await failureOf(h()['bills:hold']({ lines: [{ product_id: '22222222-2222-4222-8222-222222222222', qty: 1 }] }))).code).toBe('NOT_FOUND');
    expect(held()).toEqual([]);
    expect(audits('bill_held')).toEqual([]);
  });
});

describe('one use', () => {
  it('a second resume, a resume after a discard and a discard after a resume are HELD_BILL_GONE (and the second resume gets no cart)', async () => {
    await shop.signInAs('staff');
    const a = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    const b = await h()['bills:hold']({ lines: [{ product_id: other, qty: 1000 }] });
    await h()['bills:resume']({ id: a.id });
    expect((await failureOf(h()['bills:resume']({ id: a.id }))).code).toBe('HELD_BILL_GONE');
    expect((await failureOf(h()['bills:discard']({ id: a.id }))).code).toBe('HELD_BILL_GONE');
    await h()['bills:discard']({ id: b.id });
    expect((await failureOf(h()['bills:resume']({ id: b.id }))).code).toBe('HELD_BILL_GONE');
    expect((await failureOf(h()['bills:resume']({ id: '33333333-3333-4333-8333-333333333333' }))).code).toBe('HELD_BILL_GONE');
  });

  it('two resumes at the same moment (two windows or two people): exactly one gets the cart', async () => {
    await shop.signInAs('staff');
    const bill = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    const results = await Promise.allSettled([h()['bills:resume']({ id: bill.id }), h()['bills:resume']({ id: bill.id })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0]!.reason as DomainError).code).toBe('HELD_BILL_GONE');
  });

  it('holding, resuming and discarding each leave an audit row naming the signed-in user', async () => {
    await shop.signInAs('staff');
    const a = await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    const b = await h()['bills:hold']({ lines: [{ product_id: other, qty: 1000 }] });
    await h()['bills:resume']({ id: a.id });
    await h()['bills:discard']({ id: b.id });
    expect(audits('bill_held')).toEqual([{ user_id: shop.staffId, row_id: a.id }, { user_id: shop.staffId, row_id: b.id }]);
    expect(audits('bill_resumed')).toEqual([{ user_id: shop.staffId, row_id: a.id }]);
    expect(audits('bill_discarded')).toEqual([{ user_id: shop.staffId, row_id: b.id }]);
  });

  it('survives a restart: the bills are in the database, not in the window', async () => {
    await shop.signInAs('staff');
    await h()['bills:hold']({ lines: [{ product_id: product, qty: 1000 }] });
    expect(await h()['bills:list']({})).toHaveLength(1);
    expect(shop.count('held_bills')).toBe(1);
  });
});

describe('the contract lists the four channels', () => {
  it('bills:hold, bills:list, bills:resume and bills:discard exist, with strict inputs', () => {
    for (const channel of ['bills:hold', 'bills:list', 'bills:resume', 'bills:discard'] as const) {
      expect(channels).toContain(channel);
      expect(contract[channel].input.safeParse({ surprise: 1 }).success).toBe(false);
    }
  });
});
