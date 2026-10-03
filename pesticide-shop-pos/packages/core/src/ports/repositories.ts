import type {
  AuditLog,
  Batch,
  Brand,
  Category,
  Customer,
  Invoice,
  InvoiceItem,
  LedgerEntry,
  Payment,
  PublicUser,
  Product,
  ProductGroup,
  Purchase,
  PurchaseItem,
  SalesReturn,
  SalesReturnItem,
  StockMovement,
  Supplier,
} from '../schemas/index.js';
import type { BatchWithStock, DocumentNumbers, GroupWithSizes, NewRow, ProductGroupPatch, ProductPatch } from './types.js';

// Repository interfaces. They are SYNCHRONOUS on purpose: better-sqlite3 is synchronous, and a SQLite
// transaction cannot stay open across an `await`. Adapters hide all SQL; services never see it.
// Reads that exclude soft-deleted rows say so. Inserts return nothing: the service already knows the id.

export interface ProductRepository {
  getById(id: string): Product | undefined;
  /** Live (not soft-deleted) sizes of one group, inactive ones included, smallest pack first. */
  listByGroup(groupId: string): Product[];
  /** Barcodes and SKUs are unique across every size ever made, so this looks at soft-deleted rows too. */
  findByBarcode(barcode: string): Product | undefined;
  findBySku(sku: string): Product | undefined;
  insert(row: NewRow<Product>): void;
  /** Changes only the columns given. The database keeps version and updated_at. */
  update(id: string, patch: ProductPatch): void;
}

export interface ProductGroupRepository {
  getById(id: string): ProductGroup | undefined;
  insert(row: NewRow<ProductGroup>): void;
  update(id: string, patch: ProductGroupPatch): void;
  /**
   * Every live group with its live sizes and their stock. `today` (YYYY-MM-DD) decides which batches are expired,
   * so the clock stays injectable. Groups come back in name order.
   */
  listWithSizes(today: string): GroupWithSizes[];
}

export interface CategoryRepository {
  getById(id: string): Category | undefined;
}

export interface BrandRepository {
  getById(id: string): Brand | undefined;
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

export interface AuditRepository {
  /** Append-only record of who approved something unusual (an owner override). */
  insert(row: NewRow<AuditLog>): void;
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
  categories: CategoryRepository;
  brands: BrandRepository;
  productGroups: ProductGroupRepository;
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
  audit: AuditRepository;
  numbers: DocumentNumbers;
}
