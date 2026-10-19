import { formatPaisa, type DocumentLanguage, type PaymentReceiptData } from '@pos/core';
import { Mixed } from './bidi.js';
import { addressText, formatDateTime, shopName } from './format.js';
import { balanceLabel, balanceParts, customerLine } from './khata-format.js';
import { KHATA_LABELS } from './khata-labels.js';

const Num = ({ children, className }: { children: string; className?: string }) => <span className={className ? `num ${className}` : 'num'}>{children}</span>;

/**
 * The 80 mm payment receipt: what the shop gives a customer who paid on account. The design (CustomerForms section 3) draws the form that makes it
 * ("Save and print receipt") and names its fields (Amount received, Method, Reference number, Note, Balance after) but not the printed slip, so the slip
 * follows the 80 mm receipt styling with those words. `balance_after` is the balance right after THIS payment, as the shell worked it out.
 * Pure rendering; no cost anywhere (a payment holds none).
 */
export function PaymentReceiptDocument({ data, language }: { data: PaymentReceiptData; language: DocumentLanguage }) {
  const t = KHATA_LABELS[language];
  const footer = data.shop.footer?.trim() ?? '';
  const address = addressText(data);
  const { payment } = data;
  const { kind, amount } = balanceParts(data.balance_after);
  return (
    <div className="receipt payment-receipt doc" data-document="payment-receipt" data-paper="receipt" data-language={language} lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
      {data.is_copy && <div className="copy-mark">{t.copy}</div>}
      <header className="head">
        <div className="shop"><Mixed text={shopName(data, language)} language={language} /></div>
        <div className={address ? 'sub' : 'sub placeholder'}>{address ?? t.addressPlaceholder}</div>
        <div className="title">{t.paymentReceipt}</div>
      </header>

      <div className="info">
        {payment.receipt_no && (
          <div className="row">
            <span>{t.receiptNo}</span>
            <Num>{payment.receipt_no}</Num>
          </div>
        )}
        <div className="row date">
          <span />
          <Num>{formatDateTime(payment.paid_at, data.time_zone)}</Num>
        </div>
        <div className="row">
          <span>{t.receivedFrom}</span>
          <span><Mixed text={customerLine(data.customer, language)} language={language} /></span>
        </div>
      </div>

      <div className="items">
        <div className="item">
          <div className="row">
            <span>{t.method}</span>
            <span>{t.methods[payment.method]}</span>
          </div>
        </div>
        {payment.reference_no && (
          <div className="item">
            <div className="row">
              <span>{t.reference}</span>
              <span className="value"><Mixed text={payment.reference_no} language={language} /></span>
            </div>
          </div>
        )}
        {payment.note && (
          <div className="item">
            <div className="row">
              <span>{t.note}</span>
              <span className="value"><Mixed text={payment.note} language={language} /></span>
            </div>
          </div>
        )}
      </div>

      <div className="totals">
        <div className="row total" data-amount>
          <span>{t.amountReceived}</span>
          <Num>{formatPaisa(payment.amount)}</Num>
        </div>
      </div>
      <div className="pay">
        <div className="row strong" data-balance-after={kind}>
          <span>{t.balanceAfter}</span>
          <span>
            {kind !== 'clear' && <span>{balanceLabel(kind, t)} </span>}
            {kind === 'clear' ? <span>{t.clear}</span> : <Num>{amount}</Num>}
          </span>
        </div>
      </div>

      <footer className="thanks">{footer ? <Mixed text={footer} language={language} /> : t.thanks}</footer>
    </div>
  );
}
