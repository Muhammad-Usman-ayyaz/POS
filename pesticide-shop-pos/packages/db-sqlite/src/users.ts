import { randomUUID } from 'node:crypto';
import type { DeviceScope } from '@pos/core';
import type { Db } from './connection.js';

// Sign-in data. The core services never see password hashes (the UserRepository leaves them out), so the
// desktop app reaches them through these functions. Hashing itself is not done here: callers pass hashes in.

export interface LoginRecord {
  id: string;
  name: string;
  username: string;
  role: 'owner' | 'staff';
  is_active: 0 | 1;
  deleted_at: string | null;
  password_hash: string;
  recovery_code_hash: string | null;
}

/** The user with this exact username, hashes included, or undefined. */
export function findUserForLogin(db: Db, username: string): LoginRecord | undefined {
  return db
    .prepare(
      `SELECT id, name, username, role, is_active, deleted_at, password_hash, recovery_code_hash
         FROM users WHERE username = ?`,
    )
    .get(username) as LoginRecord | undefined;
}

export interface NewUser {
  name: string;
  username: string;
  passwordHash: string;
  role: 'owner' | 'staff';
}

/** Adds a user. (Real user management arrives with the Settings screen; this serves tests and the dev database.) */
export function createUser(db: Db, scope: DeviceScope, user: NewUser): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, name, username, password_hash, role, shop_id, branch_id, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, user.name, user.username, user.passwordHash, user.role, scope.shop_id, scope.branch_id, scope.device_id);
  return id;
}

/** Replaces the hash of the recovery code (after it was used or regenerated). */
export function setRecoveryCodeHash(db: Db, userId: string, recoveryCodeHash: string): void {
  db.prepare('UPDATE users SET recovery_code_hash = ? WHERE id = ?').run(recoveryCodeHash, userId);
}

/** New password and a new recovery code hash together: either both change or neither does. */
export function resetCredentials(db: Db, userId: string, passwordHash: string, recoveryCodeHash: string): void {
  db.transaction(() => {
    const result = db.prepare('UPDATE users SET password_hash = ?, recovery_code_hash = ? WHERE id = ?').run(passwordHash, recoveryCodeHash, userId);
    if (result.changes !== 1) throw new Error(`no user ${userId}`);
  })();
}
