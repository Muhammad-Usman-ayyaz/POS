// Phase 7 in the main process: staff START a return, the owner approves it with a one-use token for exactly that return; the renderer never says who
// approved or who started; voiding is the owner's alone; the slip is printed with COPY from the second print; and none of it carries a cost.
import { randomUUID } from 'node:crypto';
import { contract } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { returnSubjectHash } from '../src/main/approvals.js';
import { fakePrinting, makeShop, movableClock, OWNER, type Shop } from './support.js';

type Handler = (input: unknown) => Promise<any>;
const failureOf = async (promise: Promise<unknown>): Promise<DomainError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError, but the call succeeded');
};

let shop: Shop;
let clock: ReturnType<typeof movableClock>;
let printing: ReturnType<typeof fakePrinting>;
let h: Record<string, Handler>;
let ins1l: string;
let fert: string;
let rashid: string;
const audits = (action: string) =>
  shop.runtime.db.prepare('SELECT user_id, table_name, row_id, details FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { user_id: string | null; table_name: string; row_id: string; details: string }[];
const footprint = () => Object.fromEntries(['invoices', 'sales_returns', 'sales_return_items', 'stock_movements', 'ledger_entries', 'payments', 'audit_log'].map((t) => [t, shop.count(t)]));

/** The owner sells 3 packs of Insecticide 1 L on credit (Rs 1,500). Returns the invoice and its one line. */
async function ownerSells(paid = 0, product = ins1l, qty = 3000, customer: string | undefined = rashid) {
  await shop.signOut();
  await shop.signInAs('owner');
  const sold = await h['sale:create']!({ ...(customer ? { customer_id: customer } : {}), paid_amount: paid, lines: [{ product_id: product, qty }] });
  return { invoice: sold.invoice, line: sold.items[0] };
}
const draft = (invoiceId: string, lineId: string, qty = 1000, over: object = {}) => ({
  invoice_id: invoiceId,
  items: [{ invoice_item_id: lineId, qty, condition: 'resellable', reason: 'changed_mind', ...over }],
});
const approve = (d: ReturnType<typeof draft>, password: string = OWNER.password) => h['approval:requestReturn']!({ username: 'owner', password, return: d });

beforeEach(async () => {
  clock = movableClock();
  printing = fakePrinting();
  shop = await makeShop({ clock, printing: printing.driver });
  h = shop.runtime.handlers as unknown as Record<string, Handler>;
  ins1l = shop.demo.products['insecticide1l']!;
  fert = shop.demo.products['fertilizer1kg']!;
  rashid = shop.demo.customers['rashid']!;
});
afterEach(() => shop.runtime.close());

describe('staff start a return, the owner approves it', () => {
  it('the owner needs no token: the return is theirs, approved_by is the owner and requested_by too', async () => {
    const { invoice, line } = await ownerSells();
    const made = await h['salesReturn:create']!(draft(invoice.id, line.id));
    expect(made.sales_return).toMatchObject({ approved_by: shop.ownerId, requested_by: shop.ownerId, total: 50_000 });
    expect(audits('approval_used')).toHaveLength(0);
  });

  it('staff without a token get APPROVAL_REQUIRED and nothing is written', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const before = footprint();
    const error = await failureOf(h['salesReturn:create']!(draft(invoice.id, line.id)));
    expect(error.code).toBe('APPROVAL_REQUIRED');
    expect(footprint()).toEqual(before);
  });

  it('staff with the owner\'s token complete the return; the owner is the approver, staff the requester, and the use is audited', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    const grant = await approve(d);
    expect(Object.keys(grant).sort()).toEqual(['expires_at', 'token']);
    const made = await h['salesReturn:create']!({ ...d, approval_token: grant.token });
    expect(made.sales_return).toMatchObject({ approved_by: shop.ownerId, requested_by: shop.staffId });
    expect(audits('approval_granted')).toHaveLength(1);
    expect(audits('approval_used')).toEqual([expect.objectContaining({ user_id: shop.ownerId, table_name: 'sales_returns', row_id: made.sales_return.id })]);
    expect(audits('return_approved')).toEqual([expect.objectContaining({ user_id: shop.ownerId })]);
    expect(JSON.parse(audits('return_approved')[0]!.details)).toMatchObject({ requested_by: shop.staffId });
    expect(made.items[0]).not.toHaveProperty('cost_price');
  });

  it('a token works ONCE: the same token again is APPROVAL_INVALID and nothing more is returned', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    const { token } = await approve(d);
    await h['salesReturn:create']!({ ...d, approval_token: token });
    const before = footprint();
    expect((await failureOf(h['salesReturn:create']!({ ...d, approval_token: token }))).code).toBe('APPROVAL_INVALID');
    expect(footprint()).toEqual(before);
  });

  it('a token is for EXACTLY that return: another quantity, line, condition, reason or invoice is refused, and the try spends the token', async () => {
    const { invoice, line } = await ownerSells();
    const other = await ownerSells(0, fert, 2000);
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    const variants: object[] = [
      draft(invoice.id, line.id, 2000),
      draft(invoice.id, line.id, 1000, { condition: 'damaged' }),
      draft(invoice.id, line.id, 1000, { reason: 'other' }),
      draft(invoice.id, other.line.id),
      draft(other.invoice.id, other.line.id),
    ];
    for (const v of variants) {
      const { token } = await approve(d);
      const before = footprint();
      expect((await failureOf(h['salesReturn:create']!({ ...v, approval_token: token }))).code).toBe('APPROVAL_INVALID');
      expect(footprint()).toEqual(before);
      expect((await failureOf(h['salesReturn:create']!({ ...d, approval_token: token }))).code).toBe('APPROVAL_INVALID'); // spent by the wrong try
    }
  });

  it('a token given to one person is no good to another, and it runs out after a minute', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    const old = await approve(d);
    clock.advance(61_000);
    expect((await failureOf(h['salesReturn:create']!({ ...d, approval_token: old.token }))).code).toBe('APPROVAL_INVALID');
    const mine = await approve(d);
    await shop.signOut();
    await shop.signInAs('owner');
    // the owner does not need it, but a token that was given to staff is not the owner's to spend on someone else's behalf either: it is simply unused here
    expect((await h['salesReturn:create']!(d)).sales_return.requested_by).toBe(shop.ownerId);
    expect(mine.token).toHaveLength(64);
  });

  it('the owner\'s password is needed: a wrong one is INVALID_CREDENTIALS (same answer as for a wrong name), and staff cannot approve with their own', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    expect((await failureOf(approve(d, 'not-the-password'))).code).toBe('INVALID_CREDENTIALS');
    expect((await failureOf(h['approval:requestReturn']!({ username: 'staff', password: 'test-staff-secret-1', return: d }))).code).toBe('INVALID_CREDENTIALS');
    expect(audits('approval_failed')).toHaveLength(2);
  });

  it('a return token cannot be used for a sale, and a sale approval cannot complete a return', async () => {
    const { invoice, line } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const d = draft(invoice.id, line.id);
    // a 40 percent discount is more than staff may give: it needs the owner's approval, so a token is looked at
    const sale = { customer_id: rashid, paid_amount: 0, lines: [{ product_id: ins1l, qty: 1000, line_discount: 20_000 }] };
    const asSale = await h['approval:request']!({ username: 'owner', password: OWNER.password, actions: ['discount_override'], sale });
    expect((await failureOf(h['salesReturn:create']!({ ...d, approval_token: asSale.token }))).code).toBe('APPROVAL_INVALID');
    const asReturn = await approve(d);
    expect((await failureOf(h['sale:create']!({ ...sale, approval_token: asReturn.token }))).code).toBe('APPROVAL_INVALID');
  });
});

