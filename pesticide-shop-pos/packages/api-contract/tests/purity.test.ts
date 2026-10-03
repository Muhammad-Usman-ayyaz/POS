// api-contract is shared by the UI and the desktop shell, so it must stay pure: no React, no Electron, no Node,
// no database, and no package that sits above it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const MODULES = `(react|react-dom|react/[^'"]*|electron|better-sqlite3|sqlite3|fs|path|os|child_process|crypto|node:[^'"]*|@pos/(ui|db-sqlite|desktop)[^'"]*)`;
// `from 'x'`, a bare `import 'x'` (side effect), a dynamic `import('x')`, and `require('x')`
const FORBIDDEN = new RegExp(`(from\\s+|import\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*)['"]${MODULES}['"]`);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

describe('packages/api-contract imports', () => {
  it('imports no React, Electron, Node, database, ui or desktop code', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('has no .tsx file (no UI)', () => {
    expect(sourceFiles(SRC).filter((f) => f.endsWith('.tsx'))).toEqual([]);
  });

  it('depends only on zod and @pos/core', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort()).toEqual(['@pos/core', 'zod']);
  });

  it('does not read the real time or call crypto', () => {
    const offenders = sourceFiles(SRC).filter((f) => /\bDate\.now\(|\bnew Date\(\s*\)|randomUUID|Math\.random/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
