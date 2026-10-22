// "Balance on a date" through the REAL handler: a statement day is a SHOP day (Asia/Karachi unless the setting shop.time_zone says otherwise), and the
// renderer cannot choose the zone.
import { randomUUID } from 'node:crypto';
import { contract } from '@pos/api-contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeShop, type Shop } from './support.js';

describe('khata:statement as a balance on a date', () => {
  let shop: Shop;
  let customer: string;
  const h = () => shop.runtime.handlers;
  const put = (delta: number, at: string) => {
    const scope = shop.runtime.db.prepare('SELECT shop_id, branch_id, device_id FROM customers WHERE id = ?').get(customer) as { shop_id: string; branch_id: string; device_id: string };
    shop.runtime.db
      .prepare(
        `INSERT INTO ledger_entries (id, party_type, party_id, entry_type, amount_delta, entry_date, created_by, shop_id, branch_id, device_id, seq)
         VALUES (?, 'customer', ?, 'adjustment', ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM ledger_entries WHERE seq IS NOT NULL))`,
      )
      .run(randomUUID(), customer, delta, at, shop.ownerId, scope.shop_id, scope.branch_id, scope.device_id);
  };
  const closing = async (to: string) => (await h()['khata:statement']({ customer_id: customer, to })).closing_balance;

  beforeEach(async () => {
    shop = await makeShop();
    await shop.signInAs('owner');
    customer = (await h()['customers:create']({ fields: { name_en: 'Dated Farmer' } })).customer.id;
    put(100, '2026-10-04T18:59:59.999Z'); // 23:59:59.999 on 4 Oct in Karachi
    put(10, '2026-10-04T19:00:00.000Z'); // 00:00:00.000 on 5 Oct in Karachi
  });
  afterEach(() => shop.runtime.close());

  it('the day ends at Karachi midnight, to the millisecond', async () => {
    expect(await closing('2026-10-03')).toBe(0);
    expect(await closing('2026-10-04')).toBe(100);
    expect(await closing('2026-10-05')).toBe(110);
  });

  it('the setting shop.time_zone moves the boundary; a mistyped setting falls back to Karachi', async () => {
    const scope = shop.runtime.db.prepare('SELECT shop_id, branch_id, device_id FROM customers WHERE id = ?').get(customer) as { shop_id: string; branch_id: string; device_id: string };
    const set = (value: string) =>
      shop.runtime.db.prepare('INSERT INTO settings (id, "key", value, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), 'shop.time_zone', value, scope.shop_id, scope.branch_id, scope.device_id);
    set('UTC');
    expect(await closing('2026-10-04')).toBe(110);
    shop.runtime.db.prepare('UPDATE settings SET value = ? WHERE "key" = ?').run('Mars/Base', 'shop.time_zone');
    expect(await closing('2026-10-04')).toBe(100);
  });

  it('the renderer cannot send a time zone', () => {
    expect(contract['khata:statement'].input.safeParse({ customer_id: customer, to: '2026-10-04', time_zone: 'UTC' }).success).toBe(false);
  });
});
