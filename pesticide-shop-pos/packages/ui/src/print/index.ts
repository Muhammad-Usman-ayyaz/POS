// Receipts and invoices: pure rendering from data (no screen, no Electron). The shell turns the HTML into paper or a PDF.
export { InvoiceDocument } from './invoice-document.js';
export { ReceiptDocument } from './receipt-document.js';
export { documentCss, PAGE, renderDocumentHtml, renderDocumentMarkup, type DocumentFonts } from './render.js';
export { lineQuantity, quantityText } from './format.js';
export { LABELS } from './labels.js';
