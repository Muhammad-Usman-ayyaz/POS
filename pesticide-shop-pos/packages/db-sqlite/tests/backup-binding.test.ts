// Regression test for a crash found in Electron: the backup copy was opened with the DEFAULT native SQLite build
// (made for Node), so in Electron an upgrade of an existing database died with "compiled against a different
// Node.js version (NODE_MODULE_VERSION 137 ... requires 146)". Tests run on Node, where both builds are the same, so
// this test records how every connection is opened and checks the copy gets the same native binding as the source.
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const opened: { path: string; options: { nativeBinding?: string } | undefined }[] = [];

vi.mock('better-sqlite3', async (importOriginal) => {
  type Ctor = new (path?: string, options?: { nativeBinding?: string }) => import('better-sqlite3').Database;
  const real = (await importOriginal<{ default: Ctor }>()).default;
  class Recording extends real {
    constructor(path?: string, options?: { nativeBinding?: string }) {
      opened.push({ path: String(path), options });
      super(path, options);
    }
  }
  return { default: Recording };
});

const { backupDatabase, nativeBindingOf, openDatabase } = await import('../src/index.js');
// A binding that works under plain Node: the normal build, passed explicitly, as the desktop app passes its Electron one.
const nodeBinding = join(dirname(createRequire(import.meta.url).resolve('better-sqlite3/package.json')), 'build', 'Release', 'better_sqlite3.node');

let dir: string;
beforeEach(() => {
  opened.length = 0;
  dir = mkdtempSync(join(tmpdir(), 'pos-backup-binding-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may hold the file for a moment; the folder is in the temp directory */
  }
});

describe('the backup copy is opened with the same native SQLite build as the database it copies', () => {
  it('a database opened with an explicit native binding remembers it; one opened without says so', () => {
    const withBinding = openDatabase(':memory:', { nativeBinding: nodeBinding });
    const without = openDatabase(':memory:');
    expect(nativeBindingOf(withBinding)).toBe(nodeBinding);
    expect(nativeBindingOf(without)).toBeUndefined();
    withBinding.close();
    without.close();
  });

  it('backupDatabase opens the verification copy with the source binding (the Electron build, in the app)', async () => {
    const source = openDatabase(join(dir, 'live.db'), { nativeBinding: nodeBinding });
    source.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1);');
    opened.length = 0;

    const result = await backupDatabase(source, join(dir, 'copy.db'));

    expect(result.bytes).toBeGreaterThan(0);
    const copyOpens = opened.filter((o) => o.path === join(dir, 'copy.db'));
    expect(copyOpens).toHaveLength(1);
    expect(copyOpens[0]!.options?.nativeBinding).toBe(nodeBinding); // NOT undefined: undefined would load the default build
    source.close();
  });

  it('a source opened without a binding gives a copy opened without one (plain Node, as before)', async () => {
    const source = openDatabase(join(dir, 'live.db'));
    source.exec('CREATE TABLE t (x INTEGER)');
    opened.length = 0;
    await backupDatabase(source, join(dir, 'copy.db'));
    expect(opened.filter((o) => o.path === join(dir, 'copy.db'))[0]!.options?.nativeBinding).toBeUndefined();
    source.close();
  });

  it('the copy is still a single, checked file in rollback-journal mode', async () => {
    const source = openDatabase(join(dir, 'live.db'), { nativeBinding: nodeBinding });
    source.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (7);');
    await backupDatabase(source, join(dir, 'copy.db'));
    const copy = openDatabase(join(dir, 'copy.db'), { readonly: true, nativeBinding: nodeBinding });
    expect(copy.prepare('SELECT x FROM t').get()).toEqual({ x: 7 });
    expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
    copy.close();
    source.close();
  });
});
