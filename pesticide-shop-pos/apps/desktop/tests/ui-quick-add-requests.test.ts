// The POS quick-add (Phase 6 M7), against the REAL handlers on a real in-memory SQLite database: the requests the picker builds
// (`quickAddRules`, shared with the page) are accepted by the strict contract, give a new customer the shop's default credit limit and the retail
// price type, and the duplicate flow works as staff and as owner. There is no design file for this screen.
import { customerFormRules, quickAddRules as Q } from '@pos/ui/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { makeShop, type Shop } from './support.js';

let shop: Shop;
const call = (channel: string, input: unknown = {}): Promise<any> => (shop.runtime.handlers as unknown as Record<string, (input: unknown) => Promise<any>>)[channel]!(input);
const failure = async (channel: string, input: unknown): Promise<any> => {
  try {
    await call(channel, input);
  } catch (e) {
    return e;
  }
  throw new Error(`${channel} did not fail`);
};
afterEach(() => shop.runtime.close());
async function setup(who: 'owner' | 'staff', defaultLimitRupees?: string) {
  shop = await makeShop();
  await shop.signInAs('owner');
  if (defaultLimitRupees !== undefined) {
    await call('customers:setSettings', customerFormRules.buildCustomerSettingsRequest(await call('customers:getSettings'), { defaultLimit: defaultLimitRupees, showFarmer: false }));
  }
  if (who === 'staff') {
    await shop.signOut();
    await shop.signInAs('staff');
  }
}
const rashid = () => shop.demo.customers['rashid']!;
const form = (over: Partial<Q.QuickAddForm> = {}): Q.QuickAddForm => ({ name: 'Imran Khan', phone: '0321 7654321', village: 'Chak 45', ...over });

describe.each(['staff', 'owner'] as const)('quick-add as %s', (who) => {
  it("gets the shop's default credit limit and retail, from the contact-only request", async () => {
    await setup(who, '5000');
    const request = Q.buildQuickAddRequest(form());
    expect(request).toEqual({ fields: { name_en: 'Imran Khan', phone: '0321 7654321', village: 'Chak 45' } });
    const created = await call('customers:create', request);
    expect(created.customer).toMatchObject({ name_en: 'Imran Khan', name_ur: null, village: 'Chak 45', credit_limit: 500_000, default_price_type: 'retail' });
    expect(created.no_limit).toBe(false);
    // the reply carries what the bill needs
    expect(Q.billCustomerFrom(created.customer)).toEqual({ id: created.customer.id, nameEn: 'Imran Khan', nameUr: null, village: 'Chak 45', defaultPriceType: 'retail' });
  });

  it('a default of 0 means no limit (the line the picker shows says so)', async () => {
    await setup(who);
    expect((await call('customers:getSettings')).default_credit_limit).toBe(0);
    const created = await call('customers:create', Q.buildQuickAddRequest(form()));
    expect(created.customer.credit_limit).toBe(0);
    expect(created.no_limit).toBe(true);
  });

  it('Urdu text is stored as name_ur, Latin as name_en', async () => {
    await setup(who);
    const ur = await call('customers:create', Q.buildQuickAddRequest(form({ name: 'عمران خان', phone: '', village: '' })));
    expect(ur.customer).toMatchObject({ name_ur: 'عمران خان', name_en: null });
    const en = await call('customers:create', Q.buildQuickAddRequest(form({ name: 'Zubair', phone: '', village: '' })));
    expect(en.customer).toMatchObject({ name_en: 'Zubair', name_ur: null });
  });

  it('the duplicate flow: refused, listed, then Save as new (confirm_duplicate) creates another; Use existing creates nothing', async () => {
    await setup(who, '2000');
    const f = form({ name: 'rashid ', village: '' });
    const first = Q.buildQuickAddRequest(f);
    expect(first).not.toHaveProperty('confirm_duplicate');
    expect((await failure('customers:create', first)).code).toBe('DUPLICATE_CUSTOMER');
    const matches = await call('customers:findDuplicates', Q.buildQuickAddDuplicatesRequest(f));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ customer_id: rashid(), same_name: true });
    // Use existing: the picker reads the customer for the bill; nothing is written
    const before = shop.count('customers');
    const existing = await call('customers:get', { customer_id: matches[0].customer_id });
    expect(Q.billCustomerFrom(existing.customer).defaultPriceType).toBe(existing.customer.default_price_type);
    expect(shop.count('customers')).toBe(before);
    // Save as new
    const again = Q.buildQuickAddRequest(f, true);
    expect(again).toEqual({ ...first, confirm_duplicate: true });
    const created = await call('customers:create', again);
    expect(created.customer.id).not.toBe(rashid());
    expect(created.customer.credit_limit).toBe(200_000);
    expect(shop.count('customers')).toBe(before + 1);
  });
});

describe('owner-only fields', () => {
  it('a staff request that ever carried a credit limit, price type or farmer detail is refused and writes nothing', async () => {
    await setup('staff', '5000');
    const before = shop.count('customers');
    for (const extra of [{ credit_limit: 9_000_000 }, { default_price_type: 'wholesale' }, { father_name: 'X' }, { cnic: '12345' }]) {
      const request = Q.buildQuickAddRequest(form());
      const bad = { ...request, fields: { ...request.fields, ...extra } };
      expect((await failure('customers:create', bad)).code, JSON.stringify(extra)).toBe('FIELD_NOT_ALLOWED');
    }
    expect(shop.count('customers')).toBe(before);
  });

  it('the request carries no user, role or created_by: the shell takes them from the session', async () => {
    await setup('staff');
    const request = Q.buildQuickAddRequest(form());
    expect(Object.keys(request)).toEqual(['fields']);
    expect(Object.keys(request.fields).sort()).toEqual(['name_en', 'phone', 'village']);
    await call('customers:create', request); // accepted as is
  });
});
