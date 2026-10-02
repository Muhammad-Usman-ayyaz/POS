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

export const Product = z
  .object({
    id: Id,
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
