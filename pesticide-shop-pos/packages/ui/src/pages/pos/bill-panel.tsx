import type { SaleQuoteView } from '@pos/api-contract';
import { Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { DateField } from '../../components/ui/date-field.js';
import { describeError, formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { ApiError } from '@pos/api-contract';
import { PAYMENT_METHODS, groupTyped, groupedRupeesText, pickName, tidyPaidText, type Customer, type PaymentMethod, type PriceType } from './pos-state.js';

/** The right-hand column's top card: who the customer is, how much they owe, and the credit bar. */
export function CustomerCard({ customer, priceType, quote, onChange }: { customer: Customer | null; priceType: PriceType; quote: SaleQuoteView | null; onChange: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.customer;
  const money = (n: number) => formatMoney(n, language);
  const q = quote?.customer && customer && quote.customer.id === customer.id ? quote.customer : null;
  const limit = q?.credit_limit ?? 0;
  const pct = (n: number) => (limit > 0 ? Math.min(100, Math.max(0, (n / limit) * 100)) : 0);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-card px-4 py-3.5 shadow-card transition-[border-color,box-shadow] hover:border-card-hover hover:shadow-lift" aria-label={t.eyebrow}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-label">
            {t.eyebrow} · <span className="num">F4</span>
          </p>
          <p data-customer-name className="truncate text-xl font-bold leading-[1.3]">
            {customer ? pickName(customer.nameEn, customer.nameUr, language) : t.walkIn}
          </p>
          <p className="truncate text-[13px] text-muted">
            {customer ? `${customer.village ? `${customer.village} · ` : ''}${priceType === 'wholesale' ? t.wholesalePrice : t.retailPrice}` : t.walkInHint}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onChange}>
          {t.change}
        </Button>
      </div>
      {q && (
        <>
          {limit > 0 && (
            <div aria-hidden data-credit-bar className="h-1.5 overflow-hidden rounded-[3px] bg-track">
              <div className={cn('grow-in h-full rounded-[3px]', q.over_limit ? 'bg-danger-ink' : 'bg-accent')} style={{ width: `${pct(q.after_sale)}%` }} />
            </div>
          )}
          <div className="flex justify-between gap-2 text-[13px] text-muted">
            <span>
              {t.owesNow} <b className="num text-ink">{money(q.balance)}</b>
            </span>
            <span>
              {t.afterSale} <b className={cn('num', q.over_limit ? 'text-danger-ink' : 'text-ink')}>{money(q.after_sale)}</b>
            </span>
          </div>
          <p className="text-xs text-muted">{limit > 0 ? t.limit(money(limit)) : t.noLimit}</p>
        </>
      )}
    </section>
  );
}

/** Totals, the amount paid now, the payment method, the Khata remainder with its pay-by date, and the buttons. */
export function PaymentPanel({
  quote,
  fresh,
  lines,
  hasCustomer,
  paidText,
  onPaidText,
  paidInvalid,
  method,
  onMethod,
  reference,
  onReference,
  dueDate,
  onDueDate,
  today,
  change,
  blocker,
  busy,
  onComplete,
  onHold,
  onClear,
}: {
  quote: SaleQuoteView | null;
  fresh: boolean;
  lines: number;
  hasCustomer: boolean;
  paidText: string | null;
  onPaidText: (text: string) => void;
  paidInvalid: boolean;
  method: PaymentMethod;
  onMethod: (method: PaymentMethod) => void;
  reference: string;
  onReference: (text: string) => void;
  dueDate: string;
  onDueDate: (date: string) => void;
  today: string;
  /** Cash handed over beyond the bill (shown as a hint; never saved). */
  change: number;
  /** Why Complete sale is off, in words, or null. */
  blocker: string | null;
  busy: boolean;
  onComplete: () => void;
  onHold: () => void;
  onClear: () => void;
}) {
  const { m, language } = useI18n();
  const t = m.pos.bill;
  const money = (n: number) => formatMoney(n, language);
  const total = quote?.total ?? 0;
  const khata = quote && hasCustomer ? quote.unpaid : 0;
  const walkInShort = !hasCustomer && quote !== null && quote.issues.some((i) => i.scope === 'payment');
  const shown = paidText ?? (quote ? groupedRupeesText(total) : '');
  const paymentIssue = quote?.issues.find((i) => i.scope === 'payment' && hasCustomer);
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg border border-line bg-card px-4 py-3.5 shadow-card transition-[border-color,box-shadow] hover:border-card-hover hover:shadow-lift" aria-label={t.total}>
      <p className="text-[12.5px] text-muted">{t.invoice(lines)}</p>

      <div className={cn('rounded-md bg-tint-soft px-3.5 py-2.5', !fresh && 'opacity-70')} aria-busy={!fresh}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-bold">{t.total}</p>
          <p data-total className="num pop-once text-[34px] font-bold leading-[1.15] text-accent">
            {money(total)}
          </p>
        </div>
        <div className="flex justify-between text-[13px] text-label">
          <span>{t.includesTax}</span>
          <span data-tax className="num">
            {money(quote?.tax_total ?? 0)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="paid-now" className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-label">
          {t.paidNow}
        </label>
        {/* Always left to right, like the design: "Rs" first, the amount at the end, in Urdu too (a right-to-left field put "Rs" after the number: "1000Rs"). */}
        <div dir="ltr" className={cn('field flex h-12 items-center rounded-md border bg-card px-3.5 focus-within:border-accent', paidInvalid ? 'border-danger-ink' : 'border-field-line')}>
          <span className="num me-2 text-base text-muted">{t.rs}</span>
          <input
            id="paid-now"
            name="paid"
            inputMode="decimal"
            autoComplete="off"
            value={shown}
            onChange={(e) => onPaidText(groupTyped(e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              const tidy = tidyPaidText(e.target.value);
              if (tidy !== e.target.value) onPaidText(tidy);
            }}
            aria-invalid={paidInvalid || undefined}
            className="num h-full min-w-0 flex-1 border-0 bg-transparent text-end text-[22px] font-semibold shadow-none"
          />
        </div>
        {paidInvalid && (
          <p role="alert" className="text-sm font-medium text-danger-ink">
            {t.paidInvalid}
          </p>
        )}
        {change > 0 && method === 'cash' && (
          <p data-change className="text-sm font-semibold text-accent">
            {t.changeDue(money(change))}
          </p>
        )}
        <div role="radiogroup" aria-label={t.method} className="grid grid-cols-4 gap-1.5">
          {PAYMENT_METHODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => onMethod(value)}
              className={cn(
                'lift min-h-11 rounded-sm border px-0.5 text-[13px]',
                method === value ? 'border-2 border-accent bg-tint font-bold text-accent-dark' : 'border-field-line bg-card text-ink hover:bg-row-hover',
              )}
            >
              {t.methods[value]}
            </button>
          ))}
        </div>
        {method !== 'cash' && (
          <input
            aria-label={t.reference}
            placeholder={t.reference}
            name="reference"
            value={reference}
            onChange={(e) => onReference(e.target.value)}
            className="h-11 w-full rounded-sm border border-field-line bg-card px-3 text-sm"
            maxLength={60}
          />
        )}
      </div>

      {khata > 0 && (
        <div data-khata className="flex flex-col gap-1 rounded-md bg-warn-bg px-3.5 py-2 text-warn-ink">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{t.goesOnKhata}</p>
            <p className="num text-[19px] font-bold">{money(khata)}</p>
          </div>
          <label className="flex items-center justify-between gap-2 text-[13px]">
            <span>{t.payBy}</span>
            <DateField name="due_date" min={today} value={dueDate} onChange={onDueDate} className="h-11 w-[160px] rounded-[8px] border-warn-line text-sm text-ink" />
          </label>
        </div>
      )}
      {walkInShort && <p className="text-sm text-muted">{t.walkInFull}</p>}
      {paymentIssue && <Notice className="py-2" tone="danger" title={describeError(new ApiError(paymentIssue.code, paymentIssue.message, paymentIssue.params), language).title} next={describeError(new ApiError(paymentIssue.code, paymentIssue.message, paymentIssue.params), language).next} />}

      <div className="mt-auto flex flex-col gap-2.5 pt-1">
        {blocker && <p className="text-sm text-muted">{blocker}</p>}
        <Button size="cta" className="w-full" disabled={blocker !== null || busy} onClick={onComplete}>
          <span>
            {busy ? t.completing : t.complete} ·{' '}
            <span className="num text-base">F12</span>
          </span>
        </Button>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onHold}>
            {t.hold}
          </Button>
          <Button variant="danger" size="sm" className="flex-1" onClick={onClear}>
            {t.clear}
          </Button>
        </div>
      </div>
    </section>
  );
}
