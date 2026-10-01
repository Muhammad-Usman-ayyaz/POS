// core must stay pure: no SQLite, Electron, React or file system. It talks to the outside only through ports.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const FORBIDDEN = /from\s+['"](better-sqlite3|sqlite3|electron|react|react-dom|fs|path|child_process|os|node:[^'"]*)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('packages/core imports', () => {
  it('uses no forbidden module in src', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('does not import another workspace package either', () => {
    const offenders = sourceFiles(SRC).filter((f) => /from\s+['"]@pos\//.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('reads the real time only in clock.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith('clock.ts'))
      .filter((f) => /\bDate\.now\(|\bnew Date\(\s*\)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
