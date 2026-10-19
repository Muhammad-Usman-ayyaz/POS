// Receipts and invoices: pure rendering from data (no screen, no Electron). The shell turns the HTML into paper or a PDF.
export { InvoiceDocument } from './invoice-document.js';
export { ReceiptDocument } from './receipt-document.js';
export { documentCss, PAGE, renderDocumentHtml, renderDocumentMarkup, type DocumentFonts } from './render.js';
export { lineQuantity, quantityText } from './format.js';
export { LABELS } from './labels.js';
export { COST_WORDS, costFormats, findCostLeaks, withoutFontData } from './cost-scan.js';
// Phase 6 M6: customer statement (80 mm and A4), payment receipt, statement CSV
export { StatementDocument } from './statement-document.js';
export { PaymentReceiptDocument } from './payment-receipt-document.js';
export { khataCss, renderPaymentReceiptHtml, renderPaymentReceiptMarkup, renderStatementHtml, renderStatementMarkup } from './khata-render.js';
export { KHATA_LABELS } from './khata-labels.js';
export { balanceParts, calendarDayText, dayText, rangeText } from './khata-format.js';
export { CSV_BOM, csvCell, rupeesText, safeText, statementCsv, statementFileName, STATEMENT_CSV_HEADER } from './statement-csv.js';
