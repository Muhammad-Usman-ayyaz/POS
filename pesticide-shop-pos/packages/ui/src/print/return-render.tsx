import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentLanguage, ReturnDocumentData } from '@pos/core';
import { shopName } from './format.js';
import { RETURN_LABELS } from './return-labels.js';
import { ReturnSlipA4, ReturnSlipReceipt } from './return-slip-document.js';
import { documentCss, type DocumentFonts } from './render.js';

/** Extra styles for the return slip, on top of `documentCss` (which has the 80 mm receipt and the A4 invoice it follows). */
export const returnCss = `
.return-slip .sub.note{font-size:12px;color:#444;margin-top:6px;overflow-wrap:anywhere}
.return-slip.invoice .sub.note{color:#5B675F}
.return-slip .row.small{color:#444}
.return-slip.invoice .row.small{color:#5B675F}
.return-slip .items .item{break-inside:avoid}
.return-slip .row.strong{margin-top:2px}
.return-slip.invoice table.lines td{padding:10px 8px;font-size:13px}
.return-slip.invoice table.lines th{padding:10px 8px}
`;

export const renderReturnSlipMarkup = (data: ReturnDocumentData, language: DocumentLanguage): string =>
  renderToStaticMarkup(data.kind === 'receipt' ? <ReturnSlipReceipt data={data} language={language} /> : <ReturnSlipA4 data={data} language={language} />);

/** The slip as one page of HTML: the document, its stylesheet and its fonts, nothing loaded from anywhere (the page's CSP forbids every request). */
export function renderReturnSlipHtml(data: ReturnDocumentData, language: DocumentLanguage, fonts: DocumentFonts): string {
  const t = RETURN_LABELS[language];
  const title = `${data.kind === 'receipt' ? t.returnSlip : t.creditNote} ${data.return.return_no} - ${shopName(data, language)}`.replace(/[<>&"]/g, '');
  return (
    '<!doctype html>' +
    `<html lang="${language}" dir="${language === 'ur' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:" />` +
    `<title>${title}</title><style>${documentCss(fonts, data.kind)}${returnCss}</style></head><body>${renderReturnSlipMarkup(data, language)}</body></html>`
  );
}
