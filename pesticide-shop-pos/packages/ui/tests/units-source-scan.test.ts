// Repo-wide scan: no visible small-unit text (g, ml, gm, grams, and the Urdu words for them) anywhere in the shipped source.
// Scope: packages/ui/src (messages en + ur, components, pages, print), packages/core/src, apps/desktop/src.
// Only STRING LITERALS and JSX text are read (comments are not shown to anyone). The allow-list is deliberately tiny.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSource } from './source-scan.js';
import { smallUnitsIn } from './unit-scan.js';

const ROOT = join(__dirname, '..', '..', '..');
const SCOPES = ['packages/ui/src', 'packages/core/src', 'apps/desktop/src'];

/**
 * The ONLY files allowed to hold the base-unit codes or the old words:
 *  - the conversion module (it IS the converter, and reads old text),
 *  - the schema enum of stored unit codes (the database values).
 * Nothing else. (Tests and SQL are outside the scanned folders.)
 */
export const ALLOW = new Set(['packages/core/src/units.ts', 'packages/core/src/schemas/common.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** String literals that are exactly a stored unit code (data, not text): only the module and the schema may have them. */
const BARE_CODE = /^(?:g|ml)$/;

function offences(path: string): string[] {
  const src = readFileSync(path, 'utf8');
  const { strings } = scanSource(src);
  const jsxText = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!).filter((t) => /[A-Za-z؀-ۿ]/.test(t));
  const out: string[] = [];
  for (const s of [...strings, ...jsxText]) {
    const hits = smallUnitsIn(s);
    if (hits.length > 0) out.push(`${JSON.stringify(s.slice(0, 60))}: ${hits.join(', ')}`);
    else if (BARE_CODE.test(s.trim())) out.push(`${JSON.stringify(s)}: a bare unit code`);
  }
  return out;
}

describe('no small unit is visible anywhere in the source', () => {
  for (const scope of SCOPES) {
    it(`${scope}`, () => {
      const found: Record<string, string[]> = {};
      for (const file of files(join(ROOT, scope))) {
        const rel = relative(ROOT, file).split(sep).join('/');
        if (ALLOW.has(rel)) continue;
        const bad = offences(file);
        if (bad.length > 0) found[rel] = bad;
      }
      expect(found).toEqual({});
    });
  }

  it('the allow-list is exactly the conversion module and the stored-code schema', () => {
    expect([...ALLOW].sort()).toEqual(['packages/core/src/schemas/common.ts', 'packages/core/src/units.ts']);
  });

  it('the scan really reads every message file (a unit planted in a message would be found)', () => {
    expect(smallUnitsIn('Fertilizer 250 g')).not.toEqual([]);
    expect(smallUnitsIn('Insecticide 500 ml')).not.toEqual([]);
    expect(smallUnitsIn('250 گرام')).not.toEqual([]);
    expect(smallUnitsIn('Fertilizer 0.25 kg and 1 L')).toEqual([]);
    expect(smallUnitsIn('⁦0.25⁩ کلو')).toEqual([]);
    expect(files(join(ROOT, 'packages/ui/src/i18n/messages')).length).toBe(2);
  });
});
