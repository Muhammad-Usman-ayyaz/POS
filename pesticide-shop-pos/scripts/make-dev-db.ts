// Recreates a fresh dev.db at the repo root: migrated, shop set up, an owner and a staff user with real
// (argon2) passwords, and the demo products and customers from the design mockups.
// Run: npm run dev:db     Then: npm run dev
// To see the first-launch setup screen instead, just delete dev.db (or never run this).
//
// This is the ONLY place the dev logins live. It is a throw-away development database: nothing here is a real
// secret. Because it deletes a file, it is strict about what it will touch:
//   - only <repo root>/dev.db, never POS_DB_PATH or any other path
//   - never a database that already holds a shop other than the demo one (a real shop someone set up through the app)
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { addDays, systemClock, todayUtc } from '@pos/core';
import { createUser, firstLaunchSetup, loadDeviceInfo, migrate, openDatabase } from '../packages/db-sqlite/src/index.js';
import { inspectExistingDatabase, seedDemoData } from '../packages/db-sqlite/src/demo.js';
import { generateRecoveryCode, normalizeRecoveryCode } from '../apps/desktop/src/main/recovery.js';
import { assertIsRepoRoot, assertTargetIsRepoDevDb, devDbPath, ignoredEnvironmentNote } from './dev-db-guard.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const OWNER = { name: 'Owner', username: 'owner', password: 'owner-pass-1' };
const STAFF = { name: 'Salesman', username: 'staff', password: 'staff-pass-1' };

async function main(): Promise<void> {
  assertIsRepoRoot(repoRoot);
  const dbPath = devDbPath(repoRoot);
  assertTargetIsRepoDevDb(dbPath, repoRoot);
  const note = ignoredEnvironmentNote(process.env);
  if (note) console.warn(note);

  // Look before deleting anything.
  const existing = inspectExistingDatabase(dbPath);
  if (existing === 'real') {
    throw new Error(
      `${dbPath} already holds a shop that is not the demo shop (or cannot be read). Refusing to delete it.\n` +
        'If it really is disposable, delete the file yourself and run this again.',
    );
  }

  // WAL mode leaves -wal and -shm files beside the database; remove them too.
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });

  const db = openDatabase(dbPath);
  try {
    const { applied } = await migrate(db);
    const recoveryCode = generateRecoveryCode((n) => randomBytes(n));
    const { ownerId } = firstLaunchSetup(db, {
      shopName: 'Pesticide Club Shop',
      ownerName: OWNER.name,
      ownerUsername: OWNER.username,
      ownerPasswordHash: await hash(OWNER.password),
      ownerRecoveryCodeHash: await hash(normalizeRecoveryCode(recoveryCode)),
    });
    const info = loadDeviceInfo(db);
    if (!info) throw new Error('setup did not create a device');
    createUser(db, info.scope, { name: STAFF.name, username: STAFF.username, passwordHash: await hash(STAFF.password), role: 'staff' });
    seedDemoData(db, info.scope, ownerId, addDays(todayUtc(systemClock), 0));

    console.log(`Created ${dbPath} (migrations applied: ${applied.join(', ')})`);
    console.log(`  owner  ${OWNER.username} / ${OWNER.password}`);
    console.log(`  staff  ${STAFF.username} / ${STAFF.password}`);
    console.log(`  owner recovery code (dev only): ${recoveryCode}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
