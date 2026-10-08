import { z } from 'zod';
import { nowIso, todayUtc } from '../clock.js';
import { DomainError } from '../errors.js';
import { priceForQty } from '../money/index.js';
import { Id, IsoDate, NonNegPaisa, PaymentMethod, Qty } from '../schemas/common.js';
import type { Purchase, PurchaseItem } from '../schemas/index.js';
import type { NewRow } from '../ports/index.js';
import { activeUser, liveProduct, liveSupplier, parseInput, pickOrCreateBatch, rowFactory, type ServiceDeps } from './support.js';

export const PurchaseInput = z.object({
  supplier_id: Id,
  supplier_invoice_no: z.string().min(1).optional(),
  /** Defaults to today. */
  purchase_date: IsoDate.optional(),
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
          purchase_date: input.purchase_date ?? todayUtc(deps.clock),
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

        return { purchase, items, payment_id };
      });
    },
  };
}
export type PurchaseService = ReturnType<typeof createPurchaseService>;
