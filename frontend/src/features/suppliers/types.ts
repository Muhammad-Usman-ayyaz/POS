export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  notes: string;
  /** Sum of received purchases' line totals, all-time. */
  total_purchased: string;
  /** total_purchased - payments made, across received (non-cancelled) purchases. */
  outstanding_balance: string;
  purchase_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  notes: string;
}
