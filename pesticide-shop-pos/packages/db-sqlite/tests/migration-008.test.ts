// Migration 008 (stable ledger sequence, farmer land size and crop) applied on a shop that already has ledger rows at version 7.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, currentSchemaVersion, loadMigrations, migrate, openDatabase, createSqliteRepositories, createSqliteUnitOfWork, type Db } from '../src/index.js';

type Row = Record<string, unknown>;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-mig008-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment; the folder is in the temp directory */
  }
});

const upTo7 = () => loadMigrations().slice(0, 7);
const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as Row[];
const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Row;
const columns = (db: Db, table: string) => all(db, `PRAGMA table_info(${table})`);
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};
const SCOPE = { shop_id: 's1', branch_id: 'b1', device_id: 'd1' };
const dump = (db: Db, table: string): Row[] => all(db, `SELECT * FROM ${table} ORDER BY rowid`);

/** A shop at version 7 with five customer ledger rows (and one supplier row) written the old way: no seq column exists yet. */
async function shopAtVersion7(file: string): Promise<Db> {
  const db = openDatabase(file);
  await migrate(db, { migrations: upTo7() });
  expect(currentSchemaVersion(db)).toBe(7);
  db.exec(`INSERT INTO shops (id, name) VALUES ('s1', 'Pesticide Club Shop');
           INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A');
           INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1');
           INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'Owner', 'owner', 'x', 'owner', 's1', 'b1', 'd1');
           INSERT INTO customers (id, name_en, credit_limit, shop_id, branch_id, device_id) VALUES ('c1', 'Rashid', 500000, 's1', 'b1', 'd1');
           INSERT INTO suppliers (id, name_en, shop_id, branch_id, device_id) VALUES ('sup1', 'Dealer', 's1', 'b1', 'd1');`);
  const ins = db.prepare(
    "INSERT INTO ledger_entries (id, party_type, party_id, entry_type, amount_delta, entry_date, created_by, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?, 'u1', 's1', 'b1', 'd1')",
  );
  ins.run('l1', 'customer', 'c1', 'opening', 100_000, '2026-01-01T10:00:00.000Z');
  ins.run('l2', 'customer', 'c1', 'invoice', 50_000, '2026-01-02T10:00:00.000Z');
  ins.run('ls', 'supplier', 'sup1', 'purchase', 70_000, '2026-01-02T11:00:00.000Z');
  ins.run('l3', 'customer', 'c1', 'payment', -30_000, '2026-01-03T10:00:00.000Z');
  ins.run('l4', 'customer', 'c1', 'invoice', 20_000, '2026-01-03T10:00:00.000Z');
  return db;
}

const newRow = (id: string, delta = 1) => ({ id, party_type: 'customer', party_id: 'c1', entry_type: 'adjustment', amount_delta: delta, created_by: 'u1', ...SCOPE });
const repoInsert = (db: Db, row: Record<string, unknown>) => createSqliteUnitOfWork(db, SCOPE).run((tx) => tx.ledger.insert(row as never));

