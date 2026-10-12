import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, shell, type PrinterInfo } from 'electron';
import type { PrintDriver, PrintPage } from './driver.js';

// The real printing, in the main process. A document is a complete HTML page (fonts inside); it is loaded in a hidden window that cannot
// reach the network, and that window is printed or turned into a PDF. The screen (renderer) never prints: it only calls the channels.

const PX_PER_MM = 96 / 25.4;

/** Loads the page in a hidden, locked-down window and waits until its fonts are ready. The caller must destroy the window. */
async function loadHidden(html: string, widthMm: number): Promise<{ win: BrowserWindow; contentHeightPx: number }> {
  const win = new BrowserWindow({
    show: false,
    width: Math.ceil(widthMm * PX_PER_MM),
    height: 900,
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, devTools: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await win.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
    // The embedded fonts decode asynchronously: measure and print only once they are ready, or Urdu could print in a fallback font.
    // The height is the body's, NOT `scrollHeight` (which is never less than the hidden window's own height, so every receipt would come out as long as the window).
    const height = (await win.webContents.executeJavaScript('document.fonts.ready.then(() => Math.ceil(document.body.getBoundingClientRect().height))')) as number;
    return { win, contentHeightPx: height };
  } catch (error) {
    win.destroy();
    throw error;
  }
}

/** A receipt is as tall as its content (with a little slack); an A4 page is A4. */
function pageHeightMm(page: PrintPage, contentHeightPx: number): number {
  return page.heightMm ?? Math.max(40, Math.ceil(contentHeightPx / PX_PER_MM) + 2);
}

/** Which printer the system calls its default. Electron's typings do not say where; older versions had `isDefault`, newer ones put it in `options`. A wrong guess only costs the "default" mark in the list. */
function isDefaultPrinter(p: PrinterInfo): boolean {
  const legacy = (p as { isDefault?: boolean }).isDefault;
  if (typeof legacy === 'boolean') return legacy;
  const options = p.options as Record<string, unknown>;
  return [options['is-default'], options['printer-is-default']].some((v) => v === true || v === 'true');
}

export function createElectronPrintDriver(): PrintDriver {
  return {
    async listPrinters() {
      const probe = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      try {
        const printers = await probe.webContents.getPrintersAsync();
        return printers.map((p) => ({ name: p.name, display_name: p.displayName || p.name, is_default: isDefaultPrinter(p) }));
      } finally {
        probe.destroy();
      }
    },

    async print(html, { page, printerName }) {
      const { win, contentHeightPx } = await loadHidden(html, page.widthMm);
      try {
        const heightMm = pageHeightMm(page, contentHeightPx);
        await new Promise<void>((resolve, reject) => {
          win.webContents.print(
            {
              silent: true,
              printBackground: true,
              deviceName: printerName ?? '',
              margins: { marginType: 'none' },
              pageSize: { width: Math.round(page.widthMm * 1000), height: Math.round(heightMm * 1000) },
            },
            (success, reason) => (success ? resolve() : reject(new Error(reason || 'the printer did not accept the document'))),
          );
        });
      } finally {
        win.destroy();
      }
    },

    async toPdf(html, { page }) {
      const { win, contentHeightPx } = await loadHidden(html, page.widthMm);
      try {
        const heightMm = pageHeightMm(page, contentHeightPx);
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: { width: page.widthMm / 25.4, height: heightMm / 25.4 },
        });
        return new Uint8Array(pdf);
      } finally {
        win.destroy();
      }
    },

    async savePdf(fileName, pdf) {
      const folder = join(app.getPath('documents'), 'Pesticide Club POS', 'Receipts');
      await mkdir(folder, { recursive: true });
      const path = join(folder, fileName);
      await writeFile(path, pdf);
      // Opening it is a courtesy: if no viewer is installed the file is still saved and its path is returned.
      void shell.openPath(path);
      return path;
    },
  };
}
