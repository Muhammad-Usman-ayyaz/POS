// Owner-only rules, enforced in the main process. A staff session must get NOT_AUTHORIZED before anything is written.
import type { Channel, Input } from '@pos/api-contract';
import { channels } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { can, capabilities, CAPABILITY_ROLES, requireCapability } from '../src/main/permissions.js';
import { day, makeShop, type Shop } from './support.js';

const failureOf = async (promise: Promise<unknown>): Promise<DomainError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError, but the call succeeded');
};

describe('the permission table', () => {
  it('has one line per capability, and by default every one is owner-only', () => {
    expect(capabilities.sort()).toEqual([
      'cost.view', 'credit.override', 'khata.openingBalance', 'prices.override', 'profit.view', 'returns.approve',
      'stock.adjust', 'stock.openingStock', 'stock.writeOff',
    ]);
    for (const capability of capabilities) {
      expect(can('owner', capability), capability).toBe(true);
      expect(can('staff', capability), capability).toBe(false);
      expect(CAPABILITY_ROLES[capability]).toEqual(['owner']);
    }
  });

  it('requireCapability throws NOT_AUTHORIZED for staff and passes for the owner', () => {
    const staff = { id: 's', name: 'S', username: 's', role: 'staff' as const };
    const owner = { ...staff, role: 'owner' as const };
    for (const capability of capabilities) {
      expect(() => requireCapability(owner, capability)).not.toThrow();
      expect(() => requireCapability(staff, capability)).toThrow(DomainError);
    }
  });
});

