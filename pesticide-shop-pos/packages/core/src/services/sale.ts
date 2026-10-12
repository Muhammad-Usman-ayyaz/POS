import { z } from 'zod';
import { daysBetween, nowIso, todayUtc } from '../clock.js';
import { allocateBatches, validateManualAllocation, type AllocatableBatch } from '../domain/allocation.js';
import { nearExpiryLimit } from '../domain/catalogue.js';
import { buildInvoiceLines, calcInvoiceTotals, checkInvoicePayment, type InvoiceLineDraft } from '../domain/totals.js';
import { DomainError, type DomainErrorCode, type ErrorParams } from '../errors.js';
import { priceForQty } from '../money/index.js';
import type { NewRow, Repositories } from '../ports/index.js';
import { Id, IsoDate, NonNegPaisa, PaymentMethod, PriceType, Qty } from '../schemas/common.js';
import type { Customer, Invoice, InvoiceItem, Product } from '../schemas/index.js';
import { activeUser, liveCustomer, liveProduct, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

/** The setting that says how much of a line staff may give off without the owner (percent of the line's price). Default below. */
export const STAFF_MAX_DISCOUNT_KEY = 'staff_max_discount_percent';
export const DEFAULT_STAFF_MAX_DISCOUNT_PERCENT = 5;

// Both schemas are strict: an unknown key (for example a `unit_price` or a `name_en` sent by a client) is an error, not
// something that is quietly ignored. Prices come from the product; a different price is an explicit override. The name of
// each line comes from the catalogue, never from the caller.
const SaleLineInput = z.strictObject({
  product_id: Id,
  /** Base units. */
  qty: Qty,
  line_discount: NonNegPaisa.default(0),
  /** Manual batch choice. Leave out for earliest expiry first. */
  batches: z.array(z.strictObject({ batch_id: Id, qty: Qty })).min(1).optional(),
  /**
   * Owner-approved price for this line, in paisa per pack. Normally the price is looked up from the
   * product (retail or wholesale, by price type) and the cashier cannot change it.
   */
  price_override: z.strictObject({ unit_price: NonNegPaisa, approved_by: Id }).optional(),
});

const SaleFields = {
  /** Leave out for a walk-in sale, which must be paid in full. */
  customer_id: Id.optional(),
  /** Defaults to the customer's usual price type, else retail. */
  price_type: PriceType.optional(),
  /** When the customer should pay the rest. Only kept if something is left unpaid. */
  due_date: IsoDate.optional(),
  /** How the amount paid now was paid. Saved on the invoice, and on the payments row for a customer sale. */
  payment_method: PaymentMethod.default('cash'),
  reference_no: z.string().min(1).optional(),
  /**
   * Owner approval to put a credit sale over the customer's credit limit. Without it such a sale is refused.
   * Only checked when a limit is set (credit_limit above 0).
   */
  credit_override: z.strictObject({ approved_by: Id }).optional(),
  /**
   * Owner approval for discounts above what staff may give. Core has no roles and does not decide whether a discount needs it
   * (the shell does); when it is given it is checked to be an active owner and written to the audit log.
   */
  discount_override: z.strictObject({ approved_by: Id }).optional(),
  created_by: Id,
  lines: z.array(SaleLineInput).min(1),
};

export const SaleInput = z.strictObject({
  ...SaleFields,
  /** Paid now, in paisa. */
  paid_amount: NonNegPaisa,
  /**
   * The screen's id for this attempt to complete the sale. A second request with the same id (a double click, a retry, a restart in between)
   * gets the invoice that already exists instead of making another. The same id with a different sale is refused (REQUEST_ID_REUSED).
   */
  request_id: z.string().min(8).max(100).optional(),
});
export type SaleInput = z.input<typeof SaleInput>;

/** A cart to be priced and checked without being sold. Same as a sale, but `paid_amount` may be left out (it then means "paid in full"). */
export const QuoteInput = z.strictObject({ ...SaleFields, paid_amount: NonNegPaisa.optional() });
export type QuoteInput = z.input<typeof QuoteInput>;

export interface SaleResult {
  invoice: NewRow<Invoice>;
  items: NewRow<InvoiceItem>[];
  payment_id: string | null;
  /** True when this is the invoice of an EARLIER request with the same request_id (nothing was written now). Its payment_id is then null. */
  replayed?: boolean;
}

// ---------- the quote ----------

export interface QuoteBatch {
  batch_id: string;
  batch_no: string;
  expiry_date: string;
  /** Base units taken from this batch. */
  qty: number;
  days_to_expiry: number;
  near_expiry: boolean;
}

/** One cart line as the sale would record it, added up over the batches it uses. Never carries the cost. */
export interface QuoteLine {
  /** Position in the cart that was sent. */
  index: number;
  product_id: string;
  name_en: string | null;
  name_ur: string | null;
  pack_label: string;
  base_unit: Product['base_unit'];
  pack_size: number;
  qty: number;
  /** Paisa per pack, tax included: the list price or the owner-approved override. */
  unit_price: number;
  /** What the quantity costs before the discount, tax included: the sum of the batch rows. */
  gross: number;
  line_discount: number;
  /** True when the discount is more than the staff limit allows (percent of `gross`), so the owner must approve it. */
  discount_over_limit: boolean;
  tax_rate_bp: number;
  /** The tax inside `line_total`. */
  tax_amount: number;
  line_total: number;
  batches: QuoteBatch[];
}

export interface QuoteIssue {
  scope: 'line' | 'customer' | 'payment' | 'credit' | 'due_date' | 'approval';
  /** For a line: its position in the cart. */
  line_index?: number;
  code: DomainErrorCode;
  message: string;
  params: ErrorParams;
}

export interface QuoteCustomer {
  id: string;
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  default_price_type: 'retail' | 'wholesale';
  /** 0 means no limit is set. */
  credit_limit: number;
  /** What they owe now (opening balance included). */
  balance: number;
  /** What this sale would add to it: the part not paid now. */
  unpaid: number;
  after_sale: number;
  /** A limit is set and balance + unpaid goes over it. */
  over_limit: boolean;
}

export interface SaleQuote {
  /** True when nothing is wrong: no issue, so the sale could be recorded as quoted (before any approval the caller still needs). */
  ok: boolean;
  price_type: 'retail' | 'wholesale';
  lines: QuoteLine[];
  subtotal: number;
  tax_total: number;
  total: number;
  /** Paid now. When the request left it out: the whole total. */
  paid_amount: number;
  unpaid: number;
  customer: QuoteCustomer | null;
  issues: QuoteIssue[];
  /** Today (the UTC date core works in), and the near-expiry window, so the screen needs no clock of its own. */
  today: string;
  near_expiry_days: number;
  /** The setting: percent of a line's price that staff may take off without the owner. */
  staff_max_discount_percent: number;
}

// ---------- planning: the one place a cart becomes invoice rows, used by quote AND create ----------

interface PlannedLine {
  index: number;
  product: Product;
  unit_price: number;
  gross: number;
  drafts: InvoiceLineDraft[];
  price_override: { approved_by: string } | null;
  batches: QuoteBatch[];
}

interface PlanContext {
  tx: Repositories;
  today: string;
  nearDays: number;
  price_type: 'retail' | 'wholesale';
  /** Stops two cart lines for the same product from selling the same stock twice. */
  taken: Map<string, number>;
}

type CartLineInput = z.output<typeof SaleLineInput>;

/** Prices, allocates and rounds one cart line. Throws a DomainError for anything wrong with it. */
function planLine(ctx: PlanContext, line: CartLineInput, index: number): PlannedLine {
  const { tx, today, nearDays, taken } = ctx;
  const product = liveProduct(tx, line.product_id);
  // The price is looked up from the product. Only an active owner can set a different one.
  const listPrice = ctx.price_type === 'wholesale' ? product.wholesale_price : product.retail_price;
  let unit_price = listPrice;
  if (line.price_override) {
    ownerUser(tx, line.price_override.approved_by);
    unit_price = line.price_override.unit_price;
  }
  const all = tx.batches.listForProduct(product.id);
  const costOf = new Map(all.map((b) => [b.id, b.cost_price]));
  const batches: AllocatableBatch[] = all.map((b) => ({ batch_id: b.id, expiry_date: b.expiry_date, stock: b.stock - (taken.get(b.id) ?? 0) }));
  const request = { qty: line.qty, pack_size: product.pack_size, allow_loose: product.allow_loose === 1, today, batches };
  const allocations = line.batches ? validateManualAllocation(request, line.batches) : allocateBatches(request);
  for (const a of allocations) taken.set(a.batch_id, (taken.get(a.batch_id) ?? 0) + a.qty);

  const drafts = buildInvoiceLines(
    { product_id: product.id, qty: line.qty, unit_price, pack_size: product.pack_size, line_discount: line.line_discount, tax_rate_bp: product.tax_rate_bp },
    // The cost is copied from the batch now, so profit later uses the cost at sale time.
    allocations.map((a) => ({ ...a, cost_price: costOf.get(a.batch_id) ?? 0 })),
  );
  const last = nearExpiryLimit(today, nearDays);
  const info = new Map(all.map((b) => [b.id, b]));
  return {
    index,
    product,
    unit_price,
    gross: allocations.reduce((sum, a) => sum + priceForQty(a.qty, unit_price, product.pack_size), 0),
    drafts,
    price_override: line.price_override ? { approved_by: line.price_override.approved_by } : null,
    batches: allocations.map((a) => {
      const b = info.get(a.batch_id)!;
      return { batch_id: a.batch_id, batch_no: b.batch_no, expiry_date: b.expiry_date, qty: a.qty, days_to_expiry: daysBetween(today, b.expiry_date), near_expiry: b.expiry_date <= last };
    }),
  };
}

const issueOf = (error: unknown, scope: QuoteIssue['scope'], line_index?: number): QuoteIssue => {
  if (!(error instanceof DomainError)) throw error; // a bug, not a problem with the cart
  return { scope, ...(line_index === undefined ? {} : { line_index }), code: error.code, message: error.message, params: error.params };
};

export function createSaleService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  /** What was recorded for an earlier request with this id, if it is the same sale. */
  const replay = (tx: Repositories, existing: Invoice, input: z.output<typeof SaleInput>): SaleResult => {
    const items = tx.invoices.listItems(existing.id);
    const soldByProduct = new Map<string, number>();
    for (const i of items) soldByProduct.set(i.product_id, (soldByProduct.get(i.product_id) ?? 0) + i.qty);
    const askedByProduct = new Map<string, number>();
    for (const l of input.lines) askedByProduct.set(l.product_id, (askedByProduct.get(l.product_id) ?? 0) + l.qty);
    const sameLines = soldByProduct.size === askedByProduct.size && [...askedByProduct].every(([id, qty]) => soldByProduct.get(id) === qty);
    // Prices are not compared: a retry after a price change is still the same sale.
    const same = existing.created_by === input.created_by && existing.customer_id === (input.customer_id ?? null) && existing.paid_amount === input.paid_amount && sameLines;
    if (!same) throw new DomainError('REQUEST_ID_REUSED', 'this request id was already used for a different sale', { invoice_no: existing.invoice_no });
    return { invoice: existing, items, payment_id: null, replayed: true };
  };

  return {
    /**
     * Prices and checks a cart WITHOUT selling it, with the very same planning as `create` (so a quote and the sale that follows agree to the
     * paisa). Problems with a line, the customer, the payment or the credit limit come back as `issues` instead of being thrown, and the lines
     * that have one are left out of the totals. Writes nothing.
     */
    quote(rawInput: QuoteInput): SaleQuote {
      const input = parseInput(QuoteInput, rawInput);
      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        const nearDays = tx.settings.getInt('near_expiry_days', 30);
        const limitPercent = tx.settings.getInt(STAFF_MAX_DISCOUNT_KEY, DEFAULT_STAFF_MAX_DISCOUNT_PERCENT);
        const issues: QuoteIssue[] = [];
        activeUser(tx, input.created_by);

        let customer: Customer | undefined;
        if (input.customer_id) {
          try {
            customer = liveCustomer(tx, input.customer_id);
          } catch (e) {
            issues.push(issueOf(e, 'customer'));
          }
        }
        const price_type = input.price_type ?? customer?.default_price_type ?? 'retail';

        const ctx: PlanContext = { tx, today, nearDays, price_type, taken: new Map() };
        const planned: PlannedLine[] = [];
        input.lines.forEach((line, index) => {
          try {
            planned.push(planLine(ctx, line, index));
          } catch (e) {
            issues.push(issueOf(e, 'line', index));
          }
        });

        const drafts = planned.flatMap((p) => p.drafts);
        const totals = calcInvoiceTotals(drafts);
        const paid_amount = input.paid_amount ?? totals.total;
        const unpaid = totals.total - paid_amount;
        try {
          checkInvoicePayment({ total: totals.total, paid_amount, has_customer: customer !== undefined });
        } catch (e) {
          issues.push(issueOf(e, 'payment'));
        }

        let quoteCustomer: QuoteCustomer | null = null;
        if (customer) {
          const balance = tx.ledger.balance('customer', customer.id);
          const over = customer.credit_limit > 0 && unpaid > 0 && balance + unpaid > customer.credit_limit;
          quoteCustomer = {
            id: customer.id,
            name_en: customer.name_en,
            name_ur: customer.name_ur,
            village: customer.village,
            default_price_type: customer.default_price_type,
            credit_limit: customer.credit_limit,
            balance,
            unpaid,
            after_sale: balance + Math.max(unpaid, 0),
            over_limit: over,
          };
          if (over) {
            issues.push({
              scope: 'credit',
              code: 'CREDIT_LIMIT_EXCEEDED',
              message: `credit limit is ${customer.credit_limit}; the customer owes ${balance} and this sale adds ${unpaid}`,
              params: { limit: customer.credit_limit, owed: balance, adds: unpaid },
            });
          }
        }
        if (input.due_date !== undefined && input.due_date < today) {
          issues.push({ scope: 'due_date', code: 'INVALID_INPUT', message: `due_date ${input.due_date} is in the past`, params: { due_date: input.due_date } });
        }

        const lines: QuoteLine[] = planned.map((p) => {
          const discount = p.drafts.reduce((sum, d) => sum + d.line_discount, 0);
          return {
            index: p.index,
            product_id: p.product.id,
            name_en: p.product.name_en,
            name_ur: p.product.name_ur,
            pack_label: p.product.pack_label,
            base_unit: p.product.base_unit,
            pack_size: p.product.pack_size,
            qty: p.drafts.reduce((sum, d) => sum + d.qty, 0),
            unit_price: p.unit_price,
            gross: p.gross,
            line_discount: discount,
            // percent of the price, compared in whole paisa so there is no rounding in the decision
            discount_over_limit: discount * 100 > p.gross * limitPercent,
            tax_rate_bp: p.product.tax_rate_bp,
            tax_amount: p.drafts.reduce((sum, d) => sum + d.tax_amount, 0),
            line_total: p.drafts.reduce((sum, d) => sum + d.line_total, 0),
            batches: p.batches,
          };
        });

        return {
          ok: issues.length === 0,
          price_type,
          lines,
          subtotal: totals.subtotal,
          tax_total: totals.tax_total,
          total: totals.total,
          paid_amount,
          unpaid,
          customer: quoteCustomer,
          issues,
          today,
          near_expiry_days: nearDays,
          staff_max_discount_percent: limitPercent,
        };
      });
    },

    /**
     * Records a sale, following docs/database-rules.md "Record a sale", in one transaction:
     * number, invoice, one line per batch used, a `sale` stock movement per line, and for a customer the
     * ledger (invoice plus total) and any payment now (payment in, ledger minus). A walk-in sale writes
     * no payment or ledger rows: the cash lives on the invoice.
     */
    create(rawInput: SaleInput): SaleResult {
      const input = parseInput(SaleInput, rawInput);

      return deps.uow.run((tx) => {
        // The same request twice (a double click, a retry, a restart in between): the first one's invoice, nothing new.
        if (input.request_id) {
          const earlier = tx.invoices.getByRequestId(input.request_id);
          if (earlier) return replay(tx, earlier, input);
        }

        const today = todayUtc(deps.clock);
        const now = nowIso(deps.clock);
        activeUser(tx, input.created_by);
        const customer = input.customer_id ? liveCustomer(tx, input.customer_id) : undefined;
        const price_type = input.price_type ?? customer?.default_price_type ?? 'retail';

        // Work out every line first. Nothing is written until the whole sale is known to be valid.
        const ctx: PlanContext = { tx, today, nearDays: tx.settings.getInt('near_expiry_days', 30), price_type, taken: new Map() };
        const planned = input.lines.map((line, index) => planLine(ctx, line, index));
        const drafts = planned.flatMap((p) => p.drafts);
        const approvals: { user_id: string; action: string; details: unknown }[] = [];
        for (const p of planned) {
          if (!p.price_override) continue;
          const listPrice = price_type === 'wholesale' ? p.product.wholesale_price : p.product.retail_price;
          approvals.push({
            user_id: p.price_override.approved_by,
            action: 'price_override',
            details: { product_id: p.product.id, price_type, list_price: listPrice, unit_price: p.unit_price },
          });
        }
        // The names as the catalogue has them NOW: copied onto each invoice line, so a later rename cannot change this receipt.
        const names = new Map(planned.map((p) => [p.product.id, { name_en: p.product.name_en, name_ur: p.product.name_ur }]));

        const totals = calcInvoiceTotals(drafts);
        checkInvoicePayment({ total: totals.total, paid_amount: input.paid_amount, has_customer: customer !== undefined });
        const unpaid = totals.total - input.paid_amount;

        if (input.credit_override) ownerUser(tx, input.credit_override.approved_by);
        if (input.discount_override) {
          ownerUser(tx, input.discount_override.approved_by);
          approvals.push({
            user_id: input.discount_override.approved_by,
            action: 'discount_override',
            details: { lines: planned.filter((p) => p.drafts.some((d) => d.line_discount > 0)).map((p) => ({ product_id: p.product.id, discount: p.drafts.reduce((s, d) => s + d.line_discount, 0), gross: p.gross })) },
          });
        }
        // A limit of 0 means no limit is set. The balance includes any opening balance, so it counts too.
        if (customer && unpaid > 0 && customer.credit_limit > 0) {
          const owed = tx.ledger.balance('customer', customer.id);
          if (owed + unpaid > customer.credit_limit) {
            if (!input.credit_override) {
              throw new DomainError(
                'CREDIT_LIMIT_EXCEEDED',
                `credit limit is ${customer.credit_limit}; the customer owes ${owed} and this sale adds ${unpaid}`,
                { limit: customer.credit_limit, owed, adds: unpaid },
              );
            }
            approvals.push({
              user_id: input.credit_override.approved_by,
              action: 'credit_limit_override',
              details: { customer_id: customer.id, credit_limit: customer.credit_limit, owed, unpaid },
            });
          }
        }
        if (input.due_date !== undefined && input.due_date < today) {
          throw new DomainError('INVALID_INPUT', `due_date ${input.due_date} is in the past`);
        }

        const invoice: NewRow<Invoice> = {
          id: deps.ids.newId(),
          invoice_no: tx.numbers.next('invoice'),
          customer_id: customer?.id ?? null,
          created_by: input.created_by,
          invoice_date: now,
          due_date: unpaid > 0 ? (input.due_date ?? null) : null,
          price_type,
          subtotal: totals.subtotal,
          tax_total: totals.tax_total,
          total: totals.total,
          paid_amount: input.paid_amount,
          payment_method: input.payment_method,
          status: 'active',
          void_reason: null,
          voided_by: null,
          request_id: input.request_id ?? null,
          ...deps.scope,
        };
        tx.invoices.insert(invoice);
        for (const a of approvals) {
          tx.audit.insert(rows.audit({ user_id: a.user_id, action: a.action, table_name: 'invoices', row_id: invoice.id, details: a.details }));
        }

        const items: NewRow<InvoiceItem>[] = [];
        for (const d of drafts) {
          const name = names.get(d.product_id) ?? { name_en: null, name_ur: null };
          const item: NewRow<InvoiceItem> = { id: deps.ids.newId(), invoice_id: invoice.id, ...d, name_en: name.name_en, name_ur: name.name_ur, ...deps.scope };
          tx.invoices.insertItem(item);
          items.push(item);
          tx.stock.insert(
            rows.stock({ batch_id: d.batch_id, qty_delta: -d.qty, movement_type: 'sale', ref_type: 'invoice', ref_id: invoice.id, created_by: input.created_by }),
          );
        }

        let payment_id: string | null = null;
        if (customer) {
          if (totals.total > 0) {
            tx.ledger.insert(
              rows.ledger({ party_type: 'customer', party_id: customer.id, entry_type: 'invoice', amount_delta: totals.total, ref_type: 'invoice', ref_id: invoice.id, entry_date: now, created_by: input.created_by }),
            );
          }
          if (input.paid_amount > 0) {
            const payment = rows.payment({
              party_type: 'customer',
              party_id: customer.id,
              method: input.payment_method,
              ...(input.reference_no ? { reference_no: input.reference_no } : {}),
              amount: input.paid_amount,
              direction: 'in',
              paid_at: now,
              created_by: input.created_by,
            });
            tx.payments.insert(payment);
            payment_id = payment.id;
            tx.ledger.insert(
              rows.ledger({ party_type: 'customer', party_id: customer.id, entry_type: 'payment', amount_delta: -input.paid_amount, ref_type: 'payment', ref_id: payment.id, entry_date: now, created_by: input.created_by }),
            );
          }
        }

        return { invoice, items, payment_id };
      });
    },
  };
}
export type SaleService = ReturnType<typeof createSaleService>;
