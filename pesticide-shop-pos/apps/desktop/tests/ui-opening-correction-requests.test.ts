// The Correct opening balance box's own requests (`customerOpeningRules`) through the REAL handlers on a real in-memory SQLite database.
import { customerOpeningRules as O } from '@pos/ui/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { makeShop, type Shop } from './support.js';

let shop: Shop;
const call = (channel: string, input: unknown = {}): Promise<any> => (shop.runtime.handlers as unknown as Record<string, (input: unknown) => Promise<any>>)[channel]!(input);
afterEach(() => shop.runtime.close());

describe('Correct opening balance', () => {
  it('the statement lines give the current opening, the request corrects it to the typed amount, and a second correction builds on the first', async () => {
    shop = await makeShop();
    await shop.signInAs('owner');
    const id: string = (await call('customers:create', { fields: { name_en: 'Correcting Farmer' } })).customer.id;
    await call('khata:setOpeningBalance', O.buildOpeningRequest(id, 'they_owe_us', '6,500'));
    const now = async () => O.effectiveOpening((await call('khata:statement', { customer_id: id })).lines);
    expect(await now()).toBe(650_000);

    await call('khata:adjustOpening', O.buildAdjustRequest(id, (await now())!, 'they_owe_us', '5,000', 'Rs 1,500 too much'));
    expect(await now()).toBe(500_000);
    expect((await call('customers:get', { customer_id: id })).balance).toBe(500_000);

    await call('khata:adjustOpening', O.buildAdjustRequest(id, (await now())!, 'we_owe_them', '200', 'it was the other way'));
    expect(await now()).toBe(-20_000);
    expect((await call('customers:get', { customer_id: id })).balance).toBe(-20_000);
    const st = await call('khata:statement', { customer_id: id });
    expect(st.lines.map((l: { label: string }) => l.label)).toEqual(['opening', 'adjustment', 'adjustment']);
  });
});
