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

/** The native binding each open connection was made with (undefined: the default one in node_modules). */
const bindings = new WeakMap<Db, string | undefined>();

/**
 * The native binding `db` was opened with. Any SECOND connection to the same file (the backup copy) must use the same
 * one: in Electron the default build in node_modules is for Node and cannot be loaded ("compiled against a different
 * Node.js version").
 */
export function nativeBindingOf(db: Db): string | undefined {
  return bindings.get(db);
}

/** Opens a database with the pragmas every connection must have. Use ':memory:' for tests. */
export function openDatabase(path: string, options: OpenOptions = {}): Db {
  const db = new Database(path, {
    readonly: options.readonly ?? false,
    ...(options.nativeBinding ? { nativeBinding: options.nativeBinding } : {}),
  });
  bindings.set(db, options.nativeBinding);
  db.pragma('foreign_keys = ON');
  if (!options.readonly && path !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}
