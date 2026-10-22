// The rules of the Returns screen without React: the requests it sends, the stepper and when a return may be completed. (The screen itself is in returns-page.test.tsx.)
import type { InvoiceForReturnView, ReturnPreviewView } from '@pos/api-contract';
import { describe, expect, it } from 'vitest';
import {
  approvalRequest,
  clampQty,
  countsPacks,
  createRequest,
  emptyDraft,
  previewRequest,
  qtyBoxText,
  readiness,
  refundTarget,
  returnedState,
  stepOf,
  stepQty,
  type Draft,
  type ReturnLine,
} from '../src/pages/returns/returns-state.js';

const line = (over: Partial<ReturnLine> = {}): ReturnLine => ({
  invoice_item_id: 'a', position: 1, name_en: 'Insecticide', name_ur: null, batch_no: 'B1', base_unit: 'ml', pack_size: 1000, whole_packs_only: true,
  qty: 3000, qty_returned: 0, qty_returnable: 3000, unit_price: 50_000, line_discount: 0, tax_amount: 0, line_total: 150_000, batch_expired: false, ...over,
});
const loose = (over: Partial<ReturnLine> = {}): ReturnLine => line({ invoice_item_id: 'b', name_en: 'Fertilizer', base_unit: 'g', whole_packs_only: false, qty: 2500, qty_returnable: 2500, line_total: 50_000, ...over });
const view = (lines: ReturnLine[]): InvoiceForReturnView => ({
  invoice: { id: 'inv', invoice_no: 'INV-A-000001', invoice_date: '2026-10-12T05:00:00.000Z', due_date: null, status: 'active', payment_method: 'cash', price_type: 'retail', subtotal: 1, tax_total: 0, total: 1, paid_amount: 1, on_khata: 0, void_reason: null },
  customer: null, customer_id: null, lines, khata_balance: null, has_returns: false, refund_paid_part_to_khata: false, returns: [],
});
const preview = (over: Partial<ReturnPreviewView> = {}): ReturnPreviewView => ({
  invoice_id: 'inv', invoice_no: 'INV-A-000001', lines: [], total: 1, tax_total: 0, cash_amount: 1, khata_amount: 0, khata_before: null, khata_after: null, restock_lines: 1, write_off_lines: 0, issues: [], ...over,
});

describe('the draft', () => {
  it('starts at 0 on every line, resellable, with no reason; a line from an expired batch starts as written off', () => {
    const d = emptyDraft(view([line(), loose({ batch_expired: true })]));
    expect(d).toEqual({ a: { qty: 0, condition: 'resellable', reason: '' }, b: { qty: 0, condition: 'expired', reason: '' } });
  });
});

describe('the stepper', () => {
  it('a sealed size and a single piece count packs; any other line is typed in kg or L', () => {
    expect(countsPacks(line())).toBe(true);
    expect(countsPacks(loose({ pack_size: 1 }))).toBe(true);
    expect(countsPacks(loose())).toBe(false);
  });

  it('moves a sealed size by a whole pack and a loose size by the counter\'s step (50 for a pack of 500 or more, 10 for 100 or more, else 1)', () => {
    expect(stepOf(line())).toBe(1000);
    expect(stepOf(line({ pack_size: 500 }))).toBe(500);
    expect(stepOf(loose())).toBe(50);
    expect(stepOf(loose({ pack_size: 250 }))).toBe(10);
    expect(stepOf(loose({ pack_size: 50 }))).toBe(1);
  });

  it('never goes below 0 or past what can still come back, and the last step lands exactly on the rest', () => {
    const l = loose({ qty_returnable: 120 });
    expect(stepQty(l, 0, -1)).toBe(0);
    expect(stepQty(l, 0, 1)).toBe(50);
    expect(stepQty(l, 100, 1)).toBe(120); // not 150
    expect(stepQty(l, 120, 1)).toBe(120);
    expect(clampQty(l, 999)).toBe(120);
    expect(clampQty(l, -5)).toBe(0);
    expect(clampQty(l, 33.9)).toBe(33);
    expect(stepQty(line({ qty_returnable: 2000 }), 2000, 1)).toBe(2000);
  });

  it('shows whole packs as a count and a loose quantity in kg or L, never g or ml', () => {
    expect(qtyBoxText(line(), 2000)).toBe('2');
    expect(qtyBoxText(loose(), 500)).toBe('0.5');
    expect(qtyBoxText(loose(), 1250)).toBe('1.25');
    expect(qtyBoxText(loose({ base_unit: 'ml' }), 100)).toBe('0.1');
  });
});

