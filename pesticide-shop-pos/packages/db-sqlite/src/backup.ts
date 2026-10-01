import { rmSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Db } from './connection.js';

export interface IntegrityReport {
  ok: boolean;
  problems: string[];
}

/** Runs integrity_check and foreign_key_check. */
export function checkIntegrity(db: Db): IntegrityReport {
  const problems: string[] = [];
  for (const row of db.pragma('integrity_check') as { integrity_check: string }[]) {
    if (row.integrity_check !== 'ok') problems.push(row.integrity_check);
  }
  for (const row of db.pragma('foreign_key_check') as { table: string; rowid: number; parent: string }[]) {
    problems.push(`foreign key violation: ${row.table} row ${row.rowid} -> ${row.parent}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Copies the live database to `destPath` using SQLite's online backup (safe while the app is running),
 * then opens the copy and checks it. A copy that fails the check is deleted and an error is thrown.
 */
export async function backupDatabase(db: Db, destPath: string): Promise<{ path: string; bytes: number }> {
  await db.backup(destPath);
  // The copy inherits WAL mode, which would leave -wal and -shm files beside it. Switch it to a plain
  // single file so a backup can be copied to a USB stick as-is.
  const copy = new Database(destPath);
  let report: IntegrityReport;
  try {
    copy.pragma('journal_mode = DELETE');
    report = checkIntegrity(copy);
  } finally {
    copy.close();
  }
  if (!report.ok) {
    rmSync(destPath, { force: true });
    throw new Error(`Backup failed verification: ${report.problems.join('; ')}`);
  }
  return { path: destPath, bytes: statSync(destPath).size };
}
