// Safety checks for `npm run dev:db`, kept in their own file so they can be tested.
// That script DELETES the database it targets, so it may only ever touch the git-ignored dev.db in the repository root.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The one file `npm run dev:db` may replace. */
export function devDbPath(repoRoot: string): string {
  return join(resolve(repoRoot), 'dev.db');
}

/** Refuses to continue unless this really is the root of this repository (so the script cannot run from somewhere else). */
export function assertIsRepoRoot(repoRoot: string): void {
  const manifest = join(resolve(repoRoot), 'package.json');
  const name = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name : undefined;
  if (name !== 'pesticide-shop-pos') throw new Error(`${repoRoot} is not the pesticide-shop-pos repository root; refusing to touch anything.`);
}

/** Refuses any target that is not exactly <repo root>/dev.db. */
export function assertTargetIsRepoDevDb(target: string, repoRoot: string): void {
  const wanted = devDbPath(repoRoot);
  if (resolve(target).toLowerCase() !== wanted.toLowerCase()) {
    throw new Error(`Refusing to touch ${resolve(target)}. This script only ever replaces ${wanted}.`);
  }
}

/** POS_DB_PATH points the APP at a database. It must never redirect a script that deletes files. */
export function ignoredEnvironmentNote(env: Record<string, string | undefined>): string | null {
  return env['POS_DB_PATH'] ? `Ignoring POS_DB_PATH (${env['POS_DB_PATH']}): dev:db only ever uses the repository's dev.db.` : null;
}