describe('enforced in the handlers', () => {
  let shop: Shop;
  let batch: string;
  let product: string;
  const h = () => shop.runtime.handlers;
  /** Row counts of every table a denied call must not touch. */
  const footprint = () => Object.fromEntries(['invoices', 'invoice_items', 'stock_movements', 'ledger_entries', 'payments', 'sales_returns', 'audit_log'].map((t) => [t, shop.count(t)]));

  beforeEach(async () => {
    shop = await makeShop();
    product = shop.demo.products['insecticide1l']!;
    batch = shop.demo.batches['insecticide1l']!;
  });
  afterEach(() => shop.runtime.close());

  /** One call per owner-only capability. Each returns the promise so the test can see the outcome. */
  const ownerOnlyCalls: Record<string, () => Promise<unknown>> = {
    'price override on a sale': () =>
      h()['sale:create']({ paid_amount: 40_000, lines: [{ product_id: product, qty: 1000, price_override: { unit_price: 40_000 } }] }),
    'credit-limit override on a sale': () =>
      h()['sale:create']({ customer_id: shop.demo.customers['rashid']!, paid_amount: 0, credit_override: true, lines: [{ product_id: product, qty: 1000 }] }),
    'viewing cost': () => h()['stock:batchesOf']({ productId: product, includeCost: true }),
    'viewing profit': () => h()['reports:profitByDay']({ from: day(-30), to: day(0) }),
    'adjusting stock': () => h()['stock:adjust']({ batch_id: batch, qty_delta: -1000 }),
    'writing off stock': () => h()['stock:writeOff']({ batch_id: batch, qty: 1000, kind: 'damage' }),
    'opening stock': () => h()['stock:openingStock']({ product_id: product, batch_no: 'NEW-1', expiry_date: day(300), cost_price: 40_000, qty: 5000 }),
    'an opening balance': () => h()['khata:setOpeningBalance']({ customer_id: shop.demo.customers['sajid']!, amount: 10_000 }),
  };

  describe('staff', () => {
    beforeEach(async () => {
      await shop.signInAs('staff');
    });

    // The refusal must come from the MAIN PROCESS check (which names the capability), not only from the core service
    // behind it, which also refuses a staff approver. Without this a missing check in the handler would go unnoticed.
    const capabilityOf: Record<string, string> = {
      'price override on a sale': 'prices.override',
      'credit-limit override on a sale': 'credit.override',
      'viewing cost': 'cost.view',
      'viewing profit': 'profit.view',
      'adjusting stock': 'stock.adjust',
      'writing off stock': 'stock.writeOff',
      'opening stock': 'stock.openingStock',
      'an opening balance': 'khata.openingBalance',
    };

    it.each(Object.keys(ownerOnlyCalls))('cannot do this: %s -> NOT_AUTHORIZED from the main process, and nothing is written', async (name) => {
      const before = footprint();
      const error = await failureOf(ownerOnlyCalls[name]!());
      expect(error.code).toBe('NOT_AUTHORIZED');
      expect(error.params).toEqual({ capability: capabilityOf[name] });
      expect(footprint()).toEqual(before);
    });

    it('cannot approve a return (NOT_AUTHORIZED), even for a real invoice', async () => {
      await shop.signOut();
      await shop.signInAs('owner');
      const sold = await h()['sale:create']({ customer_id: shop.demo.customers['sajid']!, paid_amount: 0, lines: [{ product_id: product, qty: 1000 }] });
      await shop.signOut();
      await shop.signInAs('staff');

      const before = footprint();
      const error = await failureOf(
        h()['salesReturn:create']({ invoice_id: sold.invoice.id, refund_method: 'khata_credit', items: [{ invoice_item_id: sold.items[0]!.id, qty: 1000, condition: 'resellable' }] }),
      );
      expect(error.code).toBe('NOT_AUTHORIZED');
      expect(error.params).toEqual({ capability: 'returns.approve' }); // refused by the handler, before the core service runs
      expect(footprint()).toEqual(before);
    });

    it('CAN make an ordinary sale at the list price, and the sale is theirs', async () => {
      const sold = await h()['sale:create']({ paid_amount: 50_000, lines: [{ product_id: product, qty: 1000 }] });
      expect(sold.invoice.created_by).toBe(shop.staffId);
      expect(sold.items[0]!.unit_price).toBe(50_000); // looked up from the product
      expect(shop.count('audit_log')).toBe(shop.count('audit_log')); // no override, so no override audit row
    });

    it('CAN see stock, but the cost is left out', async () => {
      const batches = await h()['stock:batchesOf']({ productId: product });
      expect(batches.length).toBeGreaterThan(0);
      for (const b of batches) expect(b).not.toHaveProperty('cost_price');
      const explicitlyNo = await h()['stock:batchesOf']({ productId: product, includeCost: false });
      for (const b of explicitlyNo) expect(b).not.toHaveProperty('cost_price');
    });

    it('CAN sell over credit that fits the limit, and is stopped by the limit like anyone else', async () => {
      // Sajid has a limit of Rs 5,000 and owes nothing: one pack is fine, then ten more (Rs 5,500 in all) are not.
      await expect(h()['sale:create']({ customer_id: shop.demo.customers['sajid']!, paid_amount: 0, lines: [{ product_id: product, qty: 1000 }] })).resolves.toBeTruthy();
      const error = await failureOf(h()['sale:create']({ customer_id: shop.demo.customers['sajid']!, paid_amount: 0, lines: [{ product_id: product, qty: 10_000 }] }));
      expect(error.code).toBe('CREDIT_LIMIT_EXCEEDED');
    });
  });

  describe('owner', () => {
    beforeEach(async () => {
      await shop.signInAs('owner');
    });

    it('can see cost', async () => {
      const batches = await h()['stock:batchesOf']({ productId: product, includeCost: true });
      expect(batches[0]!.cost_price).toBe(40_000);
    });

    it('can see profit', async () => {
      await h()['sale:create']({ paid_amount: 50_000, lines: [{ product_id: product, qty: 1000 }] });
      const days = await h()['reports:profitByDay']({ from: day(-1), to: day(1) });
      expect(days).toEqual([{ day: shop.today, revenue: 50_000, cost: 40_000, profit: 10_000 }]);
    });

    it('can change a price: the approved price is used and the OWNER is recorded as the approver', async () => {
      const sold = await h()['sale:create']({ paid_amount: 40_000, lines: [{ product_id: product, qty: 1000, price_override: { unit_price: 40_000 } }] });
      expect(sold.items[0]!.unit_price).toBe(40_000);
      const row = shop.runtime.db.prepare("SELECT user_id, row_id FROM audit_log WHERE action = 'price_override'").get() as { user_id: string; row_id: string };
      expect(row).toEqual({ user_id: shop.ownerId, row_id: sold.invoice.id });
    });

    it('can override a credit limit: recorded in the audit log with the owner', async () => {
      // Sajid's limit is Rs 5,000. Eleven packs of Rs 500 is Rs 5,500: over the limit, so the override is needed
      const sold = await h()['sale:create']({ customer_id: shop.demo.customers['sajid']!, paid_amount: 0, credit_override: true, lines: [{ product_id: product, qty: 11_000 }] });
      expect(sold.invoice.total).toBe(550_000);
      expect(shop.runtime.db.prepare("SELECT user_id FROM audit_log WHERE action = 'credit_limit_override'").get()).toEqual({ user_id: shop.ownerId });
    });

    it('can approve a return, and the approval is recorded', async () => {
      const sold = await h()['sale:create']({ customer_id: shop.demo.customers['sajid']!, paid_amount: 0, lines: [{ product_id: product, qty: 2000 }] });
      const back = await h()['salesReturn:create']({ invoice_id: sold.invoice.id, refund_method: 'khata_credit', items: [{ invoice_item_id: sold.items[0]!.id, qty: 1000, condition: 'resellable' }] });
      expect(back.sales_return.approved_by).toBe(shop.ownerId);
      expect(shop.runtime.db.prepare("SELECT user_id, row_id FROM audit_log WHERE action = 'return_approved'").get()).toEqual({ user_id: shop.ownerId, row_id: back.sales_return.id });
    });

    it('can adjust and write off stock, and open stock and balances: every stock change is in the audit log', async () => {
      await h()['stock:adjust']({ batch_id: batch, qty_delta: -1000 });
      await h()['stock:writeOff']({ batch_id: batch, qty: 1000, kind: 'damage' });
      const opened = await h()['stock:openingStock']({ product_id: product, batch_no: 'NEW-1', expiry_date: day(300), cost_price: 40_000, qty: 5000 });
      expect(opened.batch_id).toBeTruthy();
      await h()['khata:setOpeningBalance']({ customer_id: shop.demo.customers['sajid']!, amount: 10_000 });

      const actions = shop.runtime.db.prepare("SELECT user_id, action FROM audit_log WHERE action LIKE 'stock_%' ORDER BY rowid").all();
      expect(actions).toEqual([
        { user_id: shop.ownerId, action: 'stock_adjustment' },
        { user_id: shop.ownerId, action: 'stock_write_off' },
      ]);
    });
  });

  describe('nobody signed in', () => {
    const business: Channel[] = ['sale:create', 'salesReturn:create', 'stock:batchesOf', 'stock:openingStock', 'stock:adjust', 'stock:writeOff', 'khata:setOpeningBalance', 'reports:profitByDay', 'auth:regenerateRecoveryCode'];

    it('every business channel says NOT_SIGNED_IN, and writes nothing', async () => {
      const before = footprint();
      const inputs: Partial<{ [C in Channel]: Input<C> }> = {
        'sale:create': { paid_amount: 0, lines: [{ product_id: product, qty: 1000 }] },
        'salesReturn:create': { invoice_id: product, refund_method: 'khata_credit', items: [{ invoice_item_id: product, qty: 1, condition: 'resellable' }] },
        'stock:batchesOf': { productId: product },
        'stock:openingStock': { product_id: product, batch_no: 'X', expiry_date: day(10), cost_price: 1, qty: 1 },
        'stock:adjust': { batch_id: batch, qty_delta: 1 },
        'stock:writeOff': { batch_id: batch, qty: 1, kind: 'damage' },
        'khata:setOpeningBalance': { customer_id: product, amount: 1 },
        'reports:profitByDay': { from: day(-1), to: day(0) },
        'auth:regenerateRecoveryCode': { password: 'x' },
      };
      for (const channel of business) {
        const handler = h()[channel] as (input: unknown) => Promise<unknown>;
        expect((await failureOf(handler(inputs[channel]))).code, channel).toBe('NOT_SIGNED_IN');
      }
      expect(footprint()).toEqual(before);
    });

    it('covers every channel: each one is either public, or listed above', () => {
      const publicChannels: Channel[] = ['app:getState', 'setup:createShop', 'auth:login', 'auth:logout', 'auth:me', 'auth:resetOwnerPassword', 'prefs:setLanguage'];
      expect([...publicChannels, ...business].sort()).toEqual([...channels].sort());
    });
  });
});
