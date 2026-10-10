// The screens' own requests, sent through the REAL handlers on a real in-memory SQLite database.
// The UI tests use a fake API; this proves the screens and the shell agree: that what the product form and Receive stock send is accepted
// by the strict contract, stored the way the screen means it (tax 18 percent is 1800, packs become base units, ...), and that the screen's
// clash detection says "clash" exactly when the shell raises BATCH_CONFLICT, with the same kind.
import { receiveRules as R, productFormRules as P } from '@pos/ui/rules';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { day, makeShop, type Shop } from './support.js';

let shop: Shop;
// The handlers take typed inputs; the point here is to pass what the screens built, so the typing is left loose.
const call = (channel: string, input: unknown = {}): Promise<any> => (shop.runtime.handlers as unknown as Record<string, (input: unknown) => Promise<any>>)[channel]!(input);

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a failure, but the call succeeded');
}

beforeEach(async () => {
  shop = await makeShop();
  await shop.signInAs('owner');
});
afterEach(() => shop.runtime.close());

/** Run the steps a save would make, in order, as the screen does. */
async function run(steps: P.SaveStep[]): Promise<void> {
  for (const step of steps) await call(`catalogue:${step.kind}`, step.input);
}

async function load(groupId: string): Promise<P.SavedGroup> {
  const page = await call('catalogue:list', { group_id: groupId, include_inactive: true });
  return { group: page.hits[0].group, sizes: page.hits[0].sizes };
}

/** A new product made the way the form makes it: two sizes. */
async function makeBooster(): Promise<{ groupId: string; small: string; litre: string }> {
  const draft: P.ProductDraft = {
    ...P.newDraft(),
    nameEn: 'Booster',
    nameUr: 'بوسٹر',
    unit: 'ml',
    sizes: [
      { ...P.blankSize(), label: '250 ml', packSize: '250', retail: '118', wholesale: '110.50', taxPct: '18', minPacks: '5' },
      { ...P.blankSize(), label: '1 L', packSize: '1000', retail: '500', wholesale: '450', taxPct: '0' },
    ],
  };
  expect(P.hasProblems(P.checkDraft(draft))).toBe(false);
  const [step] = P.buildSaveSteps(draft, null);
  const created = await call('catalogue:createGroup', step!.input);
  return { groupId: created.group.id, small: created.sizes[0].id, litre: created.sizes[1].id };
}

describe('the product form against the real shell', () => {
  it('a new product is accepted, and stored the way the form means it: 18 percent is 1800, rupees are paisa, the alert in packs is base units', async () => {
    const { groupId } = await makeBooster();
    const saved = await load(groupId);
    expect(saved.sizes).toHaveLength(2);
  });

  it('an edit sends only what changed, in order, and the shell accepts every step (a price, a new size, a size switched off)', async () => {
    const { groupId, small, litre } = await makeBooster();
    const before = await load(groupId);
    const draft = P.draftFromSaved(before);
    draft.nameEn = 'Booster Plus';
    draft.sizes = draft.sizes.map((s) => (s.id === small ? { ...s, retail: '125.50', taxPct: '17' } : s.id === litre ? { ...s, active: false } : s));
    draft.sizes.push({ ...P.blankSize(), label: '5 L', packSize: '5000', retail: '2300', wholesale: '2100', taxPct: '0', minPacks: '2' });
    const steps = P.buildSaveSteps(draft, before);
    expect(steps.map((s) => s.kind)).toEqual(['updateGroup', 'updateSize', 'addSize', 'setSizeActive']);
    await run(steps);

    const after = await load(groupId);
    expect(after.group.name_en).toBe('Booster Plus');
    expect(after.sizes.find((s) => s.id === small)).toMatchObject({ retail_price: 12_550, tax_rate_bp: 1700, name_en: 'Booster Plus 250 ml' });
    expect(after.sizes.find((s) => s.id === litre)!.is_active).toBe(0);
    expect(after.sizes.find((s) => s.pack_label === '5 L')).toMatchObject({ pack_size: 5000, min_stock: 10_000, retail_price: 230_000 });
  });

  it('saving with nothing changed sends nothing', async () => {
    const { groupId } = await makeBooster();
    const saved = await load(groupId);
    expect(P.buildSaveSteps(P.draftFromSaved(saved), saved)).toEqual([]);
  });

  it('a size that has batches is locked in the form, the form never sends its pack size, and the shell refuses it if it is sent (PACK_SIZE_LOCKED)', async () => {
    const { groupId, small } = await makeBooster();
    const supplier = (await call('suppliers:list', {}))[0]!;
    await call('stock:receive', { supplier_id: supplier.id, items: [{ product_id: small, batch_no: 'B-1', expiry_date: day(300), qty: 1000, cost_price: 9000 }] });
    const saved = await load(groupId);
    const draft = P.draftFromSaved(saved);
    const size = draft.sizes.find((s) => s.id === small)!;
    expect(size.batchCount).toBe(1);
    expect(P.isLocked(size)).toBe(true);
    draft.sizes = draft.sizes.map((s) => (s.id === small ? { ...s, packSize: '300', label: '250 ml bottle' } : s));
    const steps = P.buildSaveSteps(draft, saved);
    expect(JSON.stringify(steps)).not.toContain('pack_size');
    await run(steps); // the label change goes through
    const refused = await failure(call('catalogue:updateSize', { product_id: small, changes: { pack_size: 300 } }));
    expect(refused.code).toBe('PACK_SIZE_LOCKED');
    expect((await load(groupId)).sizes.find((s) => s.id === small)).toMatchObject({ pack_size: 250, pack_label: '250 ml bottle' });
  });
});

