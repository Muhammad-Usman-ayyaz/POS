// Recreates a fresh dev.db at the repo root: migrated, with first-launch setup done.
// Run: npm run dev:db
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstLaunchSetup, migrate, openDatabase } from '../packages/db-sqlite/src/index.js';

const dbPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dev.db');

async function main(): Promise<void> {
  // WAL mode leaves -wal and -shm files beside the database; remove them too.
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });

  const db = openDatabase(dbPath);
  try {
    const { applied } = await migrate(db);
    firstLaunchSetup(db, {
      shopName: 'Test Shop',
      ownerName: 'Owner',
      ownerUsername: 'owner',
      ownerPasswordHash: 'dummy-hash-not-a-real-password',
    });
    console.log(`Created ${dbPath} (migrations applied: ${applied.join(', ')})`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
