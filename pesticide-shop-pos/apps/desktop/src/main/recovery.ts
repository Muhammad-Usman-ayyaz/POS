// The owner's one-time recovery code: lets the owner reset a forgotten password.
// Shown once at setup, stored only as a hash, replaced every time it is used.
//
// 20 characters from a 32-letter alphabet is 100 bits: far too many to guess, so no lock-out is needed to protect it.
// The alphabet leaves out I, L, O and U so a code that is written down by hand is hard to misread.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20;
const GROUP = 4;

/** `bytes` must be cryptographically random (the caller passes crypto.randomBytes). 32 divides 256, so every letter is equally likely. */
export function generateRecoveryCode(bytes: (count: number) => Uint8Array): string {
  const random = bytes(LENGTH);
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    if (i > 0 && i % GROUP === 0) code += '-';
    code += ALPHABET[(random[i] ?? 0) & 31];
  }
  return code;
}

/**
 * What the owner typed, cleaned up for checking: upper case, no spaces or dashes, and the look-alike letters
 * a person might type are mapped to the ones in the alphabet (O is 0, I and L are 1).
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** True when the text could be a recovery code (right length, only letters from the alphabet). */
export function looksLikeRecoveryCode(input: string): boolean {
  const normalized = normalizeRecoveryCode(input);
  return normalized.length === LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}
