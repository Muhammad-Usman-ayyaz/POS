import { ApiError, buildApi, channels, type Channel } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpc, toErrorResult, type IpcEventLike, type IpcMainLike } from '../src/main/ipc.js';
import type { Handlers } from '../src/main/runtime.js';
import { makeShop, OWNER, STAFF, type Shop } from './support.js';

/** A stand-in for Electron's ipcMain that lets a test make calls the way the renderer would. */
function fakeIpc() {
  const listeners = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
  const ipcMain: IpcMainLike = { handle: (channel, listener) => void listeners.set(channel, listener) };
  const trustedEvent: IpcEventLike = { sender: { id: 1 }, senderFrame: { url: 'file:///app/index.html', parent: null } };
  return {
    ipcMain,
    channels: () => [...listeners.keys()],
    invoke: (channel: string, payload: unknown, event: IpcEventLike = trustedEvent) => Promise.resolve(listeners.get(channel)!(event, payload)),
    trustedEvent,
  };
}

/** Handlers that only record what they were given. */
function spyHandlers() {
  const calls: { channel: string; input: unknown }[] = [];
  const handlers = Object.fromEntries(
    channels.map((channel) => [channel, async (input: unknown) => (calls.push({ channel, input }), { channel })]),
  ) as unknown as Handlers;
  return { handlers, calls };
}

describe('registerIpc', () => {
  it('registers exactly the channels in the contract: no more, no fewer', () => {
    const ipc = fakeIpc();
    registerIpc(ipc.ipcMain, spyHandlers().handlers, () => true);
    expect(ipc.channels().sort()).toEqual([...channels].sort());
  });

  it('every channel in the contract has a real handler', async () => {
    const shop = await makeShop();
    try {
      expect(Object.keys(shop.runtime.handlers).sort()).toEqual([...channels].sort());
      for (const handler of Object.values(shop.runtime.handlers)) expect(typeof handler).toBe('function');
    } finally {
      shop.runtime.close();
    }
  });

  it('refuses a sender that is not our window, before any handler runs', async () => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => false);
    for (const channel of channels) {
      expect(await ipc.invoke(channel, {})).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED' } });
    }
    expect(calls).toEqual([]);
  });

  it('validates the input with the channel schema, and a bad payload never reaches the handler', async () => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => true);

    const result = await ipc.invoke('auth:login', { username: 'x', password: '' });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const issues = (result as { error: { issues: { path: string; message: string }[] } }).error.issues;
    expect(issues.map((i) => i.path).sort()).toEqual(['password', 'username']);
    expect(calls).toEqual([]);
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array', []],
    ['an unknown key', { username: 'owner', password: 'x', surprise: 1 }],
  ])('refuses a payload that is %s', async (_label, payload) => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => true);
    expect(await ipc.invoke('auth:login', payload)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(calls).toEqual([]);
  });

  it('hands the handler the CLEANED input (trimmed, lower-cased), not what was sent', async () => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => true);
    await ipc.invoke('auth:login', { username: '  Owner ', password: 'x' });
    expect(calls).toEqual([{ channel: 'auth:login', input: { username: 'owner', password: 'x' } }]);
  });

  it('a call with no payload is an empty object', async () => {
    const ipc = fakeIpc();
    const { handlers, calls } = spyHandlers();
    registerIpc(ipc.ipcMain, handlers, () => true);
    await ipc.invoke('app:getState', undefined);
    expect(calls).toEqual([{ channel: 'app:getState', input: {} }]);
  });

  it('keeps the code and params of a DomainError', async () => {
    const ipc = fakeIpc();
    const { handlers } = spyHandlers();
    handlers['app:getState'] = async () => {
      throw new DomainError('INSUFFICIENT_STOCK', 'only 3000 available', { available: 3000, requested: 5000, packSize: 1000 });
    };
    registerIpc(ipc.ipcMain, handlers, () => true);
    expect(await ipc.invoke('app:getState', {})).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_STOCK', message: 'only 3000 available', params: { available: 3000, requested: 5000, packSize: 1000 } },
    });
  });

  it('turns an unexpected error into INTERNAL without leaking its message or stack, and logs it', async () => {
    const ipc = fakeIpc();
    const { handlers } = spyHandlers();
    handlers['app:getState'] = async () => {
      throw new Error('SQLITE_CORRUPT at C:\\Users\\shop\\pos.db with secret details');
    };
    const log = vi.fn();
    registerIpc(ipc.ipcMain, handlers, () => true, log);

    const result = await ipc.invoke('app:getState', {});
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'something went wrong', params: {} } });
    expect(JSON.stringify(result)).not.toMatch(/SQLITE|pos\.db|secret/);
    expect(log).toHaveBeenCalledOnce();
  });

  it('wraps a result in { ok: true, data }', async () => {
    const ipc = fakeIpc();
    registerIpc(ipc.ipcMain, spyHandlers().handlers, () => true);
    expect(await ipc.invoke('prefs:setLanguage', { language: 'ur' })).toEqual({ ok: true, data: { channel: 'prefs:setLanguage' } });
  });

  it('toErrorResult handles a non-Error being thrown', () => {
    expect(toErrorResult('a string', () => undefined)).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});

