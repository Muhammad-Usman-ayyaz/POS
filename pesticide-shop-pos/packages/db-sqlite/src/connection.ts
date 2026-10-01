import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Opens a database with the pragmas every connection must have. Use ':memory:' for tests. */
export function openDatabase(path: string, options: { readonly?: boolean } = {}): Db {
  const db = new Database(path, { readonly: options.readonly ?? false });
  db.pragma('foreign_keys = ON');
  if (!options.readonly && path !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}
