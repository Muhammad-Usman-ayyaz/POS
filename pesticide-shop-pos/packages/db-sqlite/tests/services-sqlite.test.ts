import { describe, expect, it } from 'vitest';
import { defineServiceSuites } from '@pos/core/testing';
import { createSqliteWorld } from './support/sqlite-world.js';

// The SAME suite that runs against the in-memory fakes (packages/core/tests/services/in-memory.test.ts),
// here against a real SQLite database with the real migrations, triggers and transactions.
defineServiceSuites('SQLite adapter', (options) => createSqliteWorld(options));

// The settings repository against the real settings table (its "key" column is UNIQUE, deleted or not).
describe('SQLite settings repository', () => {
  const read = async (key: string, fallback: number) => {
    const w = await createSqliteWorld();
    return { w, value: w.deps.uow.run((tx) => tx.settings.getInt(key, fallback)) };
  };

  it('a soft-deleted setting reads as missing (the fallback), whatever value it kept', async () => {
    const w = await createSqliteWorld();
    w.setSetting('default_credit_limit', '5000');
    expect(w.deps.uow.run((tx) => tx.settings.getInt('default_credit_limit', 7))).toBe(5000);
    w.db.prepare('UPDATE settings SET deleted_at = ? WHERE "key" = ?').run('2026-01-02T00:00:00.000Z', 'default_credit_limit');
    expect(w.deps.uow.run((tx) => tx.settings.getInt('default_credit_limit', 7))).toBe(7);
    w.close();
  });

  it('setInt never touches a soft-deleted row: it cannot revive it, and the clash with the unique key is an error', async () => {
    const w = await createSqliteWorld();
    w.setSetting('default_credit_limit', '5000');
    w.db.prepare('UPDATE settings SET deleted_at = ? WHERE "key" = ?').run('2026-01-02T00:00:00.000Z', 'default_credit_limit');
    expect(() => w.deps.uow.run((tx) => tx.settings.setInt('default_credit_limit', 9))).toThrow(/UNIQUE/i);
    const row = w.db.prepare('SELECT value, deleted_at FROM settings WHERE "key" = ?').get('default_credit_limit') as { value: string; deleted_at: string | null };
    expect(row).toEqual({ value: '5000', deleted_at: '2026-01-02T00:00:00.000Z' });
    w.close();
  });

  it('setInt updates a live row in place and inserts a missing one; the value must be a whole number', async () => {
    const w = await createSqliteWorld();
    w.deps.uow.run((tx) => tx.settings.setInt('near_expiry_days', 45));
    w.deps.uow.run((tx) => tx.settings.setInt('near_expiry_days', 60));
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM settings WHERE "key" = ?').get('near_expiry_days')).toEqual({ n: 1 });
    expect(w.deps.uow.run((tx) => tx.settings.getInt('near_expiry_days', 0))).toBe(60);
    expect(() => w.deps.uow.run((tx) => tx.settings.setInt('near_expiry_days', 1.5))).toThrow(/whole number/);
    w.close();
  });

  it('a stored text is read the way parseInt reads it: "12abc" is 12, no number or an empty value is the fallback', async () => {
    const { w, value } = await read('missing_key', 3);
    expect(value).toBe(3);
    for (const [text, expected] of [['12abc', 12], ['abc', 3], ['', 3], ['-4', -4]] as const) {
      w.setSetting('some_key', text);
      expect(w.deps.uow.run((tx) => tx.settings.getInt('some_key', 3)), text).toBe(expected);
    }
    w.close();
  });
});
