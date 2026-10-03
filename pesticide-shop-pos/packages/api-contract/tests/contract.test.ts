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
  'sale:create': () => ({ paid_amount: 50_000, lines: [{ product_id: id(), qty: 1000 }] }),
  'salesReturn:create': () => ({ invoice_id: id(), refund_method: 'khata_credit', items: [{ invoice_item_id: id(), qty: 1000, condition: 'resellable' }] }),
  'stock:batchesOf': () => ({ productId: id() }),
  'stock:openingStock': () => ({ product_id: id(), batch_no: 'B-1', expiry_date: '2027-01-31', cost_price: 40_000, qty: 5000 }),
  'stock:adjust': () => ({ batch_id: id(), qty_delta: -100 }),
  'stock:writeOff': () => ({ batch_id: id(), qty: 100, kind: 'damage' }),
  'khata:setOpeningBalance': () => ({ customer_id: id(), amount: 100_000 }),
  'reports:profitByDay': () => ({ from: '2026-10-01', to: '2026-10-31' }),
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
      for (const key of ['created_by', 'approved_by', 'user_id', 'userId', 'role']) {
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
          if (/^(created_by|approved_by|user_id|userId|role)$/.test(key)) found.push(`${path}.${key}`);
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

  it('stock and Khata changes cannot be zero', () => {
    expect(contract['stock:adjust'].input.safeParse({ batch_id: id(), qty_delta: 0 }).success).toBe(false);
    expect(contract['khata:setOpeningBalance'].input.safeParse({ customer_id: id(), amount: 0 }).success).toBe(false);
  });
});

describe('buildApi', () => {
  it('turns channels into named functions: app:getState is api.app.getState', () => {
    const api = buildApi(async () => ({ ok: true, data: null }));
    expect(Object.keys(api).sort()).toEqual(['app', 'auth', 'khata', 'prefs', 'reports', 'sale', 'salesReturn', 'setup', 'stock']);
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
