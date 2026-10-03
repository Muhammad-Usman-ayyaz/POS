import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import { parseMigrationFiles } from '@pos/db-sqlite';
import { registerIpc, type IpcEventLike } from './ipc.js';
import { resolveNativeBinding } from './native.js';
import { createRuntime, type Runtime } from './runtime.js';
import { isAllowedNavigation, isTrustedSender, windowOptions, type TrustedPages } from './security.js';

// The SQL files are bundled into the app (Vite reads them as text at build time), so there is no folder of
// migrations to ship or lose. The same files the tests and `npm run dev:db` use.
const migrationFiles = import.meta.glob('../../../../packages/db-sqlite/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

app.setName('Pesticide Club POS');

// __POS_DEV_TOOLS__ is true only for the dev server and for the screenshot build (see electron.vite.config.ts). In a
// normal build it is the constant false, so everything inside these `if`s, including the screenshot tool, the
// environment variables that redirect the database and the settings folder, is removed from the bundle.
if (__POS_DEV_TOOLS__ && !app.isPackaged) {
  // The screenshot tool renders in software so captures are steady and do not depend on the graphics card.
  if (process.env['POS_SCREENSHOT_DIR']) app.disableHardwareAcceleration();
  // A separate data folder, used by the screenshot tool so it never touches your real settings.
  if (process.env['POS_USER_DATA']) app.setPath('userData', resolve(process.env['POS_USER_DATA']));
}

// Two copies of the app must not open the same database file.
if (!app.requestSingleInstanceLock()) app.quit();

let runtime: Runtime | null = null;
let mainWindow: BrowserWindow | null = null;

const pages: TrustedPages = {
  indexFilePath: join(__dirname, '../renderer/index.html'),
  ...(process.env['ELECTRON_RENDERER_URL'] ? { devServerUrl: process.env['ELECTRON_RENDERER_URL'] } : {}),
};

function databasePath(): string {
  // Development only: point the app at another database. An installed app always uses its own data folder.
  if (__POS_DEV_TOOLS__ && !app.isPackaged && process.env['POS_DB_PATH']) return resolve(process.env['POS_DB_PATH']);
  // Installed: in the user's app data folder. Development: dev.db in the repository root (git-ignored).
  return app.isPackaged ? join(app.getPath('userData'), 'pos.db') : resolve(app.getAppPath(), '../../dev.db');
}

function createWindow(size?: { width: number; height: number }): BrowserWindow {
  const base = windowOptions(join(__dirname, '../preload/index.js'));
  // `size` is for the screenshot tool: an exact page size, whatever the frame around it takes.
  const window = new BrowserWindow(size ? { ...base, width: size.width, height: size.height, useContentSize: true, minWidth: undefined, minHeight: undefined } : base);
  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // The page can open nothing new and go nowhere else.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, pages)) event.preventDefault();
  });

  if (pages.devServerUrl) void window.loadURL(pages.devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

function hardenSession(): void {
  // No camera, microphone, location, notifications or anything else the page could ask for.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  if (app.isPackaged) Menu.setApplicationMenu(null);
}

async function start(): Promise<void> {
  hardenSession();
  runtime = await createRuntime({
    dbPath: databasePath(),
    nativeBinding: resolveNativeBinding({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      platform: process.platform,
      arch: process.arch,
      abi: process.versions.modules,
    }),
    migrations: parseMigrationFiles(migrationFiles),
    prefsPath: join(app.getPath('userData'), 'preferences.json'),
  });
  const trusted = (event: IpcEventLike): boolean =>
    isTrustedSender(
      { webContentsId: event.sender.id, isMainFrame: event.senderFrame !== null && event.senderFrame.parent === null, frameUrl: event.senderFrame?.url ?? '' },
      mainWindow?.webContents.id ?? null,
      pages,
    );
  registerIpc(ipcMain, runtime.handlers, trusted);

  if (__POS_DEV_TOOLS__ && !app.isPackaged) {
    const shotDir = process.env['POS_SCREENSHOT_DIR'];
    if (shotDir) {
      const [width = 1366, height = 768] = (process.env['POS_SCREENSHOT_SIZE'] ?? '1366x768').split('x').map(Number);
      const window = createWindow({ width, height });
      window.show();
      const { runScreenshots } = await import('./screenshots.js');
      try {
        await runScreenshots(window, shotDir, `${width}x${height}`);
      } catch (error) {
        console.error('SCREENSHOTS failed:', error);
        process.exitCode = 1;
      }
      app.quit();
      return;
    }
    if (process.env['POS_SMOKE']) {
      // `POS_SMOKE=1 npm run dev`: open the window, ask the main process for the app state through the preload
      // bridge (so the database, the migrations, the native SQLite file and the IPC all have to work), print it, quit.
      const window = createWindow();
      window.webContents.once('did-finish-load', () => {
        void window.webContents
          .executeJavaScript('window.posBridge.app.getState().then((r) => JSON.stringify(r))')
          .then((state: string) => console.log(`POS_SMOKE_OK ${state}`))
          .catch((error: unknown) => {
            console.error('POS_SMOKE_FAILED', error);
            process.exitCode = 1;
          })
          .finally(() => app.quit());
      });
      return;
    }
  }
  createWindow();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  runtime?.close();
  runtime = null;
  app.quit();
});
void app.whenReady().then(async () => {
  try {
    await start();
  } catch (error) {
    if (__POS_DEV_TOOLS__ && (process.env['POS_SCREENSHOT_DIR'] || process.env['POS_SMOKE'])) {
      // The screenshot and smoke tools must never sit behind a dialog: say what went wrong and stop.
      console.error('Start-up failed:', error);
      app.exit(1);
      return;
    }
    dialog.showErrorBox('Pesticide Club POS could not start', error instanceof Error ? error.message : String(error));
    app.quit();
  }
});
