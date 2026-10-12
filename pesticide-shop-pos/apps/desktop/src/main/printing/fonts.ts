import type { DocumentFonts } from '@pos/ui/print';
// Vite reads these files at build time and puts them INTO the code as data: addresses (`?inline`), so a printed document never needs a font file
// from the PC, from node_modules at run time, or from the internet. IBM Plex Sans: English and every number. Noto Naskh Arabic: Urdu.
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?inline';
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?inline';
import plex700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?inline';
import naskh from '@fontsource-variable/noto-naskh-arabic/files/noto-naskh-arabic-arabic-wght-normal.woff2?inline';

export const documentFonts: DocumentFonts = { plex400, plex600, plex700, naskh };
