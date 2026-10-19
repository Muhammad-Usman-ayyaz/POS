import { formatPaisa, type DocumentLanguage, type StatementDocumentData, type StatementDocumentLine } from '@pos/core';
import { Mixed } from './bidi.js';
import { addressText, shopName } from './format.js';
import { balanceLabel, balanceParts, columnBalance, customerLine, dayText, lineDescription, lineReference, lineType, rangeText, shortBalance, signedMoney } from './khata-format.js';
import { KHATA_LABELS, type KhataDocumentLabels } from './khata-labels.js';

/** A number, amount or date: always left to right and in the number font, also inside Urdu text. */
const Num = ({ children, className }: { children: string; className?: string }) => <span className={className ? `num ${className}` : 'num'}>{children}</span>;

const dirOf = (language: DocumentLanguage): 'rtl' | 'ltr' => (language === 'ur' ? 'rtl' : 'ltr');

function Header({ data, language, t }: { data: StatementDocumentData; language: DocumentLanguage; t: KhataDocumentLabels }) {
  const address = addressText(data);
  return (
    <header className="head">
      <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
      <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
      <div className="title">{t.statement}</div>
    </header>
  );
}

/** The closing figure: "He owes Rs 9,000", "Advance Rs 1,000" or "Clear". The shell's closing balance, only worded. */
function Closing({ data, t }: { data: StatementDocumentData; t: KhataDocumentLabels }) {
  const { kind, amount } = balanceParts(data.closing_balance);
  return (
    <div className="row total closing" data-closing={kind}>
      <span>{balanceLabel(kind, t)}</span>
      <Num>{amount}</Num>
    </div>
  );
}

/** The 80 mm slip, as in docs/design/CustomerForms.dc.html section 4 ("80 mm print"). */
function StatementReceipt({ data, language }: { data: StatementDocumentData; language: DocumentLanguage }) {
  const t = KHATA_LABELS[language];
  const footer = data.shop.footer?.trim() ?? '';
  return (
    <div className="receipt statement doc" data-document="statement" data-paper="receipt" data-language={language} lang={language} dir={dirOf(language)}>
      {data.is_copy && <div className="copy-mark">{t.copy}</div>}
      <Header data={data} language={language} t={t} />
      <div className="info">
        <div className="semi"><Mixed text={customerLine(data.customer, language)} language={language} /></div>
        <div className="sub range"><Mixed text={rangeText(data.from, data.to, language)} language={language} /></div>
      </div>
      <div className="items">
        {data.lines.map((line, i) => (
          <div className="item" key={i} data-line={line.kind}>
            <div className="row">
              <span>{line.date ? <Num>{dayText(line.date, data.time_zone, false)}</Num> : ''}</span>
              <Num className="semi">{line.kind === 'brought_forward' ? '' : signedMoney(line.amount_delta)}</Num>
            </div>
            <div className="row sub">
              <span><Mixed text={line.kind === 'brought_forward' ? t.types.brought_forward : lineDescription(line, t)} language={language} /></span>
              <Num>{shortBalance(line.running_balance, t)}</Num>
            </div>
          </div>
        ))}
      </div>
      <div className="totals">
        <div className="row small">
          <span>{t.totalOwesMore}</span>
          <Num>{formatPaisa(data.totals.owes_more)}</Num>
        </div>
        <div className="row small">
          <span>{t.totalOwesLess}</span>
          <Num>{formatPaisa(data.totals.owes_less)}</Num>
        </div>
        <Closing data={data} t={t} />
        {data.credit_limit !== null && data.credit_limit > 0 && (
          <div className="row small">
            <span>{t.creditLimit}</span>
            <Num>{formatPaisa(data.credit_limit)}</Num>
          </div>
        )}
      </div>
      <div className="legend"><Mixed text={t.legend80} language={language} /></div>
      <footer className="thanks">{footer ? <Mixed text={footer} language={language} /> : t.thanks}</footer>
    </div>
  );
}

