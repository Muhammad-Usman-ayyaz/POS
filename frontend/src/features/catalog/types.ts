export type StockStatus = 'Healthy' | 'Low Stock' | 'Out of Stock';
export type ProductStatus = 'Active' | 'Restock Pending' | 'Inactive';

/** Money and quantities arrive from DRF as decimal strings; convert with Number() at display time. */
export interface Product {
  id: number;
  name: string;
  chemical: string;
  sku: string;
  category: number;
  category_name: string;
  brand: number;
  brand_name: string;
  distributor: string;
  packaging: string;
  formulation_type: string;
  stock_unit: string;
  /** null for roles that may not see cost prices (Salesman). */
  purchase_price: string | null;
  selling_price: string;
  min_stock_level: string;
  is_active: boolean;
  current_stock: string;
  stock_status: StockStatus;
  status: ProductStatus;
  margin_pct: number | null;
  expiry_date: string | null;
  batch_no: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  name: string;
  chemical: string;
  sku: string;
  category: number;
  brand: number;
  packaging: string;
  purchase_price: string;
  selling_price: string;
  min_stock_level: string;
  opening_quantity?: string;
  opening_batch_no?: string;
  opening_expiry_date?: string | null;
}

export interface NamedRef {
  id: number;
  name: string;
}

export interface ProductSummary {
  total_products: number;
  stock_value: string | null;
  weighted_margin_pct: number | null;
  low_stock_count: number;
  out_of_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  expiry_warning_days: number;
}
