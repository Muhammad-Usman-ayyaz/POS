import { z } from 'zod';
import { daysBetween, nowIso, todayUtc } from '../clock.js';
import { outstandingDebts } from '../domain/khata.js';
import { isTimeZone } from '../domain/zone-day.js';
import { buildStatement, type StatementResult } from '../domain/statement.js';
import { DomainError } from '../errors.js';
import type { Repositories } from '../ports/index.js';
import { Id, IsoDate } from '../schemas/common.js';
import type { Customer } from '../schemas/index.js';
import { activeUser, liveCustomer, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

const OpeningBalanceInput = z.object({
  customer_id: Id,
  /** Paisa the customer owed when the shop started using the app. Plus means the customer owes. Not zero. */
  amount: z.number().int().refine((n) => n !== 0, { message: 'cannot be 0' }),
  created_by: Id,
});
export type OpeningBalanceInput = z.input<typeof OpeningBalanceInput>;

/** The largest amount the shell accepts for one entry (Rs 10 billion, in paisa): the same bound as every other money input. */
const MAX_DELTA = 1_000_000_000_000;

const AdjustOpeningInput = z.strictObject({
  customer_id: Id,
  /** Paisa to ADD to what the customer owes (minus: owes less). A whole number, never 0. */
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: 'cannot be 0' })
    .refine((n) => Math.abs(n) <= MAX_DELTA, { message: 'too large' }),
  /** Why the opening balance was wrong. Required: the audit row keeps it. */
  reason: z.string().trim().min(1).max(200),
  /** The signed-in OWNER, set by the shell. */
  created_by: Id,
});
export type AdjustOpeningInput = z.input<typeof AdjustOpeningInput>;

export interface AdjustOpeningResult {
  /** The id of the one `adjustment` ledger row that was written. */
  entry_id: string;
  balance_before: number;
  /** The customer's balance after the correction: the ledger sum, from the shell. */
  balance: number;
}

/** A real calendar day, YYYY-MM-DD. */
const Day = IsoDate.refine((d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}, { message: 'not a real date' });

const StatementInput = z
  .strictObject({
    customer_id: Id,
    /** First day to show (included). Leave out for the whole history. */
    from: Day.optional(),
    /** Last day to show (included). Leave out for everything up to now. */
    to: Day.optional(),
    /** The shop's time zone, set by the shell from the shop setting (never by the screen: the contract has no such key). Default Asia/Karachi. */
    time_zone: z.string().max(60).refine(isTimeZone, { message: 'not a time zone' }).optional(),
  })
  .refine((i) => i.from === undefined || i.to === undefined || i.from <= i.to, { message: 'from must not be after to', path: ['from'] });
export type StatementInput = z.input<typeof StatementInput>;

export interface Statement extends StatementResult {
  customer: Pick<Customer, 'id' | 'name_en' | 'name_ur' | 'phone' | 'village'>;
  from: string | null;
  to: string | null;
}

export interface OverdueInvoice {
  invoice_id: string;
  invoice_no: string;
  due_date: string;
  days_overdue: number;
  /** What is still unpaid on it, after counting payments against the oldest debts first. */
  outstanding: number;
}

export interface DebtPicture {
  /** Invoices past their due date that are still unpaid, oldest first. */
  overdue: OverdueInvoice[];
  /** The due date of the oldest unpaid invoice that has one. NULL when nothing unpaid has a due date. An opening balance has no due date and is never overdue. */
  next_due: string | null;
}

/**
 * Which invoices are still unpaid, worked out inside a transaction the caller already has.
 *
 * THIS IS A DISPLAY RULE, NOT STORED DATA. Payments are taken against the customer's overall balance; no payment-to-invoice
 * allocation is stored anywhere. To say which invoices are still open we treat all the money received (payments, returns and
 * other credits) as paying the OLDEST debts first (`outstandingDebts`). It never changes a balance, a payment or a ledger row.
 */
export function debtPicture(tx: Repositories, customerId: string, today: string): DebtPicture {
  const overdue: OverdueInvoice[] = [];
  let nextDue: string | null = null;
  for (const debt of outstandingDebts(tx.ledger.list('customer', customerId))) {
    if (debt.source !== 'invoice' || debt.ref_id === null) continue; // the opening balance has no due date
    const invoice = tx.invoices.getById(debt.ref_id);
    if (!invoice || invoice.due_date === null) continue;
    if (nextDue === null) nextDue = invoice.due_date; // oldest unpaid invoice that has a due date
    if (invoice.due_date >= today) continue;
    overdue.push({
      invoice_id: invoice.id,
      invoice_no: invoice.invoice_no,
      due_date: invoice.due_date,
      days_overdue: daysBetween(invoice.due_date, today),
      outstanding: debt.outstanding,
    });
  }
  return { overdue, next_due: nextDue };
}

