// The two small pieces behind the counter's approval and the sign-in lock-out, on their own: the wrong-password throttle and the one-use approval store.
// The numbers are written out here (5, 30 seconds, 20, a minute) on purpose: a test that reads the shell's own constants would agree with any value.
import { DomainError } from '@pos/core';
import { describe, expect, it } from 'vitest';
import { createApprovalStore, subjectHash, type SaleSubject } from '../src/main/approvals.js';
import { AttemptThrottle } from '../src/main/throttle.js';
import { movableClock } from './support.js';

const refusal = (fn: () => unknown): DomainError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError');
};

describe('AttemptThrottle', () => {
  it('locks on the fifth wrong password, not the fourth and not the sixth', () => {
    const throttle = new AttemptThrottle(movableClock());
    for (let i = 0; i < 4; i++) expect(throttle.fail('k')).toBeNull();
    expect(() => throttle.check('k')).not.toThrow();
    expect(throttle.fail('k')).toEqual({ lockedForSeconds: 30 });
    expect(refusal(() => throttle.check('k')).code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('after a lock ends, one wrong password does not lock again: it takes five more, and the lock doubles', () => {
    const clock = movableClock();
    const throttle = new AttemptThrottle(clock);
    for (let i = 0; i < 5; i++) throttle.fail('k');
    clock.advance(30_000);
    expect(() => throttle.check('k')).not.toThrow();
    expect(throttle.fail('k')).toBeNull();
    expect(() => throttle.check('k')).not.toThrow();
    for (let i = 0; i < 3; i++) expect(throttle.fail('k')).toBeNull();
    expect(throttle.fail('k')).toEqual({ lockedForSeconds: 60 });
  });

  it('says the seconds left rounded UP, so it never tells someone to try while still locked', () => {
    const clock = movableClock();
    const throttle = new AttemptThrottle(clock);
    for (let i = 0; i < 5; i++) throttle.fail('k');
    clock.advance(500);
    expect(refusal(() => throttle.check('k')).params).toEqual({ seconds: 30 }); // 29.5 s left
    clock.advance(29_000);
    expect(refusal(() => throttle.check('k')).params).toEqual({ seconds: 1 }); // 0.5 s left
    clock.advance(500);
    expect(() => throttle.check('k')).not.toThrow();
  });

  it('a right password forgets the wrong ones AND the doubling', () => {
    const clock = movableClock();
    const throttle = new AttemptThrottle(clock);
    for (let i = 0; i < 5; i++) throttle.fail('k');
    clock.advance(30_000);
    for (let i = 0; i < 4; i++) throttle.fail('k');
    throttle.succeed('k');
    for (let i = 0; i < 4; i++) expect(throttle.fail('k')).toBeNull(); // four after a success: not a lock
    expect(throttle.fail('k')).toEqual({ lockedForSeconds: 30 }); // and the lock is back to the first size
  });

  it('keeps a locked key locked however many other keys come and go (the clean-up never drops a lock)', () => {
    const throttle = new AttemptThrottle(movableClock());
    for (let i = 0; i < 5; i++) throttle.fail('locked');
    for (let i = 0; i < 600; i++) throttle.fail(`other-${i}`);
    throttle.fail('one-more');
    expect(refusal(() => throttle.check('locked')).code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('keys are separate', () => {
    const throttle = new AttemptThrottle(movableClock());
    for (let i = 0; i < 5; i++) throttle.fail('a');
    expect(() => throttle.check('b')).not.toThrow();
  });
});

describe('the approval store', () => {
  const grant = (token: string, over: object = {}) => ({ ownerId: 'o1', requestedBy: 'u1', actions: ['credit_override' as const], hash: 'h', token, ...over });

  it('holds at most 20 at once: the 21st is refused until one is used or runs out', () => {
    const clock = movableClock();
    const store = createApprovalStore(clock);
    for (let i = 0; i < 20; i++) store.issue(grant(`t${i}`));
    expect(store.open()).toBe(20);
    expect(refusal(() => store.issue(grant('t20'))).code).toBe('TOO_MANY_ATTEMPTS');
    store.consume('t0', ['credit_override'], 'h', 'u1');
    expect(() => store.issue(grant('t20'))).not.toThrow();
    expect(refusal(() => store.issue(grant('t21'))).code).toBe('TOO_MANY_ATTEMPTS');
    clock.advance(60_000);
    expect(() => store.issue(grant('t22'))).not.toThrow(); // the old ones ran out
    expect(store.open()).toBe(1);
  });

  it('a token is good for 59.999 seconds and not for 60', () => {
    const clock = movableClock();
    const store = createApprovalStore(clock);
    store.issue(grant('a'));
    store.issue(grant('b'));
    clock.advance(59_999);
    expect(store.consume('a', ['credit_override'], 'h', 'u1')).toEqual({ ownerId: 'o1' });
    clock.advance(1);
    expect(refusal(() => store.consume('b', ['credit_override'], 'h', 'u1')).params).toEqual({ reason: 'unknown_or_expired' });
  });

  it('says when it runs out as an ISO time one minute ahead', () => {
    const clock = movableClock('2026-10-12T10:00:00.000Z');
    expect(createApprovalStore(clock).issue(grant('a')).expires_at).toBe('2026-10-12T10:01:00.000Z');
  });
});

describe('the fingerprint of a sale', () => {
  const base: SaleSubject = {
    customer_id: 'c1',
    price_type: 'retail',
    paid_amount: 1000,
    lines: [{ product_id: 'p1', qty: 3000, line_discount: 5, batches: [{ batch_id: 'b1', qty: 3000 }], price_override: { unit_price: 40_000 } }],
  };
  const withLine = (change: object): SaleSubject => ({ ...base, lines: [{ ...base.lines[0]!, ...change }] });

  it('is the same for the same sale, and changes with every single field that matters', () => {
    const same = subjectHash({ lines: base.lines, paid_amount: 1000, price_type: 'retail', customer_id: 'c1' });
    expect(same).toBe(subjectHash(base));
    const others: Record<string, SaleSubject> = {
      customer: { ...base, customer_id: 'c2' },
      'no customer': { ...base, customer_id: undefined },
      'price type': { ...base, price_type: 'wholesale' },
      'paid amount': { ...base, paid_amount: 1001 },
      product: withLine({ product_id: 'p2' }),
      quantity: withLine({ qty: 3001 }),
      discount: withLine({ line_discount: 6 }),
      'no discount': withLine({ line_discount: undefined }),
      batch: withLine({ batches: [{ batch_id: 'b2', qty: 3000 }] }),
      'batch quantity': withLine({ batches: [{ batch_id: 'b1', qty: 2999 }] }),
      'no batches': withLine({ batches: undefined }),
      'override price': withLine({ price_override: { unit_price: 40_001 } }),
      'no override': withLine({ price_override: undefined }),
      'a line more': { ...base, lines: [...base.lines, ...base.lines] },
      'no lines': { ...base, lines: [] },
    };
    const seen = new Set([same]);
    for (const [name, subject] of Object.entries(others)) {
      const hash = subjectHash(subject);
      expect(seen.has(hash), name).toBe(false);
      seen.add(hash);
    }
  });

  it('does not depend on the order lines carry their keys, but does on the order of the lines', () => {
    const shuffled: SaleSubject = { ...base, lines: [{ price_override: { unit_price: 40_000 }, batches: [{ qty: 3000, batch_id: 'b1' }], line_discount: 5, qty: 3000, product_id: 'p1' }] };
    expect(subjectHash(shuffled)).toBe(subjectHash(base));
    const two: SaleSubject = { ...base, lines: [{ product_id: 'p1', qty: 1000 }, { product_id: 'p2', qty: 1000 }] };
    expect(subjectHash({ ...two, lines: [...two.lines].reverse() })).not.toBe(subjectHash(two));
  });
});
