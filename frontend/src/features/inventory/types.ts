export type MovementType =
  | 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGED' | 'EXPIRED' | 'PURCHASE_REVERSED';

export const ADJUSTMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: 'ADJUSTMENT_IN', label: 'Stock Adjustment (Add)' },
  { value: 'ADJUSTMENT_OUT', label: 'Stock Adjustment (Remove)' },
  { value: 'DAMAGED', label: 'Damaged Stock' },
  { value: 'EXPIRED', label: 'Expired Stock' },
];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE_IN: 'Purchase Received',
  SALE_OUT: 'Sold',
  ADJUSTMENT_IN: 'Adjustment (Add)',
  ADJUSTMENT_OUT: 'Adjustment (Remove)',
  DAMAGED: 'Damaged Stock',
  EXPIRED: 'Expired Stock',
  PURCHASE_REVERSED: 'Purchase Cancelled',
};

export interface BatchStock {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  category_name: string;
  brand_name: string;
  packaging: string;
  stock_unit: string;
  batch_no: string;
  expiry_date: string | null;
  quantity: string;
  min_stock_level: string;
  /** null for roles that may not see cost (Salesman). */
  purchase_price: string | null;
  selling_price: string;
}

export interface StockMovement {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  batch: number;
  batch_no: string;
  movement_type: MovementType;
  quantity: string;
  balance_after: string;
  reference: string;
  note: string;
  created_by_name: string | null;
  created_at: string;
}

export interface AdjustmentInput {
  batch: number;
  movement_type: MovementType;
  quantity: string;
  note?: string;
}
