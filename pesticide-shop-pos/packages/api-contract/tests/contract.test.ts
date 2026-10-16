import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, apiFromBridge, buildApi, buildBridge, channels, contract, type Channel } from '../src/index.js';

const id = () => randomUUID();

/** One valid input per channel. A new channel without a sample fails the "every channel" test below. */
const samples: Record<Channel, () => Record<string, unknown>> = {
  'app:getState': () => ({}),
  'setup:createShop': () => ({ shopName: 'Pesticide Club Shop', ownerName: 'Owner', username: 'owner', password: 'long-enough-1' }),
  'auth:login': () => ({ username: 'owner', password: 'x' }),
  'auth:logout': () => ({}),
  'auth:me': () => ({}),
  'auth:regenerateRecoveryCode': () => ({ password: 'x' }),
  'auth:resetOwnerPassword': () => ({ username: 'owner', recoveryCode: 'ABCD-EFGH-JKMN-PQRS-TVWX', newPassword: 'another-long-1' }),
  'prefs:setLanguage': () => ({ language: 'ur' }),
  'sale:quote': () => ({ lines: [{ product_id: id(), qty: 1000 }] }),
  'sale:create': () => ({ paid_amount: 50_000, lines: [{ product_id: id(), qty: 1000 }] }),
  'customers:search': () => ({ query: 'rashid' }),
  'approval:request': () => ({ username: 'owner', password: 'x', actions: ['credit_override'], sale: { paid_amount: 0, lines: [{ product_id: id(), qty: 1000 }] } }),
  'salesReturn:create': () => ({ invoice_id: id(), refund_method: 'khata_credit', items: [{ invoice_item_id: id(), qty: 1000, condition: 'resellable' }] }),
  'invoices:list': () => ({ query: 'rashid', from: '2026-10-01', to: '2026-10-31', status: 'active', limit: 20, offset: 0 }),
  'invoices:get': () => ({ invoice_id: id() }),
  'invoices:receipt': () => ({ invoice_id: id(), kind: 'invoice' }),
  'print:document': () => ({ invoice_id: id(), kind: 'receipt', language: 'ur', output: 'printer' }),
  'printers:list': () => ({}),
  'print:getConfig': () => ({}),
  'print:setConfig': () => ({ printer_name: 'POS-80', receipt_language: 'ur', invoice_language: 'en', shop_address: 'Main road', shop_phone: '0300 1234567', shop_name_ur: null }),
  'stock:batchesOf': () => ({ productId: id() }),
  'stock:openingStock': () => ({ product_id: id(), batch_no: 'B-1', expiry_date: '2027-01-31', cost_price: 40_000, qty: 5000 }),
  'stock:adjust': () => ({ batch_id: id(), qty_delta: -100 }),
  'stock:writeOff': () => ({ batch_id: id(), qty: 100, kind: 'damage' }),
  'catalogue:list': () => ({ query: 'insecticide', filter: 'low', limit: 50, offset: 0 }),
  'catalogue:createGroup': () => ({ name_en: 'Product A', name_ur: 'پروڈکٹ', category_id: id(), brand_id: null, sizes: [{ pack_label: '500 ml', base_unit: 'ml', pack_size: 500, retail_price: 27_000, wholesale_price: 24_500, tax_rate_bp: 0, min_stock: 2500 }] }),
  'catalogue:updateGroup': () => ({ group_id: id(), name_en: 'Product B', notes: null }),
  'catalogue:addSize': () => ({ group_id: id(), size: { pack_label: '1 L', base_unit: 'ml', pack_size: 1000, retail_price: 50_000, wholesale_price: 45_000 }, existing_size_label: '500 ml' }),
  'catalogue:updateSize': () => ({ product_id: id(), changes: { retail_price: 51_000, min_stock: 3000 } }),
  'catalogue:setSizeActive': () => ({ id: id(), is_active: false }),
  'catalogue:setGroupActive': () => ({ id: id(), is_active: true }),
  'catalogue:moveSize': () => ({ product_id: id(), to_group_id: id(), pack_label: '750 ml' }),
  'stock:receive': () => ({ supplier_id: id(), supplier_invoice_no: 'GV-20418', purchase_date: '2026-10-08', items: [{ product_id: id(), batch_no: 'B-014', expiry_date: '2027-03-12', qty: 12_000, cost_price: 40_000 }] }),
  'suppliers:list': () => ({}),
  'suppliers:create': () => ({ name_en: 'Green Valley Traders', phone: '0300 1234567' }),
  'categories:list': () => ({}),
  'categories:create': () => ({ name_ur: 'کھاد' }),
  'brands:list': () => ({}),
  'brands:create': () => ({ name_en: 'Sample brand' }),
  'khata:setOpeningBalance': () => ({ customer_id: id(), amount: 100_000 }),
  'reports:profitByDay': () => ({ from: '2026-10-01', to: '2026-10-31' }),
  'bills:hold': () => ({ customer_id: id(), price_type: 'wholesale', note: 'back in ten minutes', lines: [{ product_id: id(), qty: 1000, discount: { kind: 'amount', value: 500 }, batch_id: id() }, { product_id: id(), qty: 250 }] }),
  'bills:list': () => ({}),
  'bills:resume': () => ({ id: id() }),
  'bills:discard': () => ({ id: id() }),
};

