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
  | 'EMPTY_RETURN';

/** A business rule was broken. Services and the UI map `code` to a message the shopkeeper can read. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
