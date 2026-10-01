export type RefundMethod = 'CASH' | 'KHATA_CREDIT';

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: 'Cash Refund',
  KHATA_CREDIT: 'Khata Credit',
};

export interface SalesReturnItem {
  id: number;
  sale_item: number;
  product_name: string;
  sku: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface SalesReturn {
  id: number;
  return_no: string;
  sale: number;
  invoice_no: string;
  customer_name: string | null;
  return_date: string;
  reason: string;
  refund_method: RefundMethod;
  total_amount: string;
  items: SalesReturnItem[];
  created_by_name: string | null;
  created_at: string;
}

export interface ReturnLineInput {
  sale_item: number;
  quantity: number;
}

export interface SalesReturnInput {
  sale: number;
  return_date: string;
  reason?: string;
  refund_method: RefundMethod;
  lines: ReturnLineInput[];
}
