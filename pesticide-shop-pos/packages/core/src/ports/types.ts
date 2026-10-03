import type { Batch, Product, ProductGroup } from '../schemas/index.js';

/**
 * A row as a service writes it. The database owns `created_at`, `updated_at`, `deleted_at` and `version`,
 * so a service cannot set them: the type does not allow it, and the test fakes refuse them at runtime.
 */
export type NewRow<T> = Omit<T, 'created_at' | 'updated_at' | 'deleted_at' | 'version'>;

/** A batch with its current stock: the sum of its stock movements, in base units. */
export type BatchWithStock = Batch & { stock: number };

/** Columns of a size (product row) a service may change. The database owns version and updated_at. */
export type ProductPatch = Partial<
  Pick<
    Product,
    'group_id' | 'pack_label' | 'category_id' | 'brand_id' | 'name_en' | 'name_ur' | 'sku' | 'barcode' | 'base_unit' | 'pack_size' | 'allow_loose' | 'retail_price' | 'wholesale_price' | 'tax_rate_bp' | 'min_stock' | 'is_active'
  >
>;

/** Columns of a product group a service may change. */
export type ProductGroupPatch = Partial<Pick<ProductGroup, 'name_en' | 'name_ur' | 'category_id' | 'brand_id' | 'notes' | 'is_active'>>;

/** A size with its stock in base units, summed over its live batches. `stock_sellable` leaves out expired batches. */
export type SizeWithStock = Product & { stock_total: number; stock_sellable: number };

export interface GroupWithSizes {
  group: ProductGroup;
  /** Live sizes only (not soft-deleted), smallest pack first. Inactive sizes are included. */
  sizes: SizeWithStock[];
}

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
