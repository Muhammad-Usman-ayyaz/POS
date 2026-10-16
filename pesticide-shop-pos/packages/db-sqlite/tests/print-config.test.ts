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

describe('setPrintConfig: format, footer, shop name and only-what-changed', () => {
  async function open() {
    const db = openDatabase(join(dir, 'shop.db'));
    await migrate(db);
    firstLaunchSetup(db, { shopName: 'Some Shop', ownerName: 'O', ownerUsername: 'owner', ownerPasswordHash: 'x' });
    return { db, scope: loadDeviceInfo(db)!.scope };
  }

  it('defaults: 80 mm, no footer, the name from setup', async () => {
    const { db } = await open();
    expect(getPrintConfig(db)).toMatchObject({ print_format: '80mm', receipt_footer: '', shop_name: 'Some Shop' });
    db.close();
  });

  it('stores format and footer as settings rows and the name in the shops row; an unknown stored format reads as 80 mm', async () => {
    const { db, scope } = await open();
    setPrintConfig(db, scope, { print_format: 'a4', receipt_footer: 'Come again', shop_name: 'New Name' });
    expect(db.prepare('SELECT value FROM settings WHERE "key" = ?').get('print.format')).toEqual({ value: 'a4' });
    expect(db.prepare('SELECT value FROM settings WHERE "key" = ?').get('print.receipt_footer')).toEqual({ value: 'Come again' });
    expect(db.prepare('SELECT name FROM shops').get()).toEqual({ name: 'New Name' });
    db.prepare('UPDATE settings SET value = ? WHERE "key" = ?').run('letter', 'print.format');
    expect(getPrintConfig(db).print_format).toBe('80mm');
    db.close();
  });

  it('the audit callback gets only the fields whose value differs, with before and after, and is not called at all when nothing differs', async () => {
    const { db, scope } = await open();
    const seen: unknown[] = [];
    const audit = (changed: unknown) => void seen.push(changed);
    setPrintConfig(db, scope, { receipt_footer: 'A', shop_phone: '1' }, audit);
    expect(seen).toEqual([[{ field: 'receipt_footer', from: null, to: 'A' }, { field: 'shop_phone', from: null, to: '1' }]]);
    seen.length = 0;
    setPrintConfig(db, scope, { receipt_footer: 'A', shop_phone: '2', print_format: '80mm', shop_name: 'Some Shop' }, audit);
    expect(seen).toEqual([[{ field: 'shop_phone', from: '1', to: '2' }]]);
    seen.length = 0;
    setPrintConfig(db, scope, { receipt_footer: ' A ', shop_phone: '2', shop_address: null, printer_name: '' }, audit);
    setPrintConfig(db, scope, {}, audit);
    expect(seen).toEqual([]);
    db.close();
  });

  it('an unchanged save writes no row at all (no settings row is created for a value that is already the default)', async () => {
    const { db, scope } = await open();
    const rows = () => (db.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number }).c;
    const before = rows();
    setPrintConfig(db, scope, { receipt_footer: '', print_format: '80mm', shop_name_ur: null });
    expect(rows()).toBe(before);
    db.close();
  });

  it('the shop name cannot be emptied, and the refusal rolls back the other fields of the same save', async () => {
    const { db, scope } = await open();
    expect(() => setPrintConfig(db, scope, { receipt_footer: 'X', shop_name: '  ' })).toThrow(/cannot be empty/);
    expect(getPrintConfig(db)).toMatchObject({ receipt_footer: '', shop_name: 'Some Shop' });
    db.close();
  });
});
