export type DomainErrorCode =
  | 'INVALID_MONEY'
  | 'INVALID_QUANTITY'
  | 'INSUFFICIENT_STOCK'
  | 'WHOLE_PACKS_ONLY'
  | 'BATCH_EXPIRED'
  | 'BATCH_NOT_AVAILABLE'
  | 'ALLOCATION_MISMATCH'
  | 'DISCOUNT_EXCEEDS_LINE'
  | 'OVERPAID'
  | 'CREDIT_NEEDS_CUSTOMER'
  | 'INVOICE_VOIDED'
  | 'ITEM_NOT_ON_INVOICE'
  | 'DUPLICATE_LINE'
  | 'RETURN_EXCEEDS_SOLD'
  | 'EMPTY_RETURN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'PRODUCT_INACTIVE'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'BATCH_CONFLICT'
  | 'OPENING_BALANCE_EXISTS'
  | 'NOT_SUPPORTED'
  | 'NOT_SIGNED_IN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_RECOVERY_CODE'
  | 'ALREADY_SET_UP'
  | 'INTERNAL';

/** Numbers and short strings that explain an error, so the UI can say "Only 3 packs left" in any language. */
export type ErrorParams = Readonly<Record<string, string | number>>;

/** A business rule was broken. Services and the UI map `code` to a message the shopkeeper can read. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    /** Amounts are paisa, quantities are base units. The UI formats them. */
    readonly params: ErrorParams = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
