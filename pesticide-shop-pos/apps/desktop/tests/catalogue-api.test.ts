// Phase 4, M3: the catalogue, receiving stock and the quick-adds through the main process.
// Who may call what (every channel has a policy), what staff are never told (cost), what the renderer may never say (who is acting),
// and the background pre-warm after the owner's catalogue changes.
import { randomUUID } from 'node:crypto';
import { channels, type Channel, type Input, type SessionUser } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpc, type IpcEventLike, type IpcMainLike } from '../src/main/ipc.js';
import { CAPABILITY_ROLES, CHANNEL_POLICY, can, guardHandlers, sanitizeErrorFor, type Capability } from '../src/main/permissions.js';
import type { Handlers } from '../src/main/runtime.js';
import { day, fakePrinting, makeShop, type Shop } from './support.js';

// ---------------------------------------------------------------------------------------------------------------------------
// What the policy SHOULD be, written out by hand. If someone loosens a channel, this table must be changed on purpose.
// ---------------------------------------------------------------------------------------------------------------------------
type Who = 'public' | 'signed-in' | 'owner';
const EXPECTED: Record<Channel, Who> = {
  'app:getState': 'public',
  'setup:createShop': 'public',
  'auth:login': 'public',
  'auth:logout': 'public',
  'auth:me': 'public',
  'auth:regenerateRecoveryCode': 'signed-in',
  'auth:resetOwnerPassword': 'public',
  'prefs:setLanguage': 'public',
  'sale:quote': 'signed-in',
  'sale:create': 'signed-in',
  'customers:search': 'signed-in',
  'approval:request': 'signed-in',
  'salesReturn:create': 'owner',
  'invoices:list': 'signed-in',
  'invoices:get': 'signed-in',
  'invoices:receipt': 'signed-in',
  'print:document': 'signed-in',
  'printers:list': 'signed-in',
  'print:getConfig': 'signed-in',
  'print:setConfig': 'owner',
  'stock:batchesOf': 'signed-in',
  'stock:openingStock': 'owner',
  'stock:adjust': 'owner',
  'stock:writeOff': 'owner',
  'stock:receive': 'owner',
  'catalogue:list': 'signed-in',
  'catalogue:createGroup': 'owner',
  'catalogue:updateGroup': 'owner',
  'catalogue:addSize': 'owner',
  'catalogue:updateSize': 'owner',
  'catalogue:setSizeActive': 'owner',
  'catalogue:setGroupActive': 'owner',
  'catalogue:moveSize': 'owner',
  'suppliers:list': 'signed-in',
  'suppliers:create': 'owner',
  'categories:list': 'signed-in',
  'categories:create': 'owner',
  'brands:list': 'signed-in',
  'brands:create': 'owner',
  'khata:setOpeningBalance': 'owner',
  'reports:profitByDay': 'owner',
  // held bills: owner AND staff share the counter, so any signed-in user
  'bills:hold': 'signed-in',
  'bills:list': 'signed-in',
  'bills:resume': 'signed-in',
  'bills:discard': 'signed-in',
  // Phase 6 M2: customers, payments, statement. Terms and shop settings are the owner's; everything else is any signed-in user.
  'customers:list': 'signed-in',
  'customers:get': 'signed-in',
  'customers:findDuplicates': 'signed-in',
  'customers:create': 'signed-in',
  'customers:update': 'signed-in',
  'customers:setTerms': 'owner',
  'customers:getSettings': 'signed-in',
  'customers:setSettings': 'owner',
  'payments:receive': 'signed-in',
  'khata:statement': 'signed-in',
};

const OWNER_USER: SessionUser = { id: randomUUID(), name: 'Owner', username: 'owner', role: 'owner' };
const STAFF_USER: SessionUser = { id: randomUUID(), name: 'Salesman', username: 'staff', role: 'staff' };
const roles = { 'nobody (signed out)': null, staff: STAFF_USER, owner: OWNER_USER } as const;

