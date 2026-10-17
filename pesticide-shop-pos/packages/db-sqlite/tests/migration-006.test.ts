// Migration 006 (invoices.request_id and held_bills) applied on a shop that already has sales at version 5, and the rules it adds.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, currentSchemaVersion, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;
const S = ['s1', 'b1', 'd1'] as const;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig006-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo5 = () => loadMigrations().slice(0, 5);
const upTo6 = () => loadMigrations().slice(0, 6);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;
const tables = (db: Db) => all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name as string);
const dump = (db: Db, table: string, omit: string[] = []): Row[] => all(db, `SELECT * FROM ${table} ORDER BY rowid`).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k))));
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};

/** A shop at version 5 with an owner, a customer and three sales. */
async function shopAtVersion5(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo5() });
  expect(currentSchemaVersion(db)).toBe(5);
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u2', 'Staff', 'staff', 'x', 'staff', 's1', 'b1', 'd1');
           INSERT INTO customers (id, name_en, shop_id, branch_id, device_id) VALUES ('c1', 'Rashid', 's1', 'b1', 'd1');`);
  const invoice = db.prepare("INSERT INTO invoices (id, invoice_no, created_by, subtotal, total, paid_amount, shop_id, branch_id, device_id) VALUES (?, ?, 'u2', 1000, 1000, 1000, 's1', 'b1', 'd1')");
  invoice.run('e0000001', 'INV-A-000001');
  invoice.run('e0000002', 'INV-A-000002');
  invoice.run('e0000003', 'INV-A-000003');
  return db;
}

const insertInvoice = (db: Db, id: string, requestId: string | null) =>
  db.prepare("INSERT INTO invoices (id, invoice_no, created_by, subtotal, total, paid_amount, request_id, shop_id, branch_id, device_id) VALUES (?, ?, 'u2', 1, 1, 1, ?, 's1', 'b1', 'd1')").run(id, `INV-${id}`, requestId);

const insertHeld = (db: Db, id: string, over: Row = {}) => {
  const row: Row = { id, held_by: 'u2', customer_id: null, price_type: 'retail', line_count: 2, payload: '{"lines":[]}', shop_id: 's1', branch_id: 'b1', device_id: 'd1', ...over };
  const names = Object.keys(row);
  db.prepare(`INSERT INTO held_bills (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...Object.values(row));
};

describe('migration 006 on a shop that already has sales', () => {
  it('takes a backup of the version-5 file, applies, keeps every row, and leaves existing invoices without a request id', async () => {
    const db = await shopAtVersion5(join(dir, 'shop.db'));
    const before = Object.fromEntries(tables(db).filter((t) => t !== 'schema_version').map((t) => [t, dump(db, t)]));
    const result = await migrate(db, { migrations: upTo6() });
    expect(result.applied).toEqual([6]);
    expect(currentSchemaVersion(db)).toBe(6);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
    for (const [table, rows] of Object.entries(before)) expect(dump(db, table, table === 'invoices' ? ['request_id'] : []), table).toEqual(rows);
    expect(all(db, 'SELECT request_id FROM invoices').every((r) => r.request_id === null)).toBe(true);
    expect(checkIntegrity(db)).toEqual({ ok: true, problems: [] });
    const backup = openDatabase(result.backupPath!);
    expect(currentSchemaVersion(backup)).toBe(5);
    expect(all(backup, 'PRAGMA table_info(invoices)').map((c) => c.name)).not.toContain('request_id');
    backup.close();
    db.close();
  });

  it('is all or nothing: a failure at the very end leaves the version-5 database exactly as it was', async () => {
    const db = await shopAtVersion5(join(dir, 'shop.db'));
    const snapshot = () => Object.fromEntries(tables(db).map((t) => [t, dump(db, t)]));
    const before = snapshot();
    const broken = loadMigrations().map((m) => (m.version === 6 ? { ...m, sql: `${m.sql}\nSELECT * FROM a_table_that_does_not_exist;` } : m));
    await expect(migrate(db, { migrations: broken })).rejects.toThrow(/Migration 6_sale_request_id_and_held_bills failed/);
    expect(currentSchemaVersion(db)).toBe(5);
    expect(db.inTransaction).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(all(db, 'PRAGMA table_info(invoices)').map((c) => c.name)).not.toContain('request_id');
    expect(all(db, "SELECT name FROM sqlite_master WHERE name IN ('held_bills', 'uq_invoices_request_id', 'trg_invoices_request_id_fixed')")).toEqual([]);
    db.close();
  });

  it('a second run changes nothing, and a fresh database gets everything', async () => {
    const db = await shopAtVersion5(join(dir, 'shop.db'));
    await migrate(db, { migrations: upTo6() });
    expect(await migrate(db, { migrations: upTo6() })).toMatchObject({ applied: [], currentVersion: 6 });
    db.close();
    const fresh = openDatabase(':memory:');
    expect((await migrate(fresh, { migrations: upTo6() })).applied).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all(fresh, "SELECT name FROM sqlite_master WHERE name IN ('held_bills', 'uq_invoices_request_id', 'idx_held_bills_status') ORDER BY name").map((r) => r.name)).toEqual(['held_bills', 'idx_held_bills_status', 'uq_invoices_request_id']);
    fresh.close();
  });
});

