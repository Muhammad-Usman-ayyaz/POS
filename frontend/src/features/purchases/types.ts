export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH';
export type PurchaseStatus = 'RECEIVED' | 'CANCELLED';

export interface PurchaseItem {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  batch_no: string;
  expiry_date: string | null;
  quantity: string;
  unit_cost: string;
  line_total: string;
}

export interface SupplierPayment {
  id: number;
  purchase: number;
  amount: string;
  method: PaymentMethod;
  paid_on: string;
  note: string;
  created_by_name: string | null;
  created_at: string;
}

export interface Purchase {
  id: number;
  supplier: number;
  supplier_name: string;
  invoice_no: string;
  purchase_date: string;
  status: PurchaseStatus;
  notes: string;
  items: PurchaseItem[];
  payments: SupplierPayment[];
  total_amount: string;
  paid_amount: string;
  balance: string;
  created_at: string;
}

export interface PurchaseItemInput {
  product: number;
  batch_no: string;
  expiry_date?: string | null;
  quantity: string;
  unit_cost: string;
}

export interface PurchaseInput {
  supplier: number;
  invoice_no: string;
  purchase_date: string;
  notes: string;
  items_input: PurchaseItemInput[];
}

export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  paid_on: string;
  note?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  EASYPAISA: 'Easypaisa',
  JAZZCASH: 'JazzCash',
};