describe('the whole path: typed client -> IPC -> validation -> real handlers -> SQLite', () => {
  let shop: Shop;
  let api: ReturnType<typeof buildApi>;
  beforeEach(async () => {
    shop = await makeShop();
    const ipc = fakeIpc();
    registerIpc(ipc.ipcMain, shop.runtime.handlers, () => true, () => undefined);
    api = buildApi((channel: Channel, payload: unknown) => ipc.invoke(channel, payload));
  });
  afterEach(() => shop.runtime.close());

  it('signs in through the typed API', async () => {
    expect(await api.app.getState()).toMatchObject({ phase: 'needs-login' });
    expect(await api.auth.login({ username: 'Owner ', password: OWNER.password })).toMatchObject({ username: 'owner', role: 'owner' });
    expect(await api.app.getState()).toMatchObject({ phase: 'ready' });
  });

  it('a wrong password arrives as an ApiError with the code', async () => {
    const error = await api.auth.login({ username: 'owner', password: 'nope' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('staff get NOT_AUTHORIZED for an owner-only call, as an ApiError', async () => {
    await api.auth.login({ username: 'staff', password: STAFF.password });
    const error = await api.stock.adjust({ batch_id: shop.demo.batches['insecticide1l']!, qty_delta: -1000 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NOT_AUTHORIZED' });
    expect(shop.count('audit_log')).toBe(2); // setup sign-in and this staff sign-in; nothing from the refused call
  });

  it('the renderer cannot say who is acting: created_by and approved_by are refused, even for the owner', async () => {
    await api.auth.login({ username: 'owner', password: OWNER.password });
    const spoof = (input: object) => (api.stock.adjust as (i: unknown) => Promise<unknown>)(input).catch((e: unknown) => e);
    for (const key of ['created_by', 'approved_by', 'user_id']) {
      const error = await spoof({ batch_id: shop.demo.batches['insecticide1l']!, qty_delta: -1000, [key]: shop.staffId });
      expect(error, key).toMatchObject({ code: 'INVALID_INPUT' });
    }
    expect(shop.count('stock_movements')).toBe(Object.keys(shop.demo.batches).length); // only the opening movements (one per demo size): nothing was adjusted
  });

  it('the cashier cannot type a price: unit_price on a line is refused', async () => {
    await api.auth.login({ username: 'staff', password: STAFF.password });
    const line = { product_id: shop.demo.products['insecticide1l']!, qty: 1000, unit_price: 1 };
    const error = await (api.sale.create as (i: unknown) => Promise<unknown>)({ paid_amount: 1, lines: [line] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'INVALID_INPUT' });
    expect(shop.count('invoices')).toBe(0);
  });

  it('a business rule from the core service keeps its params: out of stock says how much there is', async () => {
    await api.auth.login({ username: 'staff', password: STAFF.password });
    const error = await api.sale.create({ paid_amount: 999_999_999, lines: [{ product_id: shop.demo.products['insecticide1l']!, qty: 50_000 }] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'INSUFFICIENT_STOCK', params: { available: 12_000, requested: 50_000, packSize: 1000, scope: 'product' } });
  });
});
