import { z } from 'zod';
import {
  BaseUnit,
  editableMeta,
  Flag,
  hasAName,
  Id,
  IsoDate,
  NAME_MESSAGE,
  NonNegPaisa,
  PriceType,
  syncScope,
  TaxRateBp,
} from './common.js';

const names = { name_en: z.string().min(1).nullable(), name_ur: z.string().min(1).nullable() };

export const Category = z
  .object({ id: Id, ...names, ...syncScope, ...editableMeta })
  .refine(hasAName, { message: NAME_MESSAGE });
export type Category = z.infer<typeof Category>;

export const Brand = z
  .object({ id: Id, ...names, ...syncScope, ...editableMeta })
  .refine(hasAName, { message: NAME_MESSAGE });
export type Brand = z.infer<typeof Brand>;

export const Supplier = z
  .object({ id: Id, ...names, phone: z.string().nullable(), address: z.string().nullable(), ...syncScope, ...editableMeta })
  .refine(hasAName, { message: NAME_MESSAGE });
export type Supplier = z.infer<typeof Supplier>;

export const Customer = z
  .object({
    id: Id,
    ...names,
    phone: z.string().nullable(),
    village: z.string().nullable(),
    /** Paisa the customer may owe. 0 means no limit is set. */
    credit_limit: NonNegPaisa,
    default_price_type: PriceType,
    notes: z.string().nullable(),
    ...syncScope,
    ...editableMeta,
  })
  .refine(hasAName, { message: NAME_MESSAGE });
export type Customer = z.infer<typeof Customer>;

/**
 * What the shopkeeper thinks of as one product, for example "Product A". Its pack sizes (250 ml, 500 ml, 1 L)
 * are `Product` rows, each with its own stock, batches, prices, tax rate, barcode and minimum stock.
 * The group is the source of truth for the names, category and brand that its sizes copy.
 */
export const ProductGroup = z
  .object({
    id: Id,
    ...names,
    category_id: Id.nullable(),
    brand_id: Id.nullable(),
    notes: z.string().nullable(),
    is_active: Flag,
    ...syncScope,
    ...editableMeta,
  })
  .refine(hasAName, { message: NAME_MESSAGE });
export type ProductGroup = z.infer<typeof ProductGroup>;

/**
 * One sellable pack size of a product group. `name_en`, `name_ur`, `category_id` and `brand_id` are DENORMALIZED
 * COPIES of the group's values (name = group name + ' ' + pack_label): the catalogue service writes them, and the
 * view v_product_group_mismatch lists any that drifted.
 */
export const Product = z
  .object({
    id: Id,
    /** Never null in practice: two database triggers refuse a NULL. (The one named exception in the drift test.) */
    group_id: Id,
    /** The size as people say it, "500 ml". Empty only while the group has a single size. */
    pack_label: z.string(),
    category_id: Id.nullable(),
    brand_id: Id.nullable(),
    ...names,
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    base_unit: BaseUnit,
    /** Base units per pack: a 1L bottle is 1000 ml. */
    pack_size: z.number().int().positive(),
    allow_loose: Flag,
    /** Paisa per pack. */
    retail_price: NonNegPaisa,
    wholesale_price: NonNegPaisa,
    tax_rate_bp: TaxRateBp,
    /** In base units. */
    min_stock: z.number().int().nonnegative(),
    is_active: Flag,
    ...syncScope,
    ...editableMeta,
  })
  .refine(hasAName, { message: NAME_MESSAGE });
export type Product = z.infer<typeof Product>;

export const Batch = z.object({
  id: Id,
  product_id: Id,
  supplier_id: Id.nullable(),
  batch_no: z.string().min(1),
  expiry_date: IsoDate,
  /** Paisa per pack. */
  cost_price: NonNegPaisa,
  ...syncScope,
  ...editableMeta,
});
export type Batch = z.infer<typeof Batch>;
