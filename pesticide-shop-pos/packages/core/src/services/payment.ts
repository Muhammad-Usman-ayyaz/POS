import { z } from 'zod';
import { nowIso } from '../clock.js';
import { Id, PaymentMethod } from '../schemas/common.js';
import { activeUser, liveCustomer, liveSupplier, parseInput, rowFactory, type ServiceDeps } from './support.js';

const PaymentInput = z.object({
  party_id: Id,
  /** Paisa, more than zero. */
  amount: z.number().int().positive(),
  method: PaymentMethod,
  reference_no: z.string().min(1).optional(),
  created_by: Id,
});
export type PaymentInput = z.input<typeof PaymentInput>;

export function createPaymentService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  function record(party_type: 'customer' | 'supplier', rawInput: PaymentInput): string {
    const input = parseInput(PaymentInput, rawInput);
    return deps.uow.run((tx) => {
      const now = nowIso(deps.clock);
      activeUser(tx, input.created_by);
      if (party_type === 'customer') liveCustomer(tx, input.party_id);
      else liveSupplier(tx, input.party_id);

      const payment = rows.payment({
        party_type,
        party_id: input.party_id,
        method: input.method,
        ...(input.reference_no ? { reference_no: input.reference_no } : {}),
        amount: input.amount,
        direction: party_type === 'customer' ? 'in' : 'out',
        paid_at: now,
        created_by: input.created_by,
      });
      tx.payments.insert(payment);
      tx.ledger.insert(
        rows.ledger({ party_type, party_id: input.party_id, entry_type: 'payment', amount_delta: -input.amount, ref_type: 'payment', ref_id: payment.id, entry_date: now, created_by: input.created_by }),
      );
      return payment.id;
    });
  }

  return {
    /**
     * Money received from a customer: `payments` (in) and a `payment` ledger row with the amount as a minus.
     * It reduces the customer's overall balance, not one invoice. Paying more than is owed leaves the
     * customer with a credit (a negative balance); nothing in the rules forbids that.
     */
    receiveFromCustomer: (input: PaymentInput): string => record('customer', input),

    /** Money paid to a supplier: `payments` (out) and a `payment` ledger row with the amount as a minus. */
    payToSupplier: (input: PaymentInput): string => record('supplier', input),
  };
}
export type PaymentService = ReturnType<typeof createPaymentService>;
