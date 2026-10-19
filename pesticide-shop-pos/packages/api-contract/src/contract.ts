import { BaseUnit, Flag, HeldCartSchema, IsoDate, NonNegPaisa, PaymentMethod, PriceType, Qty, TaxRateBp } from '@pos/core';
import { z } from 'zod';
import type {
  AddSizeResult,
  ApprovalGrant,
  AppState,
  CustomerMatch,
  InvoiceDetail,
  InvoiceDocumentData,
  InvoiceList,
  PrintConfig,
  PrinterInfo,
  PrintResult,
  SaleQuoteView,
  BatchView,
  CatalogueList,
  CreateGroupResult,
  CreatedBrand,
  CreatedCategory,
  CreatedSupplier,
  GroupResult,
  HeldBillSummary,
  ResumedHeldBill,
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
  // M2 (Phase 6) customers, payments, statement
  CustomerListView,
  CustomerSummaryView,
  DuplicateMatchView,
  CustomerTermsView,
  CustomerSettingsView,
  CustomerPaymentView,
  StatementView,
  ExportStatementResult,
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
  /** Only this product (the edit screen). */
  group_id: Id.optional(),
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
  /** True after the owner has confirmed "this receipt is dated N days ago" (needed past 30 days). */
  confirm_old_date: z.boolean().optional(),
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

/** What a sale needs from the owner when it is not the owner who sells. */
export const ApprovalActionSchema = z.enum(['credit_override', 'price_override', 'discount_override']);
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

const SaleFields = {
  customer_id: Id.optional(),
  price_type: PriceType.optional(),
  due_date: IsoDate.optional(),
  payment_method: PaymentMethod.optional(),
  reference_no: z.string().min(1).max(60).optional(),
  /** Ask to go over the customer's credit limit for this sale. Owner only (or approved by the owner with a token). */
  credit_override: z.literal(true).optional(),
  lines: z.array(SaleLine).min(1),
};

export const SaleCreateInput = z.strictObject({
  ...SaleFields,
  paid_amount: NonNegPaisa,
  /**
   * The screen's id for THIS attempt to complete the sale (a new one for each bill; kept for a retry). The same id again returns the invoice
   * already made instead of making another, even after a restart.
   */
  request_id: z.string().min(8).max(100).optional(),
  /** The owner's approval, from `approval:request`, when someone other than the owner sells over the limit, at another price, or with a big discount. */
  approval_token: z.string().min(16).max(200).optional(),
});

/** A cart to price and check without selling it. `paid_amount` left out means paid in full. */
export const SaleQuoteInput = z.strictObject({ ...SaleFields, paid_amount: NonNegPaisa.optional() });

/** The cart and the amount an approval is for. It is worthless for any other cart or amount. */
export const ApprovalSubjectSchema = z.strictObject({
  customer_id: Id.optional(),
  price_type: PriceType.optional(),
  paid_amount: NonNegPaisa,
  lines: z.array(SaleLine).min(1),
});

export const ApprovalRequestInput = z.strictObject({
  /** The owner's own username and password, typed at the counter. */
  username: Username,
  password: CurrentPassword,
  actions: z.array(ApprovalActionSchema).min(1).max(3),
  sale: ApprovalSubjectSchema,
});

export const CustomerSearchInput = z.strictObject({
  query: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const SalesReturnCreateInput = z.strictObject({
  invoice_id: Id,
  reason: z.string().min(1).max(200).optional(),
  refund_method: z.enum(['cash', 'khata_credit']),
  items: z
    .array(z.strictObject({ invoice_item_id: Id, qty: Qty, condition: z.enum(['resellable', 'damaged', 'expired']) }))
    .min(1),
});

// ---------- invoices and printing ----------
// No user id anywhere: the shell takes the signed-in user from the session. Nothing here (or in its replies) carries a cost.
const Language2 = z.enum(['en', 'ur']);
export const DocumentKindSchema = z.enum(['receipt', 'invoice']);

export const InvoiceListInput = z.strictObject({
  /** The invoice number, or part of the customer's name (English or Urdu) or phone. */
  query: z.string().max(100).optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  customer_id: Id.optional(),
  status: z.enum(['active', 'voided']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const PrintDocumentInput = z.strictObject({
  invoice_id: Id,
  /** 'receipt' is the 80 mm thermal slip, 'invoice' the A4 page. */
  kind: DocumentKindSchema,
  /** Left out: the language chosen in the print settings for this kind of document. */
  language: Language2.optional(),
  /** 'pdf' skips the printer and makes a PDF file. 'printer' falls back to a PDF by itself when there is no printer or printing fails. */
  output: z.enum(['printer', 'pdf']).optional(),
});

export const PrintConfigInput = z.strictObject({
  /** The shop's English name (the owner edits it here; there is no other channel). Never empty. */
  shop_name: z.string().trim().min(1).max(80).optional(),
  /** Which document the plain Print action prints. */
  print_format: z.enum(['80mm', 'a4']).optional(),
  /** Printed at the bottom of both documents. '' clears it (the standard thank-you line comes back). */
  receipt_footer: z.string().trim().max(200).optional(),
  printer_name: z.string().trim().max(200).nullable().optional(),
  receipt_language: Language2.optional(),
  invoice_language: Language2.optional(),
  shop_name_ur: z.string().trim().max(80).nullable().optional(),
  shop_address: z.string().trim().max(200).nullable().optional(),
  shop_phone: z.string().trim().max(40).nullable().optional(),
});

// ---------- held bills ----------
// A bill set aside at the counter, kept in the database. The input is only what the cashier chose (HeldCartSchema, strict): no price, total or
// cost, and no user id: the shell takes the holder from the session. Any signed-in user may use these; the list says who held each bill.
export const HoldBillInput = HeldCartSchema;
export const HeldBillIdInput = z.strictObject({ id: Id });

// ---------- BEGIN Phase 6 M2: customers, payments, statement ----------
// Still no created_by / actor / approved_by / user_id / privileged / role anywhere: the shell takes the user from the session and works out
// `privileged` (is the session user the owner?) itself. A staff `customers:create` that carries an owner-only field is refused by the core
// with FIELD_NOT_ALLOWED, so the owner-only fields ARE in the create schema (an unknown key would be INVALID_INPUT instead).

/** Largest amount accepted from a screen, in paisa (Rs 10 billion): far above any real shop, far below the safe-integer limit. */
export const MAX_PAISA = 1_000_000_000_000;
const PositivePaisa = z.number().int().positive().max(MAX_PAISA);
const LimitPaisa = z.number().int().min(0).max(MAX_PAISA);

const PersonName = z.string().trim().max(120);
const PhoneText = z.string().trim().max(30);
const VillageText = z.string().trim().max(80);
const CustomerNotes = z.string().trim().max(500);
const PaymentNote = z.string().trim().max(200);
const ReferenceText = z.string().trim().max(100);
const Version = z.number().int().min(1).max(2_000_000_000);

/** A real calendar day, YYYY-MM-DD. */
const CalendarDay = IsoDate.refine((d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}, { message: 'not a real date' });

/** Contact fields. null clears a field on update. */
const ContactFields = {
  name_en: PersonName.nullable().optional(),
  name_ur: PersonName.nullable().optional(),
  phone: PhoneText.nullable().optional(),
  village: VillageText.nullable().optional(),
  notes: CustomerNotes.nullable().optional(),
};
const FarmerFields = {
  father_name: PersonName.nullable().optional(),
  cnic: PhoneText.nullable().optional(),
  phone2: PhoneText.nullable().optional(),
  guarantor: PersonName.nullable().optional(),
};

export const CustomerListInput = z.strictObject({
  query: z.string().max(100).optional(),
  filter: z.enum(['all', 'owes', 'overdue', 'advance']).optional(),
  sort: z.enum(['name', 'balance', 'overdue', 'next_due']).optional(),
  name_language: z.enum(['en', 'ur']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});
export const CustomerDuplicatesInput = z.strictObject({
  name_en: PersonName.nullish(),
  name_ur: PersonName.nullish(),
  phone: PhoneText.nullish(),
});
export const CustomerCreateInput = z.strictObject({
  fields: z.strictObject({ ...ContactFields, ...FarmerFields, credit_limit: LimitPaisa.optional(), default_price_type: PriceType.optional() }),
  /** True after the screen showed the "already exists" warning and the user chose Save as new. */
  confirm_duplicate: z.boolean().optional(),
});
export const CustomerUpdateInput = z.strictObject({
  customer_id: Id,
  /** Contact fields only: terms go through `customers:setTerms`. */
  fields: z.strictObject(ContactFields),
  expected_version: Version,
});
export const CustomerTermsInput = z.strictObject({
  customer_id: Id,
  /** Paisa. 0 means no limit. */
  credit_limit: LimitPaisa,
  default_price_type: PriceType,
  ...FarmerFields,
  expected_version: Version,
});
export const CustomerSettingsSetInput = z.strictObject({
  default_credit_limit: LimitPaisa.optional(),
  show_farmer_fields: z.boolean().optional(),
});
export const PaymentReceiveInput = z.strictObject({
  customer_id: Id,
  /** Paisa, a whole number above zero. */
  amount: PositivePaisa,
  method: PaymentMethod,
  /** Needed for bank, Easypaisa and JazzCash (the core refuses without it: REFERENCE_REQUIRED). */
  reference_no: ReferenceText.optional(),
  note: PaymentNote.optional(),
  /** True after the screen asked "this is more than the customer owes, take it as an advance?". */
  confirm_advance: z.boolean().optional(),
});
export const StatementInput = z
  .strictObject({ customer_id: Id, from: CalendarDay.optional(), to: CalendarDay.optional() })
  .refine((i) => i.from === undefined || i.to === undefined || i.from <= i.to, { message: 'from must not be after to', path: ['from'] });
// ---------- END Phase 6 M2 ----------

// ---------- BEGIN Phase 6 M6: statement and payment receipt printing, CSV export ----------
// Like every request: no created_by / actor / user_id (the shell takes the user from the session). `kind` is the paper: 'receipt' is 80 mm, 'invoice' is A4.
export const PrintStatementInput = z
  .strictObject({
    customer_id: Id,
    from: CalendarDay.optional(),
    to: CalendarDay.optional(),
    kind: DocumentKindSchema,
    /** Left out: the language chosen in the print settings for that paper. */
    language: Language2.optional(),
    /** 'pdf' skips the printer and makes a PDF file. 'printer' falls back to a PDF by itself. */
    output: z.enum(['printer', 'pdf']).optional(),
  })
  .refine((i) => i.from === undefined || i.to === undefined || i.from <= i.to, { message: 'from must not be after to', path: ['from'] });
export const PrintPaymentReceiptInput = z.strictObject({ payment_id: Id, language: Language2.optional(), output: z.enum(['printer', 'pdf']).optional() });
export const ExportStatementInput = z
  .strictObject({ customer_id: Id, from: CalendarDay.optional(), to: CalendarDay.optional() })
  .refine((i) => i.from === undefined || i.to === undefined || i.from <= i.to, { message: 'from must not be after to', path: ['from'] });
// ---------- END Phase 6 M6 ----------

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

  'sale:quote': { input: SaleQuoteInput },
  'sale:create': { input: SaleCreateInput },
  'customers:search': { input: CustomerSearchInput },
  'approval:request': { input: ApprovalRequestInput },
  'salesReturn:create': { input: SalesReturnCreateInput },

  'invoices:list': { input: InvoiceListInput },
  'invoices:get': { input: z.strictObject({ invoice_id: Id }) },
  'invoices:receipt': { input: z.strictObject({ invoice_id: Id, kind: DocumentKindSchema.optional() }) },
  'print:document': { input: PrintDocumentInput },
  'printers:list': { input: nothing },
  'print:getConfig': { input: nothing },
  'print:setConfig': { input: PrintConfigInput },

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

  // held bills
  'bills:hold': { input: HoldBillInput },
  'bills:list': { input: nothing },
  'bills:resume': { input: HeldBillIdInput },
  'bills:discard': { input: HeldBillIdInput },
  // ---------- BEGIN Phase 6 M2 ----------
  'customers:list': { input: CustomerListInput },
  'customers:get': { input: z.strictObject({ customer_id: Id }) },
  'customers:findDuplicates': { input: CustomerDuplicatesInput },
  'customers:create': { input: CustomerCreateInput },
  'customers:update': { input: CustomerUpdateInput },
  'customers:setTerms': { input: CustomerTermsInput },
  'customers:getSettings': { input: nothing },
  'customers:setSettings': { input: CustomerSettingsSetInput },
  'payments:receive': { input: PaymentReceiveInput },
  'khata:statement': { input: StatementInput },
  // ---------- END Phase 6 M2 ----------
  // ---------- BEGIN Phase 6 M6 ----------
  'print:statement': { input: PrintStatementInput },
  'print:paymentReceipt': { input: PrintPaymentReceiptInput },
  'khata:exportStatement': { input: ExportStatementInput },
  // ---------- END Phase 6 M6 ----------
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
  'sale:quote': SaleQuoteView;
  'sale:create': SaleView;
  'customers:search': CustomerMatch[];
  'approval:request': ApprovalGrant;
  'salesReturn:create': SalesReturnResult;
  'invoices:list': InvoiceList;
  'invoices:get': InvoiceDetail;
  'invoices:receipt': InvoiceDocumentData;
  'print:document': PrintResult;
  'printers:list': PrinterInfo[];
  'print:getConfig': PrintConfig;
  'print:setConfig': PrintConfig;
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
  'bills:hold': { id: string };
  'bills:list': HeldBillSummary[];
  'bills:resume': ResumedHeldBill;
  'bills:discard': null;
  // ---------- BEGIN Phase 6 M2 ----------
  'customers:list': CustomerListView;
  'customers:get': CustomerSummaryView;
  'customers:findDuplicates': DuplicateMatchView[];
  'customers:create': CustomerSummaryView;
  'customers:update': CustomerSummaryView;
  'customers:setTerms': CustomerTermsView;
  'customers:getSettings': CustomerSettingsView;
  'customers:setSettings': CustomerSettingsView;
  'payments:receive': CustomerPaymentView;
  'khata:statement': StatementView;
  // ---------- END Phase 6 M2 ----------
  // ---------- BEGIN Phase 6 M6 ----------
  'print:statement': PrintResult;
  'print:paymentReceipt': PrintResult;
  'khata:exportStatement': ExportStatementResult;
  // ---------- END Phase 6 M6 ----------
}

export type Output<C extends Channel> = Outputs[C];