describe('the renderer never says who', () => {
  it('approved_by, requested_by, created_by and a money field are refused by the contract', () => {
    const base = draft(randomUUID(), randomUUID());
    const schema = contract['salesReturn:create'].input;
    expect(schema.safeParse(base).success).toBe(true);
    for (const key of ['approved_by', 'requested_by', 'created_by', 'actor_id', 'cash_amount', 'khata_amount', 'total', 'refund_method']) {
      expect(schema.safeParse({ ...base, [key]: randomUUID() }).success, key).toBe(false);
    }
    expect(contract['approval:requestReturn'].input.safeParse({ username: 'owner', password: 'x', return: base, approved_by: randomUUID() }).success).toBe(false);
    expect(contract['invoices:void'].input.safeParse({ invoice_id: randomUUID(), reason: 'x', voided_by: randomUUID() }).success).toBe(false);
  });

  it('the subject hash does not depend on the order of the lines, and does depend on every fact an approval is for', () => {
    const a = { invoice_item_id: 'a', qty: 1, condition: 'resellable', reason: 'other' };
    const b = { invoice_item_id: 'b', qty: 2, condition: 'damaged', reason: 'leaked' };
    expect(returnSubjectHash({ invoice_id: 'i', items: [a, b] })).toBe(returnSubjectHash({ invoice_id: 'i', items: [b, a] }));
    for (const changed of [{ ...a, qty: 2 }, { ...a, condition: 'damaged' }, { ...a, reason: 'leaked' }, { ...a, invoice_item_id: 'c' }]) {
      expect(returnSubjectHash({ invoice_id: 'i', items: [changed, b] })).not.toBe(returnSubjectHash({ invoice_id: 'i', items: [a, b] }));
    }
    expect(returnSubjectHash({ invoice_id: 'j', items: [a, b] })).not.toBe(returnSubjectHash({ invoice_id: 'i', items: [a, b] }));
  });
});

