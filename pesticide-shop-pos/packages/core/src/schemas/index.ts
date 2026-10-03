import { Brand, Batch, Category, Customer, Product, ProductGroup, Supplier } from './catalog.js';
import { Expense, LedgerEntry, Payment, StockMovement } from './ledger.js';
import { Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem } from './purchasing.js';
import { Invoice, InvoiceItem, SalesReturn, SalesReturnItem } from './sales.js';
import { Branch, Device, NumberSequence, Setting, Shop, User } from './setup.js';
import { AuditLog, BackupLog, ChangeLog } from './system.js';

export * from './common.js';
export * from './setup.js';
export * from './catalog.js';
export * from './purchasing.js';
export * from './sales.js';
export * from './ledger.js';
export * from './system.js';

/** Every entity schema by database table name. A db-sqlite test checks these against the real columns. */
export const entitySchemas = {
  shops: Shop,
  branches: Branch,
  devices: Device,
  users: User,
  settings: Setting,
  number_sequences: NumberSequence,
  categories: Category,
  brands: Brand,
  suppliers: Supplier,
  customers: Customer,
  product_groups: ProductGroup,
  products: Product,
  batches: Batch,
  purchases: Purchase,
  purchase_items: PurchaseItem,
  purchase_returns: PurchaseReturn,
  purchase_return_items: PurchaseReturnItem,
  invoices: Invoice,
  invoice_items: InvoiceItem,
  sales_returns: SalesReturn,
  sales_return_items: SalesReturnItem,
  stock_movements: StockMovement,
  payments: Payment,
  ledger_entries: LedgerEntry,
  expenses: Expense,
  audit_log: AuditLog,
  change_log: ChangeLog,
  backup_log: BackupLog,
} as const;
