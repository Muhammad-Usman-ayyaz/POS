import { z } from 'zod';
import { todayUtc } from '../clock.js';
import { normalizeSearchText, tidyText } from '../domain/catalogue.js';
import { creditPicture } from '../domain/customers.js';
import { looksLikePhone, phoneDigits } from '../domain/phone.js';
import { DomainError } from '../errors.js';
import type { CustomerPatch, Repositories } from '../ports/index.js';
import { Id, NonNegPaisa, PriceType } from '../schemas/common.js';
import type { Customer } from '../schemas/index.js';
import { readCustomerSettings } from './customer-settings.js';
import { debtPicture } from './khata.js';
import { activeUser, liveCustomer, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

const SearchInput = z.strictObject({
  query: z.string().max(100).default(''),
  limit: z.number().int().min(1).max(50).default(20),
});
export type CustomerSearchInput = z.input<typeof SearchInput>;

/** A customer as the counter needs to see them: who, their usual price type, how much they may owe, and what they owe now. */
export interface CustomerMatch {
  id: string;
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  phone: string | null;
  default_price_type: 'retail' | 'wholesale';
  /** 0 means no limit is set. */
  credit_limit: number;
  /** What they owe now (opening balance included). Plus means they owe. */
  balance: number;
}

/** One customer with the figures the Khata list and the customer page show. All of it is worked out from the ledger when asked: nothing is stored. */
export interface CustomerSummary {
  customer: Customer;
  /** Plus: the customer owes. Minus: the customer is in credit (an advance). */
  balance: number;
  /** What may still be put on credit. NULL when `no_limit`. Never negative. */
  credit_left: number | null;
  /** A credit limit of 0 means no limit. */
  no_limit: boolean;
  /** The customer owes more than the limit. `credit_left` is 0 then. */
  over_limit: boolean;
  /** Due date of the oldest unpaid invoice that has one (see `debtPicture`). NULL when there is none. */
  next_due: string | null;
  /** Sum still unpaid on overdue invoices. */
  overdue_amount: number;
  /** How many days late the latest-running overdue invoice is (the largest `days_overdue`), 0 when nothing is overdue. */
  overdue_days: number;
}

export interface CustomerListTotals {
  /** Sum of the POSITIVE balances only, so one customer's advance never hides another's debt. Shop-wide: not narrowed by the search or filter. */
  total_outstanding: number;
  /** Sum of `overdue_amount` over every customer. Shop-wide. */
  overdue_total: number;
  /** How many customers match the search and filter (before limit and offset). */
  count: number;
}

export interface CustomerList {
  rows: CustomerSummary[];
  totals: CustomerListTotals;
}

export interface DuplicateMatch {
  customer_id: string;
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  phone: string | null;
  /** Other customers' balances are not secret from staff: the picker shows them. */
  balance: number;
  same_name: boolean;
  same_phone: boolean;
}

export interface CustomerTermsResult {
  customer: CustomerSummary;
  /** The fields whose value really changed. Empty: nothing was written and no audit row exists. */
  changed: string[];
  /** The limit was set or lowered to a figure under what the customer owes now. Allowed, but the screen should warn. */
  below_balance: boolean;
}

const Text = (max: number) => z.string().max(max).nullable();
const Contact = {
  name_en: Text(200).optional(),
  name_ur: Text(200).optional(),
  phone: Text(30).optional(),
  village: Text(100).optional(),
  notes: Text(500).optional(),
};
const Farmer = {
  father_name: Text(200).optional(),
  cnic: Text(30).optional(),
  phone2: Text(30).optional(),
  guarantor: Text(200).optional(),
};
/** Fields that are the owner's to choose. A staff create that carries any of them is refused (FIELD_NOT_ALLOWED), never quietly ignored. */
const OWNER_FIELDS = ['credit_limit', 'default_price_type', 'father_name', 'cnic', 'phone2', 'guarantor'] as const;

const CreateInput = z.strictObject({
  fields: z.strictObject({ ...Contact, ...Farmer, credit_limit: NonNegPaisa.safe().optional(), default_price_type: PriceType.optional() }),
  /** The signed-in user, set by the shell. */
  created_by: Id,
  /** True only when the signed-in user is the owner (the shell decides; the service checks the user really is one). */
  privileged: z.boolean().default(false),
  /** Save even though another customer has the same name or phone. */
  confirm_duplicate: z.boolean().optional(),
});
export type CustomerCreateInput = z.input<typeof CreateInput>;

const UpdateInput = z.strictObject({
  customer_id: Id,
  // Contact fields ONLY. A credit limit, price type or farmer field here is refused by the schema: those go through setTerms.
  fields: z.strictObject(Contact),
  expected_version: z.number().int().min(1),
  actor: Id,
});
export type CustomerUpdateInput = z.input<typeof UpdateInput>;

const TermsInput = z.strictObject({
  customer_id: Id,
  /** Paisa. 0 means no limit. */
  credit_limit: NonNegPaisa.safe(),
  default_price_type: PriceType,
  // A field left out keeps its value; null clears it.
  ...Farmer,
  expected_version: z.number().int().min(1),
  actor: Id,
});
export type CustomerTermsInput = z.input<typeof TermsInput>;

const DuplicatesInput = z.strictObject({
  name_en: z.string().max(200).nullish(),
  name_ur: z.string().max(200).nullish(),
  phone: z.string().max(30).nullish(),
});
export type CustomerDuplicatesInput = z.input<typeof DuplicatesInput>;

const ListInput = z.strictObject({
  query: z.string().max(100).default(''),
  filter: z.enum(['all', 'owes', 'overdue', 'advance']).default('all'),
  /** name: by name; balance: owes most first; overdue: most overdue first; next_due: soonest first, none last. */
  sort: z.enum(['name', 'balance', 'overdue', 'next_due']).default('name'),
  /** Which name to sort by (the displayed language); the other one is used when this one is missing. */
  name_language: z.enum(['en', 'ur']).default('en'),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});
export type CustomerListInput = z.input<typeof ListInput>;

const GetInput = z.strictObject({ customer_id: Id });

/** Tidied text, or null when nothing is left. */
const clean = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null) return null;
  const t = tidyText(v);
  return t === '' ? null : t;
};

