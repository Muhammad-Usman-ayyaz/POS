import { BaseUnit, Flag, IsoDate, NonNegPaisa, PaymentMethod, PriceType, Qty, TaxRateBp } from '@pos/core';
import { z } from 'zod';
import type {
  AddSizeResult,
  AppState,
  BatchView,
  CatalogueList,
  CreateGroupResult,
  CreatedBrand,
  CreatedCategory,
  CreatedSupplier,
  GroupResult,
  ListedBrand,
  ListedCategory,
  ListedSupplier,
  MovedSize,
  ReceiveResult,
  SizeRow,
  Language,
  ProfitDay,
  RecoveryCodeResult,
  SaleView,
  SalesReturnResult,
  SessionUser,
  SetupResult,
} from './types.js';

// The one list of calls the UI can make. Each channel has a STRICT input schema: an unknown key is an error.
//
// The UI never says WHO is acting. There is no created_by, approved_by or user_id anywhere in these schemas:
// the shell takes the user from the signed-in session. Owner-only actions are plain requests here
// (`price_override: { unit_price }`, `credit_override: true`); the shell checks the role and adds the approver.

const Id = z.uuid();

/** Lower case, no spaces: "Ali" and "ali " are the same user. */
export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'at least 3 characters')
  .max(32, 'at most 32 characters')
  .regex(/^[a-z0-9._-]+$/, 'letters, numbers, dot, dash and underscore only');

/** A new password: at least 8 characters. Not trimmed, spaces are allowed. */
export const NewPassword = z.string().min(8, 'at least 8 characters').max(200);

/** An existing password being checked. No length rule, so an old short password still works. */
export const CurrentPassword = z.string().min(1, 'required').max(200);

export const RecoveryCodeInput = z.string().trim().min(10, 'required').max(48);

export const LanguageSchema = z.enum(['en', 'ur']);

const Name = z.string().trim().min(1, 'required').max(80);

const nothing = z.strictObject({});

// ---------- the product catalogue ----------
// No actor_id, created_by or approved_by anywhere: the shell takes the user from the session. `include_cost` is not an input either:
// the shell adds each size's cost to a list only when the signed-in user is the owner.

const Label = z.string().trim().max(40);
const Code = z.string().trim().max(60).nullish();
const Notes = z.string().trim().max(500);
const FreeName = z.string().trim().min(1, 'required').max(80);

export const SizeInputSchema = z.strictObject({
  pack_label: Label.optional(),
  sku: Code,
  barcode: Code,
  base_unit: BaseUnit,
  /** Base units per pack (a 1 L bottle is 1000 ml). */
  pack_size: z.number().int().positive(),
  allow_loose: Flag.optional(),
  /** Paisa per pack, tax included. */
  retail_price: NonNegPaisa,
  wholesale_price: NonNegPaisa,
  tax_rate_bp: TaxRateBp.optional(),
  /** Base units. The screen shows packs and converts. */
  min_stock: z.number().int().nonnegative().optional(),
});

export const SizeChangesSchema = z.strictObject({
  pack_label: Label.optional(),
  sku: Code,
  barcode: Code,
  base_unit: BaseUnit.optional(),
  pack_size: z.number().int().positive().optional(),
  allow_loose: Flag.optional(),
  retail_price: NonNegPaisa.optional(),
  wholesale_price: NonNegPaisa.optional(),
  tax_rate_bp: TaxRateBp.optional(),
  min_stock: z.number().int().nonnegative().optional(),
});

