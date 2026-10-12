import type { PrinterInfo } from '@pos/core';

/** The paper a document is made for. `heightMm: null` is a receipt: as long as its content. */
export interface PrintPage {
  widthMm: number;
  heightMm: number | null;
}

/**
 * What the runtime needs from the outside world to put a document on paper. The real one (`electron-driver.ts`) uses a hidden window and
 * Electron's `webContents.print` and `printToPDF`; tests pass a fake, so no printer or window is needed to prove the rules.
 * The document is a complete HTML page with its fonts inside it: a driver must not load anything from anywhere.
 */
export interface PrintDriver {
  /** The printers the PC knows. An empty list means none is available. */
  listPrinters(): Promise<PrinterInfo[]>;
  /** Sends the page to the printer without a dialog. Throws when the printer cannot print it. `printerName` null: the system default printer. */
  print(html: string, options: { page: PrintPage; printerName: string | null }): Promise<void>;
  /** The page as a PDF. */
  toPdf(html: string, options: { page: PrintPage }): Promise<Uint8Array>;
  /** Saves a PDF where the user can find it and opens it. Returns the path. */
  savePdf(fileName: string, pdf: Uint8Array): Promise<string>;
}

/** No printer, no window: what a runtime without a shell (or a test that does not care) gets. Every document then ends as an error-free "no printer" fallback. */
export const noPrinting: PrintDriver = {
  listPrinters: async () => [],
  print: async () => {
    throw new Error('no printer');
  },
  toPdf: async () => {
    throw new Error('no way to make a PDF here');
  },
  savePdf: async () => {
    throw new Error('no way to save a PDF here');
  },
};
