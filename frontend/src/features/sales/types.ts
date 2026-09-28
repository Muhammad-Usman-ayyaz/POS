export type SalePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'KHATA';

export const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  EASYPAISA: 'Easypaisa',
  JAZZCASH: 'JazzCash',
  KHATA: 'Khata (Credit)',
};

export interface SaleItem {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  batch: number;
  batch_no: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface Sale {
  id: number;
  invoice_no: string;
  customer: number | null;
  customer_name: string | null;
  sale_date: string;
  payment_method: SalePaymentMethod;
  discount_amount: string;
  status: 'COMPLETED' | 'CANCELLED';
  notes: string;
  items: SaleItem[];
  subtotal: string;
  total_amount: string;
  created_by_name: string | null;
  created_at: string;
}

export interface SaleLineInput {
  product: number;
  batch: number;
  quantity: number;
  unit_price: number;
}

export interface SaleInput {
  customer?: number | null;
  sale_date: string;
  payment_method: SalePaymentMethod;
  discount_amount?: number;
  notes?: string;
  lines: SaleLineInput[];
}
