import { z } from 'zod';
import { nowIso, todayUtc } from '../clock.js';
import { planReturn, planVoid, splitRefund, type PlannedReturnLine, type ReturnIssue, type ReturnReason, type SoldLine } from '../domain/returns.js';
import { DEFAULT_SHOP_TIME_ZONE, shopDayOf } from '../domain/zone-day.js';
import { DomainError } from '../errors.js';
import type { NewRow, Repositories } from '../ports/index.js';
import { Id, Qty } from '../schemas/common.js';
import { ReturnCondition, type Invoice, type InvoiceItem, type SalesReturn, type SalesReturnItem } from '../schemas/sales.js';
import { readCustomerSettings } from './customer-settings.js';
import { activeUser, found, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

const ReturnLineInput = z.strictObject({
  invoice_item_id: Id,
  /** Base units, in the line's own unit (500 g of a 2.5 kg line; whole packs of a sealed size). */
  qty: Qty,
  condition: ReturnCondition,
  /** A code from RETURN_REASONS. Missing or unknown is RETURN_REASON_REQUIRED (checked with the other line rules). */
  reason: z.string().max(40).optional(),
});

const PreviewInput = z.strictObject({ invoice_id: Id, items: z.array(ReturnLineInput).min(1) });
export type ReturnPreviewInput = z.input<typeof PreviewInput>;

const SalesReturnInput = z.strictObject({
  invoice_id: Id,
  /** Must be an active owner. Returns need the owner's approval: the shell sets this (the owner, or the owner whose approval was spent). */
  approved_by: Id,
  /** The person at the counter who started the return (staff may). Left out: the approver started it. Set by the shell, never by the screen. */
  requested_by: Id.optional(),
  /** An optional note for the whole return (stored in `sales_returns.reason`). Each line has its own required reason. */
  note: z.string().trim().min(1).max(200).optional(),
  items: z.array(ReturnLineInput).min(1),
  /** The shell spent a one-use owner approval on this return: the `approval_used` audit row is written in the return's own transaction. */
  approval_used: z.strictObject({ approved_by: Id, requested_by: Id }).optional(),
});
export type SalesReturnInput = z.input<typeof SalesReturnInput>;

const VoidInput = z.strictObject({
  invoice_id: Id,
  /** Must be an active owner. Set by the shell from the session. */
  voided_by: Id,
  reason: z.string().trim().max(200),
});
export type VoidInvoiceInput = z.input<typeof VoidInput>;

export interface SalesReturnResult {
  sales_return: NewRow<SalesReturn>;
  items: NewRow<SalesReturnItem>[];
}

export interface ReturnPreviewLine {
  invoice_item_id: string;
  qty: number;
  refund_amount: number;
  tax_refund: number;
  condition: PlannedReturnLine['condition'];
  /** True: back on the shelf (the original batch). False: written off. */
  restock: boolean;
}

/** What a return would do, worked out by the core (the screen does no money arithmetic). Nothing is written. */
export interface ReturnPreview {
  invoice_id: string;
  invoice_no: string;
  lines: ReturnPreviewLine[];
  /** Paisa, tax included. */
  total: number;
  /** The tax inside `total`. */
  tax_total: number;
  cash_amount: number;
  khata_amount: number;
  /** Null for a walk-in sale (no Khata). */
  khata_before: number | null;
  khata_after: number | null;
  /** Base units going back on the shelf and being written off (the sums over the lines). */
  restock_lines: number;
  write_off_lines: number;
  /** What `create` would refuse, if anything (the reason, whole packs and expired batch rules). Empty when it can go ahead. */
  issues: { code: ReturnIssue['code']; invoice_item_id: string }[];
}

export interface VoidResult {
  invoice_id: string;
  invoice_no: string;
  /** Paisa taken off the customer's Khata. */
  khata_reversed: number;
  /** Paisa to hand back in cash. */
  cash_back: number;
  stock_lines: number;
}

/** A line of the invoice with what a return needs to know about its product and batch. */
function soldLines(tx: Repositories, items: readonly InvoiceItem[], returned: ReadonlyMap<string, number>, today: string): SoldLine[] {
  return items.map((i) => {
    const product = tx.products.getById(i.product_id);
    const batch = tx.batches.getById(i.batch_id);
    return {
      invoice_item_id: i.id,
      qty: i.qty,
      line_total: i.line_total,
      tax_amount: i.tax_amount,
      qty_returned: returned.get(i.id) ?? 0,
      ...(product ? { pack_size: product.pack_size, base_unit: product.base_unit, whole_packs_only: product.allow_loose === 0 } : {}),
      batch_expired: batch !== undefined && batch.expiry_date < today,
    };
  });
}

function khataLine(tx: Repositories, invoice: Invoice): { before: number | null } {
  return { before: invoice.customer_id === null ? null : tx.ledger.balance('customer', invoice.customer_id) };
}

export function createSalesReturnService(deps: ServiceDeps) {
  const rows = rowFactory(deps);
  /** Today on the SHOP's clock (Asia/Karachi): a batch is expired for a return when its expiry is before this day. */
  const shopToday = (): string => shopDayOf(nowIso(deps.clock), DEFAULT_SHOP_TIME_ZONE);

  function plan(tx: Repositories, invoiceId: string, items: z.output<typeof ReturnLineInput>[], collect?: ReturnIssue[]) {
    const invoice = found(tx.invoices.getById(invoiceId), 'invoice', invoiceId);
    const invoiceItems = tx.invoices.listItems(invoice.id);
    const returned = tx.salesReturns.returnedQtyByItem(invoice.id);
    const sold = soldLines(tx, invoiceItems, returned, shopToday());
    const requested = items.map((i) => ({ invoice_item_id: i.invoice_item_id, qty: i.qty, condition: i.condition, reason: i.reason as ReturnReason }));
    const result = planReturn({ invoice_status: invoice.status, lines: sold, requested }, collect);
    const split = splitRefund({
      total: result.total,
      has_customer: invoice.customer_id !== null,
      unpaid_on_invoice: invoice.total - invoice.paid_amount,
      khata_credited_so_far: tx.salesReturns.khataCreditedSoFar(invoice.id),
      refund_paid_part_to_khata: readCustomerSettings(tx).refund_paid_part_to_khata,
    });
    return { invoice, invoiceItems, plan: result, split };
  }

  return {
    /** What the return would do: the refund by line, its tax, how it is paid (cash and Khata) and the Khata before and after. Writes nothing. */
    preview(rawInput: ReturnPreviewInput): ReturnPreview {
      const input = parseInput(PreviewInput, rawInput);
      return deps.uow.run((tx) => {
        const issues: ReturnIssue[] = [];
        const { invoice, plan: p, split } = plan(tx, input.invoice_id, input.items, issues);
        const { before } = khataLine(tx, invoice);
        return {
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          lines: p.lines.map((l) => ({ invoice_item_id: l.invoice_item_id, qty: l.qty, refund_amount: l.refund_amount, tax_refund: l.tax_refund, condition: l.condition, restock: l.restock })),
          total: p.total,
          tax_total: p.lines.reduce((n, l) => n + l.tax_refund, 0),
          cash_amount: split.cash,
          khata_amount: split.khata,
          khata_before: before,
          khata_after: before === null ? null : before - split.khata,
          restock_lines: p.lines.filter((l) => l.restock).length,
          write_off_lines: p.lines.filter((l) => !l.restock).length,
          issues: issues.map((i) => ({ code: i.code, invoice_item_id: i.invoice_item_id })),
        };
      });
    },

    /**
     * A customer brings goods back against a completed sale, in one transaction: the return and its lines, stock movements on the batch each
     * line was sold from, and (only for what was still on Khata) a compensating `return` ledger row. Resellable goods go back on the shelf
     * (`sale_return`); the rest come back and are written off at once (`sale_return` then `damage` or `expired`), with the line's reason.
     * The money: what the customer PAID comes back in cash with no Khata entry; what is still ON KHATA is taken off their balance (Q8).
     */
    create(rawInput: SalesReturnInput): SalesReturnResult {
      const input = parseInput(SalesReturnInput, rawInput);

      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        ownerUser(tx, input.approved_by);
        const requestedBy = input.requested_by ?? input.approved_by;
        activeUser(tx, requestedBy);
        const { invoice, invoiceItems, plan: p, split } = plan(tx, input.invoice_id, input.items);

        const header: NewRow<SalesReturn> = {
          id: deps.ids.newId(),
          return_no: tx.numbers.next('return'),
          invoice_id: invoice.id,
          approved_by: input.approved_by,
          requested_by: requestedBy,
          return_date: todayUtc(deps.clock),
          reason: input.note ?? null,
          refund_method: split.khata > 0 ? 'khata_credit' : 'cash',
          total: p.total,
          cash_amount: split.cash,
          khata_amount: split.khata,
          ...deps.scope,
        };
        tx.salesReturns.insert(header);
        // The owner approved this return: keep a record of who, what and how much.
        tx.audit.insert(
          rows.audit({
            user_id: input.approved_by,
            action: 'return_approved',
            table_name: 'sales_returns',
            row_id: header.id,
            details: {
              return_no: header.return_no, invoice_id: invoice.id, total: p.total, refund_method: header.refund_method,
              cash_amount: split.cash, khata_amount: split.khata, requested_by: requestedBy,
            },
          }),
        );
        if (input.approval_used) {
          tx.audit.insert(
            rows.audit({
              user_id: input.approval_used.approved_by,
              action: 'approval_used',
              table_name: 'sales_returns',
              row_id: header.id,
              details: { requested_by: input.approval_used.requested_by, actions: ['return_approve'] },
            }),
          );
        }

        const lines: NewRow<SalesReturnItem>[] = [];
        for (const line of p.lines) {
          const row: NewRow<SalesReturnItem> = {
            id: deps.ids.newId(),
            sales_return_id: header.id,
            invoice_item_id: line.invoice_item_id,
            qty: line.qty,
            refund_amount: line.refund_amount,
            tax_refund: line.tax_refund,
            condition: line.condition,
            reason: line.reason,
            ...deps.scope,
          };
          tx.salesReturns.insertItem(row);
          lines.push(row);

          // Everything that comes back is booked into the batch it was sold from. Resellable goods stay there; the rest are written off at once.
          const original = found(invoiceItems.find((i) => i.id === line.invoice_item_id), 'invoice item', line.invoice_item_id);
          const move = { batch_id: original.batch_id, ref_type: 'return', ref_id: header.id, created_by: requestedBy };
          tx.stock.insert(rows.stock({ ...move, qty_delta: line.qty, movement_type: 'sale_return' }));
          if (line.write_off) tx.stock.insert(rows.stock({ ...move, qty_delta: -line.qty, movement_type: line.write_off }));
        }

        if (split.khata > 0 && invoice.customer_id !== null) {
          tx.ledger.insert(
            rows.ledger({
              party_type: 'customer', party_id: invoice.customer_id, entry_type: 'return', amount_delta: -split.khata,
              ref_type: 'return', ref_id: header.id, entry_date: now, created_by: requestedBy,
            }),
          );
        }

        return { sales_return: header, items: lines };
      });
    },

    /**
     * Owner only. Cancels a whole sale that was a mistake: the invoice stays on record marked voided (with the reason and the owner), the stock goes back
     * on the batches it came from with new `void` movements, and what the sale left on the customer's Khata is taken off with a compensating ledger row.
     * What the customer paid is handed back in cash (nothing is written for it: it is `paid_amount` of the voided invoice). An invoice that already has
     * returns is refused (return the rest instead). One transaction, one `invoice_voided` audit row.
     */
    voidInvoice(rawInput: VoidInvoiceInput): VoidResult {
      const input = parseInput(VoidInput, rawInput);
      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        ownerUser(tx, input.voided_by);
        const invoice = found(tx.invoices.getById(input.invoice_id), 'invoice', input.invoice_id);
        if (invoice.status !== 'active') throw new DomainError('INVOICE_VOIDED', 'the invoice is already voided');
        if (input.reason.length === 0) throw new DomainError('VOID_REASON_REQUIRED', 'a reason is needed to void an invoice');
        const items = tx.invoices.listItems(invoice.id);
        const plan = planVoid({
          invoice,
          items,
          has_returns: tx.salesReturns.hasReturns(invoice.id),
          refund_paid_part_to_khata: readCustomerSettings(tx).refund_paid_part_to_khata,
        });

        tx.invoices.markVoided(invoice.id, input.reason, input.voided_by);
        for (const s of plan.stock) {
          tx.stock.insert(rows.stock({ batch_id: s.batch_id, qty_delta: s.qty, movement_type: 'void', ref_type: 'invoice', ref_id: invoice.id, created_by: input.voided_by }));
        }
        if (plan.khata > 0 && invoice.customer_id !== null) {
          tx.ledger.insert(
            rows.ledger({
              party_type: 'customer', party_id: invoice.customer_id, entry_type: 'return', amount_delta: -plan.khata,
              ref_type: 'void', ref_id: invoice.id, entry_date: now, created_by: input.voided_by,
            }),
          );
        }
        tx.audit.insert(
          rows.audit({
            user_id: input.voided_by,
            action: 'invoice_voided',
            table_name: 'invoices',
            row_id: invoice.id,
            details: { invoice_no: invoice.invoice_no, total: invoice.total, paid_amount: invoice.paid_amount, reason: input.reason, khata_reversed: plan.khata, cash_back: plan.cash },
          }),
        );
        return { invoice_id: invoice.id, invoice_no: invoice.invoice_no, khata_reversed: plan.khata, cash_back: plan.cash, stock_lines: plan.stock.length };
      });
    },
  };
}
export type SalesReturnService = ReturnType<typeof createSalesReturnService>;
