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
import type { BatchWithStock, CatalogueGroup, CustomerPatch, DocumentNumbers, GroupWithSizes, LedgerDisplayRow, NewRow, ProductGroupPatch, ProductPatch, SizeStatus, SizeStock } from './types.js';

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
  /** Every live group with its live sizes, without stock. Groups come back in name order. */
  listCatalogue(): CatalogueGroup[];
  /**
   * A short text that changes whenever a product or a product group is added, changed or soft-deleted (and only then:
   * a sale or a receipt does not move it). A cache of `listCatalogue` is out of date exactly when this changes, so no
   * write path has to remember to say so. It is cheap: it must not read more than a count and a sum per table.
   */
  catalogueSignature(): string;
  /** Stock of the given sizes (a size with no batches is 0 and 0). `today` (YYYY-MM-DD) decides which batches are expired. */
  stockOfSizes(productIds: readonly string[], today: string): Map<string, SizeStock>;
  /**
   * The stock picture of EVERY live size at once (a size with no batches is simply not in the map): totals, expired
   * stock, next expiry, batch counts, and the cost of the batch that sells first. One pass over the batches and movements.
   */
  sizeStatuses(today: string): Map<string, SizeStatus>;
  /**
   * A number that moves whenever ANYTHING is written to the database (any table, any service; writes that are later
   * rolled back count too) and never goes back. A cache of `sizeStatuses` is out of date exactly when it moves.
   */
  changeToken(): number;
}

export interface CategoryRepository {
  getById(id: string): Category | undefined;
  /** Live categories in name order. */
  list(): Category[];
  insert(row: NewRow<Category>): void;
}

export interface BrandRepository {
  getById(id: string): Brand | undefined;
  /** Live brands in name order. */
  list(): Brand[];
  insert(row: NewRow<Brand>): void;
}

export interface SettingsRepository {
  /** A whole-number setting (for example near_expiry_days), or `fallback` when it is missing or not a number. */
  getInt(key: string, fallback: number): number;
  /** Writes a whole-number setting (creates the row if there is none). The caller validates the value and says who changed it (audit). */
  setInt(key: string, value: number): void;
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
  /** Every live customer in name order (a shop has hundreds, not millions: the service filters in memory, with the same name matching as the catalogue). */
  list(): Customer[];
  insert(row: NewRow<Customer>): void;
  /** Changes only the columns given. The database keeps version and updated_at. */
  update(id: string, patch: CustomerPatch): void;
}

export interface SupplierRepository {
  getById(id: string): Supplier | undefined;
  /** Live suppliers in name order. */
  list(): Supplier[];
  insert(row: NewRow<Supplier>): void;
}

export interface UserRepository {
  /** Never returns the password hash. */
  getById(id: string): PublicUser | undefined;
}

export interface InvoiceRepository {
  getById(id: string): Invoice | undefined;
  /** The invoice made for this request id (migration 006), if any. */
  getByRequestId(requestId: string): Invoice | undefined;
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
  /** Oldest first: by entry_date, then the stable ledger order (seq; rows from before migration 008 have no seq and come first, in insertion order). */
  list(partyType: 'customer' | 'supplier', partyId: string): LedgerEntry[];
  /** `seq` is assigned by the repository (the next number, inside the transaction): a service never sets it. */
  insert(row: Omit<NewRow<LedgerEntry>, 'seq'>): void;
  /** The balance of every party of one type that has at least one ledger row (a party with no rows is not in the map: its balance is 0). */
  balancesByParty(partyType: 'customer' | 'supplier'): Map<string, number>;
  /**
   * Every ledger row of one CUSTOMER (party_type 'customer' always) in (entry_date, insertion) order, with the invoice number,
   * return number, payment method, reference, receipt number and note joined on for the statement. Same rows as `list`, nothing added or left out.
   */
  customerStatementRows(customerId: string): LedgerDisplayRow[];
}

/** Everything a service can reach inside one transaction. */
export interface Repositories {
  settings: SettingsRepository;
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
