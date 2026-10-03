// Downloads the Electron build of better-sqlite3 into apps/desktop/native/ and VERIFIES it.
//
// Why: the better_sqlite3.node in node_modules is built for Node (tests and scripts use it). Electron has a
// different ABI and cannot load that file. Rather than rebuild node_modules in place (which would break
// `npm test`), the desktop app loads a second, Electron-ABI binary from here via the `nativeBinding` option.
//
//   npm run native -w @pos/desktop                    download if missing or wrong, verify (offline is fine if already valid)
//   npm run native -w @pos/desktop -- --print-hashes  download and print the hashes, for updating native-binaries.json
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as tar from 'tar';
import { assertPinsMatchInstalled, checkTarget, pinForThisPlatform, platformKey, sha256, targetFile } from './native-lib.mjs';

const printHashes = process.argv.includes('--print-hashes');

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function extractBinary(tarball) {
  const work = mkdtempSync(join(tmpdir(), 'pos-native-'));
  try {
    const file = join(work, 'bs3.tar.gz');
    writeFileSync(file, tarball);
    await tar.x({ file, cwd: work, filter: (path) => path.endsWith('build/Release/better_sqlite3.node') });
    return readFileSync(join(work, 'build', 'Release', 'better_sqlite3.node'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  if (printHashes) {
    const pin = pinForThisPlatform();
    const tarball = await download(pin.url);
    const binary = await extractBinary(tarball);
    console.log(JSON.stringify({ tarballSha256: sha256(tarball), fileSha256: sha256(binary) }, null, 2));
    process.exit(0);
  }

  assertPinsMatchInstalled();
  const state = checkTarget();
  if (state === 'ok') {
    console.log(`native: better-sqlite3 for Electron (${platformKey}) is present and verified.`);
    process.exit(0);
  }

  const pin = pinForThisPlatform();
  console.log(`native: ${state === 'missing' ? 'downloading' : 'replacing a file with the wrong hash:'} ${pin.url}`);
  const tarball = await download(pin.url);
  if (sha256(tarball) !== pin.tarballSha256) {
    throw new Error(`The downloaded archive does not match the pinned SHA-256 (got ${sha256(tarball)}). Refusing to use it.`);
  }
  const binary = await extractBinary(tarball);
  if (sha256(binary) !== pin.fileSha256) {
    throw new Error(`The extracted better_sqlite3.node does not match the pinned SHA-256 (got ${sha256(binary)}). Refusing to use it.`);
  }
  mkdirSync(dirname(targetFile), { recursive: true });
  const staging = `${targetFile}.download`;
  writeFileSync(staging, binary);
  copyFileSync(staging, targetFile);
  rmSync(staging, { force: true });
  if (checkTarget() !== 'ok') throw new Error('The installed file failed verification.');
  console.log(`native: installed and verified ${targetFile}`);
} catch (error) {
  console.error(`\nnative: ${error instanceof Error ? error.message : error}\n`);
  console.error('The desktop app needs this file to open its database. It is downloaded once and needs internet only for that.');
  process.exit(1);
}
