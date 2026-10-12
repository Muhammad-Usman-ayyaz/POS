// `npm run check:pdf`: makes the Urdu 80 mm receipt and A4 invoice with Electron's real printToPDF, reads the PDFs back with pdf.js, checks the text layer
// and the embedded font, and saves a PNG of each page. Output: apps/desktop/.pdf-check/ (PDFs, reports, PNGs). Exit code 1 if any check fails.
// It builds the app once with the development tools in (like the screenshot tool) and puts a normal build back at the end.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const electron = require('electron');
const pdfjsBuild = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build');
const outDir = join(desktop, '.pdf-check');

const build = (extraEnv) => spawnSync('npx', ['electron-vite', 'build'], { cwd: desktop, env: { ...process.env, ...extraEnv }, stdio: 'inherit', shell: true });
if (build({ POS_BUILD_DEV_TOOLS: '1' }).status !== 0) process.exit(1);
rmSync(outDir, { recursive: true, force: true, maxRetries: 3 });
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, POS_PDF_CHECK_DIR: outDir, POS_PDFJS_DIR: pdfjsBuild, POS_USER_DATA: join(outDir, '.data') };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, [desktop], { env, stdio: 'inherit', timeout: 300000 });
let failed = result.status !== 0;
if (build({ POS_BUILD_DEV_TOOLS: '' }).status !== 0) failed = true;
process.exit(failed ? 1 : 0);
