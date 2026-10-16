import {
  DomainError,
  HeldPayloadSchema,
  type DeviceScope,
  type HeldBillCustomer,
  type HeldBillLine,
  type HeldBillSummary,
  type HeldCart,
  type HeldPayload,
  type ResumedHeldBill,
} from '@pos/core';
import type { Db } from './connection.js';

// Held bills (migration 006): a draft of a cart that is set aside at the counter and resumed or discarded, once.
//
// What is stored is only what the cashier chose (see HeldCartSchema): no price, tax, total or cost. The queries here NAME their columns and
// never select a price. Who held a bill comes from the caller's user id (the session), never from the request. The table's triggers also
// refuse a hard delete, an edit of the cart and a second resolution; the UPDATE below says `status = 'held'` as well, so the second try
// finds nothing to change and is told HELD_BILL_GONE instead of hitting the trigger.

interface BillRow {
  id: string;
  held_by_name: string;
  created_at: string;
  customer_id: string | null;
  price_type: 'retail' | 'wholesale';
  line_count: number;
  payload: string;
  c_name_en: string | null;
  c_name_ur: string | null;
  c_village: string | null;
  c_price_type: 'retail' | 'wholesale' | null;
}

const BILL_SELECT = `SELECT h.id, u.name AS held_by_name, h.created_at, h.customer_id, h.price_type, h.line_count, h.payload,
                            c.name_en AS c_name_en, c.name_ur AS c_name_ur, c.village AS c_village, c.default_price_type AS c_price_type
                       FROM held_bills h
                       JOIN users u ON u.id = h.held_by
                       LEFT JOIN customers c ON c.id = h.customer_id`;

const parsePayload = (text: string): HeldPayload => {
  const parsed = HeldPayloadSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new DomainError('INTERNAL', 'a held bill holds something that is not a cart');
  return parsed.data;
};

function summaryOf(row: BillRow): HeldBillSummary {
  const customer: HeldBillCustomer | null =
    row.customer_id === null
      ? null
      : { id: row.customer_id, name_en: row.c_name_en, name_ur: row.c_name_ur, village: row.c_village, default_price_type: row.c_price_type ?? 'retail' };
  return {
    id: row.id,
    held_by_name: row.held_by_name,
    held_at: row.created_at,
    customer,
    price_type: row.price_type,
    line_count: row.line_count,
    note: parsePayload(row.payload).note ?? null,
  };
}

/** Puts a cart on hold for `heldBy`. Every product must exist. Returns the new bill's id. */
export function holdBill(db: Db, scope: DeviceScope, input: { id: string; heldBy: string; cart: HeldCart }, audit?: () => void): string {
  const { cart } = input;
  const payload: HeldPayload = { ...(cart.note !== undefined ? { note: cart.note } : {}), lines: cart.lines };
  db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM products WHERE id = ? AND deleted_at IS NULL');
    for (const line of cart.lines) {
      if (!exists.get(line.product_id)) throw new DomainError('NOT_FOUND', 'a product on this bill does not exist', { product_id: line.product_id });
    }
    db.prepare(
      `INSERT INTO held_bills (id, held_by, customer_id, price_type, line_count, payload, shop_id, branch_id, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.id, input.heldBy, cart.customer_id ?? null, cart.price_type ?? 'retail', cart.lines.length, JSON.stringify(payload), scope.shop_id, scope.branch_id, scope.device_id);
    audit?.();
  }).immediate();
  return input.id;
}

/** The bills still on hold, oldest first, each with who held it and when. */
export function listHeldBills(db: Db, limit = 200): HeldBillSummary[] {
  const rows = db.prepare(`${BILL_SELECT} WHERE h.status = 'held' AND h.deleted_at IS NULL ORDER BY h.created_at, h.rowid LIMIT ?`).all(limit) as BillRow[];
  return rows.map(summaryOf);
}

/**
 * Resolves a held bill as 'resumed' or 'discarded', once, in one transaction. The UPDATE only matches a bill that is still held, so of two
 * calls for the same bill exactly one changes a row; the other is told HELD_BILL_GONE. `audit` runs in the same transaction.
 * Returns the bill as it was held (for a resume, with the lines).
 */
function resolve(db: Db, id: string, by: string, status: 'resumed' | 'discarded', audit?: () => void): ResumedHeldBill {
  return db
    .transaction(() => {
      const changed = db
        .prepare(
          `UPDATE held_bills SET status = ?, resolved_by = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ? AND status = 'held' AND deleted_at IS NULL`,
        )
        .run(status, by, id).changes;
      if (changed === 0) throw new DomainError('HELD_BILL_GONE', 'this held bill was already resumed or discarded, or does not exist');
      const row = db.prepare(`${BILL_SELECT} WHERE h.id = ?`).get(id) as BillRow;
      const payload = parsePayload(row.payload);
      const lines = linesOf(db, payload);
      audit?.();
      return { ...summaryOf(row), lines };
    })
    .immediate();
}

function linesOf(db: Db, payload: HeldPayload): HeldBillLine[] {
  const product = db.prepare('SELECT COALESCE(g.name_en, p.name_en) AS name_en, COALESCE(g.name_ur, p.name_ur) AS name_ur, p.pack_label, p.pack_size, p.allow_loose, p.base_unit FROM products p LEFT JOIN product_groups g ON g.id = p.group_id WHERE p.id = ?');
  return payload.lines.map((line) => {
    const p = product.get(line.product_id) as { name_en: string | null; name_ur: string | null; pack_label: string; pack_size: number; allow_loose: number; base_unit: HeldBillLine['base_unit'] } | undefined;
    if (!p) throw new DomainError('NOT_FOUND', 'a product on this held bill does not exist', { product_id: line.product_id });
    return {
      product_id: line.product_id,
      qty: line.qty,
      discount: line.discount?.value ?? 0,
      batch_id: line.batch_id ?? null,
      name_en: p.name_en,
      name_ur: p.name_ur,
      pack_label: p.pack_label,
      pack_size: p.pack_size,
      allow_loose: p.allow_loose === 1,
      base_unit: p.base_unit,
    };
  });
}

/** Takes a bill off hold and returns its cart. Works once: a second try (or a bill that is not there) throws HELD_BILL_GONE. */
export function resumeHeldBill(db: Db, id: string, by: string, audit?: () => void): ResumedHeldBill {
  return resolve(db, id, by, 'resumed', audit);
}

/** Throws a held bill away. Works once, like resume. */
export function discardHeldBill(db: Db, id: string, by: string, audit?: () => void): void {
  resolve(db, id, by, 'discarded', audit);
}