describe('the contract', () => {
  it('has a sample for every channel, and every sample is valid', () => {
    expect(Object.keys(samples).sort()).toEqual([...channels].sort());
    for (const channel of channels) {
      const result = contract[channel].input.safeParse(samples[channel]());
      expect(result.success, `${channel}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('names every channel as namespace:action', () => {
    for (const channel of channels) expect(channel).toMatch(/^[a-z][a-zA-Z]*:[a-z][a-zA-Z]*$/);
  });

  it('is strict: an unknown key is refused on every channel', () => {
    for (const channel of channels) {
      const result = contract[channel].input.safeParse({ ...samples[channel](), surprise: 1 });
      expect(result.success, channel).toBe(false);
    }
  });

  it('never lets the renderer say who is acting: created_by, approved_by and user_id are refused on every channel', () => {
    for (const channel of channels) {
      for (const key of ['created_by', 'approved_by', 'user_id', 'userId', 'role', 'actor_id', 'include_cost']) {
        const result = contract[channel].input.safeParse({ ...samples[channel](), [key]: id() });
        expect(result.success, `${channel} accepted ${key}`).toBe(false);
      }
    }
  });

  it('has no identity field anywhere in any schema, nested ones included', () => {
    const found: string[] = [];
    const walk = (schema: z.ZodType, path: string): void => {
      const def = (schema as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType } }).def;
      if (def.type === 'object' && def.shape) {
        for (const [key, child] of Object.entries(def.shape)) {
          if (/^(created_by|approved_by|user_id|userId|role|actor_id|include_cost)$/.test(key)) found.push(`${path}.${key}`);
          walk(child, `${path}.${key}`);
        }
      } else if (def.type === 'array' && def.element) walk(def.element, `${path}[]`);
      else if ((def.type === 'optional' || def.type === 'nullable' || def.type === 'default') && def.innerType) walk(def.innerType, path);
    };
    for (const channel of channels) walk(contract[channel].input, channel);
    expect(found).toEqual([]);
  });

  it('asks for owner-only things as plain requests, without naming an approver', () => {
    const sale = contract['sale:create'].input;
    const line = { product_id: id(), qty: 1000, price_override: { unit_price: 40_000 } };
    expect(sale.safeParse({ paid_amount: 0, customer_id: id(), credit_override: true, lines: [line] }).success).toBe(true);
    expect(sale.safeParse({ paid_amount: 0, lines: [{ ...line, price_override: { unit_price: 40_000, approved_by: id() } }] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: 0, credit_override: { approved_by: id() }, lines: [line] }).success).toBe(false);
    // the cashier cannot type a price: there is no unit_price on a line
    expect(sale.safeParse({ paid_amount: 0, lines: [{ product_id: id(), qty: 1000, unit_price: 1 }] }).success).toBe(false);
  });
});

describe('held bills hold what the cashier chose, and no price', () => {
  const hold = contract['bills:hold'].input;
  const line = () => ({ product_id: id(), qty: 1000 });

  it('accepts a cart of choices only: product, quantity, discount as entered, batch, customer, price type, note', () => {
    expect(hold.safeParse(samples['bills:hold']()).success).toBe(true);
    expect(hold.safeParse({ lines: [line()] }).success).toBe(true);
  });

  it('refuses a price, a tax, a total or a cost anywhere in the cart (a price sent by the renderer is an error, not stored)', () => {
    for (const key of ['unit_price', 'price', 'retail_price', 'total', 'subtotal', 'tax_amount', 'cost_price', 'line_total', 'seen_price', 'price_override']) {
      expect(hold.safeParse({ lines: [{ ...line(), [key]: 100 }] }).success, `line.${key}`).toBe(false);
      expect(hold.safeParse({ lines: [line()], [key]: 100 }).success, `cart.${key}`).toBe(false);
    }
  });

  it('refuses an actor (held_by is the session, not the request) and a status', () => {
    for (const key of ['held_by', 'resolved_by', 'status', 'actor_id', 'created_by']) expect(hold.safeParse({ lines: [line()], [key]: id() }).success, key).toBe(false);
  });

  it('needs at least one line, whole positive quantities, and a discount that is an amount of whole paisa', () => {
    expect(hold.safeParse({ lines: [] }).success).toBe(false);
    expect(hold.safeParse({ lines: [{ ...line(), qty: 0 }] }).success).toBe(false);
    expect(hold.safeParse({ lines: [{ ...line(), discount: { kind: 'amount', value: -1 } }] }).success).toBe(false);
    expect(hold.safeParse({ lines: [{ ...line(), discount: { kind: 'amount', value: 1.5 } }] }).success).toBe(false);
    expect(hold.safeParse({ lines: [{ ...line(), discount: { kind: 'amount', value: 5, unit_price: 1 } }] }).success).toBe(false);
  });

  it('resume and discard take only the bill id', () => {
    for (const channel of ['bills:resume', 'bills:discard'] as const) {
      expect(contract[channel].input.safeParse({}).success).toBe(false);
      expect(contract[channel].input.safeParse({ id: 'not-an-id' }).success).toBe(false);
    }
  });
});

describe('field rules', () => {
  const login = contract['auth:login'].input;
  const setup = contract['setup:createShop'].input;
  const base = samples['setup:createShop']();

  it('usernames are trimmed and lower-cased, and use plain characters only', () => {
    expect(login.parse({ username: '  Owner ', password: 'x' }).username).toBe('owner');
    for (const bad of ['ab', 'a b c', 'name!', 'x'.repeat(33), '']) expect(login.safeParse({ username: bad, password: 'x' }).success, bad).toBe(false);
  });

  it('a new password needs 8 characters, an existing one only needs to be there', () => {
    expect(setup.safeParse({ ...base, password: '1234567' }).success).toBe(false);
    expect(setup.safeParse({ ...base, password: '12345678' }).success).toBe(true);
    expect(setup.safeParse({ ...base, password: '        ' }).success).toBe(true); // spaces are allowed, not trimmed
    expect(login.safeParse({ username: 'owner', password: 'x' }).success).toBe(true);
    expect(login.safeParse({ username: 'owner', password: '' }).success).toBe(false);
  });

  it('names are trimmed and cannot be empty', () => {
    expect(setup.parse({ ...base, shopName: '  Shop  ' }).shopName).toBe('Shop');
    expect(setup.safeParse({ ...base, shopName: '   ' }).success).toBe(false);
    expect(setup.safeParse({ ...base, ownerName: '' }).success).toBe(false);
  });

  it('money and quantities are whole numbers', () => {
    const sale = contract['sale:create'].input;
    const line = { product_id: id(), qty: 1000 };
    expect(sale.safeParse({ paid_amount: 10.5, lines: [line] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: -1, lines: [line] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: 0, lines: [{ ...line, qty: 0 }] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: 0, lines: [{ ...line, qty: 1.5 }] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: 0, lines: [] }).success).toBe(false);
    expect(sale.safeParse({ paid_amount: 0, payment_method: 'cheque', lines: [line] }).success).toBe(false);
  });

  it('the screen cannot type what an invoice line is called: name_en / name_ur on a line or on the sale are refused (the sale service copies the catalogue name)', () => {
    const sale = contract['sale:create'].input;
    const line = { product_id: id(), qty: 1000 };
    expect(sale.safeParse({ paid_amount: 0, lines: [line] }).success).toBe(true);
    for (const key of ['name_en', 'name_ur', 'tax_refund']) {
      expect(sale.safeParse({ paid_amount: 0, lines: [{ ...line, [key]: 'Fake name' }] }).success, `${key} on a line`).toBe(false);
      expect(sale.safeParse({ paid_amount: 0, lines: [line], [key]: 'Fake name' }).success, `${key} on the sale`).toBe(false);
    }
    // nor can a return line carry a tax_refund (the return service works it out)
    const back = contract['salesReturn:create'].input;
    const item = { invoice_item_id: id(), qty: 1000, condition: 'resellable' };
    expect(back.safeParse({ invoice_id: id(), refund_method: 'khata_credit', items: [item] }).success).toBe(true);
    expect(back.safeParse({ invoice_id: id(), refund_method: 'khata_credit', items: [{ ...item, tax_refund: 1 }] }).success).toBe(false);
  });

  it('stock and Khata changes cannot be zero', () => {
    expect(contract['stock:adjust'].input.safeParse({ batch_id: id(), qty_delta: 0 }).success).toBe(false);
    expect(contract['khata:setOpeningBalance'].input.safeParse({ customer_id: id(), amount: 0 }).success).toBe(false);
  });
});

describe('buildApi', () => {
  it('turns channels into named functions: app:getState is api.app.getState', () => {
    const api = buildApi(async () => ({ ok: true, data: null }));
    expect(Object.keys(api).sort()).toEqual(['app', 'approval', 'auth', 'bills', 'brands', 'catalogue', 'categories', 'customers', 'invoices', 'khata', 'prefs', 'print', 'printers', 'reports', 'sale', 'salesReturn', 'setup', 'stock', 'suppliers']);
    expect(Object.keys(api.auth).sort()).toEqual(['login', 'logout', 'me', 'regenerateRecoveryCode', 'resetOwnerPassword']);
    // one function per channel, nothing else
    const functions = Object.values(api).flatMap((ns) => Object.values(ns as Record<string, unknown>));
    expect(functions).toHaveLength(channels.length);
    expect(functions.every((f) => typeof f === 'function')).toBe(true);
  });

  it('sends the channel and the input, and returns the data', async () => {
    const calls: unknown[][] = [];
    const api = buildApi(async (channel, payload) => {
      calls.push([channel, payload]);
      return { ok: true, data: { phase: 'needs-login' } };
    });
    expect(await api.app.getState()).toEqual({ phase: 'needs-login' });
    await api.auth.login({ username: 'owner', password: 'pw' });
    expect(calls).toEqual([
      ['app:getState', {}],
      ['auth:login', { username: 'owner', password: 'pw' }],
    ]);
  });

  it('the bridge has the same named functions, and returns the envelope instead of throwing', async () => {
    const failing = buildBridge(async () => ({ ok: false, error: { code: 'NOT_AUTHORIZED', message: 'no', params: { capability: 'stock.adjust' } } }));
    const functions = Object.values(failing).flatMap((ns) => Object.values(ns as Record<string, unknown>));
    expect(functions).toHaveLength(channels.length);
    expect(await failing.stock.adjust({ batch_id: id(), qty_delta: 1 })).toEqual({
      ok: false,
      error: { code: 'NOT_AUTHORIZED', message: 'no', params: { capability: 'stock.adjust' } },
    });
  });

  it('an ApiError made from a bridge keeps its fields (the bridge carries plain data, not an error class)', async () => {
    const bridge = buildBridge(async () => ({ ok: false, error: { code: 'INSUFFICIENT_STOCK', message: 'm', params: { available: 3 } } }));
    const error = await apiFromBridge(bridge).stock.adjust({ batch_id: id(), qty_delta: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INSUFFICIENT_STOCK', params: { available: 3 } });
  });

  it('an API over a shell that lacks a function says so instead of crashing', async () => {
    const half = { app: {} } as unknown as Parameters<typeof apiFromBridge>[0];
    expect(await apiFromBridge(half).app.getState().catch((e: ApiError) => e.code)).toBe('INTERNAL');
  });

  it('throws an ApiError that keeps the code, the params and the field issues', async () => {
    const api = buildApi(async () => ({
      ok: false,
      error: { code: 'INSUFFICIENT_STOCK', message: 'only 3000 available', params: { available: 3000, requested: 5000, packSize: 1000 } },
    }));
    const error = await api.stock.adjust({ batch_id: id(), qty_delta: -5 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INSUFFICIENT_STOCK', params: { available: 3000, requested: 5000, packSize: 1000 }, issues: [] });

    const invalid = buildApi(async () => ({ ok: false, error: { code: 'INVALID_INPUT', message: 'bad', params: {}, issues: [{ path: 'username', message: 'required' }] } }));
    expect(await invalid.auth.login({ username: '', password: '' }).catch((e: ApiError) => e.issues)).toEqual([{ path: 'username', message: 'required' }]);
  });
});
