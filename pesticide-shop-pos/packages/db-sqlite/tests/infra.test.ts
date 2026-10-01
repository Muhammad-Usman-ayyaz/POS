import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
  it('loads 001_init in order', () => {
    const m = loadMigrations();
    expect(m[0]?.version).toBe(1);
  });

  it('applies on a fresh database, records the version, and is a no-op the second time', async () => {
    const db = openDatabase(':memory:');
    const first = await migrate(db);
    expect(first.applied).toEqual([1]);
    expect(first.backupPath).toBeNull();
    expect(currentSchemaVersion(db)).toBe(1);
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
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
