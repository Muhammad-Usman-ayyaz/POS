// The rules behind Receive payment, without React: what is wrong with the box, and the request it sends. Exposed through `@pos/ui/rules` so
// the desktop tests send the dialog's own requests through the real handlers. Money is typed in rupees and sent as whole paisa
// (`parseRupees`). No user, role or created_by is ever sent: the shell takes the user from the session.
import type { Api } from '@pos/api-contract';
import { parseRupees } from '../../products/product-form-state.js';

export type PayMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash';
export const PAY_METHODS: readonly PayMethod[] = ['cash', 'bank', 'easypaisa', 'jazzcash'];
/** The method the box starts on. */
export const DEFAULT_METHOD: PayMethod = 'cash';
export const NOTE_MAX = 200;
type ReceiveInput = Parameters<Api['payments']['receive']>[0];

export interface PaymentDraft {
  /** Rupees as typed. */
  amount: string;
  method: PayMethod;
  reference: string;
  note: string;
}
export const blankPayment = (): PaymentDraft => ({ amount: '', method: DEFAULT_METHOD, reference: '', note: '' });

export interface PaymentProblems {
  amount: boolean;
  reference: boolean;
  note: boolean;
}

/** The amount in paisa, or null when it is not an amount above zero. */
export function amountPaisa(draft: Pick<PaymentDraft, 'amount'>): number | null {
  const p = parseRupees(draft.amount);
  return p !== null && p > 0 ? p : null;
}

export function checkPayment(d: PaymentDraft): PaymentProblems {
  return {
    amount: amountPaisa(d) === null,
    reference: d.method !== 'cash' && d.reference.trim() === '',
    note: d.note.trim().length > NOTE_MAX,
  };
}
export const hasPaymentProblems = (p: PaymentProblems): boolean => p.amount || p.reference || p.note;

/**
 * The payment request: the amount in paisa, the method, the reference (trimmed; only for a non-cash method) and the note (trimmed, only when
 * written). `confirm_advance: true` is sent ONLY when the cashier ticked the advance box.
 */
export function buildReceiveRequest(customerId: string, d: PaymentDraft, opts: { confirmAdvance: boolean }): ReceiveInput {
  const amount = amountPaisa(d) as number;
  return {
    customer_id: customerId,
    amount,
    method: d.method,
    ...(d.method !== 'cash' && d.reference.trim() ? { reference_no: d.reference.trim() } : {}),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    ...(opts.confirmAdvance ? { confirm_advance: true } : {}),
  };
}