describe('migration 008 on a shop that already has ledger rows', () => {
  it('takes a backup, applies, rewrites no old row, and does it once', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    const before = {
      ledger: dump(db, 'ledger_entries'),
      customers: dump(db, 'customers'),
      changeLog: one(db, 'SELECT COUNT(*) AS n FROM change_log').n,
    };
    const result = await migrate(db);
    expect(result.applied).toEqual([8]);
    expect(result.backupPath).not.toBeNull();
    expect(currentSchemaVersion(db)).toBe(8);

    // every old ledger row is byte-for-byte the same, apart from the new column, which is NULL
    const after = dump(db, 'ledger_entries').map((r) => {
      const { seq, ...rest } = r;
      expect(seq).toBeNull();
      return rest;
    });
    expect(after).toEqual(before.ledger);
    expect(dump(db, 'customers').map(({ land_size, crop, ...rest }) => {
      expect([land_size, crop]).toEqual([null, null]);
      return rest;
    })).toEqual(before.customers);
    expect(one(db, 'SELECT COUNT(*) AS n FROM change_log').n).toBe(before.changeLog); // nothing was rewritten, so nothing was logged for sync
    expect(checkIntegrity(db)).toEqual({ ok: true, problems: [] });
    expect((await migrate(db)).applied).toEqual([]);
  });

  it('seq is a nullable INTEGER, land_size and crop are nullable TEXT', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    const seq = columns(db, 'ledger_entries').find((c) => c.name === 'seq');
    expect(seq).toMatchObject({ type: 'INTEGER', notnull: 0 });
    for (const n of ['land_size', 'crop']) expect(columns(db, 'customers').find((c) => c.name === n)).toMatchObject({ type: 'TEXT', notnull: 0 });
  });

  it('new rows written through the repository get seq 1, 2, 3 in order; old rows keep NULL', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    repoInsert(db, newRow('n1'));
    repoInsert(db, newRow('n2'));
    repoInsert(db, { ...newRow('n3'), party_type: 'supplier', party_id: 'sup1', entry_type: 'payment' });
    expect(all(db, 'SELECT id, seq FROM ledger_entries ORDER BY rowid').map((r) => [r.id, r.seq])).toEqual([
      ['l1', null], ['l2', null], ['ls', null], ['l3', null], ['l4', null], ['n1', 1], ['n2', 2], ['n3', 3],
    ]);
  });

  it('ordering by (seq IS NOT NULL), seq, rowid gives the old rows exactly the order rowid gave them', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    const byRowid = all(db, 'SELECT id FROM ledger_entries ORDER BY rowid').map((r) => r.id);
    await migrate(db);
    expect(all(db, 'SELECT id FROM ledger_entries ORDER BY (seq IS NOT NULL), seq, rowid').map((r) => r.id)).toEqual(byRowid);
    repoInsert(db, newRow('n1'));
    expect(all(db, 'SELECT id FROM ledger_entries ORDER BY (seq IS NOT NULL), seq, rowid').map((r) => r.id)).toEqual([...byRowid, 'n1']);
  });

  it('the unique index refuses a repeated seq, and NULLs may repeat (old rows)', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    const raw = (id: string, seq: number | null) =>
      db.prepare("INSERT INTO ledger_entries (id, party_type, party_id, entry_type, amount_delta, seq, shop_id, branch_id, device_id) VALUES (?, 'customer', 'c1', 'adjustment', 1, ?, 's1', 'b1', 'd1')").run(id, seq);
    raw('r1', 10);
    expect(failure(() => raw('r2', 10))).toMatch(/UNIQUE/i);
    expect(one(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'uq_ledger_entries_seq'").name).toBe('uq_ledger_entries_seq');
  });

  it('the trigger refuses a new row with no seq, whoever writes it', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    const count = one(db, 'SELECT COUNT(*) AS n FROM ledger_entries').n;
    expect(
      failure(() =>
        db.prepare("INSERT INTO ledger_entries (id, party_type, party_id, entry_type, amount_delta, shop_id, branch_id, device_id) VALUES ('x', 'customer', 'c1', 'adjustment', 1, 's1', 'b1', 'd1')").run(),
      ),
    ).toMatch(/seq is required/);
    expect(one(db, 'SELECT COUNT(*) AS n FROM ledger_entries').n).toBe(count);
  });

  it('a ledger row is still append-only (no update of seq or anything else, no delete)', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    expect(failure(() => db.prepare("UPDATE ledger_entries SET seq = 99 WHERE id = 'l1'").run())).toMatch(/append-only/);
    expect(failure(() => db.prepare("UPDATE ledger_entries SET amount_delta = 1 WHERE id = 'l1'").run())).toMatch(/append-only/);
    expect(failure(() => db.prepare("DELETE FROM ledger_entries WHERE id = 'l1'").run())).toMatch(/append-only/);
  });

  it('the repository refuses a service that tries to set seq itself', async () => {
    const db = await shopAtVersion7(join(dir, 'shop.db'));
    await migrate(db);
    expect(failure(() => repoInsert(db, { ...newRow('n1'), seq: 5 }))).toMatch(/owns that column/);
  });

  it('every ledger insert path in src goes through the repository (no other INSERT INTO ledger_entries without a seq)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const root = join(__dirname, '..', '..');
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const name of readdirSync(d)) {
        if (name === 'node_modules' || name === 'tests' || name === 'dist' || name === 'out') continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && /INSERT\s+INTO\s+ledger_entries/i.test(readFileSync(p, 'utf8'))) hits.push(p.replace(root, ''));
      }
    };
    walk(join(root, 'db-sqlite', 'src'));
    walk(join(root, 'core', 'src'));
    walk(join(root, '..', 'apps', 'desktop', 'src'));
    for (const file of hits) {
      const text = readFileSync(join(root, file), 'utf8');
      for (const m of text.matchAll(/INSERT\s+INTO\s+ledger_entries[^`]*/gi)) {
        expect(m[0], `${file} inserts into ledger_entries without a seq`).toMatch(/\bseq\b/);
      }
    }
  });
});
