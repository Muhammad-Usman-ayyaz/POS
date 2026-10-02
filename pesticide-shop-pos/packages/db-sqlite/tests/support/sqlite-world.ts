// SQLite backend for the shared service tests: a real in-memory database, migrated with the real
// migrations, with the same seed data as the fakes, and the real repositories and unit of work.
import { addDays, systemClock, todayUtc } from '@pos/core';
import {
  idGenerator,
  Instrument,
  ID,
  instrument,
  SCOPE,
  seedData,
  testClock,
  type InsertTable,
  type Row,
  type ServiceWorld,
  type TableName,
  type WorldOptions,
} from '@pos/core/testing';
import { createSqliteRepositories, createSqliteUnitOfWork, migrate, openDatabase, type Db } from '../../src/index.js';

const TABLES: TableName[] = [
  'products', 'batches', 'stock_movements', 'customers', 'suppliers', 'users', 'invoices', 'invoice_items', 'sales_returns',
  'sales_return_items', 'purchases', 'purchase_items', 'payments', 'ledger_entries', 'audit_log', 'number_sequences',
];

function insertSeed(db: Db, table: string, row: Row): void {
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => row[c]));
}

export interface SqliteWorld extends ServiceWorld {
  /** The open database, for tests that look at views, triggers and integrity directly. */
  db: Db;
}

export async function createSqliteWorld(options: WorldOptions = {}): Promise<SqliteWorld> {
  const today = todayUtc(systemClock);
  const db = openDatabase(':memory:');
  await migrate(db);

  // shop, branch, device and number sequences, with the same ids and formats as the fakes
  insertSeed(db, 'shops', { id: SCOPE.shop_id, name: 'Test Shop' });
  insertSeed(db, 'branches', { id: SCOPE.branch_id, shop_id: SCOPE.shop_id, name: 'Main', code: 'A' });
  insertSeed(db, 'devices', { id: SCOPE.device_id, branch_id: SCOPE.branch_id, name: 'Counter PC', device_code: 'A1' });
  const sequences: [string, string][] = [['invoice', 'INV-A-'], ['return', 'RET-A-'], ['purchase', 'PUR-A-']];
  sequences.forEach(([name, prefix], i) =>
    insertSeed(db, 'number_sequences', { id: `00000000-0000-4000-8000-0000000008${String(i).padStart(2, '0')}`, device_id: SCOPE.device_id, sequence_name: name, prefix }),
  );

  const seed = seedData(today, options);
  for (const u of seed.users) insertSeed(db, 'users', { ...u, password_hash: 'not-a-real-hash' });
  for (const r of seed.suppliers) insertSeed(db, 'suppliers', r);
  for (const r of seed.customers) insertSeed(db, 'customers', r);
  for (const r of seed.products) insertSeed(db, 'products', r);
  for (const r of seed.batches) insertSeed(db, 'batches', r);

  let seedNo = 0;
  const addStock = (batch_id: string, qty: number) =>
    insertSeed(db, 'stock_movements', {
      id: `00000000-0000-4000-8000-0000000007${String(seedNo++).padStart(2, '0')}`, batch_id, qty_delta: qty, movement_type: 'opening',
      ref_type: null, ref_id: null, created_by: ID.owner, ...SCOPE,
    });
  for (const o of seed.openings) addStock(o.batch_id, o.qty);

  const day = (n: number) => addDays(today, n);
  const clock = testClock(`${today}T12:00:00.000Z`);
  const probe = new Instrument();
  const rows = (table: TableName): Row[] => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];

  return {
    db,
    deps: { uow: instrument(createSqliteUnitOfWork(db, SCOPE), probe), clock, ids: idGenerator(), scope: SCOPE },
    today,
    day,
    at: (n, time = '12:00:00.000') => `${day(n)}T${time}Z`,
    setNow: clock.set,
    runs: () => probe.runs,
    inTransaction: () => db.inTransaction,
    rows,
    stockOf: (batchId) => (db.prepare('SELECT COALESCE(SUM(qty_delta), 0) AS total FROM stock_movements WHERE batch_id = ?').get(batchId) as { total: number }).total,
    // every table, plus the sync log the triggers write: a rolled-back change must not leave a trace anywhere
    snapshot: () => Object.fromEntries([...TABLES, 'change_log' as TableName].map((t) => [t, rows(t)])),
    update: (table, id, patch) => {
      const columns = Object.keys(patch);
      const result = db.prepare(`UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...columns.map((c) => patch[c]), id);
      if (result.changes !== 1) throw new Error(`update: no row ${id} in ${table}`);
    },
    addStock,
    failOnInsert: (table: InsertTable, nth) => probe.failOnInsert(table, nth),
    clearFailure: () => probe.clearFailure(),
    outsideTransaction: () => createSqliteRepositories(db, SCOPE),
    close: () => db.close(),
  };
}
