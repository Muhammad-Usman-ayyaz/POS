// A dev tool that deletes a database must be able to tell a demo database from a real shop's.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstLaunchSetup, loadDeviceInfo, migrate, openDatabase } from '../src/index.js';
import { DEMO_MARKER_KEY, inspectExistingDatabase, seedDemoData } from '../src/demo.js';

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'pos-demo-guard-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function makeDb(name: string, { shop = false, demo = false } = {}): Promise<string> {
  const path = join(dir, name);
  const db = openDatabase(path);
  await migrate(db);
  if (shop) {
    const { ownerId } = firstLaunchSetup(db, { shopName: 'Some Shop', ownerName: 'O', ownerUsername: 'owner', ownerPasswordHash: 'x' });
    if (demo) seedDemoData(db, loadDeviceInfo(db)!.scope, ownerId, '2026-10-01');
  }
  db.close();
  return path;
}

describe('inspectExistingDatabase', () => {
  it('no file: none', () => {
    expect(inspectExistingDatabase(join(dir, 'missing.db'))).toBe('none');
  });

  it('a migrated database with no shop, or an empty file: empty (safe to replace)', async () => {
    expect(inspectExistingDatabase(await makeDb('new.db'))).toBe('empty');
    writeFileSync(join(dir, 'zero.db'), '');
    expect(inspectExistingDatabase(join(dir, 'zero.db'))).toBe('empty');
  });

  it('the demo shop: demo (safe to replace)', async () => {
    expect(inspectExistingDatabase(await makeDb('demo.db', { shop: true, demo: true }))).toBe('demo');
  });

  it('a shop set up through the app, with no demo marker: real (never replaced), even if it is named like the demo shop', async () => {
    expect(inspectExistingDatabase(await makeDb('real.db', { shop: true }))).toBe('real');
    const path = join(dir, 'samename.db');
    const db = openDatabase(path);
    await migrate(db);
    firstLaunchSetup(db, { shopName: 'Pesticide Club Shop', ownerName: 'O', ownerUsername: 'owner', ownerPasswordHash: 'x' });
    db.close();
    expect(inspectExistingDatabase(path)).toBe('real');
  });

  it('a demo database that later got a SECOND shop, or lost its marker: real', async () => {
    const path = await makeDb('two.db', { shop: true, demo: true });
    const db = openDatabase(path);
    db.prepare("INSERT INTO shops (id, name) VALUES ('s2', 'Another')").run();
    db.close();
    expect(inspectExistingDatabase(path)).toBe('real');

    const path2 = await makeDb('nomarker.db', { shop: true, demo: true });
    const db2 = openDatabase(path2);
    db2.prepare('UPDATE settings SET deleted_at = ? WHERE "key" = ?').run('2026-10-02T00:00:00Z', DEMO_MARKER_KEY);
    db2.close();
    expect(inspectExistingDatabase(path2)).toBe('real');
  });

  it('a file it cannot read as a database counts as real: it is never deleted', () => {
    writeFileSync(join(dir, 'garbage.db'), 'this is not a sqlite database at all, just some text '.repeat(40));
    expect(inspectExistingDatabase(join(dir, 'garbage.db'))).toBe('real');
  });

  it('does not change the file it inspects', async () => {
    const path = await makeDb('real2.db', { shop: true });
    const before = (await import('node:fs')).readFileSync(path);
    inspectExistingDatabase(path);
    expect((await import('node:fs')).readFileSync(path).equals(before)).toBe(true);
  });

  it('seedDemoData writes the marker, once', async () => {
    const path = await makeDb('m.db', { shop: true, demo: true });
    const db = openDatabase(path);
    expect(db.prepare('SELECT COUNT(*) AS c FROM settings WHERE "key" = ?').get(DEMO_MARKER_KEY)).toEqual({ c: 1 });
    db.close();
  });
});

void mkdirSync;
