import { z } from 'zod';
import { daysBetween, nowIso, todayUtc } from '../clock.js';
import { outstandingDebts } from '../domain/khata.js';
import { DomainError } from '../errors.js';
import { Id } from '../schemas/common.js';
import type { LedgerEntry } from '../schemas/index.js';
import { activeUser, liveCustomer, parseInput, rowFactory, type ServiceDeps } from './support.js';

const OpeningBalanceInput = z.object({
  customer_id: Id,
  /** Paisa the customer owed when the shop started using the app. Plus means the customer owes. Not zero. */
  amount: z.number().int().refine((n) => n !== 0, { message: 'cannot be 0' }),
  created_by: Id,
});
export type OpeningBalanceInput = z.input<typeof OpeningBalanceInput>;

export interface StatementLine {
  entry: LedgerEntry;
  /** Balance after this entry. */
  running_balance: number;
}

export interface OverdueInvoice {
  invoice_id: string;
  invoice_no: string;
  due_date: string;
  days_overdue: number;
  /** What is still unpaid on it, after counting payments against the oldest debts first. */
  outstanding: number;
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

    /** Every ledger row, oldest first, with the balance after each. */
    statement(customerId: string): StatementLine[] {
      return deps.uow.run((tx) => {
        liveCustomer(tx, customerId);
        let running = 0;
        return tx.ledger.list('customer', customerId).map((entry) => {
          running += entry.amount_delta;
          return { entry, running_balance: running };
        });
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
     * Invoices past their due date that are still unpaid. Payments hit the overall balance, so we treat the
     * money received as paying the oldest debts first (docs/database-rules.md, "Reports from views").
     */
    overdue(customerId: string): OverdueInvoice[] {
      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        liveCustomer(tx, customerId);
        const result: OverdueInvoice[] = [];
        for (const debt of outstandingDebts(tx.ledger.list('customer', customerId))) {
          if (debt.source !== 'invoice' || debt.ref_id === null) continue;
          const invoice = tx.invoices.getById(debt.ref_id);
          if (!invoice || invoice.due_date === null || invoice.due_date >= today) continue;
          result.push({
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            due_date: invoice.due_date,
            days_overdue: daysBetween(invoice.due_date, today),
            outstanding: debt.outstanding,
          });
        }
        return result;
      });
    },
  };
}
export type KhataService = ReturnType<typeof createKhataService>;
