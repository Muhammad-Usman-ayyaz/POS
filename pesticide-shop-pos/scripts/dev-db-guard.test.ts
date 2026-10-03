import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertIsRepoRoot, assertTargetIsRepoDevDb, devDbPath, ignoredEnvironmentNote } from './dev-db-guard.js';

const repoRoot = resolve(__dirname, '..');

describe('npm run dev:db only ever touches the repository dev.db', () => {
  it('the target is <repo root>/dev.db', () => {
    expect(devDbPath(repoRoot)).toBe(join(repoRoot, 'dev.db'));
  });

  it('accepts exactly that path, in any spelling of it', () => {
    expect(() => assertTargetIsRepoDevDb(join(repoRoot, 'dev.db'), repoRoot)).not.toThrow();
    expect(() => assertTargetIsRepoDevDb(join(repoRoot, 'packages', '..', 'dev.db'), repoRoot)).not.toThrow();
    expect(() => assertTargetIsRepoDevDb(join(repoRoot, 'DEV.DB'), repoRoot)).not.toThrow(); // Windows paths ignore case
  });

  it.each([
    ['the app data database', join(repoRoot, 'pos.db')],
    ['a database in another folder', join(repoRoot, 'apps', 'desktop', 'dev.db')],
    ['a database outside the repository', resolve(repoRoot, '..', 'dev.db')],
    ['the user data folder', 'C:\\Users\\someone\\AppData\\Roaming\\Pesticide Club POS\\pos.db'],
    ['a similar name', join(repoRoot, 'dev.db.bak')],
  ])('refuses %s', (_label, target) => {
    expect(() => assertTargetIsRepoDevDb(target, repoRoot)).toThrow(/only ever replaces/);
  });

  it('only runs from the repository root', () => {
    expect(() => assertIsRepoRoot(repoRoot)).not.toThrow();
    expect(() => assertIsRepoRoot(join(repoRoot, 'packages'))).toThrow(/not the pesticide-shop-pos repository root/);
    expect(() => assertIsRepoRoot(resolve(repoRoot, '..'))).toThrow(/not the pesticide-shop-pos repository root/);
  });

  it('POS_DB_PATH is ignored (and reported), not obeyed', () => {
    expect(ignoredEnvironmentNote({ POS_DB_PATH: 'C:\\real\\pos.db' })).toContain('Ignoring POS_DB_PATH');
    expect(ignoredEnvironmentNote({})).toBeNull();
  });

  it('the script itself never reads POS_DB_PATH to choose a path: its target comes only from devDbPath()', () => {
    const script = readFileSync(join(repoRoot, 'scripts', 'make-dev-db.ts'), 'utf8');
    expect(script).not.toMatch(/process\.env\[?\.?['"]?POS_DB_PATH/);
    expect(script).toContain('const dbPath = devDbPath(repoRoot)');
    expect(script).toContain('assertTargetIsRepoDevDb(dbPath, repoRoot)');
  });

  it('the script looks at the existing database BEFORE it deletes anything', () => {
    const script = readFileSync(join(repoRoot, 'scripts', 'make-dev-db.ts'), 'utf8');
    expect(script.indexOf('inspectExistingDatabase(dbPath)')).toBeGreaterThan(0);
    expect(script.indexOf('inspectExistingDatabase(dbPath)')).toBeLessThan(script.indexOf('rmSync(dbPath'));
    expect(script).toMatch(/existing === 'real'/);
  });

  it('the dev logins are in the script and nowhere in CLAUDE.md', () => {
    expect(readFileSync(join(repoRoot, 'scripts', 'make-dev-db.ts'), 'utf8')).toContain('owner-pass-1');
    expect(readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8')).not.toMatch(/owner-pass-1|staff-pass-1/);
  });
});