describe('invoices.request_id', () => {
  let db: Db;
  beforeEach(async () => {
    db = await shopAtVersion5(join(dir, 'shop.db'));
    await migrate(db);
  });
  afterEach(() => db.close());

  it('the same request id cannot be used on two invoices: the database refuses it, whatever the code does', () => {
    insertInvoice(db, 'x1', 'request-0001');
    expect(failure(() => insertInvoice(db, 'x2', 'request-0001'))).toMatch(/UNIQUE constraint failed: invoices.request_id/);
    expect(one(db, "SELECT COUNT(*) AS c FROM invoices WHERE request_id = 'request-0001'").c).toBe(1);
  });

  it('invoices without a request id are not affected: any number of them may have none', () => {
    insertInvoice(db, 'n1', null);
    insertInvoice(db, 'n2', null);
    expect(one(db, 'SELECT COUNT(*) AS c FROM invoices WHERE request_id IS NULL').c).toBe(5); // the three old ones and these two
  });

  it('is the lookup the sale service uses: found by id, and the index is the partial unique one', () => {
    insertInvoice(db, 'x1', 'request-0001');
    expect(one(db, "SELECT id FROM invoices WHERE request_id = 'request-0001'").id).toBe('x1');
    expect(String(one(db, "SELECT sql FROM sqlite_master WHERE name = 'uq_invoices_request_id'").sql)).toMatch(/UNIQUE INDEX .* WHERE request_id IS NOT NULL/);
    expect(String(one(db, "EXPLAIN QUERY PLAN SELECT id FROM invoices WHERE request_id = 'request-0001'")['detail'])).toMatch(/uq_invoices_request_id/); // found by the index, not by scanning
  });

  it('once set it can never be changed or cleared; it can be set once on an invoice that had none', () => {
    insertInvoice(db, 'x1', 'request-0001');
    expect(failure(() => db.prepare("UPDATE invoices SET request_id = 'request-0002' WHERE id = 'x1'").run())).toMatch(/request_id cannot be changed once it is set/);
    expect(failure(() => db.prepare("UPDATE invoices SET request_id = NULL WHERE id = 'x1'").run())).toMatch(/cannot be changed/);
    expect(failure(() => db.prepare("UPDATE invoices SET request_id = 'request-0009' WHERE id = 'e0000001'").run())).toBe('no error'); // an old invoice, set once
    expect(failure(() => db.prepare("UPDATE invoices SET request_id = 'request-0010' WHERE id = 'e0000001'").run())).toMatch(/cannot be changed/);
  });

  it('other changes to an invoice (a void) still work and keep the request id', () => {
    insertInvoice(db, 'x1', 'request-0001');
    db.prepare("UPDATE invoices SET status = 'voided', void_reason = 'mistake', voided_by = 'u1' WHERE id = 'x1'").run();
    expect(one(db, "SELECT status, request_id FROM invoices WHERE id = 'x1'")).toEqual({ status: 'voided', request_id: 'request-0001' });
  });

  it('must be between 8 and 100 characters', () => {
    expect(failure(() => insertInvoice(db, 'y1', 'short'))).toMatch(/constraint|check/i);
    expect(failure(() => insertInvoice(db, 'y2', 'x'.repeat(101)))).toMatch(/constraint|check/i);
    expect(failure(() => insertInvoice(db, 'y3', '12345678'))).toBe('no error');
    expect(failure(() => insertInvoice(db, 'y4', 'x'.repeat(100)))).toBe('no error');
  });
});

