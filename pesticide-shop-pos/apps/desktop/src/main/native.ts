import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the Electron build of better_sqlite3.node is. It is downloaded and verified by
 * `npm run native -w @pos/desktop` (see docs/native-sqlite.md): the copy in node_modules is built for Node, not Electron.
 *
 * Development: apps/desktop/native/<platform>-<arch>-electron<abi>/better_sqlite3.node
 * Installed app: <resources>/native/... (the installer must ship that file; see Phase 9 in docs/build-plan.md)
 */
export function resolveNativeBinding(env: { isPackaged: boolean; appPath: string; resourcesPath: string; platform: string; arch: string; abi: string }): string {
  const folder = `${env.platform}-${env.arch}-electron${env.abi}`;
  const root = env.isPackaged ? join(env.resourcesPath, 'native') : join(env.appPath, 'native');
  const file = join(root, folder, 'better_sqlite3.node');
  if (!existsSync(file)) {
    throw new Error(
      `The SQLite engine for Electron is missing:\n  ${file}\n\n` +
        (env.isPackaged ? 'Reinstall the app.' : 'Run:  npm run native -w @pos/desktop   (it downloads and verifies the file once; it needs internet only for that).'),
    );
  }
  return file;
}
