// Held bills in the database (migration 006's table): hold, list, resume and discard, once; nothing priced is stored; the table's triggers hold.
import { randomUUID } from 'node:crypto';
import { DomainError, systemClock, todayUtc, type DeviceScope, type HeldCart } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, discardHeldBill, holdBill, listHeldBills, loadDeviceInfo, migrate, openDatabase, resumeHeldBill, firstLaunchSetup, type Db } from '../src/index.js';
import { seedDemoData, type DemoIds } from '../src/demo.js';

let db: Db;
let scope: DeviceScope;
let demo: DemoIds;
let owner: string;
let staff: string;
let product: string;
let batch: string;

beforeEach(async () => {
  db = openDatabase(':memory:');
  await migrate(db);
  const setup = firstLaunchSetup(db, { shopName: 'Some Shop', ownerName: 'Owner', ownerUsername: 'owner', ownerPasswordHash: 'x' });
  owner = setup.ownerId;
  scope = loadDeviceInfo(db)!.scope;
  staff = createUser(db, scope, { name: 'Salesman', username: 'staff', passwordHash: 'x', role: 'staff' });
  demo = seedDemoData(db, scope, owner, todayUtc(systemClock));
  product = demo.products['insecticide1l']!;
  batch = demo.batches['insecticide1l']!;
});
afterEach(() => db.close());

const cart = (over: Partial<HeldCart> = {}): HeldCart => ({
  customer_id: demo.customers['rashid']!,
  price_type: 'wholesale',
  note: 'back soon',
  lines: [{ product_id: product, qty: 2000, discount: { kind: 'amount', value: 500 }, batch_id: batch }, { product_id: demo.products['fertilizer50kg'] ?? product, qty: 1000 }],
  ...over,
});
const hold = (by = staff, c: HeldCart = cart()) => holdBill(db, scope, { id: randomUUID(), heldBy: by, cart: c });
const gone = (fn: () => unknown): DomainError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError');
};
/** A column or key that would hold a price, total, tax or cost (price_type, the retail/wholesale choice, is fine). */
const MONEY_KEY = /price(?!_type)|total|cost|tax|amount/;
const MONEY_KEY_IN_JSON = /"[a-z_]*(price(?!_type)|total|cost|tax)[a-z_]*":/;
const row = (id: string) => db.prepare('SELECT * FROM held_bills WHERE id = ?').get(id) as Record<string, unknown>;

describe('hold and list', () => {
  it('stores the cart as chosen, labelled with who held it (from the user id given, with their name) and when', () => {
    const id = hold(staff);
    const listed = listHeldBills(db);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id, held_by_name: 'Salesman', price_type: 'wholesale', line_count: 2, note: 'back soon', customer: { id: demo.customers['rashid'] } });
    expect(listed[0]!.held_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(row(id)).toMatchObject({ held_by: staff, status: 'held', resolved_by: null });
  });

  it('keeps NO price, total, tax or cost in the table row or the payload', () => {
    const id = hold();
    const stored = row(id);
    expect(Object.keys(stored).join(' ')).not.toMatch(MONEY_KEY);
    const payload = JSON.parse(stored.payload as string) as { lines: Record<string, unknown>[] };
    expect(JSON.stringify(payload)).not.toMatch(MONEY_KEY_IN_JSON);
    expect(Object.keys(payload.lines[0]!).sort()).toEqual(['batch_id', 'discount', 'product_id', 'qty']);
    expect(payload.lines[0]!.discount).toEqual({ kind: 'amount', value: 500 }); // the discount as entered
  });

  it('lists only bills still on hold, oldest first, and a walk-in bill has no customer', () => {
    const a = hold(owner, cart({ customer_id: undefined }));
    const b = hold(staff);
    const c = hold(staff);
    discardHeldBill(db, b, owner);
    resumeHeldBill(db, c, staff);
    expect(listHeldBills(db).map((x) => x.id)).toEqual([a]);
    expect(listHeldBills(db)[0]!.customer).toBeNull();
    expect(listHeldBills(db)[0]!.held_by_name).toBe('Owner');
  });

  it('refuses a product that does not exist, and writes nothing (the audit step in the same transaction rolls back too)', () => {
    expect(gone(() => hold(staff, cart({ lines: [{ product_id: randomUUID(), qty: 1 }] }))).code).toBe('NOT_FOUND');
    let audited = false;
    expect(() => holdBill(db, scope, { id: randomUUID(), heldBy: staff, cart: cart() }, () => { audited = true; throw new Error('audit failed'); })).toThrow('audit failed');
    expect(audited).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS c FROM held_bills').get()).toEqual({ c: 0 });
  });
});

