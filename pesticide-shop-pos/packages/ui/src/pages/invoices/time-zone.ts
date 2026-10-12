// The ONE place that says which time zone invoice dates are shown in on the invoice screens (the history list and the invoice detail).
// Every screen that formats an invoice date must import this and nothing else; no other file in pages/invoices may write a zone name.
// (The printed documents get their zone from the shell with each document: `InvoiceDocumentData.time_zone`, from the same setting.)

/**
 * TODO(setting shop.time_zone): this will come from the setting `shop.time_zone` (the shell already reads it for printed documents, default
 * Asia/Karachi) once the history rows or the session carry it. Until then the screens use the same default. See docs/decisions.md, "Invoice dates on screen".
 */
export const SHOP_TIME_ZONE = 'Asia/Karachi';
