export interface CreditPicture {
  /** What the customer may still take on credit. NULL when no limit is set (never 0 or a negative number then). */
  credit_left: number | null;
  /** True when no limit is set: a credit limit of 0 means NO LIMIT (open question 9), not "no credit allowed". */
  no_limit: boolean;
  /** True when the customer owes more than their limit. `credit_left` is then 0, not a negative number. */
  over_limit: boolean;
}

/**
 * Credit left = limit - balance, never below 0. A limit of 0 means no limit. A customer in credit (a negative balance)
 * has more than the whole limit left, which matches the credit check on a sale. Display only: nothing here moves money.
 */
export function creditPicture(creditLimit: number, balance: number): CreditPicture {
  if (creditLimit === 0) return { credit_left: null, no_limit: true, over_limit: false };
  const left = creditLimit - balance;
  if (left < 0) return { credit_left: 0, no_limit: false, over_limit: true };
  return { credit_left: left, no_limit: false, over_limit: false };
}
