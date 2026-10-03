import type { BatchStockView, ErrorParams, DomainErrorCode, SaleResult, SalesReturnResult } from '@pos/core';

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

export type { SaleResult, SalesReturnResult };

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