const normName = (v: string | null | undefined): string => normalizeSearchText(v ?? '');

/** Phone digits of a stored or typed phone, ready to compare. */
const phoneKey = (v: string | null | undefined): string => phoneDigits(normalizeSearchText(v ?? ''));

/**
 * Does the customer match what was typed? Either name, village or phone must contain every word (the catalogue's matching: either
 * language, Urdu and Arabic digits and letter variants read alike). A query that is only a phone number ("0300-123 4567", "+92 300 1234567")
 * also matches by digits alone, so spaces, dashes and the leading 0 or +92 in the stored number do not matter.
 */
function matcher(query: string): (c: Customer) => { match: boolean; rank: number } {
  const normalized = normalizeSearchText(query);
  const words = normalized.split(' ').filter((w) => w !== '');
  const digits = looksLikePhone(normalized) ? phoneDigits(normalized) : '';
  return (c) => {
    const names = [c.name_en, c.name_ur].map((n) => normalizeSearchText(n ?? '')).filter((n) => n !== '');
    const haystack = [...names, normalizeSearchText(c.village ?? ''), normalizeSearchText(c.phone ?? ''), normalizeSearchText(c.phone2 ?? '')].join(' ');
    const byText = words.every((w) => haystack.includes(w));
    const byDigits = digits !== '' && [c.phone, c.phone2].some((p) => phoneKey(p).includes(digits));
    if (!byText && !byDigits) return { match: false, rank: 0 };
    return { match: true, rank: words.length > 0 && names.some((n) => n.startsWith(words[0]!)) ? 0 : 1 };
  };
}

/**
 * Customers: finding them at the counter, the Khata list, adding and editing them, their terms, and spotting duplicates.
 * Who may do what is decided by the shell (it passes `created_by`, `actor` and `privileged` from the session, never from the screen);
 * the service also checks the role where the rule is the owner's (setTerms, a privileged create).
 */
export function createCustomerDirectoryService(deps: ServiceDeps) {
  const rows = rowFactory(deps);
  const summarise = (tx: Repositories, customer: Customer, balance: number, today: string): CustomerSummary => {
    // Only a customer who owes something can have anything unpaid or overdue.
    const debts = balance > 0 ? debtPicture(tx, customer.id, today) : { overdue: [], next_due: null };
    return {
      customer,
      balance,
      ...creditPicture(customer.credit_limit, balance),
      next_due: debts.next_due,
      overdue_amount: debts.overdue.reduce((sum, o) => sum + o.outstanding, 0),
      overdue_days: debts.overdue.reduce((max, o) => Math.max(max, o.days_overdue), 0),
    };
  };

  const summaryOf = (tx: Repositories, id: string): CustomerSummary => {
    const customer = liveCustomer(tx, id);
    return summarise(tx, customer, tx.ledger.balance('customer', id), todayUtc(deps.clock));
  };

  /** Live customers with the same normalised name (either language) or the same phone digits. */
  const duplicatesIn = (tx: Repositories, probe: { name_en?: string | null | undefined; name_ur?: string | null | undefined; phone?: string | null | undefined }): DuplicateMatch[] => {
    const names = [normName(probe.name_en), normName(probe.name_ur)].filter((n) => n !== '');
    const phone = phoneKey(probe.phone);
    if (names.length === 0 && phone === '') return [];
    const balances = tx.ledger.balancesByParty('customer');
    return tx.customers.list().flatMap((c) => {
      const theirNames = [normName(c.name_en), normName(c.name_ur)].filter((n) => n !== '');
      const same_name = names.some((n) => theirNames.includes(n));
      const same_phone = phone !== '' && [c.phone, c.phone2].some((p) => phoneKey(p) === phone);
      if (!same_name && !same_phone) return [];
      return [{ customer_id: c.id, name_en: c.name_en, name_ur: c.name_ur, village: c.village, phone: c.phone, balance: balances.get(c.id) ?? 0, same_name, same_phone }];
    });
  };

  const checkVersion = (customer: Customer, expected: number): void => {
    if (customer.version !== expected) {
      throw new DomainError('VERSION_CONFLICT', 'this customer was changed by someone else: reload and try again', { expected_version: expected, current_version: customer.version });
    }
  };

  return {
    /**
     * Live customers whose name (either language), village or phone contains every word typed, best matches first (a name that starts with the
     * first word, then by name). Matching is the catalogue's: either language, Arabic and Urdu digits and letter variants read alike. A search
     * that is a phone number matches digits only (spaces, dashes, a leading 0 or +92 ignored). An empty search lists the first customers by name.
     */
    search(rawInput: CustomerSearchInput = {}): CustomerMatch[] {
      const input = parseInput(SearchInput, rawInput);
      return deps.uow.run((tx) => {
        const test = matcher(input.query);
        const matches = tx.customers.list().flatMap((c) => {
          const m = test(c);
          return m.match ? [{ customer: c, rank: m.rank }] : [];
        });
        matches.sort((a, b) => a.rank - b.rank); // stable: the list is already in name order
        return matches.slice(0, input.limit).map(({ customer: c }) => ({
          id: c.id,
          name_en: c.name_en,
          name_ur: c.name_ur,
          village: c.village,
          phone: c.phone,
          default_price_type: c.default_price_type,
          credit_limit: c.credit_limit,
          balance: tx.ledger.balance('customer', c.id),
        }));
      });
    },

    /**
     * The Khata list: customers matching the search and filter, each with balance, credit left (or `no_limit`), next due date and what is
     * overdue, sorted and paged, plus the shop totals. Overdue and next due use the oldest-first display rule (see `debtPicture`).
     * filter: owes = balance above 0, advance = balance below 0, overdue = something overdue.
     */
    list(rawInput: CustomerListInput = {}): CustomerList {
      const input = parseInput(ListInput, rawInput);
      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        const balances = tx.ledger.balancesByParty('customer');
        const all = tx.customers.list().map((c) => summarise(tx, c, balances.get(c.id) ?? 0, today));
        const totals = {
          total_outstanding: all.reduce((sum, r) => sum + Math.max(0, r.balance), 0),
          overdue_total: all.reduce((sum, r) => sum + r.overdue_amount, 0),
        };

        const test = matcher(input.query);
        const filters = {
          all: () => true,
          owes: (r: CustomerSummary) => r.balance > 0,
          advance: (r: CustomerSummary) => r.balance < 0,
          overdue: (r: CustomerSummary) => r.overdue_amount > 0,
        };
        const matching = all.filter((r) => filters[input.filter](r) && (input.query.trim() === '' || test(r.customer).match));

        const nameOf = (r: CustomerSummary): string => {
          const c = r.customer;
          return normalizeSearchText((input.name_language === 'ur' ? c.name_ur ?? c.name_en : c.name_en ?? c.name_ur) ?? '');
        };
        const byName = (a: CustomerSummary, b: CustomerSummary): number => (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : a.customer.id < b.customer.id ? -1 : 1);
        const sorters = {
          name: byName,
          balance: (a: CustomerSummary, b: CustomerSummary) => b.balance - a.balance || byName(a, b),
          overdue: (a: CustomerSummary, b: CustomerSummary) => b.overdue_amount - a.overdue_amount || byName(a, b),
          next_due: (a: CustomerSummary, b: CustomerSummary) =>
            a.next_due === b.next_due ? byName(a, b) : a.next_due === null ? 1 : b.next_due === null ? -1 : a.next_due < b.next_due ? -1 : 1,
        };
        matching.sort(sorters[input.sort]);
        return { rows: matching.slice(input.offset, input.offset + input.limit), totals: { ...totals, count: matching.length } };
      });
    },

    /** One customer with the same figures as a list row. */
    get(rawInput: string | { customer_id: string }): CustomerSummary {
      const input = parseInput(GetInput, typeof rawInput === 'string' ? { customer_id: rawInput } : rawInput);
      return deps.uow.run((tx) => summaryOf(tx, input.customer_id));
    },

    /**
     * Other live customers with the same name (normalised: case, spaces, Urdu letter and digit variants; either language against either) or the
     * same phone (digits only). Never blocks anything: it is the list the "already exists" warning shows.
     */
    findDuplicates(rawInput: CustomerDuplicatesInput = {}): DuplicateMatch[] {
      const input = parseInput(DuplicatesInput, rawInput);
      return deps.uow.run((tx) => duplicatesIn(tx, input));
    },

    /**
     * A new customer. Contact fields are anyone's. The credit limit, price type and farmer fields are the owner's (`privileged`): from anyone else they
     * are REFUSED with FIELD_NOT_ALLOWED (never quietly dropped). A new customer starts with the shop setting `default_credit_limit` (0 = no limit
     * unless the owner set one) and the retail price type. A customer with the same normalised name or the same phone as another needs
     * `confirm_duplicate: true`, otherwise DUPLICATE_CUSTOMER (params `count`, and `matches` as JSON text; the list also comes from `findDuplicates`).
     * Not audited: creating a record is not a change to one (like creating a product).
     */
    create(rawInput: CustomerCreateInput): CustomerSummary {
      const input = parseInput(CreateInput, rawInput);
      return deps.uow.run((tx) => {
        const user = activeUser(tx, input.created_by);
        if (input.privileged && user.role !== 'owner') throw new DomainError('NOT_AUTHORIZED', 'only the owner can set terms');
        const f = input.fields;
        if (!input.privileged) {
          const given = OWNER_FIELDS.filter((k) => f[k] !== undefined);
          if (given.length > 0) throw new DomainError('FIELD_NOT_ALLOWED', 'only the owner can set a credit limit, price type or farmer details', { fields: given.join(',') });
        }
        const name_en = clean(f.name_en);
        const name_ur = clean(f.name_ur);
        if (name_en === null && name_ur === null) throw new DomainError('INVALID_INPUT', 'fields.name_en: enter an English or an Urdu name');
        const phone = clean(f.phone);

        const matches = duplicatesIn(tx, { name_en, name_ur, phone });
        if (matches.length > 0 && input.confirm_duplicate !== true) {
          throw new DomainError('DUPLICATE_CUSTOMER', 'a customer with this name or phone already exists', { count: matches.length, matches: JSON.stringify(matches) });
        }

        const id = deps.ids.newId();
        tx.customers.insert({
          id,
          name_en,
          name_ur,
          phone,
          village: clean(f.village),
          credit_limit: f.credit_limit ?? readCustomerSettings(tx).default_credit_limit,
          default_price_type: f.default_price_type ?? 'retail',
          notes: clean(f.notes),
          father_name: clean(f.father_name),
          cnic: clean(f.cnic),
          phone2: clean(f.phone2),
          guarantor: clean(f.guarantor),
          land_size: null,
          crop: null,
          ...deps.scope,
        });
        return summaryOf(tx, id);
      });
    },

    /**
     * Changes contact fields only (names, phone, village, notes). A field left out keeps its value; null clears it (one name must remain).
     * A credit limit, price type or farmer field is not accepted here: use `setTerms`. `expected_version` is the version the screen loaded;
     * if someone changed the customer since, VERSION_CONFLICT. Nothing written when nothing changed.
     */
    update(rawInput: CustomerUpdateInput): CustomerSummary {
      const input = parseInput(UpdateInput, rawInput);
      return deps.uow.run((tx) => {
        activeUser(tx, input.actor);
        const current = liveCustomer(tx, input.customer_id);
        checkVersion(current, input.expected_version);

        const patch: CustomerPatch = {};
        for (const key of ['name_en', 'name_ur', 'phone', 'village', 'notes'] as const) {
          if (input.fields[key] === undefined) continue;
          const next = clean(input.fields[key]);
          if (next !== current[key]) patch[key] = next;
        }
        if ((patch.name_en !== undefined ? patch.name_en : current.name_en) === null && (patch.name_ur !== undefined ? patch.name_ur : current.name_ur) === null) {
          throw new DomainError('INVALID_INPUT', 'fields.name_en: enter an English or an Urdu name');
        }
        if (Object.keys(patch).length > 0) tx.customers.update(current.id, patch);
        return summaryOf(tx, current.id);
      });
    },

    /**
     * The owner's terms: credit limit (0 = no limit), default price type, and the optional farmer details. Owner only. One audit row
     * `customer_terms_changed` with the old and new values of the fields that changed, in the same transaction. Lowering a limit below what the
     * customer owes now is allowed; the result says `below_balance: true` so the screen can warn. `expected_version` as in `update`.
     */
    setTerms(rawInput: CustomerTermsInput): CustomerTermsResult {
      const input = parseInput(TermsInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor);
        const current = liveCustomer(tx, input.customer_id);
        checkVersion(current, input.expected_version);

        const next: Record<string, string | number | null> = { credit_limit: input.credit_limit, default_price_type: input.default_price_type };
        for (const key of ['father_name', 'cnic', 'phone2', 'guarantor'] as const) {
          if (input[key] !== undefined) next[key] = clean(input[key]);
        }
        const before: Record<string, string | number | null> = {};
        const after: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(next)) {
          const was = current[key as keyof Customer] as string | number | null;
          if (was !== value) {
            before[key] = was;
            after[key] = value;
          }
        }
        const changed = Object.keys(after);
        const balance = tx.ledger.balance('customer', current.id);
        const below_balance = changed.includes('credit_limit') && input.credit_limit > 0 && balance > input.credit_limit;
        if (changed.length > 0) {
          tx.customers.update(current.id, after as CustomerPatch);
          tx.audit.insert(
            rows.audit({
              user_id: input.actor,
              action: 'customer_terms_changed',
              table_name: 'customers',
              row_id: current.id,
              details: { customer_id: current.id, fields: changed, before, after, ...(below_balance ? { below_balance: true, balance } : {}) },
            }),
          );
        }
        return { customer: summaryOf(tx, current.id), changed, below_balance };
      });
    },
  };
}
export type CustomerDirectoryService = ReturnType<typeof createCustomerDirectoryService>;
/** The customers service under its newer name. */
export const createCustomerService = createCustomerDirectoryService;
export type CustomerService = CustomerDirectoryService;
