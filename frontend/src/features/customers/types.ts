export interface Customer {
  id: number;
  name: string;
  phone: string;
  cnic: string;
  village: string;
  address: string;
  credit_limit: string;
  notes: string;
  total_charged: string;
  total_paid: string;
  outstanding_balance: string;
  over_credit_limit: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerInput {
  name: string;
  phone: string;
  cnic: string;
  village: string;
  address: string;
  credit_limit: string;
  notes: string;
}
