/**
 * Where a file the person asked for (the statement CSV) is saved. The MAIN process asks through this, never the screen: the page cannot write files
 * or start downloads. The real one (`electron-save-dialog.ts`) opens the system "Save as" box; tests pass a fake that records what it was asked and
 * answers with a path or with `null` (the person closed the box).
 */
export interface SaveDialog {
  /** Asks where to save. `null`: cancelled, nothing may be written. */
  chooseSavePath(options: { defaultName: string; filterName: string; extension: string }): Promise<string | null>;
}

/** No window: what a runtime without a shell gets. Every export ends as "cancelled". */
export const noSaveDialog: SaveDialog = { chooseSavePath: async () => null };
