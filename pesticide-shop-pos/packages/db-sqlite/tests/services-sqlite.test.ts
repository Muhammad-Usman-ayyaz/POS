import { defineServiceSuites } from '@pos/core/testing';
import { createSqliteWorld } from './support/sqlite-world.js';

// The SAME suite that runs against the in-memory fakes (packages/core/tests/services/in-memory.test.ts),
// here against a real SQLite database with the real migrations, triggers and transactions.
defineServiceSuites('SQLite adapter', (options) => createSqliteWorld(options));
