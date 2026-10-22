import type { Batch, Customer, LedgerEntry, Product, ProductGroup } from '../schemas/index.js';

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

/** What a size is stocked with: base units, summed over its live batches. `stock_sellable` leaves out expired batches. */
export interface SizeStock {
  stock_total: number;
  stock_sellable: number;
}

/**
 * Everything the Products screen needs to know about one size's stock, worked out from its batches and movements.
 * Base units for quantities, paisa per pack for cost, `YYYY-MM-DD` for dates.
 */
export interface SizeStatus {
  stock_total: number;
  /** Stock in batches that have not expired. */
  stock_sellable: number;
  /** Stock still sitting in batches that HAVE expired. */
  expired_stock: number;
  /** The earliest expiry among batches that still have stock, expired ones included. Null when nothing is in stock. */
  next_expiry: string | null;
  /** The earliest expiry among batches that still have stock and have not expired. */
  next_sellable_expiry: string | null;
  /** Live batches this size has ever had (with or without stock). Any batch locks the pack size. */
  batch_count: number;
  /** Live batches that still have stock. */
  stocked_batch_count: number;
  /** Cost per pack of the batch that sells first (earliest unexpired batch with stock). Null when there is none. OWNER ONLY. */
  next_cost: number | null;
}

/** A product group with its live sizes and NO stock figures. Changes only when the catalogue is edited, not when stock moves. */
export interface CatalogueGroup {
  group: ProductGroup;
  /** Live sizes only (not soft-deleted), smallest pack first. Inactive sizes are included. */
  sizes: Product[];
}

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
export type DocumentSequence = 'invoice' | 'return' | 'purchase' | 'payment';

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

/** Columns of a customer a service may change. The database owns version and updated_at. */
export type CustomerPatch = Partial<
  Pick<Customer, 'name_en' | 'name_ur' | 'phone' | 'village' | 'notes' | 'credit_limit' | 'default_price_type' | 'father_name' | 'cnic' | 'phone2' | 'guarantor' | 'land_size' | 'crop'>
>;

/**
 * One ledger row of a customer with the data a statement shows next to it. Every extra is NULL when it does not apply
 * (an opening balance has no invoice number; only a payment has a method, a reference and a receipt number).
 */
export interface LedgerDisplayRow {
  entry: LedgerEntry;
  /** For a sale row (`invoice`). */
  invoice_no: string | null;
  return_no: string | null;
  payment_method: string | null;
  reference_no: string | null;
  receipt_no: string | null;
  note: string | null;
}
