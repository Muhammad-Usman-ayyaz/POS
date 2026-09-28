export type AuditAction =
  | 'SALE_CREATED' | 'SALE_CANCELLED'
  | 'PURCHASE_RECEIVED' | 'PURCHASE_CANCELLED' | 'SUPPLIER_PAYMENT_RECORDED'
  | 'KHATA_CHARGE_RECORDED' | 'KHATA_PAYMENT_RECORDED'
  | 'STOCK_ADJUSTED'
  | 'EMPLOYEE_CREATED' | 'EMPLOYEE_UPDATED' | 'EMPLOYEE_DEACTIVATED' | 'EMPLOYEE_REACTIVATED'
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  SALE_CREATED: 'Sale Completed',
  SALE_CANCELLED: 'Sale Cancelled',
  PURCHASE_RECEIVED: 'Purchase Received',
  PURCHASE_CANCELLED: 'Purchase Cancelled',
  SUPPLIER_PAYMENT_RECORDED: 'Supplier Payment',
  KHATA_CHARGE_RECORDED: 'Khata Charge',
  KHATA_PAYMENT_RECORDED: 'Khata Payment',
  STOCK_ADJUSTED: 'Stock Adjusted',
  EMPLOYEE_CREATED: 'Employee Added',
  EMPLOYEE_UPDATED: 'Employee Updated',
  EMPLOYEE_DEACTIVATED: 'Employee Deactivated',
  EMPLOYEE_REACTIVATED: 'Employee Reactivated',
  LOGIN_SUCCESS: 'Login Success',
  LOGIN_FAILED: 'Login Failed',
};

export interface AuditLogEntry {
  id: number;
  actor_name: string;
  action: AuditAction;
  target_type: string;
  target_id: string;
  summary: string;
  created_at: string;
}
