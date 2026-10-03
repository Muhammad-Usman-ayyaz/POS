// Runs before `npm run dev` and `npm run build`: makes sure the Electron SQLite binary is there and verified.
// If it is missing it is downloaded (see fetch-native.mjs). If it is already valid nothing is downloaded.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTarget } from './native-lib.mjs';

if (checkTarget() === 'ok') process.exit(0);
const result = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'fetch-native.mjs')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