/** One valid payload per channel, for checks that only care about the keys. */
const SAMPLES: Record<Channel, () => Record<string, unknown>> = {
  'app:getState': () => ({}),
  'setup:createShop': () => ({ shopName: 'Shop', ownerName: 'Owner', username: 'owner', password: 'long-enough-1' }),
  'auth:login': () => ({ username: 'owner', password: 'x' }),
  'auth:logout': () => ({}),
  'auth:me': () => ({}),
  'auth:regenerateRecoveryCode': () => ({ password: 'x' }),
  'auth:resetOwnerPassword': () => ({ username: 'owner', recoveryCode: 'ABCD-EFGH-JKMN-PQRS-TVWX', newPassword: 'another-long-1' }),
  'prefs:setLanguage': () => ({ language: 'ur' }),
  'sale:quote': () => ({ lines: [{ product_id: randomUUID(), qty: 1000 }] }),
  'sale:create': () => ({ paid_amount: 50_000, lines: [{ product_id: randomUUID(), qty: 1000 }] }),
  'customers:search': () => ({ query: 'rashid' }),
  'approval:request': () => ({ username: 'owner', password: 'x', actions: ['credit_override'], sale: { paid_amount: 0, lines: [{ product_id: randomUUID(), qty: 1000 }] } }),
  'salesReturn:create': () => ({ invoice_id: randomUUID(), refund_method: 'khata_credit', items: [{ invoice_item_id: randomUUID(), qty: 1000, condition: 'resellable' }] }),
  'invoices:list': () => ({ query: 'rashid' }),
  'invoices:get': () => ({ invoice_id: randomUUID() }),
  'invoices:receipt': () => ({ invoice_id: randomUUID() }),
  'print:document': () => ({ invoice_id: randomUUID(), kind: 'receipt' }),
  'printers:list': () => ({}),
  'print:getConfig': () => ({}),
  'print:setConfig': () => ({ shop_phone: '0300 1234567' }),
  'stock:batchesOf': () => ({ productId: randomUUID() }),
  'stock:openingStock': () => ({ product_id: randomUUID(), batch_no: 'B-1', expiry_date: '2027-01-31', cost_price: 40_000, qty: 5000 }),
  'stock:adjust': () => ({ batch_id: randomUUID(), qty_delta: -100 }),
  'stock:writeOff': () => ({ batch_id: randomUUID(), qty: 100, kind: 'damage' }),
  'stock:receive': () => ({ supplier_id: randomUUID(), items: [{ product_id: randomUUID(), batch_no: 'B-014', expiry_date: '2027-03-12', qty: 12_000, cost_price: 40_000 }] }),
  'catalogue:list': () => ({ query: 'x' }),
  'catalogue:createGroup': () => ({ name_en: 'Product A' }),
  'catalogue:updateGroup': () => ({ group_id: randomUUID(), name_en: 'Product B' }),
  'catalogue:addSize': () => ({ group_id: randomUUID(), size: { pack_label: '1 L', base_unit: 'ml', pack_size: 1000, retail_price: 1, wholesale_price: 1 } }),
  'catalogue:updateSize': () => ({ product_id: randomUUID(), changes: { retail_price: 2 } }),
  'catalogue:setSizeActive': () => ({ id: randomUUID(), is_active: false }),
  'catalogue:setGroupActive': () => ({ id: randomUUID(), is_active: false }),
  'catalogue:moveSize': () => ({ product_id: randomUUID(), to_group_id: randomUUID(), pack_label: '2 L' }),
  'suppliers:list': () => ({}),
  'suppliers:create': () => ({ name_en: 'Supplier' }),
  'categories:list': () => ({}),
  'categories:create': () => ({ name_en: 'Category' }),
  'brands:list': () => ({}),
  'brands:create': () => ({ name_en: 'Brand' }),
  'khata:setOpeningBalance': () => ({ customer_id: randomUUID(), amount: 100 }),
  'reports:profitByDay': () => ({ from: '2026-10-01', to: '2026-10-31' }),
  'bills:hold': () => ({ lines: [{ product_id: randomUUID(), qty: 1000 }] }),
  'bills:list': () => ({}),
  'bills:resume': () => ({ id: randomUUID() }),
  'bills:discard': () => ({ id: randomUUID() }),
  'customers:list': () => ({ query: 'rashid', filter: 'owes' }),
  'customers:get': () => ({ customer_id: randomUUID() }),
  'customers:findDuplicates': () => ({ name_en: 'Rashid', phone: '0300 1234567' }),
  'customers:create': () => ({ fields: { name_en: 'New Farmer', phone: '0300 5551234' } }),
  'customers:update': () => ({ customer_id: randomUUID(), fields: { village: 'Chak 5' }, expected_version: 1 }),
  'customers:setTerms': () => ({ customer_id: randomUUID(), credit_limit: 500_000, default_price_type: 'retail', expected_version: 1 }),
  'customers:getSettings': () => ({}),
  'customers:setSettings': () => ({ default_credit_limit: 100_000 }),
  'payments:receive': () => ({ customer_id: randomUUID(), amount: 10_000, method: 'cash' }),
  'khata:statement': () => ({ customer_id: randomUUID(), from: '2026-10-01', to: '2026-10-31' }),
};

/** A stand-in for Electron's ipcMain: calls arrive the way the renderer's would. */
function fakeIpc() {
  const listeners = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
  const ipcMain: IpcMainLike = { handle: (channel, listener) => void listeners.set(channel, listener) };
  const trusted: IpcEventLike = { sender: { id: 1 }, senderFrame: { url: 'file:///app/index.html', parent: null } };
  return { ipcMain, invoke: (channel: string, payload: unknown) => Promise.resolve(listeners.get(channel)!(trusted, payload)) as Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string; params: Record<string, unknown> } }> };
}

/** Handlers that only record what they were given. */
function spyHandlers() {
  const calls: Channel[] = [];
  const handlers = Object.fromEntries(channels.map((channel) => [channel, async () => (calls.push(channel), { channel })])) as unknown as Handlers;
  return { handlers, calls };
}

const attempt = async <T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: DomainError }> => {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
};

