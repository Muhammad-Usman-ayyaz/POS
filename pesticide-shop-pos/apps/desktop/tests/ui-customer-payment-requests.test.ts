// Receive payment and Opening balance against the REAL handlers on a real in-memory SQLite database: the requests the dialogs build
// (`customerPaymentRules`, `customerOpeningRules`, shared with the dialogs) are accepted by the strict contract and do what the screen means.
import { customerDetailRules as D, customerOpeningRules as O, customerPaymentRules as P } from '@pos/ui/rules';
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
const rashid = () => shop.demo.customers['rashid']!;
const draft = (over: Partial<P.PaymentDraft> = {}): P.PaymentDraft => ({ ...P.blankPayment(), amount: '1000', ...over });
const newCustomer = async (name = 'Imran Khan'): Promise<string> => (await call('customers:create', { fields: { name_en: name } })).customer.id;

describe('Receive payment', () => {
  it('a cash payment (as staff) lowers the balance by the paisa the box sent, and the reply has the receipt and the balance after', async () => {
    await setup('staff');
    const before = (await call('customers:get', { customer_id: rashid() })).balance;
    const reply = await call('payments:receive', P.buildReceiveRequest(rashid(), draft({ amount: '1,000' }), { confirmAdvance: false }));
    expect(reply.receipt_no).toMatch(/^RCP-/);
    expect(reply.balance_after).toBe(before - 100_000);
    expect(reply.advance).toBe(false);
    expect((await call('customers:get', { customer_id: rashid() })).balance).toBe(reply.balance_after);
    // the page's preview agrees with the shell here (it is only a preview)
    expect(D.balanceAfterPreview(before, 100_000)).toBe(reply.balance_after);
  });

  it('bank without a reference is refused by the shell too (the box refuses it first), and nothing is written', async () => {
    await setup('staff');
    expect(P.checkPayment(draft({ method: 'bank' })).reference).toBe(true);
    const request = { customer_id: rashid(), amount: 100_000, method: 'bank' };
    expect((await failure('payments:receive', request)).code).toBe('REFERENCE_REQUIRED');
    expect(shop.count('payments')).toBe(0);
    const ok = await call('payments:receive', P.buildReceiveRequest(rashid(), draft({ method: 'bank', reference: '  TX-9  ' }), { confirmAdvance: false }));
    expect(ok.receipt_no).toMatch(/^RCP-/);
    const stored = shop.runtime.db.prepare('SELECT reference_no FROM payments').get() as { reference_no: string };
    expect(stored.reference_no).toBe('TX-9');
  });

  it('an advance without confirm_advance is ADVANCE_NOT_CONFIRMED; with it the customer ends up in credit and the reply says so', async () => {
    await setup('owner');
    const owed = (await call('customers:get', { customer_id: rashid() })).balance;
    const big = P.blankPayment();
    big.amount = String((owed + 50_000) / 100);
    const plain = P.buildReceiveRequest(rashid(), big, { confirmAdvance: false });
    expect(plain).not.toHaveProperty('confirm_advance');
    expect((await failure('payments:receive', plain)).code).toBe('ADVANCE_NOT_CONFIRMED');
    expect(shop.count('payments')).toBe(0);
    const reply = await call('payments:receive', P.buildReceiveRequest(rashid(), big, { confirmAdvance: true }));
    expect(reply.balance_after).toBe(-50_000);
    expect(reply.advance).toBe(true);
    expect(D.balanceView(reply.balance_after)).toEqual({ kind: 'advance', amount: 50_000 });
    expect(D.advanceExtraPreview(owed, owed + 50_000)).toBe(50_000);
  });

  it('a customer who owes nothing: any payment is an advance and needs the confirm', async () => {
    await setup('staff');
    const id = await newCustomer();
    expect((await failure('payments:receive', P.buildReceiveRequest(id, draft({ amount: '10' }), { confirmAdvance: false }))).code).toBe('ADVANCE_NOT_CONFIRMED');
    const reply = await call('payments:receive', P.buildReceiveRequest(id, draft({ amount: '10' }), { confirmAdvance: true }));
    expect(reply.balance_after).toBe(-1000);
  });

  it('the note (trimmed) is stored; 200 letters pass the contract and 201 do not', async () => {
    await setup('staff');
    await call('payments:receive', P.buildReceiveRequest(rashid(), draft({ note: `  ${'n'.repeat(200)} ` }), { confirmAdvance: false }));
    expect((shop.runtime.db.prepare('SELECT note FROM payments').get() as { note: string }).note).toBe('n'.repeat(200));
    const tooLong = { customer_id: rashid(), amount: 100, method: 'cash', note: 'n'.repeat(201) };
    expect((await failure('payments:receive', tooLong)).code).toBe('INVALID_INPUT');
    expect(P.checkPayment(draft({ note: 'n'.repeat(201) })).note).toBe(true);
  });

  it('the request carries no user, no date and only known keys (the strict contract accepts it)', async () => {
    await setup('staff');
    const request = P.buildReceiveRequest(rashid(), draft({ method: 'easypaisa', reference: 'EP-1', note: 'hi' }), { confirmAdvance: false });
    expect(Object.keys(request).sort()).toEqual(['amount', 'customer_id', 'method', 'note', 'reference_no']);
    await call('payments:receive', request);
    expect(shop.count('payments')).toBe(1);
  });
});

describe('Opening balance', () => {
  it('owner: They owe us is a plus row and We owe them a minus row; the statement shows an opening line', async () => {
    await setup('owner');
    const a = await newCustomer('Aslam');
    const b = await newCustomer('Bilal');
    await call('khata:setOpeningBalance', O.buildOpeningRequest(a, 'they_owe_us', '6,500'));
    await call('khata:setOpeningBalance', O.buildOpeningRequest(b, 'we_owe_them', '1200'));
    expect((await call('customers:get', { customer_id: a })).balance).toBe(650_000);
    const kept = await call('customers:get', { customer_id: b });
    expect(kept.balance).toBe(-120_000);
    expect(D.balanceView(kept.balance)).toEqual({ kind: 'advance', amount: 120_000 });
    const st = await call('khata:statement', { customer_id: a });
    expect(D.lastLines(st.lines).map((l) => D.pillOf(l))).toEqual(['opening']);
  });

  it('staff are refused by the shell', async () => {
    await setup('owner');
    const id = await newCustomer();
    await as('staff');
    const rows = () => (shop.runtime.db.prepare("SELECT COUNT(*) AS c FROM ledger_entries WHERE entry_type = 'opening'").get() as { c: number }).c;
    const before = rows();
    expect((await failure('khata:setOpeningBalance', O.buildOpeningRequest(id, 'they_owe_us', '100'))).code).toBe('NOT_AUTHORIZED');
    expect(rows()).toBe(before);
  });

  it('a second opening balance is OPENING_BALANCE_EXISTS and changes nothing', async () => {
    await setup('owner');
    const id = await newCustomer();
    await call('khata:setOpeningBalance', O.buildOpeningRequest(id, 'they_owe_us', '100'));
    expect((await failure('khata:setOpeningBalance', O.buildOpeningRequest(id, 'we_owe_them', '999'))).code).toBe('OPENING_BALANCE_EXISTS');
    expect((await call('customers:get', { customer_id: id })).balance).toBe(10_000);
  });
});
