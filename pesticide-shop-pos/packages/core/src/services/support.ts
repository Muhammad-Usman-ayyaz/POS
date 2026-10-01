import type { z } from 'zod';
import type { Clock } from '../clock.js';
import { DomainError } from '../errors.js';
import type { DeviceScope, IdGenerator, NewRow, Repositories, UnitOfWork } from '../ports/index.js';
import type { Batch, Customer, LedgerEntry, Payment, Product, PublicUser, StockMovement, Supplier } from '../schemas/index.js';

/** What every service needs. The adapters (SQLite, real clock, crypto) are supplied from outside core. */
export interface ServiceDeps {
  uow: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  scope: DeviceScope;
}

/** Validates input at the service boundary. A bad shape becomes a DomainError, not a raw ZodError. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new DomainError('INVALID_INPUT', detail);
  }
  return result.data;
}

export function found<T>(row: T | undefined, what: string, id: string): T {
  if (row === undefined) throw new DomainError('NOT_FOUND', `${what} not found: ${id}`);
  return row;
}

const isLive = (row: { deleted_at: string | null }): boolean => row.deleted_at === null;

export function liveProduct(tx: Repositories, id: string): Product {
  const p = found(tx.products.getById(id), 'product', id);
  if (!isLive(p) || p.is_active !== 1) throw new DomainError('PRODUCT_INACTIVE', `product is not for sale: ${p.name_en ?? p.name_ur ?? id}`);
  return p;
}

export function liveCustomer(tx: Repositories, id: string): Customer {
  const c = found(tx.customers.getById(id), 'customer', id);
  if (!isLive(c)) throw new DomainError('NOT_FOUND', `customer not found: ${id}`);
  return c;
}

export function liveSupplier(tx: Repositories, id: string): Supplier {
  const s = found(tx.suppliers.getById(id), 'supplier', id);
  if (!isLive(s)) throw new DomainError('NOT_FOUND', `supplier not found: ${id}`);
  return s;
}

export function liveBatch(tx: Repositories, id: string): Batch {
  const b = found(tx.batches.getById(id), 'batch', id);
  if (!isLive(b)) throw new DomainError('NOT_FOUND', `batch not found: ${id}`);
  return b;
}

/** The person doing the action must exist and be active. */
export function activeUser(tx: Repositories, id: string): PublicUser {
  const u = found(tx.users.getById(id), 'user', id);
  if (u.is_active !== 1 || !isLive(u)) throw new DomainError('NOT_AUTHORIZED', 'this user is not active');
  return u;
}

/** Owner-only actions (approving a return). */
export function ownerUser(tx: Repositories, id: string): PublicUser {
  const u = activeUser(tx, id);
  if (u.role !== 'owner') throw new DomainError('NOT_AUTHORIZED', 'only the owner can do this');
  return u;
}

/**
 * Builders for the rows every service writes. Each gets a new id and the device scope, and never sets
 * created_at, updated_at, deleted_at or version: the database owns those.
 */
export function rowFactory(deps: ServiceDeps) {
  const base = () => ({ id: deps.ids.newId(), ...deps.scope });
  return {
    stock(a: {
      batch_id: string;
      qty_delta: number;
      movement_type: StockMovement['movement_type'];
      ref_type?: string;
      ref_id?: string;
      created_by: string;
    }): NewRow<StockMovement> {
      return {
        ...base(),
        batch_id: a.batch_id,
        qty_delta: a.qty_delta,
        movement_type: a.movement_type,
        ref_type: a.ref_type ?? null,
        ref_id: a.ref_id ?? null,
        created_by: a.created_by,
      };
    },

    ledger(a: {
      party_type: LedgerEntry['party_type'];
      party_id: string;
      entry_type: LedgerEntry['entry_type'];
      amount_delta: number;
      ref_type?: string;
      ref_id?: string;
      entry_date: string;
      created_by: string;
    }): NewRow<LedgerEntry> {
      return {
        ...base(),
        party_type: a.party_type,
        party_id: a.party_id,
        entry_type: a.entry_type,
        amount_delta: a.amount_delta,
        ref_type: a.ref_type ?? null,
        ref_id: a.ref_id ?? null,
        entry_date: a.entry_date,
        created_by: a.created_by,
      };
    },

    payment(a: {
      party_type: Payment['party_type'];
      party_id: string;
      method: Payment['method'];
      reference_no?: string;
      amount: number;
      direction: Payment['direction'];
      paid_at: string;
      created_by: string;
    }): NewRow<Payment> {
      return {
        ...base(),
        party_type: a.party_type,
        party_id: a.party_id,
        method: a.method,
        reference_no: a.reference_no ?? null,
        amount: a.amount,
        direction: a.direction,
        paid_at: a.paid_at,
        created_by: a.created_by,
      };
    },
  };
}

/**
 * Finds the batch for (product, batch number) or creates it. If it already exists with a different expiry
 * or cost price we stop instead of quietly mixing two different things under one batch number.
 */
export function pickOrCreateBatch(
  tx: Repositories,
  deps: ServiceDeps,
  want: { product_id: string; supplier_id: string | null; batch_no: string; expiry_date: string; cost_price: number },
): string {
  const existing = tx.batches.getByProductAndNo(want.product_id, want.batch_no);
  if (existing) {
    if (existing.expiry_date !== want.expiry_date || existing.cost_price !== want.cost_price) {
      throw new DomainError(
        'BATCH_CONFLICT',
        `batch ${want.batch_no} already exists with expiry ${existing.expiry_date} and cost ${existing.cost_price}`,
      );
    }
    return existing.id;
  }
  const id = deps.ids.newId();
  tx.batches.insert({
    id,
    product_id: want.product_id,
    supplier_id: want.supplier_id,
    batch_no: want.batch_no,
    expiry_date: want.expiry_date,
    cost_price: want.cost_price,
    ...deps.scope,
  });
  return id;
}
