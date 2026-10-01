import { randomUUID } from 'node:crypto';
import type { Db } from './connection.js';

export interface FirstLaunchInput {
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  ownerName: string;
  ownerUsername: string;
  /** Already hashed by the caller. This package does no password handling. */
  ownerPasswordHash: string;
  branchName?: string;
  /** Short code used in invoice numbers, e.g. "A" gives INV-A-000001. */
  branchCode?: string;
  deviceName?: string;
  deviceCode?: string;
}

export interface SetupIds {
  shopId: string;
  branchId: string;
  deviceId: string;
  ownerId: string;
}

export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  near_expiry_days: '30',
};

/** [sequence_name, prefix before the branch code] */
const SEQUENCES: readonly (readonly [string, string])[] = [
  ['invoice', 'INV'],
  ['return', 'RET'],
  ['purchase', 'PUR'],
];

export function isSetupDone(db: Db): boolean {
  return db.prepare('SELECT 1 FROM shops WHERE deleted_at IS NULL LIMIT 1').get() !== undefined;
}

/**
 * Creates the shop, branch, device, owner user, default settings and number sequences in one transaction.
 * Throws if a shop already exists, so it cannot be run twice by accident.
 */
export function firstLaunchSetup(db: Db, input: FirstLaunchInput): SetupIds {
  if (isSetupDone(db)) throw new Error('First-launch setup has already been done.');

  const branchCode = input.branchCode ?? 'A';
  const ids: SetupIds = { shopId: randomUUID(), branchId: randomUUID(), deviceId: randomUUID(), ownerId: randomUUID() };

  db.transaction(() => {
    db.prepare('INSERT INTO shops (id, name, phone, address) VALUES (?, ?, ?, ?)').run(
      ids.shopId,
      input.shopName,
      input.shopPhone ?? null,
      input.shopAddress ?? null,
    );
    db.prepare('INSERT INTO branches (id, shop_id, name, code) VALUES (?, ?, ?, ?)').run(
      ids.branchId,
      ids.shopId,
      input.branchName ?? 'Main',
      branchCode,
    );
    db.prepare('INSERT INTO devices (id, branch_id, name, device_code) VALUES (?, ?, ?, ?)').run(
      ids.deviceId,
      ids.branchId,
      input.deviceName ?? 'Counter PC',
      input.deviceCode ?? `${branchCode}1`,
    );
    db.prepare(
      `INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id)
       VALUES (?, ?, ?, ?, 'owner', ?, ?, ?)`,
    ).run(ids.ownerId, input.ownerName, input.ownerUsername, input.ownerPasswordHash, ids.shopId, ids.branchId, ids.deviceId);

    const setting = db.prepare(
      'INSERT INTO settings (id, "key", value, shop_id, branch_id, device_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      setting.run(randomUUID(), key, value, ids.shopId, ids.branchId, ids.deviceId);
    }

    const seq = db.prepare('INSERT INTO number_sequences (id, device_id, sequence_name, prefix) VALUES (?, ?, ?, ?)');
    for (const [name, prefix] of SEQUENCES) seq.run(randomUUID(), ids.deviceId, name, `${prefix}-${branchCode}-`);
  })();

  return ids;
}
