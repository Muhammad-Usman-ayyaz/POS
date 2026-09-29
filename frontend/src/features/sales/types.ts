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
  /** How much was paid at the counter; the rest (`balance`) was charged to khata. */
  paid_amount: string;
  /** total_amount - paid_amount. Zero for an ordinary fully-paid sale. */
  balance: string;
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
  /** Omit to pay the full total now (the ordinary case); a lower amount splits the rest to khata
   * credit (requires `customer`). Ignored (forced to 0) when payment_method is KHATA. */
  paid_amount?: number;
  notes?: string;
  lines: SaleLineInput[];
}
