export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  EASYPAISA: 'Easypaisa',
  JAZZCASH: 'JazzCash',
};

export interface ChargeInput {
  amount: string;
  description?: string;
  charge_date: string;
}

export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  paid_on: string;
  note?: string;
}

export type LedgerEntryType = 'CHARGE' | 'PAYMENT';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  customer: number;
  customer_name: string;
  amount: string;
  date: string;
  description: string;
  method: PaymentMethod | null;
  method_label: string | null;
  note: string;
  created_by_name: string | null;
  created_at: string;
}
