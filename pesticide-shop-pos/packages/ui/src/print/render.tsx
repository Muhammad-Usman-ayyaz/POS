import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentKind, DocumentLanguage, InvoiceDocumentData } from '@pos/core';
import { InvoiceDocument } from './invoice-document.js';
import { ReceiptDocument } from './receipt-document.js';
import { shopName } from './format.js';
import { LABELS } from './labels.js';

/**
 * The fonts a document carries inside itself, as `data:font/woff2;base64,...` addresses. A printed page must not depend on the internet or on
 * which fonts happen to be installed on the PC: IBM Plex Sans is for English and every number, Noto Naskh Arabic for Urdu.
 * The desktop app reads the font files that ship with it (`@fontsource/ibm-plex-sans`, `@fontsource-variable/noto-naskh-arabic`) and passes them in.
 */
export interface DocumentFonts {
  plex400: string;
  plex600: string;
  plex700: string;
  /** Variable weight 400 to 700, the Arabic-script subset (all Urdu letters). */
  naskh: string;
}

/** Paper: the receipt is 80 mm wide (about 72 mm printable) and as long as it needs; the invoice is A4. */
export const PAGE = {
  receipt: { widthMm: 80, printableMm: 72, heightMm: null },
  invoice: { widthMm: 210, printableMm: 182, heightMm: 297 },
} as const;

export const documentCss = (fonts: DocumentFonts, kind: DocumentKind): string => `
@font-face{font-family:'Plex';font-weight:400;font-style:normal;src:url(${fonts.plex400}) format('woff2')}
@font-face{font-family:'Plex';font-weight:600;font-style:normal;src:url(${fonts.plex600}) format('woff2')}
@font-face{font-family:'Plex';font-weight:700;font-style:normal;src:url(${fonts.plex700}) format('woff2')}
@font-face{font-family:'Naskh';font-weight:400 700;font-style:normal;src:url(${fonts.naskh}) format('woff2')}
${kind === 'receipt' ? '@page{size:80mm auto;margin:0}' : '@page{size:A4;margin:0}'}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111}
body{font-family:'Plex','Naskh',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
[lang="ur"]{font-family:'Plex','Naskh',sans-serif}
.ltr{direction:ltr;unicode-bidi:isolate}
.num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;display:inline-block}
.doc .row{display:flex;justify-content:space-between;align-items:baseline}
.doc .row>span:first-child{min-width:0}
.doc .strong{font-weight:700}
.doc .semi{font-weight:600}
.doc .copy-mark{display:inline-block;border:1.5px solid #111;padding:1px 10px;font-weight:700;letter-spacing:.12em}
.doc .thanks{text-align:center}

/* ---- 80 mm receipt: sizes in px as in docs/design/Receipts80.dc.html (14px text, 1.5 line height, 72 mm printable) ---- */
.receipt{width:${PAGE.receipt.printableMm}mm;margin:0 auto;padding:18px 0 24px;font-size:14px;line-height:1.5;color:#111}
.receipt .row{gap:8px}
.receipt .copy-mark{display:block;width:max-content;margin:0 auto 8px;font-size:15px}
.receipt .head{text-align:center}
.receipt .shop{font-size:19px;font-weight:700}
.receipt .head .sub{font-size:12px;color:#444}
.receipt .title{margin-top:6px;font-weight:700;letter-spacing:.08em}
[lang="ur"].receipt .title{letter-spacing:0}
.receipt .info{margin:10px 0;border-top:1px dashed #111;padding-top:8px}
.receipt .row.date{justify-content:flex-end}
.receipt .items .item{padding:6px 0;border-bottom:1px dashed #9AA39D}
.receipt .line-sub{text-align:left;font-size:12px;color:#444}
.receipt .totals{margin-top:8px;border-top:2px solid #111;padding-top:8px}
.receipt .row.total{font-size:22px;font-weight:700}
.receipt .row.small{font-size:12px;color:#444}
.receipt .pay{margin-top:8px;border-top:1px dashed #111;padding-top:8px;display:flex;flex-direction:column;gap:2px}
.receipt .thanks{margin-top:14px;font-size:13px}

/* ---- A4 invoice: px as in docs/design/InvoiceA4.dc.html (794 x 1123 page, 56px margins, 14px text, 1.6 line height, 28px between blocks) ---- */
.invoice{width:${PAGE.invoice.printableMm}mm;height:1120px;margin:0 auto;padding:56px 0;font-size:14px;line-height:1.6;color:#1B2A22;display:flex;flex-direction:column;gap:28px}
.invoice .a4-head{display:flex;justify-content:space-between;align-items:flex-start}
.invoice .shop{font-size:26px;font-weight:700}
.invoice .a4-head .sub{color:#5B675F}
.invoice .a4-title{display:flex;flex-direction:column;align-items:flex-end}
[dir="rtl"].invoice .a4-title{align-items:flex-start}
.invoice .title{font-size:24px;font-weight:700;letter-spacing:.06em}
[lang="ur"].invoice .title{letter-spacing:0}
.invoice .meta{color:#5B675F}
.invoice .copy-mark{margin:2px 0}
.invoice .customer-box{border:1px solid #D9D6CC;border-radius:10px;padding:14px 16px}
.invoice .customer-box .label{font-size:12px;color:#5B675F;font-weight:700;letter-spacing:.05em}
.invoice .customer-box .value{font-size:16px;font-weight:600}
.invoice table.lines{width:100%;border-collapse:collapse}
.invoice table.lines th{background:#EFEDE4;border-bottom:1px solid #CFCBBE;font-size:12px;font-weight:700;letter-spacing:.04em;padding:10px 12px;text-align:start}
.invoice table.lines td{padding:12px;border-bottom:1px solid #ECE9DF;text-align:start}
[lang="ur"].invoice table.lines th{letter-spacing:0}
.invoice table.lines th.c-num,.invoice table.lines td.c-num{text-align:end}
.invoice .sums{width:340px;margin-inline-start:auto;display:flex;flex-direction:column;gap:6px}
.invoice .sums .row{gap:20px}
.invoice .sums .row.total{font-size:22px;font-weight:700;color:#1F5D3A;padding-top:8px;border-top:2px solid #1B2A22}
.invoice .sums .row.small{color:#5B675F}
.invoice .signatures{display:flex;justify-content:space-between;gap:80px;margin-top:auto}
.invoice .signatures>div{flex:1;border-top:1px solid #1B2A22;padding-top:6px;color:#5B675F;font-size:13px}
.invoice .thanks{font-size:13px;color:#5B675F}
`;

/** The `<body>` of a document: just the document, no page around it. */
export function renderDocumentMarkup(data: InvoiceDocumentData, language: DocumentLanguage): string {
  return renderToStaticMarkup(data.kind === 'receipt' ? <ReceiptDocument data={data} language={language} /> : <InvoiceDocument data={data} language={language} />);
}

/**
 * The whole page as one HTML text: the document, its stylesheet and its fonts, with nothing loaded from anywhere
 * (the Content-Security-Policy in it forbids every network request).
 */
export function renderDocumentHtml(data: InvoiceDocumentData, language: DocumentLanguage, fonts: DocumentFonts): string {
  const title = `${LABELS[language][data.kind === 'receipt' ? 'receipt' : 'invoice']} ${data.invoice.invoice_no} - ${shopName(data, language)}`.replace(/[<>&"]/g, '');
  return (
    '<!doctype html>' +
    `<html lang="${language}" dir="${language === 'ur' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:" />` +
    `<title>${title}</title><style>${documentCss(fonts, data.kind)}</style></head><body>${renderDocumentMarkup(data, language)}</body></html>`
  );
}
