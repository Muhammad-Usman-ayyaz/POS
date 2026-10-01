// Guards against drift: the Zod entity schemas in core must describe exactly the columns the migrations create.
import { entitySchemas } from '@pos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '../src/index.js';

interface Column {
  name: string;
  notnull: number;
  pk: number;
}

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
        const nullable = col.notnull === 0 && col.pk === 0;
        expect(shape[col.name]?.safeParse(null).success, `${table}.${col.name}`).toBe(nullable);
      }
    });
  });
});
