import type { Channel, Role, SessionUser } from '@pos/api-contract';
import { DomainError } from '@pos/core';

/**
 * What each role may do. This is THE place the policy lives: to let staff do something, add 'staff' to its
 * line here (and nothing else). Every row is checked in the main process, before any service runs.
 *
 * Decided in CLAUDE.md: the owner approves returns, changes prices, and sees cost and profit.
 * Decided here as safe defaults (open questions 12, 14 and 15 in docs/open-questions.md): stock changes, opening
 * balances, catalogue changes, receiving stock and the quick-adds are owner-only too, until the shop owner says otherwise.
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
  /** Receive stock: typing in what arrived from a supplier, with its cost (open question 15). */
  'stock.receive': ['owner'],
  'khata.openingBalance': ['owner'],
  /** Create or change a product, a size, its prices, or switch them on or off or move a size (open question 14). */
  'catalogue.edit': ['owner'],
  /** Quick-add a supplier, a category or a brand inside a form. */
  'directory.add': ['owner'],
  /** Choose the receipt printer and the languages, and give the shop's address, phone and Urdu name that are printed on every document. */
  'print.configure': ['owner'],
  // ---------- BEGIN Phase 6 M2 ----------
  /** Credit limit, default price type and the farmer details of a customer (plan D1). */
  'customers.terms': ['owner'],
  /** The shop-level customer settings: the default credit limit for new customers, and showing the farmer fields (plan D2, D8). */
  'customers.settings': ['owner'],
  // ---------- END Phase 6 M2 ----------
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

// ---------- one policy for EVERY channel ----------

/**
 * Who may call a channel, before its handler runs:
 *  - 'public'     anyone, signed in or not (start-up, sign-in, language)
 *  - 'signed-in'  any signed-in user
 *  - { capability } a signed-in user whose role has that capability
 * Every channel in the contract must have a line here: the type below makes the compiler check it, and a test fails if
 * one is missing. A handler may check more (for example the owner-only parts of a sale), never less.
 */
export type ChannelPolicy = 'public' | 'signed-in' | { readonly capability: Capability };

export const CHANNEL_POLICY = {
  'app:getState': 'public',
  'setup:createShop': 'public',
  'auth:login': 'public',
  'auth:logout': 'public',
  'auth:me': 'public',
  'auth:regenerateRecoveryCode': 'signed-in',
  'auth:resetOwnerPassword': 'public',
  'prefs:setLanguage': 'public',

  'sale:quote': 'signed-in',
  'sale:create': 'signed-in',
  'customers:search': 'signed-in',
  'approval:request': 'signed-in',
  'salesReturn:create': { capability: 'returns.approve' },

  // Invoice history and printing: anyone signed in may look up a sale and print it (the counter reprints receipts all day). The data holds no cost.
  // Only choosing the printer and the shop's printed details is the owner's.
  'invoices:list': 'signed-in',
  'invoices:get': 'signed-in',
  'invoices:receipt': 'signed-in',
  'print:document': 'signed-in',
  'printers:list': 'signed-in',
  'print:getConfig': 'signed-in',
  'print:setConfig': { capability: 'print.configure' },

  'stock:batchesOf': 'signed-in',
  'stock:openingStock': { capability: 'stock.openingStock' },
  'stock:adjust': { capability: 'stock.adjust' },
  'stock:writeOff': { capability: 'stock.writeOff' },
  'stock:receive': { capability: 'stock.receive' },

  'catalogue:list': 'signed-in',
  'catalogue:createGroup': { capability: 'catalogue.edit' },
  'catalogue:updateGroup': { capability: 'catalogue.edit' },
  'catalogue:addSize': { capability: 'catalogue.edit' },
  'catalogue:updateSize': { capability: 'catalogue.edit' },
  'catalogue:setSizeActive': { capability: 'catalogue.edit' },
  'catalogue:setGroupActive': { capability: 'catalogue.edit' },
  'catalogue:moveSize': { capability: 'catalogue.edit' },

  'suppliers:list': 'signed-in',
  'suppliers:create': { capability: 'directory.add' },
  'categories:list': 'signed-in',
  'categories:create': { capability: 'directory.add' },
  'brands:list': 'signed-in',
  'brands:create': { capability: 'directory.add' },

  'khata:setOpeningBalance': { capability: 'khata.openingBalance' },
  'reports:profitByDay': { capability: 'profit.view' },

  // Held bills: a draft of a cart, with no price and no cost in it. Staff and owner share one counter, so either may hold, list, resume or
  // discard any held bill; the list says who held each one.
  'bills:hold': 'signed-in',
  'bills:list': 'signed-in',
  'bills:resume': 'signed-in',
  'bills:discard': 'signed-in',

  // ---------- BEGIN Phase 6 M2 ----------
  // Customers and the Khata: any signed-in user finds, adds and edits (contact fields) customers, takes payments and reads a statement.
  // Terms (credit limit, price type, farmer details) and the shop-level customer settings are the owner's.
  'customers:list': 'signed-in',
  'customers:get': 'signed-in',
  'customers:findDuplicates': 'signed-in',
  'customers:create': 'signed-in',
  'customers:update': 'signed-in',
  'customers:setTerms': { capability: 'customers.terms' },
  'customers:getSettings': 'signed-in',
  'customers:setSettings': { capability: 'customers.settings' },
  'payments:receive': 'signed-in',
  'khata:statement': 'signed-in',
  // ---------- END Phase 6 M2 ----------
  // ---------- BEGIN Phase 6 M6 ----------
  // Statements and payment receipts hold no cost; the counter prints them all day (like print:document). The CSV is saved through a dialog the main process opens.
  'print:statement': 'signed-in',
  'print:paymentReceipt': 'signed-in',
  'khata:exportStatement': 'signed-in',
  // ---------- END Phase 6 M6 ----------
  // ---------- BEGIN Phase 6 wrap-up ----------
  // Correcting an opening balance is the owner's, the same capability as setting one.
  'khata:adjustOpening': { capability: 'khata.openingBalance' },
  // ---------- END Phase 6 wrap-up ----------
} as const satisfies Record<Channel, ChannelPolicy>;

