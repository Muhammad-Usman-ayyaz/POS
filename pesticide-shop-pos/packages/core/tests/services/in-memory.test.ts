import { createFakeWorld, defineServiceSuites } from '../support/index.js';

// The same suite also runs against the SQLite adapter: packages/db-sqlite/tests/services-sqlite.test.ts
defineServiceSuites('in-memory fakes', (options) => createFakeWorld(options));
