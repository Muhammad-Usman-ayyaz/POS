import { z } from 'zod';
import { todayUtc } from '../clock.js';
import { DomainError } from '../errors.js';
import { Id, IsoDate, NonNegPaisa, Qty } from '../schemas/common.js';
import { activeUser, found, liveBatch, liveProduct, liveSupplier, parseInput, pickOrCreateBatch, rowFactory, type ServiceDeps } from './support.js';

export const OpeningStockInput = z.object({
  product_id: Id,
  supplier_id: Id.optional(),
  batch_no: z.string().min(1),
  expiry_date: IsoDate,
  /** Paisa per pack. */
  cost_price: NonNegPaisa,
  /** Base units. */
  qty: Qty,
  created_by: Id,
});
export type OpeningStockInput = z.input<typeof OpeningStockInput>;

export const AdjustStockInput = z.object({
  batch_id: Id,
  /** Plus adds stock, minus removes it. Not zero. */
  qty_delta: z.number().int().refine((n) => n !== 0, { message: 'cannot be 0' }),
  created_by: Id,
});
export type AdjustStockInput = z.input<typeof AdjustStockInput>;

export const WriteOffInput = z.object({
  batch_id: Id,
  qty: Qty,
  kind: z.enum(['damage', 'expired']),
  created_by: Id,
});
export type WriteOffInput = z.input<typeof WriteOffInput>;

export interface BatchStockView {
  batch_id: string;
  batch_no: string;
  expiry_date: string;
  cost_price: number;
  stock: number;
  expired: boolean;
  /** Stock that can be sold today: zero for an expired batch. */
  sellable: number;
}

/** Stock is never stored. It is the sum of stock_movements per batch, and every change here is a new row. */
export function createStockService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  return {
    /** Batches of a product with stock, soonest expiry first. */
    batchesOf(productId: string): BatchStockView[] {
      return deps.uow.run((tx) => {
        const today = todayUtc(deps.clock);
        liveProduct(tx, productId);
        return tx.batches
          .listForProduct(productId)
          .map((b) => {
            const expired = b.expiry_date < today;
            return {
              batch_id: b.id,
              batch_no: b.batch_no,
              expiry_date: b.expiry_date,
              cost_price: b.cost_price,
              stock: b.stock,
              expired,
              sellable: expired ? 0 : b.stock,
            };
          })
          .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : a.batch_id < b.batch_id ? -1 : 1));
      });
    },

    /** Opening stock: one `opening` movement for a batch (the batch is created if it is new). Returns the batch id. */
    openingStock(rawInput: OpeningStockInput): string {
      const input = parseInput(OpeningStockInput, rawInput);
      return deps.uow.run((tx) => {
        activeUser(tx, input.created_by);
        liveProduct(tx, input.product_id);
        if (input.supplier_id) liveSupplier(tx, input.supplier_id);
        const batchId = pickOrCreateBatch(tx, deps, {
          product_id: input.product_id,
          supplier_id: input.supplier_id ?? null,
          batch_no: input.batch_no,
          expiry_date: input.expiry_date,
          cost_price: input.cost_price,
        });
        tx.stock.insert(rows.stock({ batch_id: batchId, qty_delta: input.qty, movement_type: 'opening', created_by: input.created_by }));
        return batchId;
      });
    },

    /** Count correction. The batch can never go below zero. */
    adjust(rawInput: AdjustStockInput): void {
      const input = parseInput(AdjustStockInput, rawInput);
      deps.uow.run((tx) => {
        activeUser(tx, input.created_by);
        const batch = liveBatch(tx, input.batch_id);
        const current = tx.stock.stockOfBatch(input.batch_id);
        if (current + input.qty_delta < 0) {
          throw new DomainError('INSUFFICIENT_STOCK', `batch has ${current}, cannot remove ${-input.qty_delta}`, {
            available: current,
            requested: -input.qty_delta,
            packSize: tx.products.getById(batch.product_id)?.pack_size ?? 1,
            scope: 'batch',
          });
        }
        const movement = rows.stock({ batch_id: input.batch_id, qty_delta: input.qty_delta, movement_type: 'adjustment', created_by: input.created_by });
        tx.stock.insert(movement);
        tx.audit.insert(
          rows.audit({
            user_id: input.created_by,
            action: 'stock_adjustment',
            table_name: 'stock_movements',
            row_id: movement.id,
            details: { batch_id: input.batch_id, qty_delta: input.qty_delta, stock_before: current, stock_after: current + input.qty_delta },
          }),
        );
      });
    },

    /** Damaged or expired goods taken out of stock. */
    writeOff(rawInput: WriteOffInput): void {
      const input = parseInput(WriteOffInput, rawInput);
      deps.uow.run((tx) => {
        activeUser(tx, input.created_by);
        const batch = liveBatch(tx, input.batch_id);
        const current = tx.stock.stockOfBatch(input.batch_id);
        if (input.qty > current) {
          throw new DomainError('INSUFFICIENT_STOCK', `batch has ${current}, cannot write off ${input.qty}`, {
            available: current,
            requested: input.qty,
            packSize: tx.products.getById(batch.product_id)?.pack_size ?? 1,
            scope: 'batch',
          });
        }
        const movement = rows.stock({ batch_id: input.batch_id, qty_delta: -input.qty, movement_type: input.kind, created_by: input.created_by });
        tx.stock.insert(movement);
        tx.audit.insert(
          rows.audit({
            user_id: input.created_by,
            action: 'stock_write_off',
            table_name: 'stock_movements',
            row_id: movement.id,
            details: { batch_id: input.batch_id, qty: input.qty, kind: input.kind, stock_before: current, stock_after: current - input.qty },
          }),
        );
      });
    },

    /** Current stock of one batch. */
    stockOfBatch(batchId: string): number {
      return deps.uow.run((tx) => {
        found(tx.batches.getById(batchId), 'batch', batchId);
        return tx.stock.stockOfBatch(batchId);
      });
    },
  };
}
export type StockService = ReturnType<typeof createStockService>;
