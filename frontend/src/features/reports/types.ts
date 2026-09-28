export interface RecentSale {
  id: number;
  invoice_no: string;
  customer_name: string;
  total_amount: string;
  sale_date: string;
  payment_method: string;
  status: 'COMPLETED' | 'CANCELLED';
}

export interface DashboardSummary {
  today_sales_total: string;
  today_sales_count: number;
  today_purchases_total: string;
  today_purchases_count: number;
  khata_outstanding_total: string;
  khata_outstanding_customers: number;
  supplier_payables_total: string;
  low_stock_count: number;
  expiring_soon_count: number;
  recent_sales: RecentSale[];
}

export interface TrendPoint {
  date: string;
  total: string;
}

export interface CategoryTotal {
  category: string;
  total: string;
}

export interface TopProduct {
  product: number;
  product_name: string;
  sku: string;
  category_name: string | null;
  quantity: string;
  revenue: string;
}
