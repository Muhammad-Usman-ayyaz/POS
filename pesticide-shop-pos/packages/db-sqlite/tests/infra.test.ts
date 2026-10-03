import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  backupDatabase,
  checkIntegrity,
  currentSchemaVersion,
  firstLaunchSetup,
  isSetupDone,
  loadMigrations,
  migrate,
  openDatabase as open,
  type Db,
} from '../src/index.js';

// Every database opened here is closed afterwards: Windows cannot delete a file that is still open.
const opened: Db[] = [];
function openDatabase(...args: Parameters<typeof open>): Db {
  const db = open(...args);
  opened.push(db);
  return db;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pos-db-'));
});
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

const setupInput = { shopName: 'Test Shop', ownerName: 'Owner', ownerUsername: 'owner', ownerPasswordHash: 'hash' };

describe('connection', () => {
  it('turns foreign keys on and uses WAL for file databases', () => {
    const db = openDatabase(join(dir, 'a.db'));
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });
});

describe('migrations', () => {
  it('loads the migrations in order', () => {
    expect(loadMigrations().map((m) => [m.version, m.description])).toEqual([
      [1, 'init'],
      [2, 'invoice_payment_method'],
      [3, 'user_recovery_code'],
    ]);
  });

  it('applies on a fresh database, records the version, and is a no-op the second time', async () => {
    const db = openDatabase(':memory:');
    const first = await migrate(db);
    expect(first.applied).toEqual([1, 2, 3]);
    expect(first.backupPath).toBeNull();
    expect(currentSchemaVersion(db)).toBe(3);
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
  });

  describe('002: invoices.payment_method', () => {
    const migrationsUpTo1 = () => {
      const dir001 = join(dir, 'm001');
      mkdirSync(dir001);
      writeFileSync(join(dir001, '001_init.sql'), readFileSync(join(DEFAULT_MIGRATIONS_DIR, '001_init.sql'), 'utf8'));
      return dir001;
    };
    const insertInvoice = (db: ReturnType<typeof openDatabase>, id: string, extra = '') => {
      // plain rows, so this also works on a version-1 database that does not have later columns yet
      const ids = { shopId: 's1', branchId: 'b1', deviceId: 'd1', ownerId: 'u1' };
      db.prepare("INSERT INTO shops (id, name) VALUES ('s1', 'S')").run();
      db.prepare("INSERT INTO branches (id, shop_id, name, code) VALUES ('b1', 's1', 'Main', 'A')").run();
      db.prepare("INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d1', 'b1', 'PC', 'A1')").run();
      db.prepare("INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id) VALUES ('u1', 'O', 'o', 'x', 'owner', 's1', 'b1', 'd1')").run();
      const customer = 'c0000000-0000-4000-8000-000000000001';
      db.prepare("INSERT INTO customers (id, name_en, shop_id, branch_id, device_id) VALUES (?, 'C', ?, ?, ?)").run(customer, ids.shopId, ids.branchId, ids.deviceId);
      db.prepare(`INSERT INTO invoices (id, invoice_no, customer_id, created_by, subtotal, total, paid_amount, shop_id, branch_id, device_id${extra ? ', payment_method' : ''})
                  VALUES (?, ?, ?, ?, 100, 100, 100, ?, ?, ?${extra ? ', ?' : ''})`).run(id, `INV-${id}`, customer, ids.ownerId, ids.shopId, ids.branchId, ids.deviceId, ...(extra ? [extra] : []));
    };

    it('gives invoices that already exist the method cash', async () => {
      const db = openDatabase(join(dir, 'upgrade.db'));
      await migrate(db, { migrationsDir: migrationsUpTo1() });
      expect(currentSchemaVersion(db)).toBe(1);
      insertInvoice(db, 'old-1');
      expect(() => db.prepare('SELECT payment_method FROM invoices').get()).toThrow(/no such column/);

      const result = await migrate(db);
      expect(result.applied).toEqual([2, 3]);
      expect(result.backupPath).not.toBeNull(); // the existing database was copied first
      expect(db.prepare("SELECT payment_method FROM invoices WHERE id = 'old-1'").get()).toEqual({ payment_method: 'cash' });
    });

    it('defaults to cash, accepts the four methods, and refuses anything else', async () => {
      const db = openDatabase(':memory:');
      await migrate(db);
      insertInvoice(db, 'a');
      expect(db.prepare("SELECT payment_method FROM invoices WHERE id = 'a'").get()).toEqual({ payment_method: 'cash' });
      for (const method of ['cash', 'bank', 'easypaisa', 'jazzcash']) expect(() => insertInvoiceWith(db, method)).not.toThrow();
      expect(() => insertInvoiceWith(db, 'cheque')).toThrow(/CHECK constraint/i);
      expect(() => insertInvoiceWith(db, '')).toThrow(/CHECK constraint/i);

      function insertInvoiceWith(d: typeof db, method: string) {
        const row = d.prepare("SELECT customer_id, created_by, shop_id, branch_id, device_id FROM invoices WHERE id = 'a'").get() as Record<string, string>;
        d.prepare(`INSERT INTO invoices (id, invoice_no, customer_id, created_by, subtotal, total, paid_amount, payment_method, shop_id, branch_id, device_id)
                   VALUES (?, ?, ?, ?, 100, 100, 100, ?, ?, ?, ?)`).run(`m-${method}`, `INV-m-${method}`, row.customer_id, row.created_by, method, row.shop_id, row.branch_id, row.device_id);
      }
    });

    it('is not null', async () => {
      const db = openDatabase(':memory:');
      await migrate(db);
      const column = (db.pragma('table_info(invoices)') as { name: string; notnull: number; dflt_value: string | null }[]).find((c) => c.name === 'payment_method');
      expect(column).toMatchObject({ notnull: 1, dflt_value: "'cash'" });
    });
  });

  it('takes a backup before applying a new migration to an existing file', async () => {
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    writeFileSync(join(migrations, '001_init.sql'), 'CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT, description TEXT); CREATE TABLE t (x);');
    const db = openDatabase(join(dir, 'shop.db'));
    expect((await migrate(db, { migrationsDir: migrations })).backupPath).toBeNull();

    writeFileSync(join(migrations, '002_more.sql'), 'ALTER TABLE t ADD COLUMN y;');
    const result = await migrate(db, { migrationsDir: migrations });
    expect(result.applied).toEqual([2]);
    expect(result.backupPath).not.toBeNull();
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
    db.close();
  });

  it('rolls a failing migration back completely and leaves the version unchanged', async () => {
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    writeFileSync(join(migrations, '001_init.sql'), 'CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT, description TEXT);');
    writeFileSync(join(migrations, '002_bad.sql'), 'CREATE TABLE half (x); THIS IS NOT SQL;');
    const db = openDatabase(':memory:');
    await expect(migrate(db, { migrationsDir: migrations })).rejects.toThrow(/2_bad failed/);
    expect(currentSchemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='half'").get()).toBeUndefined();
  });

  it('refuses a database newer than the app', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    db.prepare('INSERT INTO schema_version (version) VALUES (99)').run();
    await expect(migrate(db)).rejects.toThrow(/Update the app/);
  });

  it('rejects gaps in migration numbering', () => {
    mkdirSync(join(dir, 'm'));
    writeFileSync(join(dir, 'm', '001_a.sql'), '');
    writeFileSync(join(dir, 'm', '003_c.sql'), '');
    expect(() => loadMigrations(join(dir, 'm'))).toThrow(/without gaps/);
  });
});