/** The customer credit ledger (Khata). A balance is never stored: it is the sum of the ledger. */
export function createKhataService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /** Plus means the customer owes the shop. */
    balance(customerId: string): number {
      return deps.uow.run((tx) => {
        liveCustomer(tx, customerId);
        return tx.ledger.balance('customer', customerId);
      });
    },

    /**
     * A customer's statement. Every ledger row (oldest first, ties in insertion order) with the balance after it and what to show
     * beside it: the kind (opening, sale, payment, return, adjustment), the invoice or return number, the payment method,
     * reference and receipt number, and the payment note. With `from`, the first line is "brought forward": the balance before that day.
     * `to` stops the statement at the end of that day. Dates are whole SHOP days (Asia/Karachi by default, `time_zone` from the shell), both ends included: see `buildStatement`.
     * `closing_balance` is always the sum of the ledger up to `to`, so it can never disagree with `v_customer_balance`
     * (with no `to`, the service checks it against `ledger.balance` and refuses to answer if they differ).
     */
    statement(rawInput: StatementInput): Statement {
      const input = parseInput(StatementInput, rawInput);
      return deps.uow.run((tx) => {
        const customer = liveCustomer(tx, input.customer_id);
        const result = buildStatement(tx.ledger.customerStatementRows(customer.id), { from: input.from, to: input.to, timeZone: input.time_zone });
        if (input.to === undefined && result.closing_balance !== tx.ledger.balance('customer', customer.id)) {
          throw new DomainError('INTERNAL', 'statement does not add up to the ledger balance');
        }
        return {
          customer: { id: customer.id, name_en: customer.name_en, name_ur: customer.name_ur, phone: customer.phone, village: customer.village },
          from: input.from ?? null,
          to: input.to ?? null,
          ...result,
        };
      });
    },

    /** One `opening` row, entered by hand when the shop starts. A customer can only have one. */
    setOpeningBalance(rawInput: OpeningBalanceInput): void {
      const input = parseInput(OpeningBalanceInput, rawInput);
      deps.uow.run((tx) => {
        activeUser(tx, input.created_by);
        liveCustomer(tx, input.customer_id);
        if (tx.ledger.list('customer', input.customer_id).some((e) => e.entry_type === 'opening')) {
          throw new DomainError('OPENING_BALANCE_EXISTS', 'this customer already has an opening balance');
        }
        tx.ledger.insert(
          rows.ledger({ party_type: 'customer', party_id: input.customer_id, entry_type: 'opening', amount_delta: input.amount, entry_date: nowIso(deps.clock), created_by: input.created_by }),
        );
      });
    },

    /**
     * Corrects a wrong opening balance WITHOUT touching it. OWNER only. The customer must already have an `opening` row (else
     * NO_OPENING_BALANCE). It writes ONE `adjustment` ledger row for `delta` (plus: owes more, minus: owes less; a whole number, not 0) and ONE audit
     * row `opening_balance_adjusted` (reason, balance before, balance after, delta), both in this one unit of work. The `opening` row is never edited
     * and a second `opening` row is never written (the ledger is append-only). Returns the new balance.
     */
    adjustOpening(rawInput: AdjustOpeningInput): AdjustOpeningResult {
      const input = parseInput(AdjustOpeningInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.created_by);
        liveCustomer(tx, input.customer_id);
        const opening = tx.ledger.list('customer', input.customer_id).find((e) => e.entry_type === 'opening');
        if (!opening) throw new DomainError('NO_OPENING_BALANCE', 'this customer has no opening balance to correct');
        const before = tx.ledger.balance('customer', input.customer_id);
        const row = rows.ledger({
          party_type: 'customer',
          party_id: input.customer_id,
          entry_type: 'adjustment',
          amount_delta: input.delta,
          ref_type: 'opening',
          ref_id: opening.id,
          entry_date: nowIso(deps.clock),
          created_by: input.created_by,
        });
        tx.ledger.insert(row);
        const after = tx.ledger.balance('customer', input.customer_id);
        tx.audit.insert(
          rows.audit({
            user_id: input.created_by,
            action: 'opening_balance_adjusted',
            table_name: 'ledger_entries',
            row_id: row.id,
            details: { customer_id: input.customer_id, reason: input.reason, before, after, delta: input.delta },
          }),
        );
        return { entry_id: row.id, balance_before: before, balance: after };
      });
    },

    /**
     * Invoices past their due date that are still unpaid, oldest first. A display rule (see `debtPicture`): payments hit the
     * overall balance, so the money received is counted as paying the oldest debts first (docs/database-rules.md, "Reports from views").
     */
    overdue(customerId: string): OverdueInvoice[] {
      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        liveCustomer(tx, customerId);
        return debtPicture(tx, customerId, today).overdue;
      });
    },
  };
}
export type KhataService = ReturnType<typeof createKhataService>;
