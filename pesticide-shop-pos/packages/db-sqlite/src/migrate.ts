import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection.js';
import { backupDatabase } from './backup.js';

export const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export interface MigrateOptions {
  migrationsDir?: string;
  /** Where to put the pre-migration copy. Defaults to a `backups` folder next to the database file. */
  backupDir?: string;
}

export interface MigrateResult {
  applied: number[];
  currentVersion: number;
  /** Path of the copy taken before migrating, if one was needed. */
  backupPath: string | null;
}

const FILE_RE = /^(\d+)_(.+)\.sql$/;

/** Reads `NNN_description.sql` files in version order. Gaps and bad names are errors. */
export function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const m = FILE_RE.exec(f);
      if (!m) throw new Error(`Migration file name must look like 001_name.sql: ${f}`);
      return { version: Number(m[1]), description: m[2]!, sql: readFileSync(join(dir, f), 'utf8') };
    })
    .sort((a, b) => a.version - b.version);

  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrations must be numbered 1, 2, 3 without gaps. Found ${m.version} at position ${i + 1}.`);
    }
  });
  return migrations;
}

export function currentSchemaVersion(db: Db): number {
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  if (!hasTable) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}

/**
 * Applies pending migrations in order, each in its own transaction, and records them in schema_version.
 * If the database is an existing file that already has a schema, a backup copy is taken first.
 * A failed migration rolls back and throws; earlier migrations stay applied.
 */
export async function migrate(db: Db, options: MigrateOptions = {}): Promise<MigrateResult> {
  const all = loadMigrations(options.migrationsDir);
  const current = currentSchemaVersion(db);

  if (current > all.length) {
    throw new Error(`Database is at version ${current} but this app only knows ${all.length}. Update the app.`);
  }
  const pending = all.filter((m) => m.version > current);
  if (pending.length === 0) return { applied: [], currentVersion: current, backupPath: null };

  let backupPath: string | null = null;
  if (current > 0 && db.name && db.name !== ':memory:' && existsSync(db.name)) {
    const dir = options.backupDir ?? join(dirname(db.name), 'backups');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = join(dir, `${basename(db.name, '.db')}-before-v${pending[0]!.version}-${stamp}.db`);
    await backupDatabase(db, backupPath);
  }

  const applied: number[] = [];
  for (const m of pending) {
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      // Prepared after the migration runs: on a fresh database 001 is what creates schema_version.
      // OR IGNORE because 001_init.sql records itself; later migrations can leave it to the runner.
      db.prepare('INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)').run(m.version, m.description);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.version}_${m.description} failed: ${(err as Error).message}`, { cause: err });
    }
    applied.push(m.version);
  }
  return { applied, currentVersion: applied[applied.length - 1]!, backupPath };
}
