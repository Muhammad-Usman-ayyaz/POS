import { z } from 'zod';
import { nowIso, todayUtc } from '../clock.js';
import { allocateBatches, validateManualAllocation, type AllocatableBatch } from '../domain/allocation.js';
import { buildInvoiceLines, calcInvoiceTotals, checkInvoicePayment, type InvoiceLineDraft } from '../domain/totals.js';
import { DomainError } from '../errors.js';
import type { NewRow } from '../ports/index.js';
import { Id, IsoDate, NonNegPaisa, PaymentMethod, PriceType, Qty } from '../schemas/common.js';
import type { Invoice, InvoiceItem } from '../schemas/index.js';
import { activeUser, liveCustomer, liveProduct, parseInput, rowFactory, type ServiceDeps } from './support.js';

export const SaleInput = z.object({
  /** Leave out for a walk-in sale, which must be paid in full. */
  customer_id: Id.optional(),
  /** Defaults to the customer's usual price type, else retail. */
  price_type: PriceType.optional(),
  /** When the customer should pay the rest. Only kept if something is left unpaid. */
  due_date: IsoDate.optional(),
  /** Paid now, in paisa. */
  paid_amount: NonNegPaisa,
  /** For the money paid now by a customer. Walk-in sales are recorded as paid, with no method. */
  payment_method: PaymentMethod.default('cash'),
  reference_no: z.string().min(1).optional(),
  created_by: Id,
  lines: z
    .array(
      z.object({
        product_id: Id,
        /** Base units. */
        qty: Qty,
        line_discount: NonNegPaisa.default(0),
        /** Manual batch choice. Leave out for earliest expiry first. */
        batches: z.array(z.object({ batch_id: Id, qty: Qty })).min(1).optional(),
      }),
    )
    .min(1),
});
export type SaleInput = z.input<typeof SaleInput>;

export interface SaleResult {
  invoice: NewRow<Invoice>;
  items: NewRow<InvoiceItem>[];
  payment_id: string | null;
}

export function createSaleService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /**
     * Records a sale, following docs/database-rules.md "Record a sale", in one transaction:
     * number, invoice, one line per batch used, a `sale` stock movement per line, and for a customer the
     * ledger (invoice plus total) and any payment now (payment in, ledger minus). A walk-in sale writes
     * no payment or ledger rows: the cash lives on the invoice.
     */
    create(rawInput: SaleInput): SaleResult {
      const input = parseInput(SaleInput, rawInput);

      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        const now = nowIso(deps.clock);
        activeUser(tx, input.created_by);
        const customer = input.customer_id ? liveCustomer(tx, input.customer_id) : undefined;
        const price_type = input.price_type ?? customer?.default_price_type ?? 'retail';

        // Work out every line first. Nothing is written until the whole sale is known to be valid.
        // `taken` stops two cart lines for the same product from selling the same stock twice.
        const taken = new Map<string, number>();
        const drafts: InvoiceLineDraft[] = [];
        for (const line of input.lines) {
          const product = liveProduct(tx, line.product_id);
          const all = tx.batches.listForProduct(product.id);
          const costOf = new Map(all.map((b) => [b.id, b.cost_price]));
          const batches: AllocatableBatch[] = all.map((b) => ({
            batch_id: b.id,
            expiry_date: b.expiry_date,
            stock: b.stock - (taken.get(b.id) ?? 0),
          }));
          const request = { qty: line.qty, pack_size: product.pack_size, allow_loose: product.allow_loose === 1, today, batches };
          const allocations = line.batches ? validateManualAllocation(request, line.batches) : allocateBatches(request);
          for (const a of allocations) taken.set(a.batch_id, (taken.get(a.batch_id) ?? 0) + a.qty);

          drafts.push(
            ...buildInvoiceLines(
              {
                product_id: product.id,
                qty: line.qty,
                unit_price: price_type === 'wholesale' ? product.wholesale_price : product.retail_price,
                pack_size: product.pack_size,
                line_discount: line.line_discount,
                tax_rate_bp: product.tax_rate_bp,
              },
              // The cost is copied from the batch now, so profit later uses the cost at sale time.
              allocations.map((a) => ({ ...a, cost_price: costOf.get(a.batch_id) ?? 0 })),
            ),
          );
        }

        const totals = calcInvoiceTotals(drafts);
        checkInvoicePayment({ total: totals.total, paid_amount: input.paid_amount, has_customer: customer !== undefined });
        const unpaid = totals.total - input.paid_amount;

        if (customer && unpaid > 0) {
          const owed = tx.ledger.balance('customer', customer.id);
          if (owed + unpaid > customer.credit_limit) {
            throw new DomainError(
              'CREDIT_LIMIT_EXCEEDED',
              `credit limit is ${customer.credit_limit}; the customer owes ${owed} and this sale adds ${unpaid}`,
            );
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
          status: 'active',
          void_reason: null,
          voided_by: null,
          ...deps.scope,
        };
        tx.invoices.insert(invoice);

        const items: NewRow<InvoiceItem>[] = [];
        for (const d of drafts) {
          const item: NewRow<InvoiceItem> = { id: deps.ids.newId(), invoice_id: invoice.id, ...d, ...deps.scope };
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
