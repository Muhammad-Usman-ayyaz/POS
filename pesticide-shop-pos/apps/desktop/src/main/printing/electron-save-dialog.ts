import { join } from 'node:path';
import { app, dialog } from 'electron';
import type { SaveDialog } from './save-dialog.js';

/** The system "Save as" box, opened by the main process, starting in the person's Documents folder. */
export function createElectronSaveDialog(): SaveDialog {
  return {
    async chooseSavePath({ defaultName, filterName, extension }) {
      const result = await dialog.showSaveDialog({ defaultPath: join(app.getPath('documents'), defaultName), filters: [{ name: filterName, extensions: [extension] }] });
      return result.canceled || !result.filePath ? null : result.filePath;
    },
  };
}