export const CatalogueListInput = z.strictObject({
  query: z.string().max(100).optional(),
  filter: z.enum(['all', 'low', 'near_expiry', 'expired']).optional(),
  include_inactive: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

/** A new supplier, category or brand typed into a form. At least one name. */
const QuickName = { name_en: FreeName.optional(), name_ur: FreeName.optional() };
const hasAName = (i: { name_en?: string | undefined; name_ur?: string | undefined }) => i.name_en !== undefined || i.name_ur !== undefined;

export const ReceiveStockInput = z.strictObject({
  supplier_id: Id,
  supplier_invoice_no: z.string().trim().min(1).max(60).optional(),
  purchase_date: IsoDate.optional(),
  items: z
    .array(
      z.strictObject({
        product_id: Id,
        batch_no: z.string().trim().min(1).max(60),
        expiry_date: IsoDate,
        /** Base units (the screen turns packs into base units). */
        qty: Qty,
        /** Paisa per pack. */
        cost_price: NonNegPaisa,
      }),
    )
    .min(1),
});

const SaleLine = z.strictObject({
  product_id: Id,
  /** Base units. */
  qty: Qty,
  line_discount: NonNegPaisa.optional(),
  /** Manual batch choice. Leave out for earliest expiry first. */
  batches: z.array(z.strictObject({ batch_id: Id, qty: Qty })).min(1).optional(),
  /** Ask for a different price for this line, in paisa per pack. Owner only. */
  price_override: z.strictObject({ unit_price: NonNegPaisa }).optional(),
});

export const SaleCreateInput = z.strictObject({
  customer_id: Id.optional(),
  price_type: PriceType.optional(),
  due_date: IsoDate.optional(),
  paid_amount: NonNegPaisa,
  payment_method: PaymentMethod.optional(),
  reference_no: z.string().min(1).max(60).optional(),
  /** Ask to go over the customer's credit limit for this sale. Owner only. */
  credit_override: z.literal(true).optional(),
  lines: z.array(SaleLine).min(1),
});

export const SalesReturnCreateInput = z.strictObject({
  invoice_id: Id,
  reason: z.string().min(1).max(200).optional(),
  refund_method: z.enum(['cash', 'khata_credit']),
  items: z
    .array(z.strictObject({ invoice_item_id: Id, qty: Qty, condition: z.enum(['resellable', 'damaged', 'expired']) }))
    .min(1),
});

/** channel -> input schema. Add a channel here first, then implement it in the shell. */
export const contract = {
  'app:getState': { input: nothing },

  'setup:createShop': {
    input: z.strictObject({ shopName: Name, ownerName: Name, username: Username, password: NewPassword }),
  },

  'auth:login': { input: z.strictObject({ username: Username, password: CurrentPassword }) },
  'auth:logout': { input: nothing },
  'auth:me': { input: nothing },
  'auth:regenerateRecoveryCode': { input: z.strictObject({ password: CurrentPassword }) },
  'auth:resetOwnerPassword': {
    input: z.strictObject({ username: Username, recoveryCode: RecoveryCodeInput, newPassword: NewPassword }),
  },

  'prefs:setLanguage': { input: z.strictObject({ language: LanguageSchema }) },

  'sale:create': { input: SaleCreateInput },
  'salesReturn:create': { input: SalesReturnCreateInput },

  'stock:batchesOf': { input: z.strictObject({ productId: Id, includeCost: z.boolean().optional() }) },
  'stock:openingStock': {
    input: z.strictObject({
      product_id: Id,
      supplier_id: Id.optional(),
      batch_no: z.string().trim().min(1).max(60),
      expiry_date: IsoDate,
      cost_price: NonNegPaisa,
      qty: Qty,
    }),
  },
  'stock:adjust': {
    input: z.strictObject({ batch_id: Id, qty_delta: z.number().int().refine((n) => n !== 0, { message: 'cannot be 0' }) }),
  },
  'stock:writeOff': { input: z.strictObject({ batch_id: Id, qty: Qty, kind: z.enum(['damage', 'expired']) }) },

  'catalogue:list': { input: CatalogueListInput },
  'catalogue:createGroup': {
    input: z
      .strictObject({
        name_en: FreeName.optional(),
        name_ur: FreeName.optional(),
        category_id: Id.nullish(),
        brand_id: Id.nullish(),
        notes: Notes.nullish(),
        sizes: z.array(SizeInputSchema).max(40).optional(),
      })
      .refine(hasAName, { message: 'Enter an English or an Urdu name' }),
  },
  'catalogue:updateGroup': {
    input: z.strictObject({
      group_id: Id,
      name_en: FreeName.nullable().optional(),
      name_ur: FreeName.nullable().optional(),
      category_id: Id.nullable().optional(),
      brand_id: Id.nullable().optional(),
      notes: Notes.nullable().optional(),
    }),
  },
  'catalogue:addSize': {
    input: z.strictObject({ group_id: Id, size: SizeInputSchema, existing_size_label: Label.optional() }),
  },
  'catalogue:updateSize': { input: z.strictObject({ product_id: Id, changes: SizeChangesSchema }) },
  'catalogue:setSizeActive': { input: z.strictObject({ id: Id, is_active: z.boolean() }) },
  'catalogue:setGroupActive': { input: z.strictObject({ id: Id, is_active: z.boolean() }) },
  'catalogue:moveSize': {
    input: z.strictObject({ product_id: Id, to_group_id: Id, pack_label: Label.optional(), existing_size_label: Label.optional() }),
  },

  'stock:receive': { input: ReceiveStockInput },

  'suppliers:list': { input: nothing },
  'suppliers:create': {
    input: z
      .strictObject({ ...QuickName, phone: z.string().trim().max(40).optional(), address: z.string().trim().max(200).optional() })
      .refine(hasAName, { message: 'Enter an English or an Urdu name' }),
  },
  'categories:list': { input: nothing },
  'categories:create': { input: z.strictObject(QuickName).refine(hasAName, { message: 'Enter an English or an Urdu name' }) },
  'brands:list': { input: nothing },
  'brands:create': { input: z.strictObject(QuickName).refine(hasAName, { message: 'Enter an English or an Urdu name' }) },

  'khata:setOpeningBalance': {
    input: z.strictObject({ customer_id: Id, amount: z.number().int().refine((n) => n !== 0, { message: 'cannot be 0' }) }),
  },

  'reports:profitByDay': { input: z.strictObject({ from: IsoDate, to: IsoDate }) },
} as const;

export type Channel = keyof typeof contract;
export const channels = Object.keys(contract) as Channel[];

/** What the UI passes in. */
export type Input<C extends Channel> = z.input<(typeof contract)[C]['input']>;
/** What the shell hands to the handler after validation (defaults applied, strings trimmed). */
export type ParsedInput<C extends Channel> = z.output<(typeof contract)[C]['input']>;

/** What each channel returns. */
export interface Outputs {
  'app:getState': AppState;
  'setup:createShop': SetupResult;
  'auth:login': SessionUser;
  'auth:logout': null;
  'auth:me': SessionUser | null;
  'auth:regenerateRecoveryCode': RecoveryCodeResult;
  'auth:resetOwnerPassword': RecoveryCodeResult;
  'prefs:setLanguage': Language;
  'sale:create': SaleView;
  'salesReturn:create': SalesReturnResult;
  'stock:batchesOf': BatchView[];
  'stock:openingStock': { batch_id: string };
  'stock:adjust': null;
  'stock:writeOff': null;
  'catalogue:list': CatalogueList;
  'catalogue:createGroup': CreateGroupResult;
  'catalogue:updateGroup': GroupResult;
  'catalogue:addSize': AddSizeResult;
  'catalogue:updateSize': SizeRow;
  'catalogue:setSizeActive': null;
  'catalogue:setGroupActive': null;
  'catalogue:moveSize': MovedSize;
  'stock:receive': ReceiveResult;
  'suppliers:list': ListedSupplier[];
  'suppliers:create': CreatedSupplier;
  'categories:list': ListedCategory[];
  'categories:create': CreatedCategory;
  'brands:list': ListedBrand[];
  'brands:create': CreatedBrand;
  'khata:setOpeningBalance': null;
  'reports:profitByDay': ProfitDay[];
}

export type Output<C extends Channel> = Outputs[C];
