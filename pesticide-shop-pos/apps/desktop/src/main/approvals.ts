import { createHash } from 'node:crypto';
import type { ApprovalAction, SessionUser } from '@pos/api-contract';
import type { Clock, SaleQuote } from '@pos/core';
import { DomainError } from '@pos/core';

/** How long an owner's approval lasts. */
export const APPROVAL_TTL_MS = 60_000;
/** Approvals waiting to be used at once (a counter never needs more). */
const MAX_OPEN = 20;

/**
 * What a sale is, for the purpose of an approval: the cart and the amount paid now. An approval is given for exactly this and is worthless for
 * any other cart or amount (a different quantity, discount, price, batch, customer, price type or paid amount). Things that do not change what the
 * approval was for (the payment method, the reference number, the due date) are not part of it.
 */
export interface SaleSubject {
  customer_id?: string | undefined;
  price_type?: string | undefined;
  paid_amount: number;
  lines: readonly {
    product_id: string;
    qty: number;
    line_discount?: number | undefined;
    batches?: readonly { batch_id: string; qty: number }[] | undefined;
    price_override?: { unit_price: number } | undefined;
  }[];
}

/** The same JSON text for the same value, whatever the order the keys were written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A fingerprint of the cart and the amount. */
export function subjectHash(subject: SaleSubject): string {
  const normal = {
    customer_id: subject.customer_id ?? null,
    price_type: subject.price_type ?? null,
    paid_amount: subject.paid_amount,
    lines: subject.lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      line_discount: l.line_discount ?? 0,
      batches: l.batches ? l.batches.map((b) => ({ batch_id: b.batch_id, qty: b.qty })) : null,
      price_override: l.price_override ? l.price_override.unit_price : null,
    })),
  };
  return createHash('sha256').update(canonical(normal)).digest('hex');
}

/**
 * What a sale needs the owner to approve, for someone who is not the owner. The owner needs nothing: they are the approver.
 * Decided from the quote (the core's own numbers), not from the screen: going over the credit limit, a different price, a discount over the
 * staff limit.
 */
export function neededApprovals(user: SessionUser, quote: SaleQuote, lines: readonly { price_override?: unknown }[]): ApprovalAction[] {
  if (user.role === 'owner') return [];
  const needs: ApprovalAction[] = [];
  if (quote.customer?.over_limit) needs.push('credit_override');
  if (lines.some((l) => l.price_override)) needs.push('price_override');
  if (quote.lines.some((l) => l.discount_over_limit)) needs.push('discount_override');
  return needs.sort();
}

interface Grant {
  ownerId: string;
  requestedBy: string;
  actions: string;
  hash: string;
  expiresAt: number;
}

export interface ApprovalStore {
  /** Makes a one-use token for these actions and this cart, good for a minute. */
  issue(args: { ownerId: string; requestedBy: string; actions: readonly ApprovalAction[]; hash: string; token: string }): { token: string; expires_at: string };
  /**
   * Spends a token: it must exist, not have run out, not have been spent, and have been given for exactly these actions and this cart.
   * Any try with a token that exists SPENDS it, right or wrong, so one approval cannot be probed with different carts.
   * Throws APPROVAL_INVALID (with a reason that does not help guessing: the screen only says to ask again).
   */
  consume(token: string, actions: readonly ApprovalAction[], hash: string, requestedBy: string): { ownerId: string };
  /** How many are waiting (for tests). */
  open(): number;
}

export function createApprovalStore(clock: Clock): ApprovalStore {
  const grants = new Map<string, Grant>();
  const now = () => clock.now().getTime();
  const purge = () => {
    for (const [token, grant] of grants) if (grant.expiresAt <= now()) grants.delete(token);
  };
  const keyOf = (actions: readonly string[]) => [...new Set(actions)].sort().join('+');

  return {
    issue({ ownerId, requestedBy, actions, hash, token }) {
      purge();
      if (grants.size >= MAX_OPEN) throw new DomainError('TOO_MANY_ATTEMPTS', 'too many approvals are waiting', { seconds: 60 });
      const expiresAt = now() + APPROVAL_TTL_MS;
      grants.set(token, { ownerId, requestedBy, actions: keyOf(actions), hash, expiresAt });
      return { token, expires_at: new Date(expiresAt).toISOString() };
    },

    consume(token, actions, hash, requestedBy) {
      purge();
      const grant = grants.get(token);
      if (!grant) throw new DomainError('APPROVAL_INVALID', 'the approval is not valid (it may have run out or been used)', { reason: 'unknown_or_expired' });
      grants.delete(token); // spent by this try, whatever the outcome
      if (grant.requestedBy !== requestedBy) throw new DomainError('APPROVAL_INVALID', 'the approval was given to someone else', { reason: 'other_user' });
      if (grant.actions !== keyOf(actions)) throw new DomainError('APPROVAL_INVALID', 'the approval was given for a different action', { reason: 'other_action' });
      if (grant.hash !== hash) throw new DomainError('APPROVAL_INVALID', 'the approval was given for a different bill', { reason: 'other_bill' });
      return { ownerId: grant.ownerId };
    },

    open: () => grants.size,
  };
}
