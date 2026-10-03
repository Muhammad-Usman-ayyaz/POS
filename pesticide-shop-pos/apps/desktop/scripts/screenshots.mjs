// Builds nothing: run `npm run build -w @pos/desktop` first (the npm script does). Starts the built app once per
// window size, in a throw-away data folder, and saves screenshots to apps/desktop/.screenshots/<size>/.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const electron = require('electron');
const outDir = join(desktop, '.screenshots');
const sizes = (process.argv[2] ?? '1366x768,1920x1080,1280x720').split(',');

// The screenshot tool is development tooling: it is compiled in only by this special build, and the build is replaced
// by a normal one at the end, so no tooling is ever left in out/.
const build = (extraEnv) => spawnSync('npx', ['electron-vite', 'build'], { cwd: desktop, env: { ...process.env, ...extraEnv }, stdio: 'inherit', shell: true });
if (build({ POS_BUILD_DEV_TOOLS: '1' }).status !== 0) process.exit(1);

// Old pictures are replaced one by one. (Windows can refuse to delete a folder that an editor or a shell has open.)
try {
  rmSync(outDir, { recursive: true, force: true, maxRetries: 3 });
} catch {
  console.warn('screenshots: could not clear the old folder, overwriting the files in it instead');
}
mkdirSync(outDir, { recursive: true });

let failed = false;
for (const size of sizes) {
  const work = join(outDir, `.work-${size}`);
  // Every size must start from an EMPTY database, or the app opens on Sign in instead of first-launch setup.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    console.error(`screenshots: could not clear ${work}; delete it by hand and run again`);
    process.exit(1);
  }
  mkdirSync(work, { recursive: true });
  const env = { ...process.env, POS_SCREENSHOT_DIR: outDir, POS_SCREENSHOT_SIZE: size, POS_DB_PATH: join(work, 'shots.db'), POS_USER_DATA: join(work, 'data') };
  delete env.ELECTRON_RUN_AS_NODE;
  // One retry: the previous Electron process can still be shutting down when the next size starts.
  let result = spawnSync(electron, [desktop], { env, stdio: 'inherit', timeout: 180000 });
  if (result.status !== 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
    result = spawnSync(electron, [desktop], { env, stdio: 'inherit', timeout: 180000 });
  }
  if (result.status !== 0) failed = true;
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* a leftover temp folder is harmless */
  }
}
if (build({ POS_BUILD_DEV_TOOLS: '' }).status !== 0) failed = true; // leave a clean production build behind
process.exit(failed ? 1 : 0);