function A4Row({ line, data, t, language }: { line: StatementDocumentLine; data: StatementDocumentData; t: KhataDocumentLabels; language: DocumentLanguage }) {
  const brought = line.kind === 'brought_forward';
  // The brought-forward line is a balance, not an entry: it sits in the Balance column only.
  const more = !brought && line.amount_delta > 0 ? line.amount_delta : 0;
  const less = !brought && line.amount_delta < 0 ? -line.amount_delta : 0;
  return (
    <tr data-line={line.kind}>
      <td>{line.date ? <Num>{dayText(line.date, data.time_zone)}</Num> : ''}</td>
      <td>
        <Mixed text={brought ? t.types.brought_forward : lineType(line, t)} language={language} />
        {line.note && <div className="note"><Mixed text={line.note} language={language} /></div>}
      </td>
      <td><Mixed text={lineReference(line)} language={language} /></td>
      <td className="c-num">{more > 0 ? <Num>{formatPaisa(more)}</Num> : ''}</td>
      <td className="c-num">{less > 0 ? <Num>{formatPaisa(less)}</Num> : ''}</td>
      <td className="c-num"><Num className="semi">{columnBalance(line.running_balance, t)}</Num></td>
    </tr>
  );
}

/**
 * The A4 statement. The design has no A4 statement: this follows the A4 invoice (header, customer box, table styling, thank-you line) and the
 * statement screen's columns. A long customer history runs over several pages: the column heads repeat on each page, a row is never split, and
 * the top and bottom margins are repeated spacer rows (the printer margin is 0 so the page is not cut by the paper's edge).
 */
function StatementA4({ data, language }: { data: StatementDocumentData; language: DocumentLanguage }) {
  const t = KHATA_LABELS[language];
  const footer = data.shop.footer?.trim() ?? '';
  const address = addressText(data);
  const { kind, amount } = balanceParts(data.closing_balance);
  return (
    <div className="statement-a4 statement doc" data-document="statement" data-paper="invoice" data-language={language} lang={language} dir={dirOf(language)}>
      <header className="a4-head">
        <div>
          <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
          <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        </div>
        <div className="a4-title">
          <div className="title">{t.statement}</div>
          {data.is_copy && <div className="copy-mark">{t.copy}</div>}
          <span className="meta"><Mixed text={rangeText(data.from, data.to, language)} language={language} /></span>
        </div>
      </header>
      <section className="customer-box">
        <div className="label">{t.customer}</div>
        <div className="value"><Mixed text={customerLine(data.customer, language)} language={language} /></div>
        {data.customer.phone && <div className="phone"><Num>{data.customer.phone}</Num></div>}
      </section>
      <table className="lines paged">
        <thead>
          <tr className="pad"><td colSpan={6} /></tr>
          <tr className="heads">
            <th>{t.colDate}</th>
            <th>{t.colType}</th>
            <th>{t.colReference}</th>
            <th className="c-num">{t.colOwesMore}</th>
            <th className="c-num">{t.colOwesLess}</th>
            <th className="c-num">{t.colBalance}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, i) => (
            <A4Row key={i} line={line} data={data} t={t} language={language} />
          ))}
          {/* ONE row for the totals and the closing balance, so a page break can never leave the closing balance alone on a page */}
          <tr className="closing-row" data-line="closing">
            <td colSpan={6}>
              <div className="totals-grid" data-line="totals">
                <span className="totals-label">{t.totals}</span>
                <span className="c-num"><Num>{formatPaisa(data.totals.owes_more)}</Num></span>
                <span className="c-num"><Num>{formatPaisa(data.totals.owes_less)}</Num></span>
                <span className="c-num"><Num>{columnBalance(data.closing_balance, t)}</Num></span>
              </div>
              <div className="closing-box" data-closing={kind}>
                <span>{balanceLabel(kind, t)}</span>
                <Num>{amount}</Num>
              </div>
              {data.credit_limit !== null && data.credit_limit > 0 && (
                <div className="row small">
                  <span>{t.creditLimit}</span>
                  <Num>{formatPaisa(data.credit_limit)}</Num>
                </div>
              )}
              <div className="legend"><Mixed text={t.legendA4} language={language} /></div>
              <div className="thanks">{footer ? <Mixed text={footer} language={language} /> : t.thanks}</div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="pad"><td colSpan={6} /></tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The customer statement on 80 mm paper or on A4, in English or Urdu. Pure: the same data and language always give the same page. Shows no cost. */
export function StatementDocument({ data, language }: { data: StatementDocumentData; language: DocumentLanguage }) {
  return data.kind === 'receipt' ? <StatementReceipt data={data} language={language} /> : <StatementA4 data={data} language={language} />;
}
