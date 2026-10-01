import { z } from 'zod';

// Entity field names match the database columns exactly, so repositories need no mapping layer.
// Flags are 0 or 1 as stored. Money is integer paisa. Quantities are integers in the base unit.

export const Id = z.uuid();
export const Flag = z.union([z.literal(0), z.literal(1)]);

/** Money in paisa. Never a float. */
export const Paisa = z.number().int();
export const NonNegPaisa = Paisa.nonnegative();
/** Quantity in the base unit (ml, g or piece). */
export const Qty = z.number().int().positive();
/** Tax rate in basis points: 1800 is 18 percent. */
export const TaxRateBp = z.number().int().min(0).max(10_000);

/** `YYYY-MM-DD` */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
/** UTC ISO text, e.g. 2026-10-01T13:15:39.849Z */
export const IsoDateTime = z.string().min(1);

export const BaseUnit = z.enum(['ml', 'g', 'piece']);
export const PriceType = z.enum(['retail', 'wholesale']);
export const PaymentMethod = z.enum(['cash', 'bank', 'easypaisa', 'jazzcash']);
export const PartyType = z.enum(['customer', 'supplier']);
export const Role = z.enum(['owner', 'staff']);

/** Which shop, branch and device wrote the row. Present on syncable tables. */
export const syncScope = {
  shop_id: Id,
  branch_id: Id,
  device_id: Id,
};

/** Maintained by the database. App code never sets these. */
export const editableMeta = {
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
  version: z.number().int().min(1),
};

/** Line and append-only tables: no updated_at or deleted_at. */
export const lineMeta = {
  created_at: IsoDateTime,
  version: z.number().int().min(1),
};

/** At least one of English or Urdu name, same as the database CHECK. */
export const hasAName = (d: { name_en: string | null; name_ur: string | null }): boolean => d.name_en !== null || d.name_ur !== null;
export const NAME_MESSAGE = 'Enter an English or an Urdu name';
