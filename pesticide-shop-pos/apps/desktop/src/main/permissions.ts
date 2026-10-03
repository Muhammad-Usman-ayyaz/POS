import type { Role, SessionUser } from '@pos/api-contract';
import { DomainError } from '@pos/core';

/**
 * What each role may do. This is THE place the policy lives: to let staff do something, add 'staff' to its
 * line here (and nothing else). Every row is checked in the main process, before any service runs.
 *
 * Decided in CLAUDE.md: the owner approves returns, changes prices, and sees cost and profit.
 * Decided here as safe defaults (open question 12 in docs/open-questions.md): stock changes and
 * opening balances are owner-only too, until the shop owner says staff may do them.
 */
export const CAPABILITY_ROLES = {
  'returns.approve': ['owner'],
  'prices.override': ['owner'],
  'credit.override': ['owner'],
  'cost.view': ['owner'],
  'profit.view': ['owner'],
  'stock.adjust': ['owner'],
  'stock.writeOff': ['owner'],
  'stock.openingStock': ['owner'],
  'khata.openingBalance': ['owner'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;
export const capabilities = Object.keys(CAPABILITY_ROLES) as Capability[];

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITY_ROLES[capability] as readonly Role[]).includes(role);
}

/** Throws NOT_AUTHORIZED unless this user's role may do it. */
export function requireCapability(user: SessionUser, capability: Capability): void {
  if (!can(user.role, capability)) {
    throw new DomainError('NOT_AUTHORIZED', `${capability} is not allowed for ${user.role}`, { capability });
  }
}