/** Throws NOT_SIGNED_IN or NOT_AUTHORIZED unless this user may call the channel. */
export function checkPolicy(channel: Channel, user: SessionUser | null): void {
  const policy: ChannelPolicy = CHANNEL_POLICY[channel];
  if (policy === 'public') return;
  if (user === null) throw new DomainError('NOT_SIGNED_IN', 'sign in first');
  if (policy !== 'signed-in') requireCapability(user, policy.capability);
}

// ---------- what an error may tell a user who is not the owner ----------

const COST_KEY = /cost/i;

/**
 * Costs are the owner's information. An error that carries a cost (BATCH_CONFLICT says what the existing batch cost) must not
 * tell it to anyone else: the cost parameters are dropped and the message, which may repeat them, is replaced.
 * Anything else about the error is kept, so the screen can still say what went wrong.
 */
export function sanitizeErrorFor(user: SessionUser | null, error: unknown): unknown {
  if (user?.role === 'owner' || !(error instanceof DomainError)) return error;
  const costParams = Object.keys(error.params).filter((k) => COST_KEY.test(k));
  if (costParams.length === 0 && !COST_KEY.test(error.message)) return error;
  const kept = Object.fromEntries(Object.entries(error.params).filter(([k]) => !COST_KEY.test(k)));
  return new DomainError(error.code, 'the details of this error are only for the owner', kept);
}

type AnyHandlers = Record<Channel, (input: never) => Promise<unknown>>;

/**
 * Wraps every handler so that, for EVERY call: the channel's policy is checked first (the handler does not run when it fails),
 * and whatever the handler throws is made safe for the signed-in user. The user comes from the session, never from the request.
 */
export function guardHandlers<T extends AnyHandlers>(handlers: T, currentUser: () => SessionUser | null): T {
  const guarded = {} as Record<string, (input: never) => Promise<unknown>>;
  for (const channel of Object.keys(CHANNEL_POLICY) as Channel[]) {
    const handler = handlers[channel];
    guarded[channel] = async (input: never) => {
      checkPolicy(channel, currentUser());
      try {
        return await handler(input);
      } catch (error) {
        throw sanitizeErrorFor(currentUser(), error);
      }
    };
  }
  return guarded as T;
}