describe('resume', () => {
  it('returns the cart with the names and packs of its sizes (no price), and marks the bill resumed by the person who resumed it', () => {
    const id = hold(staff);
    const resumed = resumeHeldBill(db, id, owner);
    expect(resumed.lines[0]).toMatchObject({ product_id: product, qty: 2000, discount: 500, batch_id: batch, allow_loose: expect.any(Boolean), base_unit: expect.any(String) });
    expect(resumed.lines[1]!.discount).toBe(0);
    expect(resumed.lines[1]!.batch_id).toBeNull();
    expect(JSON.stringify(resumed)).not.toMatch(MONEY_KEY_IN_JSON);
    expect(resumed.held_by_name).toBe('Salesman'); // who HELD it, not who resumed it
    expect(row(id)).toMatchObject({ status: 'resumed', resolved_by: owner });
    expect(row(id).resolved_at).toMatch(/^\d{4}-/);
  });

  it('is one-use: a second resume, or a discard after a resume, is HELD_BILL_GONE and changes nothing', () => {
    const id = hold();
    resumeHeldBill(db, id, staff);
    const before = row(id);
    expect(gone(() => resumeHeldBill(db, id, owner)).code).toBe('HELD_BILL_GONE');
    expect(gone(() => discardHeldBill(db, id, owner)).code).toBe('HELD_BILL_GONE');
    expect(row(id)).toEqual(before); // still resumed by the first person, version untouched
  });

  it('a bill that never existed is HELD_BILL_GONE too', () => {
    expect(gone(() => resumeHeldBill(db, randomUUID(), owner)).code).toBe('HELD_BILL_GONE');
  });

  it('its audit step runs in the same transaction: if it fails the bill is still held', () => {
    const id = hold();
    expect(() => resumeHeldBill(db, id, owner, () => { throw new Error('audit failed'); })).toThrow('audit failed');
    expect(row(id).status).toBe('held');
    expect(listHeldBills(db)).toHaveLength(1);
  });
});

describe('discard', () => {
  it('marks the bill discarded by the person who did it, takes it off the list, and works once', () => {
    const id = hold(staff);
    discardHeldBill(db, id, owner);
    expect(row(id)).toMatchObject({ status: 'discarded', resolved_by: owner });
    expect(listHeldBills(db)).toEqual([]);
    expect(gone(() => discardHeldBill(db, id, owner)).code).toBe('HELD_BILL_GONE');
    expect(gone(() => resumeHeldBill(db, id, owner)).code).toBe('HELD_BILL_GONE');
  });
});

describe('the table protects itself (migration 006 triggers), whatever the code does', () => {
  const message = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    return 'no error';
  };

  it('a held bill cannot be deleted, not even a resolved one', () => {
    const id = hold();
    expect(message(() => db.prepare('DELETE FROM held_bills WHERE id = ?').run(id))).toMatch(/hard delete not allowed/);
    discardHeldBill(db, id, owner);
    expect(message(() => db.prepare('DELETE FROM held_bills WHERE id = ?').run(id))).toMatch(/hard delete not allowed/);
  });

  it('the cart cannot be edited: not the payload, the holder, the customer, the price type or the line count', () => {
    const id = hold();
    for (const [column, value] of [['payload', '{"lines":[]}'], ['held_by', owner], ['customer_id', null], ['price_type', 'retail'], ['line_count', 9]] as const) {
      expect(message(() => db.prepare(`UPDATE held_bills SET ${column} = ? WHERE id = ?`).run(value, id)), column).toMatch(/not edited/);
    }
  });

  it('a resolved bill cannot be resolved again, even by direct SQL', () => {
    const id = hold();
    resumeHeldBill(db, id, owner);
    expect(message(() => db.prepare("UPDATE held_bills SET status = 'discarded', resolved_by = ?, resolved_at = 'x' WHERE id = ?").run(staff, id))).toMatch(/already resumed or discarded/);
    expect(message(() => db.prepare("UPDATE held_bills SET status = 'held' WHERE id = ?").run(id))).toMatch(/already resumed or discarded/);
  });

  it('resolving without saying who and when is refused, and the version goes up by one for a real resolution', () => {
    const id = hold();
    expect(message(() => db.prepare("UPDATE held_bills SET status = 'resumed' WHERE id = ?").run(id))).toMatch(/CHECK/);
    expect(row(id).version).toBe(1);
    resumeHeldBill(db, id, owner);
    expect(row(id).version).toBe(2);
  });

  it('a bill with no lines, or a holder who is not a user, is refused', () => {
    expect(message(() => db.prepare("INSERT INTO held_bills (id, held_by, line_count, payload, shop_id, branch_id, device_id) VALUES (?, ?, 0, '{}', ?, ?, ?)").run(randomUUID(), owner, scope.shop_id, scope.branch_id, scope.device_id))).toMatch(/CHECK/);
    expect(message(() => hold(randomUUID()))).toMatch(/FOREIGN KEY/);
  });
});

describe('two resumes of the same bill, one after the other, give the cart to exactly one', () => {
  it('the first gets the cart, the second is told it is gone, and the list is empty', () => {
    const id = hold();
    const outcomes = [owner, staff].map((who) => {
      try {
        return resumeHeldBill(db, id, who).lines.length;
      } catch (e) {
        return (e as DomainError).code;
      }
    });
    expect(outcomes).toEqual([2, 'HELD_BILL_GONE']);
  });
});
