import { z } from 'zod';
import { nowIso } from '../clock.js';
import { DomainError } from '../errors.js';
import type { NewRow } from '../ports/index.js';
import { Id, PaymentMethod } from '../schemas/common.js';
import type { Payment } from '../schemas/index.js';
import { activeUser, liveCustomer, liveSupplier, parseInput, rowFactory, type ServiceDeps } from './support.js';

/** Owners keep it short on purpose: one line on a receipt. */
export const PAYMENT_NOTE_MAX = 200;

const Amount = z.number().int().positive().safe();

const SupplierPaymentInput = z.object({
  party_id: Id,
  /** Paisa, more than zero. */
  amount: Amount,
  method: PaymentMethod,
  reference_no: z.string().min(1).optional(),
  created_by: Id,
});
export type SupplierPaymentInput = z.input<typeof SupplierPaymentInput>;

const CustomerPaymentInput = z.strictObject({
  party_id: Id,
  /** Paisa, a whole number above zero. The payment is dated now: there is no back-dating. */
  amount: Amount,
  method: PaymentMethod,
  /** The bank, Easypaisa or JazzCash transaction reference. Required for those three, optional for cash. */
  reference_no: z.string().max(100).optional(),
  note: z.string().max(PAYMENT_NOTE_MAX).optional(),
  /** Must be true when the payment is more than the customer owes (including when they owe nothing): the customer ends up in credit. */
  confirm_advance: z.boolean().optional(),
  /** Who is taking the payment: the signed-in user, set by the shell, never by the screen. */
  created_by: Id,
});
export type PaymentInput = z.input<typeof CustomerPaymentInput>;

export interface CustomerPaymentResult {
  payment: NewRow<Payment>;
  /** Like RCP-A-000001. */
  receipt_no: string;
  /** What the customer owes after this payment (a minus number means they are in credit). */
  balance_after: number;
  /** True when the customer is in credit after this payment (balance_after below zero). */
  advance: boolean;
}

export function createPaymentService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /**
     * Money received from a customer, in ONE unit of work: a `payments` row (in) with its receipt number and note, and a `payment`
     * ledger row with the amount as a minus. It reduces the customer's overall balance, not one invoice.
     *
     * Rules:
     *  - the amount is a whole number of paisa above zero; the payment is dated now;
     *  - Bank, Easypaisa and JazzCash need a `reference_no`; cash does not;
     *  - paying more than the customer owes (or paying anyone who owes nothing) leaves them in credit, and needs `confirm_advance: true`
     *    or it is refused with ADVANCE_NOT_CONFIRMED; the screen asks, the service enforces;
     *  - the receipt number comes from `tx.numbers.next('payment')` INSIDE the unit of work, so a payment that fails gives its number back;
     *  - no audit row: the `payments` table (append-only, with who and when) is the record of a payment.
     */
    receiveFromCustomer(rawInput: PaymentInput): CustomerPaymentResult {
      const input = parseInput(CustomerPaymentInput, rawInput);
      const reference = input.reference_no?.trim() || undefined; // blank counts as missing
      const note = input.note?.trim() || null;
      if (input.method !== 'cash' && reference === undefined) {
        throw new DomainError('REFERENCE_REQUIRED', `a ${input.method} payment needs its reference number`, { method: input.method });
      }
      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        activeUser(tx, input.created_by);
        liveCustomer(tx, input.party_id);

        const balanceBefore = tx.ledger.balance('customer', input.party_id);
        if (input.amount > balanceBefore && input.confirm_advance !== true) {
          throw new DomainError('ADVANCE_NOT_CONFIRMED', 'this payment is more than the customer owes: confirm it as an advance', {
            amount: input.amount,
            balance: balanceBefore,
          });
        }

        const receipt_no = tx.numbers.next('payment');
        const payment = rows.payment({
          party_type: 'customer',
          party_id: input.party_id,
          method: input.method,
          ...(reference ? { reference_no: reference } : {}),
          amount: input.amount,
          direction: 'in',
          paid_at: now,
          created_by: input.created_by,
          note,
          receipt_no,
        });
        tx.payments.insert(payment);
        tx.ledger.insert(
          rows.ledger({ party_type: 'customer', party_id: input.party_id, entry_type: 'payment', amount_delta: -input.amount, ref_type: 'payment', ref_id: payment.id, entry_date: now, created_by: input.created_by }),
        );
        const balance_after = balanceBefore - input.amount;
        return { payment, receipt_no, balance_after, advance: balance_after < 0 };
      });
    },

    /** Money paid to a supplier: `payments` (out) and a `payment` ledger row with the amount as a minus. */
    payToSupplier(rawInput: SupplierPaymentInput): string {
      const input = parseInput(SupplierPaymentInput, rawInput);
      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        activeUser(tx, input.created_by);
        liveSupplier(tx, input.party_id);
        const payment = rows.payment({
          party_type: 'supplier',
          party_id: input.party_id,
          method: input.method,
          ...(input.reference_no ? { reference_no: input.reference_no } : {}),
          amount: input.amount,
          direction: 'out',
          paid_at: now,
          created_by: input.created_by,
        });
        tx.payments.insert(payment);
        tx.ledger.insert(
          rows.ledger({ party_type: 'supplier', party_id: input.party_id, entry_type: 'payment', amount_delta: -input.amount, ref_type: 'payment', ref_id: payment.id, entry_date: now, created_by: input.created_by }),
        );
        return payment.id;
      });
    },
  };
}
export type PaymentService = ReturnType<typeof createPaymentService>;
