import { IsoDate, NonNegPaisa, PaymentMethod, PriceType, Qty } from '@pos/core';
import { z } from 'zod';
import type {
  AppState,
  BatchView,
  Language,
  ProfitDay,
  RecoveryCodeResult,
  SaleResult,
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
  'sale:create': SaleResult;
  'salesReturn:create': SalesReturnResult;
  'stock:batchesOf': BatchView[];
  'stock:openingStock': { batch_id: string };
  'stock:adjust': null;
  'stock:writeOff': null;
  'khata:setOpeningBalance': null;
  'reports:profitByDay': ProfitDay[];
}

export type Output<C extends Channel> = Outputs[C];
