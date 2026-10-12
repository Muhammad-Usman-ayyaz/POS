import type { ReactNode } from 'react';
import type { DocumentLanguage } from '@pos/core';

/** A run of Latin letters and digits, with the spaces and signs a size label has inside it ("1 L", "250ml", "DAP 50kg", "Chak 12"). */
const LATIN_RUN = /([A-Za-z0-9](?:[A-Za-z0-9 .,/+%-]*[A-Za-z0-9])?)/g;

/**
 * Text typed by the owner (a product name, a size label, a village) can mix Urdu words with Latin ones: "کیڑے مار دوا ایکس 1 L". Left alone in a
 * right-to-left line, the bidirectional algorithm turns "1 L" into "L 1" (a digit after Arabic letters counts as an Arabic number). Each Latin run is
 * therefore its own left-to-right island. In an English document nothing needs doing.
 */
export function Mixed({ text, language }: { text: string; language: DocumentLanguage }): ReactNode {
  if (language !== 'ur') return text;
  const parts = text.split(LATIN_RUN);
  // split() with one capture group puts the matches at the odd positions
  return parts.map((part, i) => (i % 2 === 1 ? <span key={i} className="ltr">{part}</span> : part));
}
