import type {
  Batch,
  Customer,
  Invoice,
  InvoiceItem,
  LedgerEntry,
  Payment,
  PublicUser,
  Product,
  Purchase,
  PurchaseItem,
  SalesReturn,
  SalesReturnItem,
  StockMovement,
  Supplier,
} from '../schemas/index.js';
import type { BatchWithStock, DocumentNumbers, NewRow } from './types.js';

// Repository interfaces. They are SYNCHRONOUS on purpose: better-sqlite3 is synchronous, and a SQLite
// transaction cannot stay open across an `await`. Adapters hide all SQL; services never see it.
// Reads that exclude soft-deleted rows say so. Inserts return nothing: the service already knows the id.

export interface ProductRepository {
  getById(id: string): Product | undefined;
}

export interface BatchRepository {
  getById(id: string): Batch | undefined;
  getByProductAndNo(productId: string, batchNo: string): Batch | undefined;
  /** All live batches of a product, expired and empty ones included, each with its stock. */
  listForProduct(productId: string): BatchWithStock[];
  insert(row: NewRow<Batch>): void;
}

export interface StockRepository {
  /** Sum of qty_delta for one batch. */
  stockOfBatch(batchId: string): number;
  insert(row: NewRow<StockMovement>): void;
}

export interface CustomerRepository {
  getById(id: string): Customer | undefined;
}

export interface SupplierRepository {
  getById(id: string): Supplier | undefined;
}

export interface UserRepository {
  /** Never returns the password hash. */
  getById(id: string): PublicUser | undefined;
}

export interface InvoiceRepository {
  getById(id: string): Invoice | undefined;
  listItems(invoiceId: string): InvoiceItem[];
  insert(row: NewRow<Invoice>): void;
  insertItem(row: NewRow<InvoiceItem>): void;
}

export interface SalesReturnRepository {
  /** Quantity already returned per invoice_item_id, for the items of one invoice. Missing means 0. */
  returnedQtyByItem(invoiceId: string): ReadonlyMap<string, number>;
  insert(row: NewRow<SalesReturn>): void;
  insertItem(row: NewRow<SalesReturnItem>): void;
}

export interface PurchaseRepository {
  insert(row: NewRow<Purchase>): void;
  insertItem(row: NewRow<PurchaseItem>): void;
}

export interface PaymentRepository {
  insert(row: NewRow<Payment>): void;
}

export interface LedgerRepository {
  /** Sum of amount_delta. Plus means the party owes more. */
  balance(partyType: 'customer' | 'supplier', partyId: string): number;
  /** Oldest first. */
  list(partyType: 'customer' | 'supplier', partyId: string): LedgerEntry[];
  insert(row: NewRow<LedgerEntry>): void;
}

/** Everything a service can reach inside one transaction. */
export interface Repositories {
  products: ProductRepository;
  batches: BatchRepository;
  stock: StockRepository;
  customers: CustomerRepository;
  suppliers: SupplierRepository;
  users: UserRepository;
  invoices: InvoiceRepository;
  salesReturns: SalesReturnRepository;
  purchases: PurchaseRepository;
  payments: PaymentRepository;
  ledger: LedgerRepository;
  numbers: DocumentNumbers;
}
