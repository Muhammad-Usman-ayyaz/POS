// Migration 007 (payment receipt columns, farmer fields, 'payment' number sequence) applied on a shop that already has payments at version 6.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, currentSchemaVersion, firstLaunchSetup, loadMigrations, migrate, openDatabase, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig007-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo6 = () => loadMigrations().slice(0, 6);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;
const tables = (db: Db) => all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name as string);
const dump = (db: Db, table: string): Row[] => all(db, `SELECT * FROM ${table} ORDER BY rowid`);
const columns = (db: Db, table: string) => all(db, `PRAGMA table_info(${table})`);
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};

/** A shop at version 6: three devices (two with invoice sequences, one without), customers and payments. */
async function shopAtVersion6(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo6() });
  expect(currentSchemaVersion(db)).toBe(6);
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b2', 's1', 'Second', 'B');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d2', 'b2', 'PC2', 'B1');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d3', 'b2', 'PC3', 'B2');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');
           INSERT INTO customers (id, name_en, credit_limit, shop_id, branch_id, device_id) VALUES ('c1', 'Rashid', 500000, 's1', 'b1', 'd1');
           INSERT INTO customers (id, name_en, shop_id, branch_id, device_id) VALUES ('c2', 'Bashir', 's1', 'b1', 'd1');
           INSERT INTO number_sequences (id, device_id, sequence_name, prefix, last_number) VALUES ('q1', 'd1', 'invoice', 'INV-A-', 41);
           INSERT INTO number_sequences (id, device_id, sequence_name, prefix, last_number) VALUES ('q2', 'd2', 'invoice', 'INV-B-', 7);`);
  const pay = db.prepare("INSERT INTO payments (id, party_type, party_id, method, reference_no, amount, direction, created_by, shop_id, branch_id, device_id) VALUES (?, 'customer', ?, ?, ?, ?, 'in', 'u1', 's1', 'b1', 'd1')");
  pay.run('p1', 'c1', 'cash', null, 150000);
  pay.run('p2', 'c1', 'bank', 'TX-9', 25000);
  pay.run('p3', 'c2', 'easypaisa', null, 1);
  return db;
}

const insertPayment = (db: Db, id: string, receiptNo: string | null, note: string | null = null) =>
  db.prepare("INSERT INTO payments (id, party_type, party_id, method, amount, direction, created_by, note, receipt_no, shop_id, branch_id, device_id) VALUES (?, 'customer', 'c1', 'cash', 100, 'in', 'u1', ?, ?, 's1', 'b1', 'd1')").run(id, note, receiptNo);

describe('migration 007 on a shop that already has payments', () => {
  it('takes a backup, applies, keeps every row unchanged except the new NULL columns, and does it once', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    const before = Object.fromEntries(tables(db).filter((t) => t !== 'schema_version' && t !== 'number_sequences').map((t) => [t, dump(db, t)]));
    const seqBefore = dump(db, 'number_sequences');
    const result = await migrate(db);
    expect(result.applied).toEqual([7]);
    expect(result.backupPath).not.toBeNull();
    expect(currentSchemaVersion(db)).toBe(7);

    for (const [table, rows] of Object.entries(before)) {
      const after = dump(db, table).map((r) => {
        const copy = { ...r };
        if (table === 'payments') {
          expect(copy.note).toBeNull();
          expect(copy.receipt_no).toBeNull();
          delete copy.note;
          delete copy.receipt_no;
        }
        if (table === 'customers') {
          for (const c of ['father_name', 'cnic', 'phone2', 'guarantor']) {
            expect(copy[c]).toBeNull();
            delete copy[c];
          }
        }
        return copy;
      });
      expect(after, table).toEqual(rows);
    }
    // the old sequence rows are untouched; only new rows were added
    expect(dump(db, 'number_sequences').slice(0, seqBefore.length)).toEqual(seqBefore);
    expect(checkIntegrity(db)).toEqual({ ok: true, problems: [] });
    expect((await migrate(db)).applied).toEqual([]);
    expect(dump(db, 'number_sequences')).toHaveLength(seqBefore.length + 3);
  });

  it('adds nullable columns', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    for (const [table, names] of [
      ['payments', ['note', 'receipt_no']],
      ['customers', ['father_name', 'cnic', 'phone2', 'guarantor']],
    ] as const) {
      const cols = columns(db, table);
      for (const n of names) {
        const col = cols.find((c) => c.name === n);
        expect(col, `${table}.${n}`).toBeDefined();
        expect(col!.type).toBe('TEXT');
        expect(col!.notnull, `${table}.${n} must stay nullable`).toBe(0);
      }
    }
  });

  it('creates a payment sequence (RCP-, from 0) for every existing device and leaves the invoice ones alone', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    const seq = all(db, "SELECT device_id, prefix, last_number FROM number_sequences WHERE sequence_name = 'payment' ORDER BY device_id");
    expect(seq).toEqual([
      { device_id: 'd1', prefix: 'RCP-A-', last_number: 0 },
      { device_id: 'd2', prefix: 'RCP-B-', last_number: 0 },
      { device_id: 'd3', prefix: 'RCP-B-', last_number: 0 }, // no invoice sequence: built from its branch code
    ]);
    expect(all(db, "SELECT device_id, prefix, last_number FROM number_sequences WHERE sequence_name = 'invoice' ORDER BY device_id")).toEqual([
      { device_id: 'd1', prefix: 'INV-A-', last_number: 41 },
      { device_id: 'd2', prefix: 'INV-B-', last_number: 7 },
    ]);
  });

  it('keeps payments append-only (no update, no delete), and an old payment never gets a receipt number', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    expect(failure(() => db.prepare("UPDATE payments SET receipt_no = 'RCP-A-000001' WHERE id = 'p1'").run())).toMatch(/append-only/);
    expect(failure(() => db.prepare("UPDATE payments SET note = 'x' WHERE id = 'p1'").run())).toMatch(/append-only/);
    expect(failure(() => db.prepare('UPDATE payments SET amount = 5 WHERE id = ?').run('p1'))).toMatch(/append-only/);
    expect(failure(() => db.prepare("DELETE FROM payments WHERE id = 'p1'").run())).toMatch(/append-only/);
    expect(one(db, 'SELECT receipt_no FROM payments WHERE id = ?', 'p1').receipt_no).toBeNull();
  });

  it('receipt_no is unique when set, and many payments may have none', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    insertPayment(db, 'p20', null);
    insertPayment(db, 'p21', null);
    insertPayment(db, 'p22', 'RCP-A-000001', 'cash for seed');
    expect(failure(() => insertPayment(db, 'p23', 'RCP-A-000001'))).toMatch(/UNIQUE/i);
    expect(one(db, 'SELECT note FROM payments WHERE id = ?', 'p22').note).toBe('cash for seed');
    expect(one(db, "SELECT COUNT(*) AS n FROM change_log WHERE table_name = 'payments' AND row_id = 'p22'").n).toBe(1);
  });

  it('receipt_no is unique across the whole file: the same number from another device or another customer is refused', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    insertPayment(db, 'p30', 'RCP-A-000009');
    const other = (id: string, party: string, device: string, branch: string) =>
      db.prepare("INSERT INTO payments (id, party_type, party_id, method, amount, direction, created_by, receipt_no, shop_id, branch_id, device_id) VALUES (?, 'customer', ?, 'cash', 100, 'in', 'u1', 'RCP-A-000009', 's1', ?, ?)").run(id, party, branch, device);
    expect(failure(() => other('p31', 'c1', 'd2', 'b2')), 'another device').toMatch(/UNIQUE/i);
    expect(failure(() => other('p32', 'c2', 'd1', 'b1')), 'another customer').toMatch(/UNIQUE/i);
    expect(failure(() => other('p33', 'c2', 'd2', 'b2')), 'another device and customer').toMatch(/UNIQUE/i);
    expect(one(db, "SELECT COUNT(*) AS n FROM payments WHERE receipt_no = 'RCP-A-000009'").n).toBe(1);
  });

  it('keeps a payment sequence that already exists (last_number 6) and still migrates', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    db.exec("INSERT INTO number_sequences (id, device_id, sequence_name, prefix, last_number) VALUES ('qp1', 'd1', 'payment', 'RCP-A-', 6)");
    const result = await migrate(db);
    expect(result.applied).toEqual([7]);
    expect(all(db, "SELECT device_id, prefix, last_number FROM number_sequences WHERE sequence_name = 'payment' ORDER BY device_id")).toEqual([
      { device_id: 'd1', prefix: 'RCP-A-', last_number: 6 },
      { device_id: 'd2', prefix: 'RCP-B-', last_number: 0 },
      { device_id: 'd3', prefix: 'RCP-B-', last_number: 0 },
    ]);
  });

  it('rule: every device gets a payment sequence, a deleted device too (nothing is hidden by deleted_at)', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    db.exec(`INSERT INTO devices (id, branch_id, name, device_code, deleted_at) VALUES ('d4', 'b1', 'Old PC', 'A2', '2026-01-01T00:00:00.000Z');
             INSERT INTO number_sequences (id, device_id, sequence_name, prefix, last_number) VALUES ('q4', 'd4', 'invoice', 'INV-A-', 3);`);
    await migrate(db);
    expect(one(db, "SELECT prefix, last_number FROM number_sequences WHERE device_id = 'd4' AND sequence_name = 'payment'")).toEqual({ prefix: 'RCP-A-', last_number: 0 });
    expect(one(db, "SELECT COUNT(*) AS n FROM number_sequences WHERE sequence_name = 'payment'").n).toBe(4);
  });

  it('customers keep their data and take the farmer fields on update', async () => {
    const db = await shopAtVersion6(join(dir, 'shop.db'));
    await migrate(db);
    db.prepare("UPDATE customers SET father_name = 'Ali', cnic = '35202-1234567-1', phone2 = '0300', guarantor = 'Imran' WHERE id = 'c1'").run();
    const c = one(db, "SELECT name_en, credit_limit, father_name, cnic, phone2, guarantor, version FROM customers WHERE id = 'c1'");
    expect(c).toMatchObject({ name_en: 'Rashid', credit_limit: 500000, father_name: 'Ali', cnic: '35202-1234567-1', phone2: '0300', guarantor: 'Imran', version: 2 });
  });
});

describe('a new shop', () => {
  it('gets the payment sequence from first-launch setup', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    const ids = firstLaunchSetup(db, { shopName: 'S', ownerName: 'O', ownerUsername: 'o', ownerPasswordHash: 'x', branchCode: 'A' });
    const rows = all(db, 'SELECT sequence_name, prefix, last_number FROM number_sequences WHERE device_id = ? ORDER BY sequence_name', ids.deviceId);
    expect(rows).toEqual([
      { sequence_name: 'invoice', prefix: 'INV-A-', last_number: 0 },
      { sequence_name: 'payment', prefix: 'RCP-A-', last_number: 0 },
      { sequence_name: 'purchase', prefix: 'PUR-A-', last_number: 0 },
      { sequence_name: 'return', prefix: 'RET-A-', last_number: 0 },
    ]);
  });
});