// ---------------------------------------------------------------------------------------------------------------------------
// Every channel has a policy
// ---------------------------------------------------------------------------------------------------------------------------
describe('every channel has a permission policy', () => {
  it('the policy table lists exactly the channels in the contract: none missing, none left over', () => {
    expect(Object.keys(CHANNEL_POLICY).sort()).toEqual([...channels].sort());
    expect(Object.keys(EXPECTED).sort()).toEqual([...channels].sort());
  });

  it('every capability a policy names exists in the permission table', () => {
    for (const [channel, policy] of Object.entries(CHANNEL_POLICY)) {
      if (typeof policy === 'object') expect(Object.keys(CAPABILITY_ROLES), channel).toContain(policy.capability);
    }
  });

  it('each policy is what the hand-written table says it should be (so loosening one is a deliberate act)', () => {
    for (const channel of channels) {
      const policy = CHANNEL_POLICY[channel] as 'public' | 'signed-in' | { capability: Capability };
      const actual: Who = policy === 'public' ? 'public' : policy === 'signed-in' ? 'signed-in' : can('staff', policy.capability) ? 'signed-in' : 'owner';
      expect(actual, channel).toBe(EXPECTED[channel]);
    }
  });

  it('the real handlers cover exactly the channels', async () => {
    const shop = await makeShop();
    try {
      expect(Object.keys(shop.runtime.handlers).sort()).toEqual([...channels].sort());
    } finally {
      shop.runtime.close();
    }
  });

  it('the real handlers really go through the guard: even a public channel, whose own handler never looks at the session, has the session consulted', async () => {
    const shop = await makeShop();
    try {
      const current = vi.spyOn(shop.runtime.session, 'current');
      await shop.runtime.handlers['prefs:setLanguage']({ language: 'ur' }); // its handler only saves the language
      expect(current).toHaveBeenCalled(); // only the guard (the policy check) can have done that
      current.mockClear();
      // and an error thrown by a real handler is also seen by the guard (it asks who is signed in to make the error safe)
      await attempt(shop.runtime.handlers['auth:login']({ username: 'nobody', password: 'wrong' }));
      expect(current).toHaveBeenCalled();
    } finally {
      shop.runtime.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The matrix: every channel x nobody / staff / owner
// ---------------------------------------------------------------------------------------------------------------------------
describe('role x channel matrix', () => {
  const cases = channels.flatMap((channel) => (Object.keys(roles) as (keyof typeof roles)[]).map((who) => [channel, who] as const));

  it.each(cases)('%s as %s', async (channel, who) => {
    const { handlers, calls } = spyHandlers();
    const guarded = guardHandlers(handlers, () => roles[who]);
    const user = roles[who];
    const expected = EXPECTED[channel];
    const allowed = expected === 'public' || (expected === 'signed-in' && user !== null) || (expected === 'owner' && user?.role === 'owner');

    const result = await attempt((guarded[channel] as (input: unknown) => Promise<unknown>)({}));
    expect(result.ok, `${channel} as ${who}`).toBe(allowed);
    expect(calls).toHaveLength(allowed ? 1 : 0); // a denied call never reaches the handler
    if (!result.ok) expect(result.error.code).toBe(user === null ? 'NOT_SIGNED_IN' : 'NOT_AUTHORIZED');
  });

  it('an owner-only denial names the capability (it came from the main process, not from a service behind it)', async () => {
    const { handlers } = spyHandlers();
    const guarded = guardHandlers(handlers, () => STAFF_USER);
    const result = await attempt((guarded['catalogue:updateSize'] as (i: unknown) => Promise<unknown>)({}));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED', params: { capability: 'catalogue.edit' } } });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The renderer never says who is acting
// ---------------------------------------------------------------------------------------------------------------------------
describe('spoofed identity is refused on every channel', () => {
  it.each(['actor_id', 'created_by', 'approved_by', 'user_id', 'actor', 'privileged', 'role'])('%s: refused before any handler runs, on all channels', async (key) => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => true);
    for (const channel of channels) {
      const ok = await ipc.invoke(channel, SAMPLES[channel]());
      expect(ok.ok, `${channel}: the sample must be valid on its own`).toBe(true);
      const spoofed = await ipc.invoke(channel, { ...SAMPLES[channel](), [key]: randomUUID() });
      expect(spoofed, `${channel} with ${key}`).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect(calls).toHaveLength(channels.length); // only the valid calls reached a handler
  });

  it('include_cost cannot be asked for by the renderer: the list takes no such input, for anyone', async () => {
    const shop = await makeShop();
    try {
      const ipc = fakeIpc();
      registerIpc(ipc.ipcMain, shop.runtime.handlers, () => true);
      for (const who of ['owner', 'staff'] as const) {
        await shop.signInAs(who);
        expect(await ipc.invoke('catalogue:list', { include_cost: true }), who).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
        await shop.signOut();
      }
    } finally {
      shop.runtime.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The shop: owner flows, staff refusals, the cost scan
// ---------------------------------------------------------------------------------------------------------------------------
describe('with a real shop', () => {
  let shop: Shop;
  let jobs: (() => void)[];
  let printing: ReturnType<typeof fakePrinting>;
  const h = () => shop.runtime.handlers;
  const COST = 7_654_321; // a cost nothing else in the shop looks like
  const COST_2 = 7_654_322;
  /** Every table's row count: a refused call must change none of them. */
  const footprint = () => {
    const tables = (shop.runtime.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    return Object.fromEntries(tables.map((t) => [t, shop.count(t)]));
  };

  beforeEach(async () => {
    jobs = [];
    printing = fakePrinting();
    shop = await makeShop({ schedule: (job) => void jobs.push(job), printing: printing.driver });
  });
  afterEach(() => shop.runtime.close());

  /** The owner sets up Booster (500 ml and 1 L), receives 24 packs of the 500 ml at a distinctive cost, and signs out. */
  async function ownerSetsUp() {
    await shop.signInAs('owner');
    const category = await h()['categories:create']({ name_en: 'Growth boosters' });
    const brand = await h()['brands:create']({ name_en: 'Sample brand' });
    const supplier = await h()['suppliers:create']({ name_en: 'Green Valley Traders', phone: '0300 1234567' });
    const made = await h()['catalogue:createGroup']({
      name_en: 'Booster', name_ur: 'بوسٹر', category_id: category.id, brand_id: brand.id,
      sizes: [
        { pack_label: '500 ml', base_unit: 'ml', pack_size: 500, retail_price: 27_000, wholesale_price: 24_500, min_stock: 2500, barcode: '8964000112240' },
        { pack_label: '1 L', base_unit: 'ml', pack_size: 1000, retail_price: 50_000, wholesale_price: 45_000, min_stock: 5000 },
      ],
    });
    const received = await h()['stock:receive']({
      supplier_id: supplier.id, supplier_invoice_no: 'GV-20418',
      items: [{ product_id: made.sizes[0]!.id, batch_no: 'B-014', expiry_date: day(300), qty: 12_000, cost_price: COST }],
    });
    return { category, brand, supplier, made, received, five: made.sizes[0]!, one: made.sizes[1]! };
  }

  describe('the owner', () => {
    it('creates a product, sees it (with cost) in the list, receives stock, and is paid up with the supplier', async () => {
      const { made, received, supplier, five } = await ownerSetsUp();
      expect(made.sizes.map((s) => s.name_en)).toEqual(['Booster 500 ml', 'Booster 1 L']);
      expect(received.total).toBe(24 * COST); // 12,000 ml = 24 packs
      expect(received.batch_ids).toHaveLength(1);

      const list = await h()['catalogue:list']({ query: 'booster' });
      const size = list.hits[0]!.sizes.find((s) => s.id === five.id)!;
      expect(size).toMatchObject({ stock_total: 12_000, stock_sellable: 12_000, batch_count: 1, stocked_batch_count: 1, cost_price: COST }); // the owner sees cost
      expect(list.hits[0]!.summary).toMatchObject({ size_count: 2, base_unit: 'ml', stock_total: 12_000 });

      // paid in full: a payment out for the whole total, and nothing owed to the supplier
      expect(shop.runtime.db.prepare("SELECT amount, direction FROM payments WHERE party_id = ?").all(supplier.id)).toEqual([{ amount: received.total, direction: 'out' }]);
      expect((shop.runtime.db.prepare("SELECT COALESCE(SUM(amount_delta), 0) AS b FROM ledger_entries WHERE party_type = 'supplier' AND party_id = ?").get(supplier.id) as { b: number }).b).toBe(0);
    });

    it('is the actor on everything: the user comes from the session, not from the request', async () => {
      const { five, received } = await ownerSetsUp();
      await h()['catalogue:updateSize']({ product_id: five.id, changes: { retail_price: 28_000 } });
      const audit = shop.runtime.db.prepare("SELECT user_id, action FROM audit_log WHERE action = 'price_changed'").all() as { user_id: string; action: string }[];
      expect(audit).toEqual([{ user_id: shop.ownerId, action: 'price_changed' }]);
      const movement = shop.runtime.db.prepare("SELECT created_by FROM stock_movements WHERE ref_id = ?").get(received.purchase_id) as { created_by: string };
      expect(movement.created_by).toBe(shop.ownerId);
    });

    it('gets the full BATCH_CONFLICT (what clashed, with costs), and the message holds no cost', async () => {
      const { supplier, five } = await ownerSetsUp();
      const clash = (over: object) =>
        attempt(h()['stock:receive']({ supplier_id: supplier.id, items: [{ product_id: five.id, batch_no: 'B-014', expiry_date: day(300), qty: 500, cost_price: COST, ...over }] }));

      const expiry = await clash({ expiry_date: day(400) });
      expect(expiry).toMatchObject({ ok: false, error: { code: 'BATCH_CONFLICT', params: { kind: 'expiry', batchNo: 'B-014', existingExpiry: day(300), newExpiry: day(400), existingCost: COST, newCost: COST } } });
      const cost = await clash({ cost_price: COST_2 });
      expect(cost).toMatchObject({ ok: false, error: { code: 'BATCH_CONFLICT', params: { kind: 'cost', existingCost: COST, newCost: COST_2 } } });
      for (const r of [expiry, cost]) expect(r.ok ? '' : r.error.message).not.toMatch(/\d{5,}/); // the message holds no amount (the amounts are in params)
      // nothing was written by the refused receipts
      expect(shop.count('purchases')).toBe(1);
    });

    it('a quick-add refused as a duplicate name says so, and the lists are in name order', async () => {
      await shop.signInAs('owner');
      await h()['categories:create']({ name_en: 'Zed' });
      await h()['categories:create']({ name_en: 'Alpha' });
      expect(await attempt(h()['categories:create']({ name_en: ' alpha ' }))).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } });
      const names = (await h()['categories:list']({})).map((c) => c.name_en).filter((n): n is string => n === 'Alpha' || n === 'Zed');
      expect(names).toEqual(['Alpha', 'Zed']);
    });
  });

  describe('staff', () => {
    it('can read the lists and the catalogue, but cannot change anything: every owner-only channel is refused by the main process, with nothing written', async () => {
      const { five, one, made, supplier } = await ownerSetsUp();
      await shop.signOut();
      await shop.signInAs('staff');

      const ownerOnly: [Channel, unknown][] = [
        ['catalogue:createGroup', { name_en: 'Sneaky' }],
        ['catalogue:updateGroup', { group_id: made.group.id, name_en: 'Renamed' }],
        ['catalogue:addSize', { group_id: made.group.id, size: { pack_label: '2 L', base_unit: 'ml', pack_size: 2000, retail_price: 1, wholesale_price: 1 } }],
        ['catalogue:updateSize', { product_id: five.id, changes: { retail_price: 1 } }],
        ['catalogue:setSizeActive', { id: one.id, is_active: false }],
        ['catalogue:setGroupActive', { id: made.group.id, is_active: false }],
        ['catalogue:moveSize', { product_id: one.id, to_group_id: made.group.id, pack_label: '2 L' }],
        ['stock:receive', { supplier_id: supplier.id, items: [{ product_id: five.id, batch_no: 'S-1', expiry_date: day(100), qty: 500, cost_price: 1 }] }],
        ['suppliers:create', { name_en: 'Sneaky supplier' }],
        ['categories:create', { name_en: 'Sneaky category' }],
        ['brands:create', { name_en: 'Sneaky brand' }],
      ];
      const before = footprint();
      for (const [channel, input] of ownerOnly) {
        const result = await attempt((h()[channel] as (i: unknown) => Promise<unknown>)(input));
        expect(result.ok, channel).toBe(false);
        if (!result.ok) {
          expect(result.error.code, channel).toBe('NOT_AUTHORIZED');
          expect(result.error.params, channel).toHaveProperty('capability'); // refused by the main process's own check
        }
      }
      expect(footprint()).toEqual(before);

      // ...and what they CAN do
      expect((await h()['catalogue:list']({ query: 'booster' })).hits).toHaveLength(1);
      expect((await h()['suppliers:list']({})).map((s) => s.name_en)).toContain('Green Valley Traders');
      expect((await h()['categories:list']({})).map((s) => s.name_en)).toContain('Growth boosters');
      expect((await h()['brands:list']({})).map((s) => s.name_en)).toContain('Sample brand');
    });

    it('nobody signed out can call any list or write either: NOT_SIGNED_IN, with nothing written', async () => {
      await ownerSetsUp();
      await shop.signOut();
      const before = footprint();
      for (const channel of channels.filter((c) => /^(catalogue|suppliers|categories|brands|customers|payments):/.test(c) || c === 'stock:receive' || c === 'khata:statement')) {
        const result = await attempt((h()[channel] as (i: unknown) => Promise<unknown>)(SAMPLES[channel]()));
        expect(result, channel).toMatchObject({ ok: false, error: { code: 'NOT_SIGNED_IN' } });
      }
      expect(footprint()).toEqual(before);
    });

    it('sees no cost in the catalogue list, whatever they ask for: no cost key at all, in any size or summary', async () => {
      await ownerSetsUp();
      await shop.signOut();
      await shop.signInAs('staff');
      const inputs: Input<'catalogue:list'>[] = [{}, { query: 'booster' }, { filter: 'low' }, { filter: 'near_expiry' }, { filter: 'expired' }, { include_inactive: true }, { limit: 1, offset: 0 }];
      for (const input of inputs) {
        const reply = await h()['catalogue:list'](input);
        expect(JSON.stringify(reply)).not.toMatch(/cost/i);
      }
      const reply = await h()['catalogue:list']({ query: 'booster' });
      expect(reply.hits[0]!.sizes[0]!).toHaveProperty('stock_total'); // they still see stock
    });
  });

  describe('NO COST VALUE IN ANYTHING A STAFF SESSION RECEIVES (data and errors)', () => {
    /** Every key anywhere in the reply, and every number and string. */
    const walk = (value: unknown, out: { keys: string[]; leaves: unknown[] } = { keys: [], leaves: [] }) => {
      if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          out.keys.push(k);
          walk(v, out);
        }
      } else out.leaves.push(value);
      return out;
    };
    const leaks = (reply: unknown): string[] => {
      const { keys, leaves } = walk(reply);
      const sentinels = [COST, COST_2, 24 * COST];
      return [
        ...keys.filter((k) => /cost/i.test(k)).map((k) => `key "${k}"`),
        ...leaves.filter((v) => (typeof v === 'number' && sentinels.includes(v)) || (typeof v === 'string' && /7654\d\d\d/.test(v))).map((v) => `value ${JSON.stringify(v)}`),
      ];
    };

    it('the scanner works: the owner\'s own replies DO contain cost (so a clean result for staff means something)', async () => {
      const { five } = await ownerSetsUp();
      expect(leaks(await h()['catalogue:list']({ query: 'booster' })).length).toBeGreaterThan(0);
      expect(leaks(await h()['stock:batchesOf']({ productId: five.id, includeCost: true })).length).toBeGreaterThan(0);
    });

    it('a staff session calls EVERY channel, with good input and with bad, and nothing it gets back (as the renderer would see it) holds a cost', async () => {
      const { five, one, made, supplier } = await ownerSetsUp();
      // The owner's own sale: its line holds the batch's cost in the database (a distinctive one). Staff must not be able to learn it from
      // any invoice or print channel (history, one invoice, the document data, printing, the print settings, the printer list).
      const owners = await h()['sale:create']({ customer_id: shop.demo.customers['rashid']!, paid_amount: 10_000, lines: [{ product_id: five.id, qty: 500 }] });
      const invoiceId = owners.invoice.id;
      await shop.signOut();
      await shop.signInAs('staff');
      const ipc = fakeIpc();
      registerIpc(ipc.ipcMain, shop.runtime.handlers, () => true, () => undefined);
      // Two bills held by staff, for the held-bills channels to list, resume and discard (the owner's cost is in the database all the same).
      const toResume = await h()['bills:hold']({ customer_id: shop.demo.customers['rashid']!, lines: [{ product_id: five.id, qty: 500, discount: { kind: 'amount', value: 100 } }] });
      const toDiscard = await h()['bills:hold']({ lines: [{ product_id: one.id, qty: 1000 }] });
      // Phase 6 M2: a real customer, her current version (for update), and a second customer sharing her name (for the duplicate error).
      const rashid = shop.demo.customers['rashid']!;
      const rashidNow = await h()['customers:get']({ customer_id: rashid });
      const rashidName = rashidNow.customer.name_en!;

      const real: Partial<Record<Channel, object[]>> = {
        'bills:hold': [{ lines: [{ product_id: five.id, qty: 500 }] }, { price_type: 'wholesale', note: 'x', lines: [{ product_id: one.id, qty: 1000 }] }],
        'bills:list': [{}],
        'bills:resume': [{ id: toResume.id }, { id: toResume.id }], // the second one is HELD_BILL_GONE: errors are scanned too
        'bills:discard': [{ id: toDiscard.id }],
        'catalogue:list': [{}, { query: 'booster' }, { filter: 'low' }, { include_inactive: true, limit: 5 }],
        'invoices:list': [{}, { query: 'rashid' }, { query: 'INV' }, { status: 'active', limit: 5 }, { customer_id: shop.demo.customers['rashid']! }],
        'invoices:get': [{ invoice_id: invoiceId }],
        'invoices:receipt': [{ invoice_id: invoiceId }, { invoice_id: invoiceId, kind: 'invoice' }],
        'print:document': [
          { invoice_id: invoiceId, kind: 'receipt' }, { invoice_id: invoiceId, kind: 'receipt', language: 'ur' }, { invoice_id: invoiceId, kind: 'invoice', output: 'pdf' },
          { invoice_id: invoiceId, kind: 'invoice', language: 'ur', output: 'printer' },
        ],
        'printers:list': [{}],
        'print:getConfig': [{}],
        'print:setConfig': [{ printer_name: 'POS-80' }], // staff: refused, and the refusal must not hold a cost either
        'stock:batchesOf': [{ productId: five.id }, { productId: five.id, includeCost: true }, { productId: one.id }],
        'suppliers:list': [{}],
        'categories:list': [{}],
        'brands:list': [{}],
        'sale:create': [{ paid_amount: 27_000, lines: [{ product_id: five.id, qty: 500 }] }, { paid_amount: 1, lines: [{ product_id: five.id, qty: 500 }] }, { paid_amount: 0, lines: [{ product_id: five.id, qty: 999_999 }] }],
        'stock:receive': [{ supplier_id: supplier.id, items: [{ product_id: five.id, batch_no: 'B-014', expiry_date: day(400), qty: 500, cost_price: COST_2 }] }], // would be a BATCH_CONFLICT for the owner
        'stock:openingStock': [{ product_id: five.id, batch_no: 'B-014', expiry_date: day(400), cost_price: COST_2, qty: 500 }],
        'catalogue:updateSize': [{ product_id: five.id, changes: { retail_price: 1 } }],
        'catalogue:createGroup': [{ name_en: 'x' }],
        'catalogue:updateGroup': [{ group_id: made.group.id, name_en: 'x' }],
        // Phase 6 M2: every new channel, as staff, with real data (and the errors staff can reach)
        'customers:list': [{}, { query: 'rashid' }, { filter: 'owes', sort: 'balance' }, { filter: 'overdue', sort: 'overdue', name_language: 'ur' }, { filter: 'advance', limit: 5, offset: 0 }],
        'customers:get': [{ customer_id: rashid }],
        'customers:findDuplicates': [{ name_en: rashidName }, { phone: '0300 0000000' }],
        'customers:create': [
          { fields: { name_en: 'Staff Added Farmer', phone: '0311 1112223', village: 'Chak 9' } },
          { fields: { name_en: rashidName } }, // DUPLICATE_CUSTOMER
          { fields: { name_en: rashidName }, confirm_duplicate: true },
          { fields: { name_en: 'Greedy Farmer', credit_limit: 9_000_000 } }, // FIELD_NOT_ALLOWED
        ],
        'customers:update': [{ customer_id: rashid, fields: { village: 'Chak 7' }, expected_version: rashidNow.customer.version }, { customer_id: rashid, fields: { village: 'Chak 8' }, expected_version: rashidNow.customer.version }], // the 2nd is VERSION_CONFLICT
        'customers:setTerms': [{ customer_id: rashid, credit_limit: 9_000_000, default_price_type: 'wholesale', expected_version: rashidNow.customer.version }],
        'customers:getSettings': [{}],
        'customers:setSettings': [{ default_credit_limit: 9_000_000 }],
        'payments:receive': [
          { customer_id: rashid, amount: 1_000, method: 'cash', note: 'part payment' },
          { customer_id: rashid, amount: 1_000, method: 'bank' }, // REFERENCE_REQUIRED
          { customer_id: rashid, amount: 1_000, method: 'bank', reference_no: 'TRX-77' },
          { customer_id: rashid, amount: 900_000_000, method: 'cash' }, // ADVANCE_NOT_CONFIRMED
        ],
        'khata:statement': [{ customer_id: rashid }, { customer_id: rashid, from: day(-30), to: day(0) }],
      };
      const replies: unknown[] = [];
      const succeeded = new Set<Channel>();
      for (const channel of channels) {
        const payloads: object[] = [...(real[channel] ?? []), SAMPLES[channel](), { surprise: 1 }, {}];
        for (const payload of payloads) {
          const reply = await ipc.invoke(channel, payload);
          replies.push(reply);
          if (reply.ok) succeeded.add(channel);
          // `auth:logout` (and a reset) ends the session. Without signing the staff user back in, every channel after it would only answer
          // NOT_SIGNED_IN and this scan would look at nothing (it did, before: only the channels before auth:logout were really exercised).
          if (!shop.runtime.session.current()) await shop.signInAs('staff');
        }
      }
      expect(replies.length).toBeGreaterThan(100);
      const found = replies.flatMap((r, i) => leaks(r).map((l) => `reply #${i} ${JSON.stringify(r).slice(0, 120)} -> ${l}`));
      expect(found).toEqual([]);
      // The calls were real, as STAFF: these channels really answered with data (not NOT_SIGNED_IN, not INVALID_INPUT), so a clean scan means something.
      for (const channel of ['catalogue:list', 'stock:batchesOf', 'sale:create', 'invoices:list', 'invoices:get', 'invoices:receipt', 'print:document', 'printers:list', 'print:getConfig', 'bills:hold', 'bills:list', 'bills:resume', 'bills:discard',
        'customers:list', 'customers:get', 'customers:findDuplicates', 'customers:create', 'customers:update', 'customers:getSettings', 'payments:receive', 'khata:statement'] as const) {
        expect(succeeded.has(channel), `${channel} never succeeded for staff`).toBe(true);
      }
      expect(succeeded.has('print:setConfig')).toBe(false); // owner-only: staff only ever got the refusal
      expect(succeeded.has('customers:setTerms')).toBe(false);
      expect(succeeded.has('customers:setSettings')).toBe(false);
      // ...and the Phase 6 error codes really were reached by staff (so the error replies were scanned too)
      const codes = new Set(replies.flatMap((r) => ((r as { ok: boolean; error?: { code: string } }).ok ? [] : [(r as { error: { code: string } }).error.code])));
      for (const code of ['DUPLICATE_CUSTOMER', 'FIELD_NOT_ALLOWED', 'VERSION_CONFLICT', 'REFERENCE_REQUIRED', 'ADVANCE_NOT_CONFIRMED']) expect(codes.has(code), code).toBe(true);
    });

    // The same deep scan, extended to the PRINT OUTPUT: what a staff member sends to the printer or saves as a PDF (the 80 mm receipt and the A4
    // invoice, English and Urdu) is scanned for the sentinel cost in every format a page could write it, and for the words cost, margin, profit.
    // The PDF text layer is scanned by `npm run check:pdf` (Electron makes the PDF); the HTML here is exactly what that PDF is made from.
    describe('the printed pages (HTML) a staff session produces', () => {
      const KINDS = ['receipt', 'invoice'] as const;
      const LANGUAGES = ['en', 'ur'] as const;
      const ownerSellsAndStaffSignsIn = async () => {
        const { five } = await ownerSetsUp();
        const owners = await h()['sale:create']({ customer_id: shop.demo.customers['rashid']!, paid_amount: 10_000, lines: [{ product_id: five.id, qty: 500 }] });
        await shop.signOut();
        await shop.signInAs('staff');
        return owners.invoice.id;
      };

      it('the scanner knows every format of the cost, and the words', async () => {
        const { costFormats, findCostLeaks } = await import('@pos/ui/print');
        expect(costFormats(COST)).toEqual(expect.arrayContaining(['7654321', '76,543.21', '76543.21', '76,543', '76543', 'Rs 76,543.21']));
        for (const page of ['<p>7654321</p>', '<p>Rs 76,543.21</p>', '<p>76543.21</p>', '<td>76,543</td>', '<p>7 654 321</p>', '<p>Cost price</p>', '<p>Profit</p>', '<p>Margin</p>', '<p>لاگت</p>', 'Thank you. Please keep this receipt.7654321']) {
          expect(findCostLeaks(page, COST), page).not.toEqual([]);
        }
        expect(findCostLeaks('<p>Rs 27,000 and 1,76,543 and 17654321</p>', COST)).toEqual([]);
      });

      it('printing as staff (printer and PDF, both papers, both languages) puts no cost, margin or profit on any page', async () => {
        const { findCostLeaks } = await import('@pos/ui/print');
        const invoiceId = await ownerSellsAndStaffSignsIn();
        for (const kind of KINDS) {
          for (const language of LANGUAGES) {
            for (const output of ['pdf', 'printer'] as const) await h()['print:document']({ invoice_id: invoiceId, kind, language, output });
          }
        }
        const pages = [...printing.state.printed, ...printing.state.pdfs].map((p) => p.html);
        expect(pages).toHaveLength(8);
        for (const html of pages) {
          expect(html).toContain('data-document='); // a real document, not an empty string
          expect(findCostLeaks(html, COST), html.slice(0, 160)).toEqual([]);
        }
        // Real pages: every one names the product, and the Urdu ones are right to left.
        expect(pages.filter((html) => /Booster|بوسٹر/.test(html)).length).toBe(8);
        expect(pages.filter((html) => html.includes('<html lang="ur" dir="rtl">')).length).toBe(4);
      });

      it('even if the document data DID carry the cost (a field added by mistake), the renderer prints none of it', async () => {
        const { findCostLeaks, renderDocumentHtml } = await import('@pos/ui/print');
        const invoiceId = await ownerSellsAndStaffSignsIn();
        const fonts = { plex400: 'data:,', plex600: 'data:,', plex700: 'data:,', naskh: 'data:,' };
        for (const kind of KINDS) {
          const reply = await h()['invoices:receipt']({ invoice_id: invoiceId, kind });
          const dirty = {
            ...reply,
            invoice: { ...reply.invoice, cost_total: COST, profit: COST, margin: COST },
            lines: reply.lines.map((l) => ({ ...l, cost_price: COST, unit_cost: COST, margin: COST })),
          };
          for (const language of LANGUAGES) expect(findCostLeaks(renderDocumentHtml(dirty, language, fonts), COST), `${kind} ${language}`).toEqual([]);
        }
      });
    });

    it('the staff sale reply has no cost_price on its lines (it used to)', async () => {
      const { five } = await ownerSetsUp();
      await shop.signOut();
      await shop.signInAs('staff');
      const sold = await h()['sale:create']({ paid_amount: 27_000, lines: [{ product_id: five.id, qty: 500 }] });
      expect(sold.items[0]).toMatchObject({ product_id: five.id, qty: 500, unit_price: 27_000 });
      expect(JSON.stringify(sold)).not.toContain('cost_price');
      // the owner's sale reply keeps it (profit)
      await shop.signOut();
      await shop.signInAs('owner');
      const ownersSale = await h()['sale:create']({ paid_amount: 27_000, lines: [{ product_id: five.id, qty: 500 }] });
      expect(ownersSale.items[0]!.cost_price).toBe(COST);
    });
  });

  describe('errors are made safe for whoever is signed in', () => {
    const conflict = () =>
      new DomainError('BATCH_CONFLICT', 'batch B-014 already exists with expiry 2027-03-12 and cost 7654321', {
        kind: 'cost', batchNo: 'B-014', existingExpiry: '2027-03-12', newExpiry: '2027-03-12', existingCost: COST, newCost: COST_2,
      });

    it('for staff, or nobody, the cost params and the message are dropped; the rest of the error is kept', () => {
      for (const user of [STAFF_USER, null]) {
        const safe = sanitizeErrorFor(user, conflict()) as DomainError;
        expect(safe).toBeInstanceOf(DomainError);
        expect(safe.code).toBe('BATCH_CONFLICT');
        expect(Object.keys(safe.params).sort()).toEqual(['batchNo', 'existingExpiry', 'kind', 'newExpiry']);
        expect(JSON.stringify([safe.message, safe.params])).not.toMatch(/7654|existingCost|newCost/); // the amounts and their names are gone
      }
    });

    it('for the owner the error is untouched', () => {
      const error = conflict();
      expect(sanitizeErrorFor(OWNER_USER, error)).toBe(error);
    });

    it('an error with no cost in it, and anything that is not a DomainError, passes through unchanged', () => {
      const plain = new DomainError('INSUFFICIENT_STOCK', 'only 3 left', { available: 3 });
      expect(sanitizeErrorFor(STAFF_USER, plain)).toBe(plain);
      const odd = new Error('boom');
      expect(sanitizeErrorFor(STAFF_USER, odd)).toBe(odd);
    });

    it('through the guard: a handler that throws a cost-bearing error reaches staff stripped and the owner whole', async () => {
      const handlers = Object.fromEntries(channels.map((c) => [c, async () => { throw conflict(); }])) as unknown as Handlers;
      const asStaff = await attempt((guardHandlers(handlers, () => STAFF_USER)['sale:create'] as (i: unknown) => Promise<unknown>)({}));
      const asOwner = await attempt((guardHandlers(handlers, () => OWNER_USER)['sale:create'] as (i: unknown) => Promise<unknown>)({}));
      expect(asStaff.ok === false && JSON.stringify([asStaff.error.message, asStaff.error.params])).not.toMatch(/7654|existingCost|newCost/);
      expect(asOwner.ok === false && asOwner.error.params).toMatchObject({ existingCost: COST, newCost: COST_2 });
    });
  });

  describe('pre-warm: the owner never waits for the cache rebuild', () => {
    /** Counts how often the catalogue and the stock picture are read from SQLite, by watching the statements. */
    function watchReads() {
      const proto = Object.getPrototypeOf(shop.runtime.db.prepare('SELECT 1')) as { all: (...a: unknown[]) => unknown };
      const original = proto.all;
      const reads = { catalogue: 0, stock: 0 };
      proto.all = function (this: { source: string }, ...args: unknown[]) {
        if (this.source.includes('FROM product_groups WHERE deleted_at IS NULL ORDER BY')) reads.catalogue += 1;
        if (this.source.includes('WITH bs AS')) reads.stock += 1;
        return original.apply(this, args);
      };
      return { reads, stop: () => void (proto.all = original) };
    }
    const runJobs = () => {
      const run = jobs.splice(0);
      run.forEach((job) => job());
      return run.length;
    };

    it('every owner catalogue write, and receiving stock, schedules exactly one pre-warm; reads and the other writes schedule none', async () => {
      const { five, one, made, supplier } = await ownerSetsUp(); // category, brand, supplier, group, receive
      expect(jobs).toHaveLength(2); // createGroup and receive; the quick-adds did not
      jobs.length = 0;

      await h()['catalogue:updateGroup']({ group_id: made.group.id, name_en: 'Booster Plus' });
      await h()['catalogue:addSize']({ group_id: made.group.id, size: { pack_label: '2 L', base_unit: 'ml', pack_size: 2000, retail_price: 90_000, wholesale_price: 80_000 } });
      await h()['catalogue:updateSize']({ product_id: five.id, changes: { retail_price: 28_000 } });
      await h()['catalogue:setSizeActive']({ id: one.id, is_active: false });
      await h()['catalogue:setSizeActive']({ id: one.id, is_active: true });
      await h()['catalogue:moveSize']({ product_id: one.id, to_group_id: made.group.id, pack_label: '1 litre' }).catch(() => undefined); // same group: refused
      expect(jobs).toHaveLength(5); // the refused move scheduled nothing
      jobs.length = 0;

      await h()['stock:receive']({ supplier_id: supplier.id, items: [{ product_id: one.id, batch_no: 'X-1', expiry_date: day(200), qty: 1000, cost_price: 40_000 }] });
      expect(jobs).toHaveLength(1);
      jobs.length = 0;

      // none of these schedule anything
      await h()['catalogue:list']({});
      await h()['suppliers:list']({});
      await h()['categories:create']({ name_en: 'Another category' });
      await h()['brands:create']({ name_en: 'Another brand' });
      await h()['suppliers:create']({ name_en: 'Another supplier' });
      expect(await attempt(h()['catalogue:updateGroup']({ group_id: randomUUID(), name_en: 'x' }))).toMatchObject({ ok: false }); // a failed write
      expect(await attempt(h()['catalogue:addSize']({ group_id: made.group.id, size: { pack_label: '500 ml', base_unit: 'ml', pack_size: 500, retail_price: 1, wholesale_price: 1 } }))).toMatchObject({ ok: false }); // duplicate label
      expect(jobs).toHaveLength(0);
    });

    it('a SALE does not schedule a pre-warm (it would stall the counter)', async () => {
      const { five } = await ownerSetsUp();
      jobs.length = 0;
      await h()['sale:create']({ paid_amount: 27_000, lines: [{ product_id: five.id, qty: 500 }] });
      await shop.signOut();
      await shop.signInAs('staff');
      await h()['sale:create']({ paid_amount: 27_000, lines: [{ product_id: five.id, qty: 500 }] });
      expect(jobs).toHaveLength(0);
    });

    it('running the job builds the caches, so the next list does not rebuild them; without it the next list does', async () => {
      const { five } = await ownerSetsUp();
      await h()['catalogue:list']({}); // warm
      const watch = watchReads();
      try {
        jobs.length = 0;
        await h()['catalogue:updateSize']({ product_id: five.id, changes: { retail_price: 28_000 } });
        expect(watch.reads).toEqual({ catalogue: 0, stock: 0 }); // the write itself reads neither

        expect(runJobs()).toBe(1); // the pre-warm runs in the background
        expect(watch.reads.catalogue).toBe(1);
        expect(watch.reads.stock).toBe(1);

        const after = await h()['catalogue:list']({ query: 'booster' }); // the owner's next call
        expect(after.hits[0]!.sizes.find((s) => s.id === five.id)!.retail_price).toBe(28_000); // and it shows the change
        expect(watch.reads).toEqual({ catalogue: 1, stock: 1 }); // ...without rebuilding anything

        // control: another write whose pre-warm is NOT run makes the next list rebuild
        await h()['catalogue:updateSize']({ product_id: five.id, changes: { retail_price: 29_000 } });
        jobs.length = 0;
        await h()['catalogue:list']({ query: 'booster' });
        expect(watch.reads.catalogue).toBe(2);
      } finally {
        watch.stop();
      }
    });

    it('a pre-warm that runs after the app has closed does not throw', async () => {
      await ownerSetsUp();
      shop.runtime.close();
      expect(() => jobs.splice(0).forEach((job) => job())).not.toThrow();
    });
  });
});
