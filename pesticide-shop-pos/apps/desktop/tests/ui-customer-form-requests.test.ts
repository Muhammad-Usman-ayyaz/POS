// The customer form and the Customers settings, against the REAL handlers on a real in-memory SQLite database: the requests the screens
// build (`customerFormRules`, shared with the page) are accepted by the strict contract and do what the screen means, as staff and as owner.
import { customerFormRules as R } from '@pos/ui/rules';
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
async function setup(who: 'owner' | 'staff' = 'owner') {
  shop = await makeShop();
  await shop.signInAs(who);
}
const as = async (who: 'owner' | 'staff') => {
  await shop.signOut();
  await shop.signInAs(who);
};

const draft = (over: Partial<R.CustomerDraft> = {}): R.CustomerDraft => ({ ...R.newDraft(), nameEn: 'Imran Khan', phone: '0321 7654321', village: 'Chak 45', ...over });
const rashid = () => shop.demo.customers['rashid']!;

describe('create', () => {
  it('staff: the contact-only request is accepted; the customer starts with the shop default limit and retail', async () => {
    await setup('owner');
    await call('customers:setSettings', R.buildCustomerSettingsRequest(await call('customers:getSettings'), { defaultLimit: '5000', showFarmer: false }));
    await as('staff');
    const request = R.buildCreateRequest(draft({ creditLimit: '999', priceType: 'wholesale' }), { owner: false, showFarmer: true });
    expect(request).toEqual({ fields: { name_en: 'Imran Khan', phone: '0321 7654321', village: 'Chak 45' } }); // typed terms never leave a staff form
    const created = await call('customers:create', request);
    expect(created.customer).toMatchObject({ name_en: 'Imran Khan', credit_limit: 500_000, default_price_type: 'retail', father_name: null });
  });

  it('staff: an owner-shaped request is refused by the shell (so the form must never send it)', async () => {
    await setup('staff');
    const bad = R.buildCreateRequest(draft(), { owner: true, showFarmer: false });
    expect((await failure('customers:create', bad)).code).toBe('FIELD_NOT_ALLOWED');
    expect(shop.count('customers')).toBe(5); // only the demo customers
  });

  it('owner: the limit typed in rupees arrives as paisa with the price type and farmer details', async () => {
    await setup('owner');
    await call('customers:setSettings', { show_farmer_fields: true });
    const request = R.buildCreateRequest(draft({ creditLimit: '12,500.50', priceType: 'wholesale', fatherName: 'Muhammad Khan', guarantor: 'Bashir' }), { owner: true, showFarmer: true });
    const created = await call('customers:create', request);
    expect(created.customer).toMatchObject({ credit_limit: 1_250_050, default_price_type: 'wholesale', father_name: 'Muhammad Khan', guarantor: 'Bashir', cnic: null });
  });

  it('a limit of 0 means no limit', async () => {
    await setup('owner');
    const created = await call('customers:create', R.buildCreateRequest(draft({ creditLimit: '0' }), { owner: true, showFarmer: false }));
    expect(created.no_limit).toBe(true);
  });
});

describe('the duplicate flow', () => {
  it('the same name is refused without confirm_duplicate, findDuplicates lists who, and Save as new goes through', async () => {
    await setup('staff');
    const d = draft({ nameEn: 'rashid ', village: '' });
    const first = R.buildCreateRequest(d, { owner: false, showFarmer: false });
    expect(first).not.toHaveProperty('confirm_duplicate');
    expect((await failure('customers:create', first)).code).toBe('DUPLICATE_CUSTOMER');
    const matches = await call('customers:findDuplicates', R.buildDuplicatesRequest(d));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ customer_id: rashid(), village: 'Chak 12', balance: 200_000, same_name: true });
    expect(R.balanceKind(matches[0])).toBe('owes');
    const again = R.buildCreateRequest(d, { owner: false, showFarmer: false, confirmDuplicate: true });
    expect(again).toEqual({ ...first, confirm_duplicate: true });
    const created = await call('customers:create', again);
    expect(created.customer.id).not.toBe(rashid());
    expect(shop.count('customers')).toBe(6);
  });

  it('the same phone is a duplicate too', async () => {
    await setup('staff');
    await call('customers:create', R.buildCreateRequest(draft({ nameEn: 'First Person', phone: '0345 1112223' }), { owner: false, showFarmer: false }));
    const d = draft({ nameEn: 'Someone Else', phone: '0345-1112223' });
    expect((await failure('customers:create', R.buildCreateRequest(d, { owner: false, showFarmer: false }))).code).toBe('DUPLICATE_CUSTOMER');
  });
});

