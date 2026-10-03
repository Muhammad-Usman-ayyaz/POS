import Database from 'better-sqlite3';

export type Db = Database.Database;

export interface OpenOptions {
  readonly?: boolean;
  /**
   * Path to a better_sqlite3.node built for a different runtime than the one in node_modules. The desktop app
   * (Electron) passes the Electron-ABI binary here; tests and scripts run on plain Node and leave it out.
   */
  nativeBinding?: string;
}

/** Opens a database with the pragmas every connection must have. Use ':memory:' for tests. */
export function openDatabase(path: string, options: OpenOptions = {}): Db {
  const db = new Database(path, {
    readonly: options.readonly ?? false,
    ...(options.nativeBinding ? { nativeBinding: options.nativeBinding } : {}),
  });
  db.pragma('foreign_keys = ON');
  if (!options.readonly && path !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}
