import { DomainError } from '../errors.js';

/** A batch as the allocator sees it: current stock is the sum of its stock movements. */
export interface AllocatableBatch {
  batch_id: string;
  /** `YYYY-MM-DD` */
  expiry_date: string;
  /** In base units. */
  stock: number;
}

export interface AllocateRequest {
  /** Wanted, in base units. */
  qty: number;
  pack_size: number;
  allow_loose: boolean;
  /** `YYYY-MM-DD`. Passed in so this stays pure and testable. A batch is expired only when expiry_date < today. */
  today: string;
  batches: readonly AllocatableBatch[];
}

export interface Allocation {
  batch_id: string;
  qty: number;
}

function checkRequest(req: AllocateRequest): void {
  if (!Number.isInteger(req.qty) || req.qty <= 0) throw new DomainError('INVALID_QUANTITY', `quantity must be a positive integer: ${req.qty}`);
  if (!req.allow_loose && req.qty % req.pack_size !== 0) {
    throw new DomainError('WHOLE_PACKS_ONLY', `this product is sold in whole packs of ${req.pack_size}`, { packSize: req.pack_size });
  }
}

const isExpired = (b: AllocatableBatch, today: string): boolean => b.expiry_date < today;

/** Stock that can actually be taken from a batch. Pack-only products can only give whole packs. */
function usableStock(b: AllocatableBatch, req: AllocateRequest): number {
  return req.allow_loose ? b.stock : b.stock - (b.stock % req.pack_size);
}

/**
 * Picks batches earliest-expiry-first, skips expired and empty ones, and splits across batches when
 * one is not enough. Ties on expiry go to the lower batch_id so the result is always the same.
 * Pack-only products are split in whole packs, because the database checks every invoice line.
 */
export function allocateBatches(req: AllocateRequest): Allocation[] {
  checkRequest(req);

  const candidates = req.batches
    .filter((b) => !isExpired(b, req.today) && usableStock(b, req) > 0)
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : a.batch_id < b.batch_id ? -1 : 1));

  const result: Allocation[] = [];
  let remaining = req.qty;
  for (const b of candidates) {
    if (remaining === 0) break;
    const take = Math.min(remaining, usableStock(b, req));
    result.push({ batch_id: b.batch_id, qty: take });
    remaining -= take;
  }

  if (remaining > 0) {
    const available = req.qty - remaining;
    throw new DomainError('INSUFFICIENT_STOCK', `only ${available} available, ${req.qty} requested`, { available, requested: req.qty, packSize: req.pack_size, scope: 'product' });
  }
  return result;
}

/**
 * Checks a batch choice made by hand (the manual override) against the same rules.
 * Returns the allocations unchanged when they are valid.
 */
export function validateManualAllocation(req: AllocateRequest, manual: readonly Allocation[]): Allocation[] {
  checkRequest(req);
  const seen = new Set<string>();
  let total = 0;

  for (const m of manual) {
    if (seen.has(m.batch_id)) throw new DomainError('DUPLICATE_LINE', `batch chosen twice: ${m.batch_id}`);
    seen.add(m.batch_id);
    if (!Number.isInteger(m.qty) || m.qty <= 0) throw new DomainError('INVALID_QUANTITY', `quantity must be a positive integer: ${m.qty}`);

    const batch = req.batches.find((b) => b.batch_id === m.batch_id);
    if (!batch) throw new DomainError('BATCH_NOT_AVAILABLE', `batch is not one of this product's batches: ${m.batch_id}`);
    if (isExpired(batch, req.today)) throw new DomainError('BATCH_EXPIRED', `batch expired on ${batch.expiry_date}`, { expiry: batch.expiry_date });
    if (!req.allow_loose && m.qty % req.pack_size !== 0) {
      throw new DomainError('WHOLE_PACKS_ONLY', `this product is sold in whole packs of ${req.pack_size}`, { packSize: req.pack_size });
    }
    if (m.qty > batch.stock) {
      throw new DomainError('INSUFFICIENT_STOCK', `batch has ${batch.stock}, ${m.qty} requested`, { available: batch.stock, requested: m.qty, packSize: req.pack_size, scope: 'batch' });
    }
    total += m.qty;
  }

  if (total !== req.qty) throw new DomainError('ALLOCATION_MISMATCH', `batches add up to ${total}, but ${req.qty} was requested`);
  return manual.map((m) => ({ ...m }));
}
