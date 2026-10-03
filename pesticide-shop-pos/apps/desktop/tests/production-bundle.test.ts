// Builds the app the way `npm run build` does and checks what ended up in apps/desktop/out.
// The production bundle must hold no demo data, no dev logins, no development tooling, and the preload must be
// self-contained. This runs a real build (about 10 seconds), so it replaces whatever is in apps/desktop/out:
// do not run it while `npm run dev` is using that folder.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const desktop = join(__dirname, '..');
const out = join(desktop, 'out');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let files: { path: string; text: string }[] = [];

beforeAll(() => {
  // The normal production build: no POS_BUILD_DEV_TOOLS, so __POS_DEV_TOOLS__ is false.
  const env = { ...process.env };
  delete env['POS_BUILD_DEV_TOOLS'];
  execFileSync('npx', ['electron-vite', 'build'], { cwd: desktop, env, stdio: 'pipe', shell: true });
  files = walk(out)
    .filter((p) => /\.(js|mjs|cjs|css|html|json|map)$/.test(p))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}, 180_000);

const where = (needle: string | RegExp) => files.filter((f) => (typeof needle === 'string' ? f.text.includes(needle) : needle.test(f.text))).map((f) => f.path.slice(out.length + 1));

describe('the production build', () => {
  it('produced the main process, the preload and the renderer', () => {
    expect(existsSync(join(out, 'main', 'index.js'))).toBe(true);
    expect(existsSync(join(out, 'preload', 'index.js'))).toBe(true);
    expect(existsSync(join(out, 'renderer', 'index.html'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('contains no demo data: no demo products, customers or supplier, and no demo marker', () => {
    const demo = ['Insecticide 1L', 'Insecticide 500ml', 'Fungicide 250ml', 'Weedicide 1L', 'DAP fertilizer', 'Vegetable seed', 'Rodenticide', 'Agri Dealer', 'Rashid', 'Imran', 'Bashir', 'Tariq', 'Sajid', 'demo_data', 'DEMO_MARKER_KEY'];
    for (const needle of demo) expect(where(needle), needle).toEqual([]);
  });

  it('contains no dev logins: no owner-pass-1 or staff-pass-1', () => {
    expect(where('owner-pass-1')).toEqual([]);
    expect(where('staff-pass-1')).toEqual([]);
    expect(where(/owner-pass|staff-pass/)).toEqual([]);
  });

  it('cannot reach seedDemoData, the dev-database helpers, or the demo module at all', () => {
    for (const needle of ['seedDemoData', 'inspectExistingDatabase', 'createUser', 'make-dev-db', 'dev-db-guard']) expect(where(needle), needle).toEqual([]);
  });

  it('contains no development tooling: no screenshot tool, no smoke test, no database or settings-folder overrides', () => {
    for (const needle of ['runScreenshots', 'POS_SCREENSHOT_DIR', 'POS_SCREENSHOT_SIZE', 'Page.captureScreenshot', 'POS_SMOKE', 'POS_DB_PATH', 'POS_USER_DATA', '__POS_DEV_TOOLS__']) {
      expect(where(needle), needle).toEqual([]);
    }
    expect(files.some((f) => /screenshots/i.test(f.path))).toBe(false);
  });

  it('keeps better-sqlite3 and argon2 as imports of installed packages, not bundled into the app (so they can load their native files)', () => {
    const main = readFileSync(join(out, 'main', 'index.js'), 'utf8');
    expect(main).toContain('require("better-sqlite3")');
    expect(main).toContain('require("@node-rs/argon2")');
    expect(main).not.toContain('Could not dynamically require');
    const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toContain('better-sqlite3'); // see the "//" note in package.json before removing it
  });

  it('ships the strict Content-Security-Policy in index.html, with no relaxed rule', () => {
    const html = readFileSync(join(out, 'renderer', 'index.html'), 'utf8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src &apos;none&apos;".replace(/&apos;/g, "'"));
    expect(html).not.toMatch(/unsafe-inline|unsafe-eval|ws:\/\/|localhost/);
  });
});

describe('the built preload script', () => {
  it('imports nothing but electron (a sandboxed preload cannot load anything else)', () => {
    const code = readFileSync(join(out, 'preload', 'index.js'), 'utf8');
    const imports = [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    expect([...new Set(imports)]).toEqual(['electron']);
  });

  it('exposes only posBridge, and no raw ipcRenderer', () => {
    const code = readFileSync(join(out, 'preload', 'index.js'), 'utf8');
    expect([...code.matchAll(/exposeInMainWorld\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(['posBridge']);
    expect(code).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/);
    expect(code).not.toMatch(/ipcRenderer\.(send|on|once|sendSync|postMessage)\b/);
  });
});
