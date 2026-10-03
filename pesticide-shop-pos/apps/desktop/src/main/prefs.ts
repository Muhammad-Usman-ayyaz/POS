import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LanguageSchema, type Language } from '@pos/api-contract';
import { z } from 'zod';

const PrefsFile = z.object({ language: LanguageSchema.default('en') });

/**
 * Small per-computer settings kept in a JSON file in the app data folder (not in the database, because the
 * Sign in screen needs the language before anyone has signed in). The renderer reads and changes it only through the API.
 */
export class PrefsStore {
  private language: Language = 'en';

  constructor(private readonly path: string | null) {
    if (!path) return;
    try {
      this.language = PrefsFile.parse(JSON.parse(readFileSync(path, 'utf8'))).language;
    } catch {
      // No file yet, or it is unreadable: start with the default. It is rewritten on the next change.
    }
  }

  get(): Language {
    return this.language;
  }

  setLanguage(language: Language): void {
    this.language = language;
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify({ language }, null, 2));
    renameSync(temp, this.path); // replace in one step, so a power cut cannot leave half a file
  }
}