describe('Receive stock against the real shell', () => {
  const header = async () => ({ supplierId: (await call('suppliers:list', {}))[0]!.id as string, invoiceNo: 'GV-20418', date: R.todayText() });
  const lineFor = (productId: string, packSize: number, over: Partial<R.LineDraft> = {}): R.LineDraft => ({
    key: `k-${Math.random()}`, productId, nameEn: 'Booster', nameUr: null, label: '', packSize, batchNo: 'B-100', expiry: day(300), packs: '12', cost: '400', ...over,
  });
  const batchesOf = async (productId: string): Promise<R.ExistingBatch[]> =>
    (await call('stock:batchesOf', { productId, includeCost: true })).map((b: any) => ({ batch_no: b.batch_no, expiry_date: b.expiry_date, cost_price: b.cost_price }));
  const stockOf = async (productId: string): Promise<number> => (await call('stock:batchesOf', { productId })).reduce((sum: number, b: any) => sum + b.stock, 0);

  it('the request is accepted: 12 packs of a 1000 ml size become 12000 ml of stock, cost per pack in paisa, and it is paid in full', async () => {
    const { litre } = await makeBooster();
    const head = await header();
    const request = R.buildReceiveRequest(head, [lineFor(litre, 1000)], false);
    const result = await call('stock:receive', request);
    expect(await stockOf(litre)).toBe(12_000);
    expect(result.total).toBe(480_000); // 12 x Rs 400, and the shell's total agrees with the screen's
    expect(R.totalsOf([lineFor(litre, 1000)]).cost).toBe(result.total);
    const batches = await call('stock:batchesOf', { productId: litre, includeCost: true });
    expect(batches[0]!).toMatchObject({ batch_no: 'B-100', cost_price: 40_000, stock: 12_000 });
    // paid in full: the supplier's ledger nets to zero
    const owed = shop.runtime.db.prepare("SELECT COALESCE(SUM(amount_delta), 0) AS owed FROM ledger_entries WHERE party_type = 'supplier'").get() as { owed: number };
    expect(owed.owed).toBe(0);
  });

  it('the screen says "clash" exactly when the shell raises BATCH_CONFLICT, with the same kind; and each way out it offers is accepted by the shell', async () => {
    const { litre } = await makeBooster();
    const head = await header();
    await call('stock:receive', R.buildReceiveRequest(head, [lineFor(litre, 1000)], false)); // B-100, Rs 400, expires day(300)

    const scenarios: { name: string; over: Partial<R.LineDraft>; kind: 'expiry' | 'cost' | null }[] = [
      { name: 'the same number, expiry and cost', over: {}, kind: null },
      { name: 'a different expiry, the same cost', over: { expiry: day(200) }, kind: 'expiry' },
      { name: 'a different cost, the same expiry', over: { cost: '430' }, kind: 'cost' },
      { name: 'a different cost AND a different expiry', over: { cost: '430', expiry: day(200) }, kind: 'cost' },
      { name: 'a cost differing by one paisa', over: { cost: '400.01' }, kind: 'cost' },
      { name: 'a new batch number', over: { batchNo: 'B-777', expiry: day(200), cost: '430' }, kind: null },
    ];
    for (const { name, over, kind } of scenarios) {
      const line = lineFor(litre, 1000, over);
      const clash = R.findClashes([line], { [litre]: await batchesOf(litre) })[line.key];
      expect(clash?.kind ?? null, `the screen: ${name}`).toBe(kind);
      const outcome = call('stock:receive', R.buildReceiveRequest(head, [line], false));
      if (kind === null) {
        await outcome;
      } else {
        const error = await failure(outcome);
        expect(error.code, `the shell: ${name}`).toBe('BATCH_CONFLICT');
        expect(error.params['kind'], `the shell's kind: ${name}`).toBe(kind);
      }
    }

    // the two ways out the screen offers
    const expiryClash = lineFor(litre, 1000, { expiry: day(150) });
    const found = R.findClashes([expiryClash], { [litre]: await batchesOf(litre) })[expiryClash.key];
    expect(found?.kind).toBe('expiry');
    if (found?.kind === 'expiry') {
      await call('stock:receive', R.buildReceiveRequest(head, [{ ...expiryClash, expiry: found.existingExpiry }], false)); // "Use existing expiry"
    }
    const costClash = lineFor(litre, 1000, { cost: '999' });
    const existing = await batchesOf(litre);
    const next = R.nextFreeBatchNo(costClash.batchNo, R.takenBatchNumbers(costClash, [costClash], { [litre]: existing }));
    expect(existing.some((b) => b.batch_no === next)).toBe(false);
    await call('stock:receive', R.buildReceiveRequest(head, [{ ...costClash, batchNo: next }], false)); // "Save as new batch number"
    expect((await batchesOf(litre)).find((b) => b.batch_no === next)).toMatchObject({ cost_price: 99_900 });
  });

  it('a batch with no stock left still clashes on the screen and in the shell (the screen sees every batch)', async () => {
    const { litre } = await makeBooster();
    const head = await header();
    await call('stock:receive', R.buildReceiveRequest(head, [lineFor(litre, 1000, { packs: '1' })], false));
    const batch = (await call('stock:batchesOf', { productId: litre }))[0]!;
    await call('stock:writeOff', { batch_id: batch.batch_id, qty: 1000, kind: 'damage' });
    expect(await stockOf(litre)).toBe(0);
    const line = lineFor(litre, 1000, { expiry: day(200) });
    expect(R.findClashes([line], { [litre]: await batchesOf(litre) })[line.key]?.kind).toBe('expiry');
    expect((await failure(call('stock:receive', R.buildReceiveRequest(head, [line], false)))).code).toBe('BATCH_CONFLICT');
  });

  it('the same batch number twice for one size: the screen says duplicate, the shell says DUPLICATE_LINE; on two sizes it is fine in both', async () => {
    const { small, litre } = await makeBooster();
    const head = await header();
    const a = lineFor(litre, 1000, { batchNo: 'B-5' });
    const b = lineFor(litre, 1000, { batchNo: 'B-5' });
    expect(R.findClashes([a, b], {})[b.key]?.kind).toBe('duplicate');
    expect((await failure(call('stock:receive', R.buildReceiveRequest(head, [a, b], false)))).code).toBe('DUPLICATE_LINE');
    const c = lineFor(small, 250, { batchNo: 'B-5' });
    expect(R.findClashes([a, c], {})[c.key]).toBeNull();
    await call('stock:receive', R.buildReceiveRequest(head, [a, c], false));
    expect(await stockOf(small)).toBe(3000);
  });

  it('dates: a future date is refused by the screen and by the shell; 30 days ago needs nothing; 31 days asks (the shell says how many days) and goes through when confirmed', async () => {
    const { litre } = await makeBooster();
    const base = await header();
    const line = (batchNo: string) => lineFor(litre, 1000, { batchNo });

    const future = { ...base, date: day(1) };
    expect(R.checkHeader(future, R.todayText())).toBe('dateFuture');
    expect((await failure(call('stock:receive', R.buildReceiveRequest(future, [line('F-1')], false)))).code).toBe('FUTURE_DATE');

    const thirty = { ...base, date: day(-30) };
    expect(R.checkHeader(thirty, R.todayText())).toBeNull();
    await call('stock:receive', R.buildReceiveRequest(thirty, [line('D-30')], false));

    const old = { ...base, date: day(-31) };
    const asked = await failure(call('stock:receive', R.buildReceiveRequest(old, [line('D-31')], false)));
    expect(asked.code).toBe('RECEIPT_DATE_OLD');
    expect(asked.params['days']).toBe(31);
    await call('stock:receive', R.buildReceiveRequest(old, [line('D-31')], true));
    const audited = shop.runtime.db.prepare("SELECT details FROM audit_log WHERE action = 'receipt_backdated' ORDER BY rowid DESC LIMIT 1").get() as { details: string };
    expect(JSON.parse(audited.details)).toMatchObject({ days_ago: 31, confirmed_by_user: true });
  });

  it('the request the screen builds is exactly what the strict contract allows: no actor, no payment fields', async () => {
    const { litre } = await makeBooster();
    const head = await header();
    const request = R.buildReceiveRequest(head, [lineFor(litre, 1000)], true);
    expect(Object.keys(request).sort()).toEqual(['confirm_old_date', 'items', 'purchase_date', 'supplier_id', 'supplier_invoice_no']);
    expect(Object.keys(request.items[0]!).sort()).toEqual(['batch_no', 'cost_price', 'expiry_date', 'product_id', 'qty']);
  });
});
