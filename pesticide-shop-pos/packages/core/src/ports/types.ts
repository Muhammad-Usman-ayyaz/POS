import type { Batch } from '../schemas/index.js';

/**
 * A row as a service writes it. The database owns `created_at`, `updated_at`, `deleted_at` and `version`,
 * so a service cannot set them: the type does not allow it, and the test fakes refuse them at runtime.
 */
export type NewRow<T> = Omit<T, 'created_at' | 'updated_at' | 'deleted_at' | 'version'>;

/** A batch with its current stock: the sum of its stock movements, in base units. */
export type BatchWithStock = Batch & { stock: number };

/** Which shop, branch and device is running. Written onto every syncable row. */
export interface DeviceScope {
  shop_id: string;
  branch_id: string;
  device_id: string;
}

/** Numbered documents. Numbers come from `number_sequences`, one counter per device. */
export type DocumentSequence = 'invoice' | 'return' | 'purchase';

/** Primary keys are UUIDs made by the app. Core never calls crypto itself. */
export interface IdGenerator {
  newId(): string;
}

/**
 * The next number for a document, like `INV-A-000123`. It belongs to the unit of work, so a rolled-back
 * sale does not use up a number.
 */
export interface DocumentNumbers {
  next(sequence: DocumentSequence): string;
}
