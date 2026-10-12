import type { DocumentLanguage, InvoiceDocumentData } from '@pos/core';
import { Mixed } from './bidi.js';
import { addressText, customerText, formatDateTime, formatDueDate, grossOf, lineName, lineQuantity, minusMoney, money, shopName, totalDiscount } from './format.js';
import { LABELS } from './labels.js';

/** A number, amount or date: always left to right and in the number font, also inside Urdu text. */
const Num = ({ children, className }: { children: string; className?: string }) => <span className={className ? `num ${className}` : 'num'}>{children}</span>;

const Row = ({ label, children, strong }: { label: string; children: string; strong?: boolean }) => (
  <div className={strong ? 'row strong' : 'row'}>
    <span>{label}</span>
    <Num>{children}</Num>
  </div>
);

/**
 * The 80 mm thermal receipt (printable width 72 mm). Built from `docs/design/Receipts80.dc.html`.
 * Pure: the same data and language always give the same page. Shows no cost, no batch and no profit: only what the customer was charged.
 * `dir` is set from the language, so the Urdu receipt reads right to left with the amounts on the left.
 */
export function ReceiptDocument({ data, language }: { data: InvoiceDocumentData; language: DocumentLanguage }) {
  const t = LABELS[language];
  const address = addressText(data);
  const customer = customerText(data, language);
  const discount = totalDiscount(data);
  const { invoice } = data;
  return (
    <div className="receipt doc" data-document="receipt" data-language={language} lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
      {data.is_copy && <div className="copy-mark">{t.copy}</div>}
      {invoice.status === 'voided' && <div className="copy-mark">{t.voided}</div>}
      <header className="head">
        <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
        {/* Not invented: the owner has not given an address or phone until one is saved in the print settings. */}
        <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        <div className="title">{t.receipt}</div>
      </header>

      <div className="info">
      <Row label={t.invoiceNo}>{invoice.invoice_no}</Row>
      <div className="row date">
        <span />
        <Num>{formatDateTime(invoice.invoice_date, data.time_zone)}</Num>
      </div>
      {customer && (
        <div className="row">
          <span>{t.customer}</span>
          <span><Mixed text={customer} language={language} /></span>
        </div>
      )}
      </div>

      <div className="items">
        {data.lines.map((line) => {
          const q = lineQuantity(line, language);
          const name = lineName(line, language) + (q.loose ? ` · ${t.loose}` : '');
          return (
            <div className="item" key={line.position}>
              <div className="row semi">
                <span><Mixed text={name} language={language} /></span>
                <Num>{money(grossOf(line))}</Num>
              </div>
              <div className="sub line-sub">
                <Num>{`${q.qtyText} × ${q.rateText}`}</Num>
              </div>
            </div>
          );
        })}
        {discount > 0 && (
          <div className="item">
            <div className="row semi">
              <span>{t.discount}</span>
              <Num>{minusMoney(discount)}</Num>
            </div>
          </div>
        )}
      </div>

      <div className="totals">
      <div className="row total">
        <span>{t.total}</span>
        <Num>{money(invoice.total)}</Num>
      </div>
      {invoice.tax_total > 0 && (
        <div className="row small">
          <span>{t.includesTax}</span>
          <Num>{money(invoice.tax_total)}</Num>
        </div>
      )}
      </div>

      <div className="pay">
      {invoice.paid_amount > 0 && <Row label={`${t.paid} · ${t.methods[invoice.payment_method]}`}>{money(invoice.paid_amount)}</Row>}
      {invoice.on_khata > 0 && (
        <Row label={t.onKhata} strong>
          {money(invoice.on_khata)}
        </Row>
      )}
      {data.balance_as_of_sale !== null && <Row label={t.balanceNow}>{money(data.balance_as_of_sale)}</Row>}
      {invoice.due_date && invoice.on_khata > 0 && <Row label={t.payBy}>{formatDueDate(invoice.due_date)}</Row>}
      </div>

      <footer className="thanks">{t.thanks}</footer>
    </div>
  );
}
