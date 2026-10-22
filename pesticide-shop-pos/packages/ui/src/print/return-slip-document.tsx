import { formatPaisa, type DocumentLanguage, type ReturnDetailLine, type ReturnDocumentData } from '@pos/core';
import { Mixed } from './bidi.js';
import { addressText, customerText, formatDateTime, lineName, lineQuantity, money, shopName } from './format.js';
import { balanceParts } from './khata-format.js';
import { RETURN_LABELS, type ReturnDocumentLabels } from './return-labels.js';

const Num = ({ children, className }: { children: string; className?: string }) => <span className={className ? `num ${className}` : 'num'}>{children}</span>;

const reasonText = (line: ReturnDetailLine, t: ReturnDocumentLabels): string => {
  const known = (t.reasons as Record<string, string | undefined>)[line.reason ?? ''];
  return known ?? line.reason ?? '';
};

const stockText = (line: ReturnDetailLine, t: ReturnDocumentLabels): string => (line.condition === 'resellable' ? t.backToStock : t.writtenOff);

/** The quantity of a returned line in the line's own unit ("0.5 kg", "2 packs") and the price per pack or per kg / L. Units come from the core units module. */
function quantity(line: ReturnDetailLine, language: DocumentLanguage) {
  return lineQuantity({ qty: line.qty, pack_size: line.pack_size, base_unit: line.base_unit, unit_price: line.unit_price }, language);
}

/** "Owes now Rs 2,217" / "Advance Rs 500" / "Clear": the customer's Khata right after this return, as the shell gave it (no arithmetic here). */
function Owes({ data, t }: { data: ReturnDocumentData; t: ReturnDocumentLabels }) {
  if (data.balance_after === null) return null;
  const { kind, amount } = balanceParts(data.balance_after);
  return (
    <div className="row strong" data-balance-after={kind}>
      <span>{kind === 'advance' ? t.advance : t.owesNow}</span>
      {kind === 'clear' ? <span>{t.clear}</span> : <Num>{amount}</Num>}
    </div>
  );
}

/** How the refund was paid: only the parts that are more than zero. */
function Refunded({ data, t }: { data: ReturnDocumentData; t: ReturnDocumentLabels }) {
  const r = data.return;
  return (
    <>
      <div className="row small">
        <span>{t.refundedTo}</span>
        <span />
      </div>
      {r.cash_amount > 0 && (
        <div className="row" data-part="cash">
          <span>{t.cashBack}</span>
          <Num>{money(r.cash_amount)}</Num>
        </div>
      )}
      {r.khata_amount > 0 && (
        <div className="row" data-part="khata">
          <span>{t.khataCredit}</span>
          <Num>{money(r.khata_amount)}</Num>
        </div>
      )}
    </>
  );
}

/**
 * The 80 mm return slip. Built to follow the 80 mm receipt (`docs/design/Receipts80.dc.html`) with the words of the "Return complete" panel in
 * `docs/design/Returns.dc.html`. Pure rendering from data; it shows what the customer got back, never a cost. Every quantity carries its unit
 * (kg, L, packs, pieces) from the units module.
 */
