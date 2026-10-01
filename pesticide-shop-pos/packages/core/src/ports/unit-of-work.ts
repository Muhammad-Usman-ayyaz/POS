import type { Repositories } from './repositories.js';

/**
 * Runs `work` inside ONE database transaction.
 *
 * - If `work` returns, everything it wrote is committed together.
 * - If `work` throws, everything it wrote is rolled back and the same error is rethrown.
 * - `work` must be synchronous. Returning a Promise is a bug: the transaction would commit before it settles.
 * - Calling `run` from inside `work` is not allowed. Use the `tx` you were given.
 *
 * Services do their reads inside `run` too, so a decision (is there enough stock?) and the writes that
 * follow it see the same data.
 */
export interface UnitOfWork {
  run<T>(work: (tx: Repositories) => T): T;
}
