import { z } from 'zod';
import { daysBetween, nowIso, todayUtc } from '../clock.js';
import { DomainError } from '../errors.js';
import { priceForQty } from '../money/index.js';
import { Id, IsoDate, NonNegPaisa, PaymentMethod, Qty } from '../schemas/common.js';
import type { Purchase, PurchaseItem } from '../schemas/index.js';
import type { NewRow } from '../ports/index.js';
import { activeUser, liveProduct, liveSupplier, parseInput, pickOrCreateBatch, rowFactory, type ServiceDeps } from './support.js';

/** A receipt dated more than this many days ago needs the owner's confirmation (a typo in the date is likelier than a month-old delivery). */
export const OLD_RECEIPT_DAYS = 30;

export const PurchaseInput = z.object({
  supplier_id: Id,
  supplier_invoice_no: z.string().min(1).optional(),
  /** The day the goods arrived. Defaults to today. A PAST day is allowed (yesterday's delivery, entered today) and is audited; a future day is refused. */
  purchase_date: IsoDate.optional(),
  /** The owner has seen "this receipt is dated N days ago" and says save anyway. Needed when the date is more than OLD_RECEIPT_DAYS ago. */
  confirm_old_date: z.boolean().optional(),
  /** Paisa off the whole purchase. */
  discount: NonNegPaisa.default(0),
  /** Paid to the supplier now. */
  paid_amount: NonNegPaisa.default(0),
  /** Pay the whole total now (the total is worked out here, after the discount). Do not also give paid_amount. */
  pay_in_full: z.boolean().optional(),
  payment_method: PaymentMethod.default('cash'),
  reference_no: z.string().min(1).optional(),
  created_by: Id,
  items: z
    .array(
      z.object({
        product_id: Id,
        batch_no: z.string().min(1),
        expiry_date: IsoDate,
        /** Base units. */
        qty: Qty,
        /** Paisa per pack. */
        cost_price: NonNegPaisa,
      }),
    )
    .min(1),
});
export type PurchaseInput = z.input<typeof PurchaseInput>;

export interface PurchaseResult {
  purchase: NewRow<Purchase>;
  items: NewRow<PurchaseItem>[];
  payment_id: string | null;
}

export function createPurchaseService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /**
     * Stock in, following docs/database-rules.md "Purchase":
     * batch, purchase and items, a `purchase` stock movement per batch, then the supplier ledger
     * (purchase plus total, and if paid a `payment out` with a payment ledger row). One transaction.
     */
    record(rawInput: PurchaseInput): PurchaseResult {
      const input = parseInput(PurchaseInput, rawInput);

      return deps.uow.run((tx) => {
        const now = nowIso(deps.clock);
        const today = todayUtc(deps.clock);
        // A receipt may be dated in the past (the owner enters yesterday's delivery), never in the future.
        if (input.purchase_date !== undefined && input.purchase_date > today) {
          throw new DomainError('FUTURE_DATE', `a receipt cannot be dated in the future: ${input.purchase_date} is after today (${today})`, { date: input.purchase_date, today });
        }
        // A date far in the past is more likely a typo than a late delivery: ask the owner to confirm it.
        const daysAgo = input.purchase_date === undefined ? 0 : daysBetween(input.purchase_date, today);
        if (daysAgo > OLD_RECEIPT_DAYS && input.confirm_old_date !== true) {
          throw new DomainError('RECEIPT_DATE_OLD', `this receipt is dated ${daysAgo} days ago: confirm to save it`, { date: input.purchase_date ?? today, today, days: daysAgo });
        }
        activeUser(tx, input.created_by);
        liveSupplier(tx, input.supplier_id);

        const seen = new Set<string>();
        const lines = input.items.map((item) => {
          const product = liveProduct(tx, item.product_id);
          const key = `${item.product_id}|${item.batch_no}`;
          if (seen.has(key)) throw new DomainError('DUPLICATE_LINE', `batch ${item.batch_no} is listed twice`);
          seen.add(key);
          return { item, line_cost: priceForQty(item.qty, item.cost_price, product.pack_size) };
        });

        const goods = lines.reduce((sum, l) => sum + l.line_cost, 0);
        if (input.discount > goods) throw new DomainError('DISCOUNT_EXCEEDS_LINE', `discount ${input.discount} is more than the purchase ${goods}`, { discount: input.discount, linePrice: goods });
        const total = goods - input.discount;
        if (input.pay_in_full && input.paid_amount !== 0) throw new DomainError('INVALID_INPUT', 'give either pay_in_full or paid_amount, not both');
        const paid = input.pay_in_full ? total : input.paid_amount;
        if (paid > total) throw new DomainError('OVERPAID', `paid ${paid} is more than the total ${total}`, { paid: paid, total });

        const purchase: NewRow<Purchase> = {
          id: deps.ids.newId(),
          supplier_id: input.supplier_id,
          supplier_invoice_no: input.supplier_invoice_no ?? null,
          purchase_date: input.purchase_date ?? today,
          discount: input.discount,
          total,
          paid_amount: paid,
          ...deps.scope,
        };
        tx.purchases.insert(purchase);

        const items: NewRow<PurchaseItem>[] = [];
        for (const { item } of lines) {
          const batch_id = pickOrCreateBatch(tx, deps, {
            product_id: item.product_id,
            supplier_id: input.supplier_id,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date,
            cost_price: item.cost_price,
          });
          const row: NewRow<PurchaseItem> = {
            id: deps.ids.newId(),
            purchase_id: purchase.id,
            batch_id,
            qty: item.qty,
            cost_price: item.cost_price,
            ...deps.scope,
          };
          tx.purchases.insertItem(row);
          items.push(row);
          tx.stock.insert(
            rows.stock({ batch_id, qty_delta: item.qty, movement_type: 'purchase', ref_type: 'purchase', ref_id: purchase.id, created_by: input.created_by }),
          );
        }

        // We now owe the supplier the total. Paying some of it settles that much.
        if (total > 0) {
          tx.ledger.insert(
            rows.ledger({ party_type: 'supplier', party_id: input.supplier_id, entry_type: 'purchase', amount_delta: total, ref_type: 'purchase', ref_id: purchase.id, entry_date: now, created_by: input.created_by }),
          );
        }
        let payment_id: string | null = null;
        if (paid > 0) {
          const payment = rows.payment({
            party_type: 'supplier',
            party_id: input.supplier_id,
            method: input.payment_method,
            ...(input.reference_no ? { reference_no: input.reference_no } : {}),
            amount: paid,
            direction: 'out',
            paid_at: now,
            created_by: input.created_by,
          });
          tx.payments.insert(payment);
          payment_id = payment.id;
          tx.ledger.insert(
            rows.ledger({ party_type: 'supplier', party_id: input.supplier_id, entry_type: 'payment', amount_delta: -paid, ref_type: 'payment', ref_id: payment.id, entry_date: now, created_by: input.created_by }),
          );
        }

        // A receipt dated on another day than today is written to the audit log: who, which day it says, and what it was for.
        if (purchase.purchase_date !== today) {
          tx.audit.insert(
            rows.audit({
              user_id: input.created_by,
              action: 'receipt_backdated',
              table_name: 'purchases',
              row_id: purchase.id,
              details: { purchase_date: purchase.purchase_date, entered_on: today, supplier_id: input.supplier_id, total, ...(daysAgo > OLD_RECEIPT_DAYS ? { days_ago: daysAgo, confirmed_by_user: true } : {}) },
            }),
          );
        }

        return { purchase, items, payment_id };
      });
    },
  };
}
export type PurchaseService = ReturnType<typeof createPurchaseService>;
