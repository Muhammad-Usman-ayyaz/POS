// The customer list screen's own requests (`customerListRules`, shared with the page), through the REAL handlers on a real in-memory SQLite
// database: the strict contract accepts them, and filters, paging, sorting and the search by Urdu name and digits-only phone do what the screen means.
import { CustomerListInput } from '@pos/api-contract';
import { customerListRules as C } from '@pos/ui/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { makeShop, type Shop } from './support.js';

let shop: Shop;
const call = (channel: string, input: unknown = {}): Promise<any> => (shop.runtime.handlers as unknown as Record<string, (input: unknown) => Promise<any>>)[channel]!(input);
afterEach(() => shop.runtime.close());

const f = (over: Partial<C.CustomerListFilters> = {}): C.CustomerListFilters => ({ query: '', filter: 'all', sort: 'name', language: 'en', offset: 0, ...over });
/** What the screen sends, after the same strict check the IPC layer applies. */
const list = (over: Partial<C.CustomerListFilters> = {}) => call('customers:list', CustomerListInput.parse(C.buildListRequest(f(over))));
const names = (r: any) => r.rows.map((x: any) => x.customer.name_en);
const id = (key: string) => shop.demo.customers[key]!;

async function setup(role: 'owner' | 'staff' = 'owner') {
  shop = await makeShop();
  await shop.signInAs(role);
  shop.runtime.db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run('0300 123-4567', id('rashid'));
  shop.runtime.db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run('+92 301 1111111', id('imran'));
}

describe('the customer list against the real shell', () => {
  it('every request the screen builds passes the strict contract; the first page lists everyone by name with the shop totals', async () => {
    await setup();
    const all = await list();
    expect(names(all)).toEqual(['Bashir', 'Imran', 'Rashid', 'Sajid', 'Tariq']);
    expect(all.totals).toEqual({ total_outstanding: 200_000 + 1_550_000 + 820_000 + 475_000, overdue_total: 0, count: 5 });
    for (const language of ['en', 'ur'] as const) for (const filter of ['all', 'owes', 'overdue', 'advance'] as const) for (const sort of ['name', 'balance', 'overdue', 'next_due'] as const) {
      expect(() => CustomerListInput.parse(C.buildListRequest(f({ language, filter, sort, query: ' x ', offset: 25 })))).not.toThrow();
    }
  });

  it('the filters separate the customers, and the totals do not move with them', async () => {
    await setup();
    expect(names(await list({ filter: 'owes' }))).toEqual(['Bashir', 'Imran', 'Rashid', 'Tariq']);
    expect(names(await list({ filter: 'advance' }))).toEqual([]);
    expect(names(await list({ filter: 'overdue' }))).toEqual([]);
    const owes = await list({ filter: 'owes' });
    expect(owes.totals.total_outstanding).toBe(3_045_000);
    expect(owes.totals.count).toBe(4);
    // an advance: Sajid pays Rs 100 with nothing owed
    await call('payments:receive', { customer_id: id('sajid'), amount: 10_000, method: 'cash', confirm_advance: true });
    const advance = await list({ filter: 'advance' });
    expect(names(advance)).toEqual(['Sajid']);
    expect(advance.rows[0].balance).toBe(-10_000);
    expect(advance.totals.total_outstanding).toBe(3_045_000); // positive balances only: an advance hides no debt
  });

  it('search trims, and finds an English name, an Urdu name, a village and a digits-only phone', async () => {
    await setup();
    expect(names(await list({ query: '  rashid ' }))).toEqual(['Rashid']);
    expect(names(await list({ query: 'راشد' }))).toEqual(['Rashid']);
    expect(names(await list({ query: 'عمران' }))).toEqual(['Imran']);
    const village = names(await list({ query: 'Chak 45' }));
    expect(village).toContain('Imran');
    expect(names(await list({ query: '03001234567' }))).toEqual(['Rashid']); // stored "0300 123-4567"
    expect(names(await list({ query: '3011111111' }))).toEqual(['Imran']); // stored "+92 301 1111111", typed without the 0
    expect(names(await list({ query: 'nobody-here' }))).toEqual([]);
  });

  it('sorting and paging: the sort by name follows the language, offset skips rows, and count is the matching number', async () => {
    await setup();
    expect(names(await list({ sort: 'balance' }))[0]).toBe('Imran');
    const page2 = await call('customers:list', { ...C.buildListRequest(f({ offset: 1 })), limit: 2 });
    expect(names(page2)).toEqual(['Imran', 'Rashid']);
    expect(page2.totals.count).toBe(5);
    const beyond = await list({ offset: C.PAGE_SIZE });
    expect(beyond.rows).toEqual([]);
    expect(beyond.totals.count).toBe(5);
    const ur = await list({ language: 'ur' });
    expect(ur.rows).toHaveLength(5);
  });

  it('a limit of 0 is "no limit" with no credit left figure, and a balance over the limit is "over limit" with 0 left', async () => {
    await setup('staff');
    shop.runtime.db.prepare('UPDATE customers SET credit_limit = 0 WHERE id = ?').run(id('tariq'));
    shop.runtime.db.prepare('UPDATE customers SET credit_limit = 100000 WHERE id = ?').run(id('imran'));
    const all = await list();
    const by = (n: string) => all.rows.find((r: any) => r.customer.name_en === n);
    expect(by('Tariq')).toMatchObject({ no_limit: true, credit_left: null, over_limit: false });
    expect(by('Imran')).toMatchObject({ no_limit: false, over_limit: true, credit_left: 0 });
    expect(by('Rashid')).toMatchObject({ no_limit: false, over_limit: false });
  });
});
