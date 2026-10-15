// The print settings are plain settings rows. A row that was soft-deleted is not brought back by a save: it is refused and left alone.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstLaunchSetup, getPrintConfig, loadDeviceInfo, migrate, openDatabase, setPrintConfig } from '../src/index.js';

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'pos-print-config-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setPrintConfig', () => {
  it('refuses to change a soft-deleted setting: it is not revived, and nothing else in the same save is written', async () => {
    const db = openDatabase(join(dir, 'shop.db'));
    await migrate(db);
    firstLaunchSetup(db, { shopName: 'Some Shop', ownerName: 'O', ownerUsername: 'owner', ownerPasswordHash: 'x' });
    const scope = loadDeviceInfo(db)!.scope;
    setPrintConfig(db, scope, { shop_phone: '0300 1111111', shop_address: 'Old road' });
    db.prepare('UPDATE settings SET deleted_at = ? WHERE "key" = ?').run('2026-10-02T00:00:00.000Z', 'shop.phone');
    expect(getPrintConfig(db).shop_phone).toBeNull(); // a deleted setting reads as not set

    expect(() => setPrintConfig(db, scope, { shop_address: 'New road', shop_phone: '0300 2222222' })).toThrow(/deleted/);
    const row = db.prepare('SELECT value, deleted_at FROM settings WHERE "key" = ?').get('shop.phone') as { value: string; deleted_at: string | null };
    expect(row).toEqual({ value: '0300 1111111', deleted_at: '2026-10-02T00:00:00.000Z' }); // still deleted, value untouched
    expect(getPrintConfig(db).shop_phone).toBeNull();
    expect(getPrintConfig(db).shop_address).toBe('Old road'); // the whole save rolled back
    expect(db.prepare('SELECT COUNT(*) AS c FROM settings WHERE "key" = ?').get('shop.phone')).toEqual({ c: 1 }); // and no second row was made
    db.close();
  });
});