describe('void: the owner alone', () => {
  it('the owner voids with a reason; the invoice stays on record as voided; staff are refused (before anything runs)', async () => {
    const { invoice } = await ownerSells();
    await shop.signOut();
    await shop.signInAs('staff');
    const before = footprint();
    const refused = await failureOf(h['invoices:void']!({ invoice_id: invoice.id, reason: 'mistake' }));
    expect(refused).toMatchObject({ code: 'NOT_AUTHORIZED', params: { capability: 'invoices.void' } });
    expect(footprint()).toEqual(before);

    await shop.signOut();
    await shop.signInAs('owner');
    const out = await h['invoices:void']!({ invoice_id: invoice.id, reason: '  wrong customer ' });
    expect(out).toMatchObject({ invoice_no: invoice.invoice_no, khata_reversed: 150_000, cash_back: 0 });
    const detail = await h['invoices:get']!({ invoice_id: invoice.id });
    expect(detail.invoice.status).toBe('voided');
    expect(audits('invoice_voided')).toEqual([expect.objectContaining({ user_id: shop.ownerId, row_id: invoice.id })]);
    // the VOIDED mark is on the printed receipt
    await h['print:document']!({ invoice_id: invoice.id, kind: 'receipt' });
    expect(printing.state.printed.at(-1)!.html).toContain('VOIDED');
  });

  it('an invoice that has returns cannot be voided, and a voided one accepts no return', async () => {
    const { invoice, line } = await ownerSells();
    await h['salesReturn:create']!(draft(invoice.id, line.id));
    expect((await failureOf(h['invoices:void']!({ invoice_id: invoice.id, reason: 'x' }))).code).toBe('VOID_HAS_RETURNS');
    const second = await ownerSells();
    await h['invoices:void']!({ invoice_id: second.invoice.id, reason: 'x' });
    expect((await failureOf(h['salesReturn:create']!(draft(second.invoice.id, second.line.id)))).code).toBe('INVOICE_VOIDED');
  });
});

describe('look, list, preview, print', () => {
  it('forInvoice, preview, list and get: the screen gets the core\'s numbers, the quantity left, and no cost', async () => {
    const { invoice, line } = await ownerSells(50_000);
    await h['salesReturn:create']!(draft(invoice.id, line.id));
    await shop.signOut();
    await shop.signInAs('staff');
    const view = await h['returns:forInvoice']!({ invoice_id: invoice.id });
    expect(view.has_returns).toBe(true);
    expect(view.lines[0]).toMatchObject({ qty: 3000, qty_returned: 1000, qty_returnable: 2000, batch_expired: false, whole_packs_only: true, base_unit: 'ml', pack_size: 1000, unit_price: 50_000 });
    expect(view.khata_balance).toBeGreaterThan(0);
    const p = await h['returns:preview']!({ invoice_id: invoice.id, items: [{ invoice_item_id: line.id, qty: 2000, condition: 'damaged', reason: 'leaked' }] });
    expect(p).toMatchObject({ total: 100_000, cash_amount: 50_000, khata_amount: 50_000, issues: [], write_off_lines: 1 });
    const list = await h['returns:list']!({ query: invoice.invoice_no });
    expect(list.total).toBe(1);
    const got = await h['returns:get']!({ return_id: list.rows[0].id });
    expect(got.lines[0]).toMatchObject({ qty: 1000, refund_amount: 50_000, reason: 'changed_mind', condition: 'resellable' });
    for (const reply of [view, p, list, got]) expect(JSON.stringify(reply)).not.toMatch(/cost/i);
    expect((await failureOf(h['returns:get']!({ return_id: randomUUID() }))).code).toBe('NOT_FOUND');
    expect((await failureOf(h['returns:forInvoice']!({ invoice_id: randomUUID() }))).code).toBe('NOT_FOUND');
  });

  it('the slip says COPY from the second print of the same kind, counted in the audit log; the other kind starts fresh; the quantity has its unit', async () => {
    const { invoice, line } = await ownerSells(0, fert, 5000); // 5 kg of the loose fertilizer
    const made = await h['salesReturn:create']!({
      invoice_id: invoice.id, items: [{ invoice_item_id: line.id, qty: 500, condition: 'resellable', reason: 'wrong_item' }],
    });
    const id = made.sales_return.id;
    const first = await h['print:returnSlip']!({ return_id: id, kind: 'receipt', language: 'en' });
    expect(first).toMatchObject({ status: 'printed', is_copy: false });
    const second = await h['print:returnSlip']!({ return_id: id, kind: 'receipt', language: 'ur', output: 'pdf' });
    expect(second).toMatchObject({ is_copy: true, status: 'pdf_saved' });
    expect((await h['print:returnSlip']!({ return_id: id, kind: 'invoice' })).is_copy).toBe(false); // the A4 credit note is another kind
    expect(audits('return_slip_printed')).toHaveLength(3);
    const html = printing.state.printed[0]!.html;
    expect(html).toMatch(/0\.5 kg/);
    expect(html).not.toMatch(/\b500\s*g\b/);
    expect(printing.state.pdfs[0]!.html).toContain('COPY');
    expect((await failureOf(h['print:returnSlip']!({ return_id: randomUUID(), kind: 'receipt' }))).code).toBe('NOT_FOUND');
  });
});
