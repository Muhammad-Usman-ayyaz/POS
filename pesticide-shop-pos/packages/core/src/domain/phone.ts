/**
 * A phone number reduced to its digits, for searching and for spotting the same number typed two ways.
 * Spaces, dashes, brackets and a plus are dropped; a leading country code 92 and a leading 0 are dropped, so
 * "+92 300-1234567", "0300 1234567" and "3001234567" are the same. Pass text already run through `normalizeSearchText`
 * so Urdu and Arabic digits are 0-9. Returns '' when there are no digits left.
 */
export function phoneDigits(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length >= 11) digits = digits.slice(2);
  return digits.replace(/^0+/, '');
}

/** True when the text looks like a phone number being typed: only digits, spaces, dashes, brackets, dots and a plus. */
export function looksLikePhone(text: string): boolean {
  return /^[\d\s\-+().]+$/.test(text) && /\d/.test(text);
}