describe('first-launch setup', () => {
  it('creates shop, branch, device, owner, settings and number sequences', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    expect(isSetupDone(db)).toBe(false);
    const ids = firstLaunchSetup(db, setupInput);
    expect(isSetupDone(db)).toBe(true);

    expect(db.prepare('SELECT role FROM users WHERE id=?').get(ids.ownerId)).toEqual({ role: 'owner' });
    expect(db.prepare("SELECT value FROM settings WHERE \"key\"='near_expiry_days'").get()).toEqual({ value: '30' });
    const prefixes = db.prepare('SELECT prefix FROM number_sequences ORDER BY sequence_name').all();
    expect(prefixes).toEqual([{ prefix: 'INV-A-' }, { prefix: 'PUR-A-' }, { prefix: 'RET-A-' }]);
    expect(checkIntegrity(db).ok).toBe(true);
  });

  it('refuses to run twice', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    firstLaunchSetup(db, setupInput);
    expect(() => firstLaunchSetup(db, setupInput)).toThrow(/already been done/);
  });

  it('is all-or-nothing: a failure leaves no half-created shop', async () => {
    const db = openDatabase(':memory:');
    await migrate(db);
    expect(() => firstLaunchSetup(db, { ...setupInput, branchCode: undefined, ownerUsername: null as unknown as string })).toThrow();
    expect(isSetupDone(db)).toBe(false);
  });
});

describe('backup', () => {
  it('copies a live database, verifies it, and the copy holds the same data', async () => {
    const db = openDatabase(join(dir, 'live.db'));
    await migrate(db);
    firstLaunchSetup(db, setupInput);

    const result = await backupDatabase(db, join(dir, 'copy.db'));
    expect(result.bytes).toBeGreaterThan(0);

    const copy = openDatabase(result.path, { readonly: true });
    expect(copy.prepare('SELECT name FROM shops').get()).toEqual({ name: 'Test Shop' });
    expect(checkIntegrity(copy).ok).toBe(true);
    copy.close();
    db.close();
  });
});