describe('edit and terms', () => {
  it('staff: only the changed contact field is sent, with the loaded version', async () => {
    await setup('staff');
    const loaded = await call('customers:get', { customer_id: rashid() });
    const request = R.buildUpdateRequest(loaded.customer, { ...R.draftFromCustomer(loaded.customer), village: 'Chak 99' }, loaded.customer.version)!;
    expect(request).toEqual({ customer_id: rashid(), fields: { village: 'Chak 99' }, expected_version: loaded.customer.version });
    const updated = await call('customers:update', request);
    expect(updated.customer).toMatchObject({ village: 'Chak 99', version: loaded.customer.version + 1 });
    expect(R.buildUpdateRequest(updated.customer, R.draftFromCustomer(updated.customer), updated.customer.version)).toBeNull();
  });

  it('a stale expected_version is VERSION_CONFLICT (the form shows the Reload notice)', async () => {
    await setup('staff');
    const loaded = await call('customers:get', { customer_id: rashid() });
    await call('customers:update', R.buildUpdateRequest(loaded.customer, { ...R.draftFromCustomer(loaded.customer), village: 'Chak 99' }, loaded.customer.version)!);
    const stale = R.buildUpdateRequest(loaded.customer, { ...R.draftFromCustomer(loaded.customer), phone: '0300 0000000' }, loaded.customer.version)!;
    expect((await failure('customers:update', stale)).code).toBe('VERSION_CONFLICT');
  });

  it('owner: update then setTerms with the version the update returned; terms in rupees become paisa', async () => {
    await setup('owner');
    const loaded = await call('customers:get', { customer_id: rashid() });
    const changed = { ...R.draftFromCustomer(loaded.customer), village: 'Chak 99', creditLimit: '20000', priceType: 'wholesale' as const };
    const updated = await call('customers:update', R.buildUpdateRequest(loaded.customer, changed, loaded.customer.version)!);
    const terms = R.buildTermsRequest(loaded.customer, changed, { expectedVersion: updated.customer.version, showFarmer: false })!;
    expect(terms).toEqual({ customer_id: rashid(), credit_limit: 2_000_000, default_price_type: 'wholesale', expected_version: updated.customer.version });
    const result = await call('customers:setTerms', terms);
    expect(result.customer.customer).toMatchObject({ credit_limit: 2_000_000, default_price_type: 'wholesale', village: 'Chak 99' });
    expect(result.below_balance).toBe(false);
  });

  it('owner: a limit under what the customer owes sets below_balance (the form warns)', async () => {
    await setup('owner');
    const loaded = await call('customers:get', { customer_id: rashid() }); // owes Rs 2,000
    const terms = R.buildTermsRequest(loaded.customer, { ...R.draftFromCustomer(loaded.customer), creditLimit: '100' }, { expectedVersion: loaded.customer.version, showFarmer: false })!;
    expect((await call('customers:setTerms', terms)).below_balance).toBe(true);
  });

  it('staff: setTerms is refused (the form never shows terms to staff)', async () => {
    await setup('staff');
    const loaded = await call('customers:get', { customer_id: rashid() });
    const terms = R.buildTermsRequest(loaded.customer, { ...R.draftFromCustomer(loaded.customer), creditLimit: '1' }, { expectedVersion: loaded.customer.version, showFarmer: false })!;
    expect((await failure('customers:setTerms', terms)).code).toBe('NOT_AUTHORIZED');
  });

  it('farmer details are sent only while the shop shows them, and an emptied one clears', async () => {
    await setup('owner');
    await call('customers:setSettings', { show_farmer_fields: true });
    const loaded = await call('customers:get', { customer_id: rashid() });
    const filled = { ...R.draftFromCustomer(loaded.customer), cnic: '35202-1234567-1' };
    expect(R.buildTermsRequest(loaded.customer, filled, { expectedVersion: loaded.customer.version, showFarmer: false })).toBeNull();
    const terms = R.buildTermsRequest(loaded.customer, filled, { expectedVersion: loaded.customer.version, showFarmer: true })!;
    const saved = await call('customers:setTerms', terms);
    expect(saved.customer.customer.cnic).toBe('35202-1234567-1');
    const cleared = R.buildTermsRequest(saved.customer.customer, { ...filled, cnic: '' }, { expectedVersion: saved.customer.customer.version, showFarmer: true })!;
    expect(cleared.cnic).toBeNull();
    expect((await call('customers:setTerms', cleared)).customer.customer.cnic).toBeNull();
  });
});

describe('the Customers settings', () => {
  it('owner: only what changed is sent; rupees become paisa; the reply is what the form shows next', async () => {
    await setup('owner');
    let saved = await call('customers:getSettings');
    expect(saved).toEqual({ default_credit_limit: 0, show_farmer_fields: false });
    expect(R.buildCustomerSettingsRequest(saved, R.settingsDraftFrom(saved))).toEqual({});
    const onlyLimit = R.buildCustomerSettingsRequest(saved, { defaultLimit: '7500', showFarmer: false });
    expect(onlyLimit).toEqual({ default_credit_limit: 750_000 });
    saved = await call('customers:setSettings', onlyLimit);
    expect(saved).toEqual({ default_credit_limit: 750_000, show_farmer_fields: false });
    const onlyToggle = R.buildCustomerSettingsRequest(saved, { defaultLimit: '7500', showFarmer: true });
    expect(onlyToggle).toEqual({ show_farmer_fields: true });
    expect(await call('customers:setSettings', onlyToggle)).toEqual({ default_credit_limit: 750_000, show_farmer_fields: true });
  });

  it('staff may read the settings (the form needs the default) but not change them', async () => {
    await setup('staff');
    expect(await call('customers:getSettings')).toEqual({ default_credit_limit: 0, show_farmer_fields: false });
    expect((await failure('customers:setSettings', { default_credit_limit: 100 })).code).toBe('NOT_AUTHORIZED');
  });
});

describe('the rules', () => {
  it('a name is needed, in either language; the limit must be rupees', () => {
    expect(R.checkDraft(R.newDraft(), true)).toEqual({ name: true, creditLimit: false });
    expect(R.checkDraft(draft({ nameEn: '', nameUr: 'راشد' }), true).name).toBe(false);
    for (const bad of ['-1', 'abc', '', '1e3', '1.234']) expect(R.checkDraft(draft({ creditLimit: bad }), true).creditLimit, bad).toBe(true);
    expect(R.checkDraft(draft({ creditLimit: 'abc' }), false).creditLimit).toBe(false); // staff have no such box
    expect(R.balanceKind({ balance: -1 })).toBe('advance');
    expect(R.balanceKind({ balance: 0 })).toBe('owes');
  });
});