describe('the requests', () => {
  const v = view([line(), loose()]);
  const d = (over: Partial<Draft> = {}): Draft => ({ a: { qty: 1000, condition: 'resellable', reason: 'changed_mind' }, b: { qty: 0, condition: 'resellable', reason: '' }, ...over });

  it('a preview is only asked for what is chosen, and leaves a missing reason out (the reply lists it)', () => {
    expect(previewRequest(v, emptyDraft(v))).toBeNull();
    expect(previewRequest(v, d({ a: { qty: 1000, condition: 'damaged', reason: '' } }))).toEqual({ invoice_id: 'inv', items: [{ invoice_item_id: 'a', qty: 1000, condition: 'damaged' }] });
  });

  it('the return is only built when every chosen line has a reason, carries no approver or amount, and sends the note only when typed', () => {
    expect(createRequest(v, emptyDraft(v), '')).toBeNull();
    expect(createRequest(v, d({ a: { qty: 1000, condition: 'resellable', reason: '' } }), '')).toBeNull();
    const body = createRequest(v, d(), '  came back clean  ', 'tok'.repeat(10))!;
    expect(body).toEqual({ invoice_id: 'inv', note: 'came back clean', items: [{ invoice_item_id: 'a', qty: 1000, condition: 'resellable', reason: 'changed_mind' }], approval_token: 'tok'.repeat(10) });
    expect(Object.keys(createRequest(v, d(), '')!)).toEqual(['invoice_id', 'items']);
    for (const key of ['approved_by', 'requested_by', 'created_by', 'refund_amount', 'tax_refund', 'cash_amount', 'khata_amount', 'total']) expect(JSON.stringify(body)).not.toContain(key);
  });

  it('the approval request is for exactly the same lines as the return, and needs a reason on every line too', () => {
    const request = approvalRequest(v, d(), ' owner ', 'secret')!;
    expect(request).toEqual({ username: 'owner', password: 'secret', return: { invoice_id: 'inv', items: createRequest(v, d(), '')!.items } });
    expect(approvalRequest(v, d({ a: { qty: 1000, condition: 'resellable', reason: '' } }), 'owner', 'secret')).toBeNull();
  });
});

describe('when a return may be completed', () => {
  const v = view([line()]);
  const chosen = (reason: '' | 'other'): Draft => ({ a: { qty: 1000, condition: 'resellable', reason } });

  it('needs something chosen, a reason on every chosen line, the core\'s answer, and no issue in it', () => {
    expect(readiness(v, emptyDraft(v), null)).toEqual({ ok: false, why: 'nothing' });
    expect(readiness(v, chosen(''), preview())).toEqual({ ok: false, why: 'reason' });
    expect(readiness(v, chosen('other'), null)).toEqual({ ok: false, why: 'waiting' });
    expect(readiness(v, chosen('other'), preview({ issues: [{ code: 'EXPIRED_NOT_RESELLABLE', invoice_item_id: 'a' }] }))).toEqual({ ok: false, why: 'issues' });
    expect(readiness(v, chosen('other'), preview())).toEqual({ ok: true });
  });

  it('says how the refund is paid, and what state the sale is in', () => {
    expect(refundTarget({ cash_amount: 5, khata_amount: 0 })).toBe('cash');
    expect(refundTarget({ cash_amount: 0, khata_amount: 5 })).toBe('khata');
    expect(refundTarget({ cash_amount: 2, khata_amount: 3 })).toBe('both');
    expect(returnedState(view([line()]))).toBe('none');
    expect(returnedState(view([line({ qty_returned: 1000, qty_returnable: 2000 })]))).toBe('some');
    expect(returnedState(view([line({ qty_returned: 3000, qty_returnable: 0 })]))).toBe('all');
  });
});