export function ReturnSlipReceipt({ data, language }: { data: ReturnDocumentData; language: DocumentLanguage }) {
  const t = RETURN_LABELS[language];
  const footer = data.shop.footer?.trim() ?? '';
  const address = addressText(data);
  const customer = customerText(data, language);
  const r = data.return;
  return (
    <div className="receipt doc return-slip" data-document="return-slip" data-paper="receipt" data-language={language} lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
      {data.is_copy && <div className="copy-mark">{t.copy}</div>}
      <header className="head">
        <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
        <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        <div className="title">{t.returnSlip}</div>
      </header>

      <div className="info">
        <div className="row">
          <span>{t.returnNo}</span>
          <Num>{r.return_no}</Num>
        </div>
        <div className="row">
          <span>{t.forInvoice}</span>
          <Num>{data.invoice.invoice_no}</Num>
        </div>
        <div className="row date">
          <span />
          <Num>{formatDateTime(r.created_at, data.time_zone)}</Num>
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
          const q = quantity(line, language);
          const name = lineName(line, language) + (q.loose ? ` · ${t.loose}` : '');
          return (
            <div className="item" key={line.position}>
              <div className="row semi">
                <span><Mixed text={name} language={language} /></span>
                <Num>{money(line.refund_amount)}</Num>
              </div>
              <div className="sub line-sub">
                <Num>{`${q.qtyText} × ${q.rateText}`}</Num>
              </div>
              <div className="sub line-sub">
                <Mixed text={`${reasonText(line, t)} · ${stockText(line, t)}`} language={language} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="totals">
        <div className="row total" data-amount>
          <span>{t.refundTotal}</span>
          <Num>{money(r.total)}</Num>
        </div>
        {r.tax_total > 0 && (
          <div className="row small">
            <span>{t.includedTax}</span>
            <Num>{formatPaisa(r.tax_total)}</Num>
          </div>
        )}
      </div>
      <div className="pay">
        <Refunded data={data} t={t} />
        <Owes data={data} t={t} />
      </div>
      {r.note && (
        <div className="sub note">
          <span>{t.note}: </span>
          <Mixed text={r.note} language={language} />
        </div>
      )}
      <div className="sub note">{t.invoiceUnchanged(data.invoice.invoice_no)}</div>
      <footer className="thanks">{footer ? <Mixed text={footer} language={language} /> : t.thanks}</footer>
    </div>
  );
}

/** The A4 credit note: the A4 invoice's page with the returned lines (item, batch, quantity, rate, tax, refund, reason, stock). */
export function ReturnSlipA4({ data, language }: { data: ReturnDocumentData; language: DocumentLanguage }) {
  const t = RETURN_LABELS[language];
  const footer = data.shop.footer?.trim() ?? '';
  const address = addressText(data);
  const customer = customerText(data, language);
  const r = data.return;
  return (
    <div className="invoice doc return-slip" data-document="return-slip" data-paper="invoice" data-language={language} lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
      <header className="a4-head">
        <div>
          <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
          <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        </div>
        <div className="a4-title">
          <div className="title">{t.creditNote}</div>
          {data.is_copy && <div className="copy-mark">{t.copy}</div>}
          <Num>{r.return_no}</Num>
          <span className="meta"><Mixed text={`${t.forInvoice} `} language={language} /><Num>{data.invoice.invoice_no}</Num></span>
          <Num className="meta">{formatDateTime(r.created_at, data.time_zone)}</Num>
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
            <th className="c-num">{t.colTax}</th>
            <th className="c-num">{t.colRefund}</th>
            <th>{t.colReason}</th>
            <th>{t.colStock}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => {
            const q = quantity(line, language);
            const name = lineName(line, language) + (q.loose ? ` · ${t.loose}` : '');
            return (
              <tr key={line.position}>
                <td><Num>{String(line.position)}</Num></td>
                <td><Mixed text={name} language={language} /></td>
                <td><Num>{line.batch_no}</Num></td>
                <td className="c-num"><Num>{q.qtyText}</Num></td>
                <td className="c-num"><Num>{q.rateText}</Num></td>
                <td className="c-num"><Num>{line.tax_refund > 0 ? money(line.tax_refund) : '—'}</Num></td>
                <td className="c-num"><Num>{money(line.refund_amount)}</Num></td>
                <td><Mixed text={reasonText(line, t)} language={language} /></td>
                <td><Mixed text={stockText(line, t)} language={language} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="sums">
        <div className="row total" data-amount>
          <span>{t.refundTotal}</span>
          <Num>{money(r.total)}</Num>
        </div>
        {r.tax_total > 0 && (
          <div className="row small">
            <span>{t.includedTax}</span>
            <Num>{money(r.tax_total)}</Num>
          </div>
        )}
        <Refunded data={data} t={t} />
        <Owes data={data} t={t} />
        {r.note && (
          <div className="row small">
            <span>{t.note}</span>
            <span><Mixed text={r.note} language={language} /></span>
          </div>
        )}
        <div className="row small">
          <span>{t.approvedBy}</span>
          <span><Mixed text={r.approved_by} language={language} /></span>
        </div>
      </section>

      <div className="signatures">
        <div>{t.customerSignature}</div>
        <div>{t.authorisedSignature}</div>
      </div>
      <footer className="thanks">
        {t.invoiceUnchanged(data.invoice.invoice_no)} {footer ? <Mixed text={footer} language={language} /> : t.thanks}
      </footer>
    </div>
  );
}
