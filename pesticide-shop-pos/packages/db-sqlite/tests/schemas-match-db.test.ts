// Guards against drift: the Zod entity schemas in core must describe exactly the columns the migrations create.
import { entitySchemas } from '@pos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '../src/index.js';

interface Column {
  name: string;
  notnull: number;
  pk: number;
}

/**
 * THE ONE EXCEPTION. A column the Zod schema requires (never null) although the table declares it nullable, because
 * SQLite cannot add a NOT NULL foreign-key column to an existing table (see migration 004). Each one is guarded by two
 * triggers instead, named trg_<table>_<column>_required_ins and _upd, which the second test below checks and exercises.
 * Do not add to this list without the same two triggers.
 */
const REQUIRED_BY_TRIGGER: Readonly<Record<string, readonly string[]>> = { products: ['group_id'] };

let db: Db;
beforeAll(async () => {
  db = openDatabase(':memory:');
  await migrate(db);
});

const columns = (table: string): Column[] => db.pragma(`table_info(${table})`) as Column[];

describe('core schemas match the database', () => {
  it('there is a schema for every table, and no schema for a missing table', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
      .map((t) => t.name)
      .filter((t) => t !== 'schema_version')
      .sort();
    expect(Object.keys(entitySchemas).sort()).toEqual(tables);
  });

  describe.each(Object.entries(entitySchemas))('%s', (table, schema) => {
    const shape = (schema as unknown as { shape: Record<string, { safeParse(v: unknown): { success: boolean } }> }).shape;

    it('has the same columns', () => {
      expect(Object.keys(shape).sort()).toEqual(columns(table).map((c) => c.name).sort());
    });

    it('allows null exactly where the column is nullable', () => {
      for (const col of columns(table)) {
        const nullable = col.notnull === 0 && col.pk === 0 && !REQUIRED_BY_TRIGGER[table]?.includes(col.name);
        expect(shape[col.name]?.safeParse(null).success, `${table}.${col.name}`).toBe(nullable);
      }
    });
  });
});

describe('the named exception: columns required by trigger, not by NOT NULL', () => {
  const exceptions = Object.entries(REQUIRED_BY_TRIGGER).flatMap(([table, cols]) => cols.map((col): [string, string] => [table, col]));

  it.each(exceptions)('%s.%s is declared nullable, which is why it needs the exception', (table, col) => {
    expect(columns(table).find((c) => c.name === col)?.notnull).toBe(0);
  });

  it.each(exceptions)('%s.%s has both triggers (insert and update) and they refuse NULL', (table, col) => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").all(table) as { name: string }[]).map((t) => t.name);
    expect(names).toContain(`trg_${table}_${col}_required_ins`);
    expect(names).toContain(`trg_${table}_${col}_required_upd`);
    // and they work: a throw-away database with one group and one size
    const probe = openDatabase(':memory:');
    return migrate(probe).then(() => {
      const scope = { shop: 's', branch: 'b', device: 'd' };
      probe.exec(`INSERT INTO shops (id, name) VALUES ('s', 'S');
                  INSERT INTO branches (id, shop_id, name, code) VALUES ('b', 's', 'Main', 'A');
                  INSERT INTO devices (id, branch_id, name, device_code) VALUES ('d', 'b', 'PC', 'A1');
                  INSERT INTO product_groups (id, name_en, shop_id, branch_id, device_id) VALUES ('g', 'G', '${scope.shop}', '${scope.branch}', '${scope.device}');
                  INSERT INTO products (id, group_id, name_en, base_unit, pack_size, retail_price, wholesale_price, shop_id, branch_id, device_id) VALUES ('p', 'g', 'P', 'ml', 100, 1, 1, 's', 'b', 'd');`);
      expect(() => probe.exec(`INSERT INTO products (id, name_en, base_unit, pack_size, retail_price, wholesale_price, shop_id, branch_id, device_id) VALUES ('q', 'Q', 'ml', 100, 1, 1, 's', 'b', 'd')`)).toThrow(/group_id is required/);
      expect(() => probe.exec(`UPDATE products SET group_id = NULL WHERE id = 'p'`)).toThrow(/group_id is required/);
      probe.close();
    });
  });
});
