import type { Language } from '@pos/api-contract';
import type { BaseUnitCode } from '@pos/core';
import type { Messages } from '../../i18n/messages/en.js';
import { qtyText, stockText } from '../../i18n/units.js';

/**
 * A returned or sold quantity said in the line's own unit, the way the receipt says it: whole packs as "2 packs", anything loose as "0.5 kg" or "1.25 L"
 * (a quantity that is not a whole number of packs is loose). Never g or ml. The numbers come from the units module.
 */
export function quantityShown(m: Pick<Messages, 'units'>, language: Language, base: BaseUnitCode, packSize: number, qty: number): string {
  const loose = packSize > 1 && qty % packSize !== 0;
  return loose ? qtyText(m, language, base, qty) : stockText(m, language, base, packSize, qty);
}
