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
[lang="ur"]{font-family:'Plex','Naskh',sans-serif;line-height:1.7}
.ltr{direction:ltr;unicode-bidi:isolate}
.num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;display:inline-block}
.doc .row{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.doc .row>span:first-child{min-width:0}
.doc .strong{font-weight:700}
.doc .sub{color:#555}
.doc .placeholder{font-style:italic}
.doc .copy-mark{display:inline-block;border:1.5px solid #111;padding:1px 10px;font-weight:700;letter-spacing:.12em}
.doc .thanks{text-align:center;color:#333}

/* ---- 80 mm receipt ---- */
.receipt{width:${PAGE.receipt.printableMm}mm;margin:0 auto;padding:4mm 0 6mm;font-size:9.5pt;line-height:1.45}
.receipt .copy-mark{display:block;width:max-content;margin:0 auto 2mm;font-size:11pt}
.receipt .head{text-align:center}
.receipt .shop{font-size:14pt;font-weight:700;line-height:1.3}
.receipt .head .sub{font-size:8pt}
.receipt .title{font-weight:700;letter-spacing:.12em;margin-top:1mm}
[lang="ur"].receipt .title{letter-spacing:0}
.receipt hr{border:0;margin:2.5mm 0}
.receipt hr.dashed{border-top:1px dashed #444}
.receipt hr.solid{border-top:2px solid #111}
.receipt .row.date{justify-content:flex-end}
.receipt .items .item{padding:1.6mm 0;border-bottom:1px dashed #999}
.receipt .items .item:last-child{border-bottom:0}
.receipt .line-sub{text-align:left;font-size:8.5pt}
.receipt .row.total{font-size:15pt;font-weight:700;align-items:baseline}
.receipt .row.small{font-size:8.5pt;color:#555}
.receipt .thanks{margin-top:4mm;font-size:9pt}

/* ---- A4 invoice ---- */
.invoice{width:${PAGE.invoice.printableMm}mm;min-height:${PAGE.invoice.heightMm - 28}mm;margin:0 auto;padding:14mm 0;font-size:10pt;display:flex;flex-direction:column}
.invoice .a4-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm}
.invoice .shop{font-size:20pt;font-weight:700;color:#1B2A22}
.invoice .a4-title{display:flex;flex-direction:column;align-items:flex-end}
[dir="rtl"].invoice .a4-title{align-items:flex-start}
.invoice .title{font-size:19pt;font-weight:700;letter-spacing:.06em;color:#1B2A22}
[lang="ur"].invoice .title{letter-spacing:0}
.invoice .meta{color:#555;font-size:9.5pt}
.invoice .copy-mark{margin:1mm 0}
.invoice .customer-box{border:1px solid #D9D6CC;border-radius:3mm;padding:3mm 4mm;margin-bottom:6mm}
.invoice .customer-box .label{font-size:8pt;color:#555;font-weight:600}
.invoice .customer-box .value{font-size:11pt;font-weight:600}
.invoice table.lines{width:100%;border-collapse:collapse}
.invoice table.lines th{background:#EFEDE4;font-size:8pt;font-weight:700;padding:2.5mm 2mm;text-align:start}
.invoice table.lines td{padding:2.6mm 2mm;border-bottom:1px solid #ECE9DF;vertical-align:top}
.invoice .c-num{text-align:end}
.invoice .c-no{width:9mm}
.invoice .c-item{width:40%}
.invoice .sums{width:50%;margin-top:6mm;margin-inline-start:auto;border-top:1.5px solid #1B2A22;padding-top:2mm}
.invoice .sums .row{padding:1mm 0}
.invoice .sums .row.total{font-size:15pt;font-weight:700;color:#1F5D3A}
.invoice .sums .row.small{color:#555;font-size:9pt}
.invoice .signatures{display:flex;justify-content:space-between;gap:14mm;margin-top:auto;padding-top:30mm}
.invoice .signatures>div{flex:1}
.invoice .sign-line{border-top:1px solid #444;margin-bottom:1.5mm}
.invoice .signatures .sub{font-size:8.5pt}
.invoice .thanks{margin-top:8mm;font-size:8.5pt;color:#555}
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
