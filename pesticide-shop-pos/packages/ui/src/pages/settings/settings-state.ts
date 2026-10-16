import type { Language, PrintConfig } from '@pos/api-contract';

export const FOOTER_MAX = 200;
export const SHOP_NAME_MAX = 80;

/** What the form holds: the print settings as text, so an empty box is "". */
export interface SettingsDraft {
  shopName: string;
  printFormat: PrintConfig['print_format'];
  receiptFooter: string;
  /** "" is the system default printer. */
  printer: string;
  receiptLanguage: Language;
  invoiceLanguage: Language;
  shopNameUr: string;
  address: string;
  phone: string;
}

export const draftFrom = (c: PrintConfig): SettingsDraft => ({
  shopName: c.shop_name,
  printFormat: c.print_format,
  receiptFooter: c.receipt_footer,
  printer: c.printer_name ?? '',
  receiptLanguage: c.receipt_language,
  invoiceLanguage: c.invoice_language,
  shopNameUr: c.shop_name_ur ?? '',
  address: c.shop_address ?? '',
  phone: c.shop_phone ?? '',
});

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/**
 * The `print:setConfig` request: ONLY what was changed from what is saved. A box emptied is sent as null (cleared), so the shell takes the
 * placeholder or the system default again. Nothing changed gives {}.
 */
export function buildSettingsRequest(saved: SettingsDraft, now: SettingsDraft): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (now.shopName.trim() !== saved.shopName.trim() && now.shopName.trim() !== '') out['shop_name'] = now.shopName.trim();
  if (now.printFormat !== saved.printFormat) out['print_format'] = now.printFormat;
  // an emptied footer is sent as '' (the standard thank-you line comes back)
  if (now.receiptFooter.trim() !== saved.receiptFooter.trim()) out['receipt_footer'] = now.receiptFooter.trim();
  if (now.printer !== saved.printer) out['printer_name'] = orNull(now.printer);
  if (now.receiptLanguage !== saved.receiptLanguage) out['receipt_language'] = now.receiptLanguage;
  if (now.invoiceLanguage !== saved.invoiceLanguage) out['invoice_language'] = now.invoiceLanguage;
  if (now.shopNameUr.trim() !== saved.shopNameUr.trim()) out['shop_name_ur'] = orNull(now.shopNameUr);
  if (now.address.trim() !== saved.address.trim()) out['shop_address'] = orNull(now.address);
  if (now.phone.trim() !== saved.phone.trim()) out['shop_phone'] = orNull(now.phone);
  return out;
}

/** The shop name may not be empty: the form keeps Save off (and the shell refuses it too). */
export const shopNameMissing = (d: SettingsDraft): boolean => d.shopName.trim() === '';
