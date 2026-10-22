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
  'print:setConfig': () => ({ shop_name: 'Club Shop', print_format: 'a4', receipt_footer: 'Thank you', printer_name: 'POS-80', receipt_language: 'ur', invoice_language: 'en', shop_address: 'Main road', shop_phone: '0300 1234567', shop_name_ur: null }),
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
  // Phase 6 M2
  'customers:list': () => ({ query: '0300', filter: 'owes', sort: 'balance', name_language: 'ur', limit: 50, offset: 0 }),
  'customers:get': () => ({ customer_id: id() }),
  'customers:findDuplicates': () => ({ name_en: 'Rashid Ali', name_ur: null, phone: '0300 1234567' }),
  'customers:create': () => ({ fields: { name_en: 'Rashid Ali', phone: '0300 1234567', village: 'Chak 5', notes: null }, confirm_duplicate: true }),
  'customers:update': () => ({ customer_id: id(), fields: { phone: '0301 7654321', notes: null }, expected_version: 1 }),
  'customers:setTerms': () => ({ customer_id: id(), credit_limit: 500_000, default_price_type: 'wholesale', father_name: 'Ali', cnic: '35202-1234567-1', phone2: null, guarantor: 'Bashir', expected_version: 3 }),
  'customers:getSettings': () => ({}),
  'customers:setSettings': () => ({ default_credit_limit: 100_000, show_farmer_fields: true }),
  'payments:receive': () => ({ customer_id: id(), amount: 50_000, method: 'bank', reference_no: 'TRX-1', note: 'for the wheat', confirm_advance: true }),
  'khata:statement': () => ({ customer_id: id(), from: '2026-10-01', to: '2026-10-31' }),
  // BEGIN Phase 6 M6 samples
  'print:statement': () => ({ customer_id: id(), from: '2026-10-01', to: '2026-10-31', kind: 'invoice', language: 'ur', output: 'pdf' }),
  'print:paymentReceipt': () => ({ payment_id: id(), language: 'en', output: 'printer' }),
  'khata:exportStatement': () => ({ customer_id: id(), from: '2026-10-01' }),
  // END Phase 6 M6 samples
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
      for (const key of ['created_by', 'approved_by', 'user_id', 'userId', 'role', 'actor_id', 'actor', 'privileged', 'include_cost']) {
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
          if (/^(created_by|approved_by|user_id|userId|role|actor_id|actor|privileged|include_cost)$/.test(key)) found.push(`${path}.${key}`);
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
    expect(Object.keys(api).sort()).toEqual(['app', 'approval', 'auth', 'bills', 'brands', 'catalogue', 'categories', 'customers', 'invoices', 'khata', 'payments', 'prefs', 'print', 'printers', 'reports', 'sale', 'salesReturn', 'setup', 'stock', 'suppliers']);
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

describe('print:setConfig input: print format, receipt footer and shop name', () => {
  const parse = (input: unknown) => contract['print:setConfig'].input.safeParse(input);

  it('accepts each new field alone and trims the text', () => {
    expect(parse({ print_format: 'a4' })).toMatchObject({ success: true, data: { print_format: 'a4' } });
    expect(parse({ print_format: '80mm' }).success).toBe(true);
    expect(parse({ receipt_footer: '  Thank you, come again  ' })).toMatchObject({ success: true, data: { receipt_footer: 'Thank you, come again' } });
    expect(parse({ shop_name: '  Club Shop  ' })).toMatchObject({ success: true, data: { shop_name: 'Club Shop' } });
  });

  it('an empty footer is allowed (it clears it) but an empty or blank shop name is not, and neither is null', () => {
    expect(parse({ receipt_footer: '' }).success).toBe(true);
    expect(parse({ receipt_footer: '   ' })).toMatchObject({ success: true, data: { receipt_footer: '' } });
    expect(parse({ shop_name: '' }).success).toBe(false);
    expect(parse({ shop_name: '    ' }).success).toBe(false);
    expect(parse({ shop_name: null }).success).toBe(false);
    expect(parse({ receipt_footer: null }).success).toBe(false);
    expect(parse({ print_format: null }).success).toBe(false);
  });

  it('refuses a format that is not one of the two, wrong types and over-long text, at the exact bounds', () => {
    expect(parse({ print_format: 'a5' }).success).toBe(false);
    expect(parse({ print_format: 'A4' }).success).toBe(false);
    expect(parse({ print_format: 80 }).success).toBe(false);
    expect(parse({ receipt_footer: 'x'.repeat(200) }).success).toBe(true);
    expect(parse({ receipt_footer: 'x'.repeat(201) }).success).toBe(false);
    expect(parse({ shop_name: 'x'.repeat(80) }).success).toBe(true);
    expect(parse({ shop_name: 'x'.repeat(81) }).success).toBe(false);
    expect(parse({ shop_name: 5 }).success).toBe(false);
  });

  it('stays strict: no unknown field, and nothing that names a user or a shop id', () => {
    expect(parse({ print_format: 'a4', colour: 'red' }).success).toBe(false);
    expect(parse({ shop_id: id() }).success).toBe(false);
    expect(parse({ actor_id: id() }).success).toBe(false);
    expect(parse({ shop_name_en: 'x' }).success).toBe(false);
  });
});

describe('Phase 6 M2: customers, payments, statement', () => {
  const create = contract['customers:create'].input;
  const update = contract['customers:update'].input;
  const terms = contract['customers:setTerms'].input;
  const settings = contract['customers:setSettings'].input;
  const pay = contract['payments:receive'].input;
  const statement = contract['khata:statement'].input;
  const list = contract['customers:list'].input;

  it('refuses an actor, a user or a privilege flag at the top AND inside `fields`, on every new channel', () => {
    const fresh = ['customers:list', 'customers:get', 'customers:findDuplicates', 'customers:create', 'customers:update', 'customers:setTerms', 'customers:getSettings', 'customers:setSettings', 'payments:receive', 'khata:statement'] as const;
    for (const channel of fresh) {
      for (const key of ['created_by', 'actor', 'actor_id', 'approved_by', 'user_id', 'privileged', 'role']) {
        expect(contract[channel].input.safeParse({ ...samples[channel](), [key]: key === 'privileged' ? true : id() }).success, `${channel} accepted ${key}`).toBe(false);
      }
    }
    for (const key of ['created_by', 'actor', 'privileged', 'user_id', 'role']) {
      expect(create.safeParse({ fields: { name_en: 'A', [key]: key === 'privileged' ? true : id() } }).success, `create fields.${key}`).toBe(false);
      expect(update.safeParse({ customer_id: id(), fields: { phone: '1', [key]: id() }, expected_version: 1 }).success, `update fields.${key}`).toBe(false);
    }
  });

  it('update takes contact fields only: a credit limit, price type or farmer field goes through setTerms', () => {
    for (const key of ['credit_limit', 'default_price_type', 'father_name', 'cnic', 'phone2', 'guarantor', 'land_size', 'crop']) {
      expect(update.safeParse({ customer_id: id(), fields: { [key]: 'x' }, expected_version: 1 }).success, key).toBe(false);
    }
    expect(update.safeParse({ customer_id: id(), fields: { name_en: 'A' } }).success).toBe(false); // expected_version is required
    expect(update.safeParse({ customer_id: id(), fields: { name_en: 'A' }, expected_version: 0 }).success).toBe(false);
    expect(update.safeParse({ customer_id: id(), fields: { name_en: 'A' }, expected_version: 1.5 }).success).toBe(false);
  });

  it('setTerms needs the version and both terms; the limit is a non-negative whole number of paisa', () => {
    const ok = { customer_id: id(), credit_limit: 0, default_price_type: 'retail' as const, expected_version: 1 };
    expect(terms.safeParse(ok).success).toBe(true);
    for (const bad of [{ credit_limit: -1 }, { credit_limit: 1.5 }, { credit_limit: 1_000_000_000_001 }, { credit_limit: '5' }, { default_price_type: 'credit' }, { expected_version: undefined }]) {
      expect(terms.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    const { default_price_type: _a, ...noType } = ok;
    expect(terms.safeParse(noType).success).toBe(false);
  });

  it('settings: a negative, fractional or huge default limit is refused', () => {
    expect(settings.safeParse({}).success).toBe(true);
    expect(settings.safeParse({ default_credit_limit: 0 }).success).toBe(true);
    for (const bad of [-1, 1.5, 1_000_000_000_001, Number.NaN, '100']) expect(settings.safeParse({ default_credit_limit: bad }).success, String(bad)).toBe(false);
    expect(settings.safeParse({ show_farmer_fields: 1 }).success).toBe(false);
  });

  it('payment amounts are positive whole paisa within the maximum; the note and reference have bounds; the method is one of four', () => {
    const ok = { customer_id: id(), amount: 1, method: 'cash' as const };
    expect(pay.safeParse(ok).success).toBe(true);
    expect(pay.safeParse({ ...ok, amount: 1_000_000_000_000 }).success).toBe(true);
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: 1_000_000_000_001 }, { amount: Number.MAX_SAFE_INTEGER + 1 }, { method: 'cheque' }, { note: 'x'.repeat(201) }, { reference_no: 'x'.repeat(101) }, { confirm_advance: 'yes' }, { date: '2026-10-01' }, { paid_at: '2026-10-01' }]) {
      expect(pay.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(pay.safeParse({ ...ok, note: 'x'.repeat(200) }).success).toBe(true);
  });

  it('text bounds: names 120, phone 30, village 80, notes 500, text is trimmed', () => {
    const f = (fields: Record<string, unknown>) => create.safeParse({ fields });
    expect(f({ name_en: 'x'.repeat(120) }).success).toBe(true);
    expect(f({ name_en: 'x'.repeat(121) }).success).toBe(false);
    expect(f({ name_ur: 'x'.repeat(121) }).success).toBe(false);
    expect(f({ phone: 'x'.repeat(30) }).success).toBe(true);
    expect(f({ phone: 'x'.repeat(31) }).success).toBe(false);
    expect(f({ village: 'x'.repeat(80) }).success).toBe(true);
    expect(f({ village: 'x'.repeat(81) }).success).toBe(false);
    expect(f({ notes: 'x'.repeat(500) }).success).toBe(true);
    expect(f({ notes: 'x'.repeat(501) }).success).toBe(false);
    expect(f({ credit_limit: -1 }).success).toBe(false);
    expect(f({ credit_limit: 1.5 }).success).toBe(false);
    expect(create.parse({ fields: { name_en: '  Ali  ' } }).fields.name_en).toBe('Ali');
  });

  it('the owner-only fields ARE accepted by the create schema (so a staff create gets FIELD_NOT_ALLOWED from the core, not a vague INVALID_INPUT)', () => {
    expect(create.safeParse({ fields: { name_en: 'A', credit_limit: 5, default_price_type: 'wholesale', father_name: 'B', cnic: '1', phone2: '2', guarantor: 'C' } }).success).toBe(true);
  });

  it('the statement dates are real days and `from` is not after `to`', () => {
    const c = id();
    expect(statement.safeParse({ customer_id: c }).success).toBe(true);
    expect(statement.safeParse({ customer_id: c, from: '2026-10-05', to: '2026-10-05' }).success).toBe(true);
    for (const bad of [{ from: '2026-10-06', to: '2026-10-05' }, { from: '2026-02-30' }, { to: '2026-13-01' }, { from: '2026-1-1' }, { from: 'yesterday' }]) {
      expect(statement.safeParse({ customer_id: c, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('free text is TRIMMED: phone, village, notes (create and update), and the payment reference and note', () => {
    const made = create.parse({ fields: { phone: '  0300 1  ', village: '  Kot  ', notes: '  late  ', father_name: ' F ', cnic: ' 35202 ', phone2: ' 0301 ', guarantor: ' G ' } });
    expect(made.fields).toMatchObject({ phone: '0300 1', village: 'Kot', notes: 'late', father_name: 'F', cnic: '35202', phone2: '0301', guarantor: 'G' });
    const edited = update.parse({ customer_id: id(), fields: { phone: ' 1 ', village: ' v ', notes: ' n ', name_ur: ' ن ' }, expected_version: 1 });
    expect(edited.fields).toMatchObject({ phone: '1', village: 'v', notes: 'n', name_ur: 'ن' });
    const paid = pay.parse({ customer_id: id(), amount: 5, method: 'bank', reference_no: '  TX-1  ', note: '  half  ' });
    expect(paid).toMatchObject({ reference_no: 'TX-1', note: 'half' });
    const setTerms = terms.parse({ customer_id: id(), credit_limit: 1, default_price_type: 'retail', expected_version: 1, father_name: ' A ', guarantor: ' B ' });
    expect(setTerms).toMatchObject({ father_name: 'A', guarantor: 'B' });
    // the duplicate probe is trimmed as well
    expect(contract['customers:findDuplicates'].input.parse({ name_en: ' Ali ', phone: ' 03 ' })).toMatchObject({ name_en: 'Ali', phone: '03' });
  });

  it('a null clears a contact field on update (phone, village, notes, names), and a field may be left out', () => {
    for (const key of ['phone', 'village', 'notes', 'name_en', 'name_ur']) {
      expect(update.safeParse({ customer_id: id(), fields: { [key]: null }, expected_version: 1 }).success, key).toBe(true);
    }
    expect(update.safeParse({ customer_id: id(), fields: {}, expected_version: 1 }).success).toBe(true);
    expect(update.safeParse({ customer_id: id(), expected_version: 1 }).success).toBe(false); // fields itself is required
    expect(update.parse({ customer_id: id(), fields: { phone: null }, expected_version: 1 }).fields.phone).toBeNull();
  });

  it('update refuses a credit limit and a price type even with a perfectly VALID value', () => {
    for (const fields of [{ credit_limit: 9_000_000 }, { credit_limit: 0 }, { default_price_type: 'wholesale' }, { default_price_type: 'retail' }, { name_en: 'A', credit_limit: 9_000_000 }]) {
      expect(update.safeParse({ customer_id: id(), fields, expected_version: 1 }).success, JSON.stringify(fields)).toBe(false);
    }
  });

  it('farmer fields: father_name and guarantor 120, cnic and phone2 30, land_size and crop 80; null is fine (create and setTerms)', () => {
    const farmer = (fields: Record<string, unknown>) => create.safeParse({ fields: { name_en: 'A', ...fields } }).success;
    const farmerTerms = (extra: Record<string, unknown>) => terms.safeParse({ customer_id: id(), credit_limit: 0, default_price_type: 'retail', expected_version: 1, ...extra }).success;
    for (const [key, max] of [['father_name', 120], ['guarantor', 120], ['cnic', 30], ['phone2', 30], ['land_size', 80], ['crop', 80]] as const) {
      expect(farmer({ [key]: 'x'.repeat(max) }), `create ${key} ${max}`).toBe(true);
      expect(farmer({ [key]: 'x'.repeat(max + 1) }), `create ${key} ${max + 1}`).toBe(false);
      expect(farmer({ [key]: null }), `create ${key} null`).toBe(true);
      expect(farmerTerms({ [key]: 'x'.repeat(max) }), `terms ${key} ${max}`).toBe(true);
      expect(farmerTerms({ [key]: 'x'.repeat(max + 1) }), `terms ${key} ${max + 1}`).toBe(false);
      expect(farmerTerms({ [key]: null }), `terms ${key} null`).toBe(true);
      expect(farmerTerms({ [key]: 5 }), `terms ${key} number`).toBe(false);
    }
  });

  it('expected_version is a whole number from 1 to 2,000,000,000 on update and setTerms', () => {
    for (const version of [1, 2, 2_000_000_000]) {
      expect(update.safeParse({ customer_id: id(), fields: { phone: '1' }, expected_version: version }).success, `update ${version}`).toBe(true);
      expect(terms.safeParse({ customer_id: id(), credit_limit: 0, default_price_type: 'retail', expected_version: version }).success, `terms ${version}`).toBe(true);
    }
    for (const version of [0, -1, 2_000_000_001, 1.5, '3', null, Number.NaN]) {
      expect(update.safeParse({ customer_id: id(), fields: { phone: '1' }, expected_version: version }).success, `update ${String(version)}`).toBe(false);
      expect(terms.safeParse({ customer_id: id(), credit_limit: 0, default_price_type: 'retail', expected_version: version }).success, `terms ${String(version)}`).toBe(false);
    }
  });

  it('setTerms needs the credit limit itself (a missing one is not "no limit"), and a limit of exactly the maximum is fine', () => {
    const { credit_limit: _gone, ...without } = { customer_id: id(), credit_limit: 5, default_price_type: 'retail' as const, expected_version: 1 };
    expect(terms.safeParse(without).success).toBe(false);
    expect(terms.safeParse({ ...without, credit_limit: undefined }).success).toBe(false);
    expect(terms.safeParse({ ...without, credit_limit: null }).success).toBe(false);
    expect(terms.safeParse({ ...without, credit_limit: 1_000_000_000_000 }).success).toBe(true);
  });

  it('customers:get takes exactly one customer id, a real UUID, and nothing else', () => {
    const get = contract['customers:get'].input;
    expect(get.safeParse({ customer_id: id() }).success).toBe(true);
    for (const bad of [{}, { customer_id: 'rashid' }, { customer_id: '123' }, { customer_id: '' }, { customer_id: 5 }, { customer_id: null }, { id: id() }, { customer_id: id(), extra: 1 }, { customer_id: `${id()} ` }]) {
      expect(get.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('the list accepts every filter, sort and language, and the page limit runs from 1 to 500 whole numbers', () => {
    for (const filter of ['all', 'owes', 'overdue', 'advance']) expect(list.safeParse({ filter }).success, filter).toBe(true);
    for (const sort of ['name', 'balance', 'overdue', 'next_due']) expect(list.safeParse({ sort }).success, sort).toBe(true);
    for (const name_language of ['en', 'ur']) expect(list.safeParse({ name_language }).success, name_language).toBe(true);
    for (const limit of [1, 2, 499, 500]) expect(list.safeParse({ limit }).success, `limit ${limit}`).toBe(true);
    for (const limit of [0, 501, 500.5, 1.5, -1, '5', Number.NaN]) expect(list.safeParse({ limit }).success, `limit ${String(limit)}`).toBe(false);
    for (const offset of [0, 1, 1000]) expect(list.safeParse({ offset }).success, `offset ${offset}`).toBe(true);
    for (const offset of [-1, 0.5, 2.5, '1', Number.NaN]) expect(list.safeParse({ offset }).success, `offset ${String(offset)}`).toBe(false);
    expect(list.safeParse({ query: 'x'.repeat(100) }).success).toBe(true);
  });

  it('the list takes bounded paging and only known filters and sorts', () => {
    expect(list.safeParse({}).success).toBe(true);
    for (const bad of [{ filter: 'rich' }, { sort: 'cost' }, { name_language: 'fr' }, { limit: 0 }, { limit: 501 }, { offset: -1 }, { query: 'x'.repeat(101) }]) {
      expect(list.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
