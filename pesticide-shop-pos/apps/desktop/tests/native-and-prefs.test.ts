import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveNativeBinding } from '../src/main/native.js';
import { argon2Hasher } from '../src/main/password.js';
import { PrefsStore } from '../src/main/prefs.js';
import { assertPinsMatchInstalled, checkTarget, installedVersions, pins, platformKey, sha256, targetFile } from '../scripts/native-lib.mjs';

describe('the pinned Electron build of SQLite', () => {
  it('the pins match the versions that are installed: bumping electron or better-sqlite3 without updating native-binaries.json fails here', () => {
    expect(() => assertPinsMatchInstalled()).not.toThrow();
    const v = installedVersions();
    expect(v).toEqual({ betterSqlite3: pins.version, electron: pins.electron, abi: pins.abi });
  });

  it('electron is pinned to an exact version (no ^ or ~), because the binary is built for exactly that ABI', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['electron']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.devDependencies['electron']).toBe(pins.electron);
  });

  it('every pin has the archive URL for its exact versions and two SHA-256 hashes', () => {
    for (const [platform, pin] of Object.entries(pins.binaries) as [string, { url: string; tarballSha256: string; fileSha256: string }][]) {
      expect(pin.url, platform).toContain(`v${pins.version}`);
      expect(pin.url, platform).toContain(`electron-v${pins.abi}-${platform}`);
      expect(pin.url.startsWith('https://github.com/WiseLibs/better-sqlite3/releases/download/'), platform).toBe(true);
      expect(pin.tarballSha256, platform).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.fileSha256, platform).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.tarballSha256).not.toBe(pin.fileSha256);
    }
  });

  it.skipIf(!existsSync(targetFile))('the downloaded file is the pinned one, byte for byte', () => {
    expect(checkTarget()).toBe('ok');
    expect(sha256(readFileSync(targetFile))).toBe(pins.binaries[platformKey]!.fileSha256);
  });

  it.skipIf(!existsSync(targetFile))('the Electron binary is a different file from the Node one in node_modules', () => {
    const nodeBinary = join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    expect(sha256(readFileSync(targetFile))).not.toBe(sha256(readFileSync(nodeBinary)));
  });

  describe('where the app looks for it', () => {
    let dir: string;
    beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'pos-native-'))));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    const env = (over: object = {}) => ({ isPackaged: false, appPath: dir, resourcesPath: join(dir, 'res'), platform: 'win32', arch: 'x64', abi: '146', ...over });

    it('in development: apps/desktop/native/<platform>-<arch>-electron<abi>/', () => {
      const file = join(dir, 'native', 'win32-x64-electron146', 'better_sqlite3.node');
      mkdirSync(join(dir, 'native', 'win32-x64-electron146'), { recursive: true });
      writeFileSync(file, 'x');
      expect(resolveNativeBinding(env())).toBe(file);
    });

    it('in an installed app: the resources folder, which is where the installer must put it', () => {
      const file = join(dir, 'res', 'native', 'win32-x64-electron146', 'better_sqlite3.node');
      mkdirSync(join(dir, 'res', 'native', 'win32-x64-electron146'), { recursive: true });
      writeFileSync(file, 'x');
      expect(resolveNativeBinding(env({ isPackaged: true }))).toBe(file);
    });

    it('a missing file gives a message that says exactly what to run', () => {
      expect(() => resolveNativeBinding(env())).toThrow(/npm run native -w @pos\/desktop/);
      expect(() => resolveNativeBinding(env({ isPackaged: true }))).toThrow(/Reinstall/);
    });

    it('uses the ABI of the running Electron, so a different Electron looks in a different folder', () => {
      mkdirSync(join(dir, 'native', 'win32-x64-electron146'), { recursive: true });
      writeFileSync(join(dir, 'native', 'win32-x64-electron146', 'better_sqlite3.node'), 'x');
      expect(() => resolveNativeBinding(env({ abi: '149' }))).toThrow(/electron149/);
    });
  });
});

describe('PrefsStore', () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'pos-prefs-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts in English, and remembers a change across restarts', () => {
    const path = join(dir, 'p.json');
    expect(new PrefsStore(path).get()).toBe('en');
    new PrefsStore(path).setLanguage('ur');
    expect(new PrefsStore(path).get()).toBe('ur');
  });

  it('writes the file in one step: no half-written file and no temp file left behind', () => {
    const path = join(dir, 'p.json');
    new PrefsStore(path).setLanguage('ur');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ language: 'ur' });
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('creates the folder if it is missing', () => {
    const path = join(dir, 'a', 'b', 'p.json');
    new PrefsStore(path).setLanguage('ur');
    expect(new PrefsStore(path).get()).toBe('ur');
  });

  it.each([['garbage', 'not json at all'], ['wrong language', '{"language":"fr"}'], ['empty', ''], ['an array', '[]'], ['an object with no language', '{}']])('falls back to English for a damaged file (%s)', (_label, content) => {
    const path = join(dir, 'p.json');
    writeFileSync(path, content);
    expect(new PrefsStore(path).get()).toBe('en');
  });

  it('with no path it works in memory only', () => {
    const store = new PrefsStore(null);
    store.setLanguage('ur');
    expect(store.get()).toBe('ur');
  });
});

describe('password hashing (argon2id)', () => {
  it('hashes to an argon2id string that does not contain the password, differently each time (random salt)', async () => {
    const a = await argon2Hasher.hash('correct horse battery staple');
    const b = await argon2Hasher.hash('correct horse battery staple');
    expect(a).toMatch(/^\$argon2id\$v=19\$/);
    expect(a).not.toContain('horse');
    expect(a).not.toBe(b);
  });

  it('verifies the right password and refuses the wrong one, including a near miss', async () => {
    const hash = await argon2Hasher.hash('Secret-123');
    expect(await argon2Hasher.verify(hash, 'Secret-123')).toBe(true);
    expect(await argon2Hasher.verify(hash, 'secret-123')).toBe(false);
    expect(await argon2Hasher.verify(hash, 'Secret-123 ')).toBe(false);
    expect(await argon2Hasher.verify(hash, '')).toBe(false);
  });

  it('never throws on a hash it cannot read: it just says no', async () => {
    for (const bad of ['', 'not-a-hash', '$argon2id$garbage', 'fake$password']) expect(await argon2Hasher.verify(bad, 'x')).toBe(false);
  });

  it('is slow enough to resist guessing but fast enough to sign in (between 10 ms and 1 s)', async () => {
    const started = performance.now();
    await argon2Hasher.hash('timing-test');
    const ms = performance.now() - started;
    expect(ms).toBeGreaterThan(10);
    expect(ms).toBeLessThan(1000);
  });
});
