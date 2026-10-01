import { z } from 'zod';
import { nowIso, todayUtc } from '../clock.js';
import { planReturn, type SoldLine } from '../domain/returns.js';
import { DomainError } from '../errors.js';
import type { NewRow } from '../ports/index.js';
import { Id, Qty } from '../schemas/common.js';
import { ReturnCondition, type SalesReturn, type SalesReturnItem } from '../schemas/sales.js';
import { found, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

const SalesReturnInput = z.object({
  invoice_id: Id,
  /** Must be an active owner. Returns need the owner's approval. */
  approved_by: Id,
  reason: z.string().min(1).optional(),
  /** Only `khata_credit` works for now. Cash refunds wait for open question 8. */
  refund_method: z.enum(['cash', 'khata_credit']),
  items: z
    .array(
      z.object({
        invoice_item_id: Id,
        /** Base units. */
        qty: Qty,
        condition: ReturnCondition,
      }),
    )
    .min(1),
});
export type SalesReturnInput = z.input<typeof SalesReturnInput>;

export interface SalesReturnResult {
  sales_return: NewRow<SalesReturn>;
  items: NewRow<SalesReturnItem>[];
}

export function createSalesReturnService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /**
     * A customer brings goods back against a completed sale (docs/database-rules.md "Return"), in one
     * transaction: the return and its lines, a `sale_return` stock movement for each resellable line on the
     * same batch it came from, and a `return` ledger row crediting the customer's Khata.
     */
    create(rawInput: SalesReturnInput): SalesReturnResult {
      const input = parseInput(SalesReturnInput, rawInput);
      if (input.refund_method === 'cash') {
        throw new DomainError('NOT_SUPPORTED', 'cash refunds are not available yet: the ledger entries are an open question (8)');
      }

      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        ownerUser(tx, input.approved_by);
        const invoice = found(tx.invoices.getById(input.invoice_id), 'invoice', input.invoice_id);
        if (invoice.customer_id === null) {
          throw new DomainError('CREDIT_NEEDS_CUSTOMER', 'a walk-in sale has no Khata to credit; a cash refund is needed (not available yet)');
        }

        const items = tx.invoices.listItems(invoice.id);
        const returned = tx.salesReturns.returnedQtyByItem(invoice.id);
        const sold: SoldLine[] = items.map((i) => ({
          invoice_item_id: i.id,
          qty: i.qty,
          line_total: i.line_total,
          qty_returned: returned.get(i.id) ?? 0,
        }));
        const plan = planReturn({ invoice_status: invoice.status, lines: sold, requested: input.items });

        const header: NewRow<SalesReturn> = {
          id: deps.ids.newId(),
          return_no: tx.numbers.next('return'),
          invoice_id: invoice.id,
          approved_by: input.approved_by,
          return_date: todayUtc(deps.clock),
          reason: input.reason ?? null,
          refund_method: 'khata_credit',
          total: plan.total,
          ...deps.scope,
        };
        tx.salesReturns.insert(header);

        const lines: NewRow<SalesReturnItem>[] = [];
        for (const line of plan.lines) {
          const row: NewRow<SalesReturnItem> = {
            id: deps.ids.newId(),
            sales_return_id: header.id,
            invoice_item_id: line.invoice_item_id,
            qty: line.qty,
            refund_amount: line.refund_amount,
            condition: line.condition,
            ...deps.scope,
          };
          tx.salesReturns.insertItem(row);
          lines.push(row);

          // Only resellable goods go back into sellable stock, on the batch they were sold from.
          if (line.restock) {
            const original = found(items.find((i) => i.id === line.invoice_item_id), 'invoice item', line.invoice_item_id);
            tx.stock.insert(
              rows.stock({ batch_id: original.batch_id, qty_delta: line.qty, movement_type: 'sale_return', ref_type: 'return', ref_id: header.id, created_by: input.approved_by }),
            );
          }
        }

        if (plan.total > 0) {
          tx.ledger.insert(
            rows.ledger({ party_type: 'customer', party_id: invoice.customer_id, entry_type: 'return', amount_delta: -plan.total, ref_type: 'return', ref_id: header.id, entry_date: now, created_by: input.approved_by }),
          );
        }

        return { sales_return: header, items: lines };
      });
    },
  };
}
export type SalesReturnService = ReturnType<typeof createSalesReturnService>;