describe('held_bills: a draft of a cart, resumed or discarded once', () => {
  let db: Db;
  beforeEach(async () => {
    db = await shopAtVersion5(join(dir, 'shop.db'));
    await migrate(db);
  });
  afterEach(() => db.close());

  it('holds who held it, the customer, the price type, how many lines, and the cart as JSON; it starts held', () => {
    insertHeld(db, 'h1', { customer_id: 'c1', price_type: 'wholesale', line_count: 3, payload: '{"lines":[{"product_id":"p","qty":1000}]}' });
    expect(one(db, 'SELECT held_by, customer_id, price_type, line_count, status, resolved_by, resolved_at, deleted_at, version FROM held_bills WHERE id = ?', 'h1')).toEqual({
      held_by: 'u2', customer_id: 'c1', price_type: 'wholesale', line_count: 3, status: 'held', resolved_by: null, resolved_at: null, deleted_at: null, version: 1,
    });
    expect(String(one(db, 'SELECT created_at FROM held_bills WHERE id = ?', 'h1').created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses a cart that is not JSON, a bill with no lines, an unknown price type or status, and people who do not exist', () => {
    expect(failure(() => insertHeld(db, 'h2', { payload: 'not json' }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'h3', { line_count: 0 }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'h4', { price_type: 'free' }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'h5', { status: 'sold', resolved_by: 'u1', resolved_at: 'x' }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'h6', { held_by: 'nobody' }))).toMatch(/FOREIGN KEY/i);
    expect(failure(() => insertHeld(db, 'h7', { customer_id: 'nobody' }))).toMatch(/FOREIGN KEY/i);
    expect(one(db, 'SELECT COUNT(*) AS c FROM held_bills').c).toBe(0);
  });

  it('is resumed or discarded ONCE, with who did it and when; the version moves and the update time is set', () => {
    insertHeld(db, 'h1');
    db.prepare("UPDATE held_bills SET status = 'resumed', resolved_by = 'u2', resolved_at = '2026-10-12T10:00:00.000Z' WHERE id = 'h1'").run();
    expect(one(db, 'SELECT status, resolved_by, resolved_at, version FROM held_bills WHERE id = ?', 'h1')).toEqual({ status: 'resumed', resolved_by: 'u2', resolved_at: '2026-10-12T10:00:00.000Z', version: 2 });
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'discarded', resolved_by = 'u1', resolved_at = 'later' WHERE id = 'h1'").run())).toMatch(/already resumed or discarded/);
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'held', resolved_by = NULL, resolved_at = NULL WHERE id = 'h1'").run())).toMatch(/already resumed or discarded/);
    insertHeld(db, 'h2');
    db.prepare("UPDATE held_bills SET status = 'discarded', resolved_by = 'u1', resolved_at = '2026-10-12T11:00:00.000Z' WHERE id = 'h2'").run();
    expect(one(db, 'SELECT status FROM held_bills WHERE id = ?', 'h2').status).toBe('discarded');
  });

  it('who and when are set together with the status, and only then', () => {
    insertHeld(db, 'h1');
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'resumed' WHERE id = 'h1'").run())).toMatch(/constraint|check/i);
    expect(failure(() => db.prepare("UPDATE held_bills SET resolved_by = 'u1', resolved_at = 'x' WHERE id = 'h1'").run())).toMatch(/constraint|check/i);
    expect(one(db, 'SELECT status FROM held_bills WHERE id = ?', 'h1').status).toBe('held');
  });

  it('only held, resumed and discarded exist as a status, whatever else is sent along with a resolution', () => {
    for (const status of ['x', 'sold', 'Held', 'held ', '']) {
      expect(failure(() => insertHeld(db, `s-${status}`, { status, resolved_by: 'u1', resolved_at: '2026-10-12T10:00:00.000Z' })), JSON.stringify(status)).toMatch(/constraint|check/i);
    }
    insertHeld(db, 'ok1');
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'x', resolved_by = 'u1', resolved_at = 'later' WHERE id = 'ok1'").run())).toMatch(/constraint|check/i);
  });

  it('a resolution needs BOTH who and when: one without the other is refused, for a new row and for an update, in either direction', () => {
    expect(failure(() => insertHeld(db, 'r1', { status: 'resumed', resolved_by: 'u1', resolved_at: null }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'r2', { status: 'resumed', resolved_by: null, resolved_at: '2026-10-12T10:00:00.000Z' }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'r3', { status: 'held', resolved_by: 'u1', resolved_at: null }))).toMatch(/constraint|check/i);
    expect(failure(() => insertHeld(db, 'r4', { status: 'held', resolved_by: null, resolved_at: 'x' }))).toMatch(/constraint|check/i);
    insertHeld(db, 'r5');
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'discarded', resolved_by = 'u1' WHERE id = 'r5'").run())).toMatch(/constraint|check/i);
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'discarded', resolved_at = 'x' WHERE id = 'r5'").run())).toMatch(/constraint|check/i);
    expect(one(db, 'SELECT status FROM held_bills WHERE id = ?', 'r5').status).toBe('held');
  });

  it('the update time moves when the bill is resolved (not just the version), even when the update does not say so', () => {
    insertHeld(db, 'u1x', { created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z' });
    db.prepare("UPDATE held_bills SET status = 'resumed', resolved_by = 'u2', resolved_at = '2026-10-12T10:00:00.000Z' WHERE id = 'u1x'").run();
    const row = one(db, 'SELECT created_at, updated_at, version FROM held_bills WHERE id = ?', 'u1x');
    expect(row.created_at).toBe('2020-01-01T00:00:00.000Z');
    expect(row.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
    expect(String(row.updated_at) > '2026-01-01').toBe(true);
    expect(row.version).toBe(2);
  });

  it('who resolved it must be a real user', () => {
    insertHeld(db, 'f1');
    expect(failure(() => db.prepare("UPDATE held_bills SET status = 'resumed', resolved_by = 'nobody', resolved_at = 'x' WHERE id = 'f1'").run())).toMatch(/FOREIGN KEY/i);
    expect(one(db, 'SELECT status FROM held_bills WHERE id = ?', 'f1').status).toBe('held');
  });

  it('the price type is retail unless it says otherwise', () => {
    db.prepare("INSERT INTO held_bills (id, held_by, line_count, payload, shop_id, branch_id, device_id) VALUES ('d1x', 'u2', 1, '{}', 's1', 'b1', 'd1')").run();
    expect(one(db, 'SELECT price_type FROM held_bills WHERE id = ?', 'd1x').price_type).toBe('retail');
  });

  it('the cart is never edited after it was held: not its lines, customer, price type, count or owner', () => {
    insertHeld(db, 'h1');
    for (const change of ["payload = '{\"lines\":[1]}'", "customer_id = 'c1'", "price_type = 'wholesale'", 'line_count = 9', "held_by = 'u1'"]) {
      expect(failure(() => db.prepare(`UPDATE held_bills SET ${change} WHERE id = 'h1'`).run()), change).toMatch(/a held cart is not edited/);
    }
  });

  it('can never be deleted', () => {
    insertHeld(db, 'h1');
    expect(failure(() => db.prepare("DELETE FROM held_bills WHERE id = 'h1'").run())).toMatch(/hard delete not allowed/);
  });

  it('is a local draft: it writes nothing to change_log (it is not shared with other devices)', () => {
    const before = one(db, 'SELECT COUNT(*) AS c FROM change_log').c;
    insertHeld(db, 'h1');
    db.prepare("UPDATE held_bills SET status = 'resumed', resolved_by = 'u2', resolved_at = 'now' WHERE id = 'h1'").run();
    expect(one(db, 'SELECT COUNT(*) AS c FROM change_log').c).toBe(before);
    expect(one(db, "SELECT COUNT(*) AS c FROM change_log WHERE table_name = 'held_bills'").c).toBe(0);
  });

  it('is found by status and time (the index the held-bills list uses)', () => {
    expect(String(one(db, "EXPLAIN QUERY PLAN SELECT id FROM held_bills WHERE status = 'held' ORDER BY created_at")['detail'])).toMatch(/idx_held_bills_status/);
  });
});
