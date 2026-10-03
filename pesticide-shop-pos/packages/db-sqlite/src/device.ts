import type { DeviceScope } from '@pos/core';
import type { Db } from './connection.js';

export interface DeviceInfo {
  scope: DeviceScope;
  shopName: string;
  deviceName: string;
  deviceCode: string;
}

/**
 * The shop, branch and device this database belongs to (made by first-launch setup).
 * One shop, one PC: there is one of each. Returns undefined before setup has run.
 */
export function loadDeviceInfo(db: Db): DeviceInfo | undefined {
  const row = db
    .prepare(
      `SELECT s.id AS shop_id, s.name AS shop_name, b.id AS branch_id, d.id AS device_id, d.name AS device_name, d.device_code AS device_code
         FROM devices d
         JOIN branches b ON b.id = d.branch_id
         JOIN shops s ON s.id = b.shop_id
        WHERE d.deleted_at IS NULL AND b.deleted_at IS NULL AND s.deleted_at IS NULL
        ORDER BY d.created_at, d.rowid
        LIMIT 1`,
    )
    .get() as { shop_id: string; shop_name: string; branch_id: string; device_id: string; device_name: string; device_code: string } | undefined;
  if (!row) return undefined;
  return {
    scope: { shop_id: row.shop_id, branch_id: row.branch_id, device_id: row.device_id },
    shopName: row.shop_name,
    deviceName: row.device_name,
    deviceCode: row.device_code,
  };
}
