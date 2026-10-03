// Shared by fetch-native.mjs and check-native.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const desktopDir = join(here, '..');
export const pins = JSON.parse(readFileSync(join(desktopDir, 'native-binaries.json'), 'utf8'))['better-sqlite3'];
export const platformKey = `${process.platform}-${process.arch}`;
export const targetFile = join(desktopDir, 'native', `${platformKey}-electron${pins.abi}`, 'better_sqlite3.node');

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** The versions actually installed, which must match the pins. */
export function installedVersions() {
  const betterSqlite3 = require('better-sqlite3/package.json').version;
  const electronDir = dirname(require.resolve('electron/package.json'));
  const electron = require('electron/package.json').version;
  const abi = Number(readFileSync(join(electronDir, 'abi_version'), 'utf8').trim());
  return { betterSqlite3, electron, abi };
}

/** Throws a clear error when the installed packages and native-binaries.json disagree. */
export function assertPinsMatchInstalled() {
  const v = installedVersions();
  const problems = [];
  if (v.betterSqlite3 !== pins.version) problems.push(`better-sqlite3 is ${v.betterSqlite3} but the pin is ${pins.version}`);
  if (v.electron !== pins.electron) problems.push(`electron is ${v.electron} but the pin is ${pins.electron}`);
  if (v.abi !== pins.abi) problems.push(`electron ABI is ${v.abi} but the pin is ${pins.abi}`);
  if (problems.length) {
    throw new Error(`native-binaries.json is out of date:\n  - ${problems.join('\n  - ')}\nUpdate it (see docs/native-sqlite.md), then run: npm run native -w @pos/desktop`);
  }
}

export const pinForThisPlatform = () => {
  const pin = pins.binaries[platformKey];
  if (!pin) throw new Error(`No pinned better-sqlite3 binary for ${platformKey}. Add one to apps/desktop/native-binaries.json (see docs/native-sqlite.md).`);
  return pin;
};

/** 'ok' | 'missing' | 'wrong-hash' */
export function checkTarget() {
  if (!existsSync(targetFile)) return 'missing';
  return sha256(readFileSync(targetFile)) === pinForThisPlatform().fileSha256 ? 'ok' : 'wrong-hash';
}
