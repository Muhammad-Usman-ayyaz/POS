import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentLanguage, PaymentReceiptData, StatementDocumentData } from '@pos/core';
import { PaymentReceiptDocument } from './payment-receipt-document.js';
import { StatementDocument } from './statement-document.js';
import { shopName } from './format.js';
import { KHATA_LABELS } from './khata-labels.js';
import { documentCss, PAGE, type DocumentFonts } from './render.js';

/** Paper for each statement kind: 'receipt' is the 80 mm slip, 'invoice' is A4 (the same names the invoice documents use). A payment receipt is always 80 mm. */
export const STATEMENT_PAGE = PAGE;

/** Extra styles for the statement and the payment receipt, on top of `documentCss` (which has the 80 mm receipt and the A4 invoice). */
export const khataCss = `
.statement .legend{margin-top:8px;font-size:12px;color:#444;text-align:center}
.receipt.statement .info .sub.range{font-size:12px;color:#444}
.receipt.statement .items .item .row.sub{font-size:12px;color:#444}
.receipt.statement .items .item{break-inside:avoid}
.receipt .row.closing{font-size:20px}
.payment-receipt .items .item .row{gap:12px}
.payment-receipt .items .value{text-align:end;overflow-wrap:anywhere}
.payment-receipt .row.total{align-items:baseline}

/* ---- A4 statement: follows the A4 invoice (docs/design/InvoiceA4.dc.html tokens); the design has no A4 statement ---- */
.statement-a4{width:${PAGE.invoice.printableMm}mm;margin:0 auto;font-size:14px;line-height:1.5;color:#1B2A22}
.statement-a4 .a4-head{display:flex;justify-content:space-between;align-items:flex-start;padding-top:14mm}
.statement-a4 .shop{font-size:26px;font-weight:700}
.statement-a4 .a4-head .sub{color:#5B675F}
.statement-a4 .a4-title{display:flex;flex-direction:column;align-items:flex-end}
[dir="rtl"].statement-a4 .a4-title{align-items:flex-start}
.statement-a4 .title{font-size:24px;font-weight:700;letter-spacing:.06em}
[lang="ur"].statement-a4 .title{letter-spacing:0}
.statement-a4 .meta{color:#5B675F}
.statement-a4 .copy-mark{margin:2px 0}
.statement-a4 .customer-box{margin:20px 0 14px;border:1px solid #D9D6CC;border-radius:10px;padding:14px 16px}
.statement-a4 .customer-box .label{font-size:12px;color:#5B675F;font-weight:700;letter-spacing:.05em}
.statement-a4 .customer-box .value{font-size:16px;font-weight:600}
.statement-a4 .customer-box .phone{color:#5B675F}
.statement-a4 table.paged{width:100%;border-collapse:collapse}
.statement-a4 thead{display:table-header-group}
.statement-a4 tfoot{display:table-footer-group}
.statement-a4 tr.pad td{height:14mm;padding:0;border:0}
.statement-a4 tr.heads th{background:#EFEDE4;border-bottom:1px solid #CFCBBE;font-size:12px;font-weight:700;letter-spacing:.04em;padding:10px 12px;text-align:start}
[lang="ur"].statement-a4 tr.heads th{letter-spacing:0}
.statement-a4 tbody tr{break-inside:avoid;page-break-inside:avoid}
.statement-a4 tbody td{padding:10px 12px;border-bottom:1px solid #ECE9DF;text-align:start;vertical-align:top}
.statement-a4 th.c-num,.statement-a4 td.c-num{text-align:end}
.statement-a4 .note{font-size:12px;color:#5B675F;overflow-wrap:anywhere}
.statement-a4 .totals-grid{display:grid;grid-template-columns:3fr 1fr 1fr 1.3fr;gap:0 12px;border-top:2px solid #1B2A22;padding:10px 12px;margin-bottom:12px;font-weight:700}
.statement-a4 .totals-grid .c-num{text-align:end}
.statement-a4 tr.closing-row td{border-bottom:0;padding-top:18px}
.statement-a4 .closing-box{display:flex;justify-content:space-between;align-items:baseline;font-size:22px;font-weight:700;color:#1F5D3A;border:1px solid #D9D6CC;border-radius:10px;padding:12px 16px;margin-bottom:8px}
.statement-a4 .row.small{color:#5B675F}
.statement-a4 .legend{text-align:start;margin-top:10px;color:#5B675F;font-size:12px}
.statement-a4 .thanks{margin-top:16px;font-size:13px;color:#5B675F}
`;

/** The statement as one page of HTML: the document, its stylesheet and its fonts, nothing loaded from anywhere (the page's CSP forbids every request). */
export function renderStatementHtml(data: StatementDocumentData, language: DocumentLanguage, fonts: DocumentFonts): string {
  const t = KHATA_LABELS[language];
  const title = `${t.statement} - ${shopName(data, language)}`.replace(/[<>&"]/g, '');
  return (
    '<!doctype html>' +
    `<html lang="${language}" dir="${language === 'ur' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:" />` +
    `<title>${title}</title><style>${documentCss(fonts, data.kind)}${khataCss}</style></head><body>${renderToStaticMarkup(<StatementDocument data={data} language={language} />)}</body></html>`
  );
}

export function renderPaymentReceiptHtml(data: PaymentReceiptData, language: DocumentLanguage, fonts: DocumentFonts): string {
  const t = KHATA_LABELS[language];
  const title = `${t.paymentReceipt} ${data.payment.receipt_no ?? ''} - ${shopName(data, language)}`.replace(/[<>&"]/g, '');
  return (
    '<!doctype html>' +
    `<html lang="${language}" dir="${language === 'ur' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:" />` +
    `<title>${title}</title><style>${documentCss(fonts, 'receipt')}${khataCss}</style></head><body>${renderToStaticMarkup(<PaymentReceiptDocument data={data} language={language} />)}</body></html>`
  );
}

export const renderStatementMarkup = (data: StatementDocumentData, language: DocumentLanguage): string => renderToStaticMarkup(<StatementDocument data={data} language={language} />);
export const renderPaymentReceiptMarkup = (data: PaymentReceiptData, language: DocumentLanguage): string => renderToStaticMarkup(<PaymentReceiptDocument data={data} language={language} />);
