import type { BatchStockView, Brand, CatalogueList, Category, CustomerMatch, ErrorParams, DomainErrorCode, NewRow, Product, ProductGroup, SaleQuote, SaleResult, SalesReturnResult, Supplier } from '@pos/core';

// What the shell sends back. Plain data only: it crosses a process boundary (structured clone).

export type Language = 'en' | 'ur';
export type Role = 'owner' | 'staff';

/** The signed-in user as the UI sees them. Never carries a password hash. */
export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: Role;
}

/** Which screen the app should show first. */
export type AppPhase = 'needs-setup' | 'needs-login' | 'ready';

export interface AppState {
  phase: AppPhase;
  language: Language;
  shop: { name: string } | null;
  device: { name: string; code: string } | null;
  /** Set when phase is 'ready'. */
  user: SessionUser | null;
}

/** First-launch setup result. The recovery code is shown to the owner once and never again. */
export interface SetupResult {
  user: SessionUser;
  recoveryCode: string;
}

export interface RecoveryCodeResult {
  recoveryCode: string;
}

/** A batch with its stock. The cost is only present when the owner asked for it. */
export type BatchView = Omit<BatchStockView, 'cost_price'> & { cost_price?: number };

export interface ProfitDay {
  /** `YYYY-MM-DD` */
  day: string;
  /** Paisa. */
  revenue: number;
  cost: number;
  profit: number;
}

export type { CatalogueList, SaleResult, SalesReturnResult };

/**
 * A sale as the screen gets it. Each line carries the cost price of its batch (profit uses it), which only the OWNER may see:
 * for anyone else the shell leaves `cost_price` out of every line.
 */
/**
 * A cart priced and checked by the core, without selling it (nothing here carries a cost). `requires_approval` is what the owner would have to
 * approve if the person selling is not the owner: going over the credit limit, a different price, a discount above the staff limit.
 */
export type SaleQuoteView = SaleQuote & { requires_approval: ('credit_override' | 'price_override' | 'discount_override')[] };

/** The owner's approval at the counter: a one-use token for exactly these actions and this cart, good for a minute. */
export interface ApprovalGrant {
  token: string;
  /** ISO date-time. */
  expires_at: string;
  actions: ('credit_override' | 'price_override' | 'discount_override')[];
}

export type { CustomerMatch };

export type SaleView = Omit<SaleResult, 'items'> & { items: (Omit<SaleResult['items'][number], 'cost_price'> & { cost_price?: number })[] };

// ---- catalogue answers (plain data; none carries a cost: cost is only in `catalogue:list` rows, for the owner) ----
export type SizeRow = Product;
export interface CreateGroupResult {
  group: NewRow<ProductGroup>;
  sizes: NewRow<Product>[];
}
export interface GroupResult {
  group: ProductGroup;
  sizes: Product[];
}
export interface AddSizeResult {
  size: NewRow<Product>;
  sizes: Product[];
}
export type MovedSize = Product;
export interface ReceiveResult {
  purchase_id: string;
  /** Paisa. */
  total: number;
  batch_ids: string[];
}
export type ListedSupplier = Supplier;
export type ListedCategory = Category;
export type ListedBrand = Brand;
export type CreatedSupplier = NewRow<Supplier>;
export type CreatedCategory = NewRow<Category>;
export type CreatedBrand = NewRow<Brand>;

/** An input problem: which field, and what is wrong. For showing next to the field. */
export interface InputIssue {
  path: string;
  message: string;
}

export interface ApiErrorPayload {
  code: DomainErrorCode;
  /** English, for logs and developers. The UI shows its own translated text for `code`. */
  message: string;
  params: ErrorParams;
  /** Only for INVALID_INPUT. */
  issues?: InputIssue[];
}

/** Every call returns this instead of throwing, so an error keeps its code across the process boundary. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorPayload };
