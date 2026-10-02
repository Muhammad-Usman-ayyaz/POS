import type { DeviceScope, Repositories, UnitOfWork } from '@pos/core';
import type { Db } from '../connection.js';
import { createSqliteRepositories } from './sqlite-repositories.js';

/**
 * The unit of work on a real SQLite transaction (better-sqlite3 `db.transaction`).
 *
 * - BEGIN IMMEDIATE: the write lock is taken at the start, so what a service reads is still true when it writes.
 * - If `work` returns, COMMIT. If it throws, ROLLBACK and the SAME error is rethrown.
 * - `work` must be synchronous: a transaction cannot wait on a Promise, so one is refused (and rolled back).
 * - Nested `run` is refused: use the `tx` you were given.
 */
export function createSqliteUnitOfWork(db: Db, scope: DeviceScope): UnitOfWork {
  const repositories = createSqliteRepositories(db, scope);
  let running = false;

  return {
    run<T>(work: (tx: Repositories) => T): T {
      if (running) throw new Error('run() called inside run(): use the tx you were given');

      const transaction = db.transaction((): T => {
        const result = work(repositories);
        if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
          throw new Error('the unit of work callback must be synchronous: a transaction cannot wait on a Promise');
        }
        return result;
      });

      running = true;
      try {
        return transaction.immediate();
      } finally {
        running = false;
      }
    },
  };
}
