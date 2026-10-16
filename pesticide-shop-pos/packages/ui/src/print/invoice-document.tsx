import type { DocumentLanguage, InvoiceDocumentData } from '@pos/core';
import { Mixed } from './bidi.js';
import { addressText, customerText, formatDateTime, formatDueDate, lineName, lineQuantity, money, shopName } from './format.js';
import { LABELS } from './labels.js';

const Num = ({ children, className }: { children: string; className?: string }) => <span className={className ? `num ${className}` : 'num'}>{children}</span>;

const SumRow = ({ label, children, strong }: { label: string; children: string; strong?: boolean }) => (
  <div className={strong ? 'row strong' : 'row'}>
    <span>{label}</span>
    <Num>{children}</Num>
  </div>
);

/**
 * The A4 invoice. Built from `docs/design/InvoiceA4.dc.html`, with one addition to the design: a Tax column (the tax inside each
 * line, as the owner asked for tax per line). Pure rendering from data; no cost, margin or profit anywhere. The batch NUMBER is shown (it is not cost).
 * The Urdu page is right to left: the table's first column (#) is on the right and the amounts are on the left.
 */
export function InvoiceDocument({ data, language }: { data: InvoiceDocumentData; language: DocumentLanguage }) {
  const t = LABELS[language];
  // The owner's footer replaces the standard thank-you line when there is one. It is plain text (React escapes it), never markup.
  const footer = data.shop.footer?.trim() ?? '';
  const address = addressText(data);
  const customer = customerText(data, language);
  const { invoice } = data;
  return (
    <div className="invoice doc" data-document="invoice" data-language={language} lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
      <header className="a4-head">
        <div>
          <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
          <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        </div>
        <div className="a4-title">
          <div className="title">{t.invoice}</div>
          {data.is_copy && <div className="copy-mark">{t.copy}</div>}
          {invoice.status === 'voided' && <div className="copy-mark">{t.voided}</div>}
          <Num>{invoice.invoice_no}</Num>
          <Num className="meta">{formatDateTime(invoice.invoice_date, data.time_zone)}</Num>
        </div>
      </header>

      {customer && (
        <section className="customer-box">
          <div className="label">{t.customer}</div>
          <div className="value"><Mixed text={customer} language={language} /></div>
        </section>
      )}

      <table className="lines">
        <thead>
          <tr>
            <th>{t.colNumber}</th>
            <th>{t.colItem}</th>
            <th>{t.colBatch}</th>
            <th className="c-num">{t.colQty}</th>
            <th className="c-num">{t.colRate}</th>
            <th className="c-num">{t.colDiscount}</th>
            <th className="c-num">{t.colTax}</th>
            <th className="c-num">{t.colAmount}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => {
            const q = lineQuantity(line, language);
            const name = lineName(line, language) + (q.loose ? ` · ${t.loose}` : '');
            return (
              <tr key={line.position}>
                <td>
                  <Num>{String(line.position)}</Num>
                </td>
                <td><Mixed text={name} language={language} /></td>
                <td>
                  <Num>{line.batch_no}</Num>
                </td>
                <td className="c-num">
                  <Num>{q.qtyText}</Num>
                </td>
                <td className="c-num">
                  <Num>{q.rateText}</Num>
                </td>
                <td className="c-num">
                  <Num>{line.line_discount > 0 ? money(line.line_discount) : '—'}</Num>
                </td>
                <td className="c-num">
                  <Num>{line.tax_amount > 0 ? money(line.tax_amount) : '—'}</Num>
                </td>
                <td className="c-num">
                  <Num>{money(line.line_total)}</Num>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="sums">
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
        {invoice.paid_amount > 0 && <SumRow label={`${t.paid} · ${t.methods[invoice.payment_method]}`}>{money(invoice.paid_amount)}</SumRow>}
        {invoice.on_khata > 0 && (
          <SumRow label={t.onKhata} strong>
            {money(invoice.on_khata)}
          </SumRow>
        )}
        {data.balance_as_of_sale !== null && <SumRow label={t.balanceNow}>{money(data.balance_as_of_sale)}</SumRow>}
        {invoice.due_date && invoice.on_khata > 0 && <SumRow label={t.payBy}>{formatDueDate(invoice.due_date)}</SumRow>}
      </section>

      <div className="signatures">
        <div>{t.customerSignature}</div>
        <div>{t.authorisedSignature}</div>
      </div>
      <footer className="thanks">{footer ? <Mixed text={footer} language={language} /> : t.thanks}</footer>
    </div>
  );
}
