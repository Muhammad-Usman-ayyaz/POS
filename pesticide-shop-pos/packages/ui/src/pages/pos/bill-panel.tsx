import type { SaleQuoteView } from '@pos/api-contract';
import { Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { describeError, formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { ApiError } from '@pos/api-contract';
import { PAYMENT_METHODS, pickName, rupeesText, type Customer, type PaymentMethod, type PriceType } from './pos-state.js';

/** The right-hand column's top card: who the customer is, how much they owe, and the credit bar. */
export function CustomerCard({ customer, priceType, quote, onChange }: { customer: Customer | null; priceType: PriceType; quote: SaleQuoteView | null; onChange: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.customer;
  const money = (n: number) => formatMoney(n, language);
  const q = quote?.customer && customer && quote.customer.id === customer.id ? quote.customer : null;
  const limit = q?.credit_limit ?? 0;
  const pct = (n: number) => (limit > 0 ? Math.min(100, Math.max(0, (n / limit) * 100)) : 0);
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-label={t.eyebrow}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t.eyebrow} · <span className="num">F4</span>
          </p>
          <p data-customer-name className="truncate text-2xl font-bold leading-tight">
            {customer ? pickName(customer.nameEn, customer.nameUr, language) : t.walkIn}
          </p>
          <p className="truncate text-sm text-muted">
            {customer ? `${customer.village ? `${customer.village} · ` : ''}${priceType === 'wholesale' ? t.wholesalePrice : t.retailPrice}` : t.walkInHint}
          </p>
        </div>
        <Button variant="secondary" onClick={onChange}>
          {t.change}
        </Button>
      </div>
      {q && (
        <div className="mt-3">
          {limit > 0 && (
            <div aria-hidden className="relative h-2 overflow-hidden rounded-full bg-row-line">
              <div className={cn('grow-in absolute inset-y-0 start-0 rounded-full', q.over_limit ? 'bg-danger-ink' : 'bg-warn-ink/50')} style={{ width: `${pct(q.after_sale)}%` }} />
              <div className="absolute inset-y-0 start-0 rounded-full bg-accent" style={{ width: `${pct(q.balance)}%` }} />
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm text-muted">
            <span>
              {t.owesNow} <b className="num text-ink">{money(q.balance)}</b>
            </span>
            <span>
              {t.afterSale} <b className={cn('num', q.over_limit ? 'text-danger-ink' : 'text-ink')}>{money(q.after_sale)}</b>
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{limit > 0 ? t.limit(money(limit)) : t.noLimit}</p>
        </div>
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
  const shown = paidText ?? (quote ? rupeesText(total) : '');
  const paymentIssue = quote?.issues.find((i) => i.scope === 'payment' && hasCustomer);
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-card p-4 shadow-card" aria-label={t.total}>
      <p className="text-sm text-muted">{t.invoice(lines)}</p>

      <div className={cn('mt-3 rounded-lg bg-tint-soft p-4', !fresh && 'opacity-70')} aria-busy={!fresh}>
        <div className="flex items-end justify-between gap-3">
          <p className="font-bold">{t.total}</p>
          <p data-total className="num pop-once text-4xl font-bold leading-none text-accent">
            {money(total)}
          </p>
        </div>
        <div className="mt-2 flex justify-between text-sm text-muted">
          <span>{t.includesTax}</span>
          <span data-tax className="num">
            {money(quote?.tax_total ?? 0)}
          </span>
        </div>
      </div>

      <label htmlFor="paid-now" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">
        {t.paidNow}
      </label>
      <div className={cn('mt-1 flex items-center rounded-lg border bg-card px-4', paidInvalid ? 'border-danger-ink' : 'border-field-line')}>
        <span className="text-lg text-muted">{t.rs}</span>
        <input
          id="paid-now"
          name="paid"
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          onChange={(e) => onPaidText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={paidInvalid || undefined}
          className="num h-14 min-w-0 flex-1 border-0 bg-transparent text-end text-2xl font-bold shadow-none [@media(max-height:800px)]:h-12"
        />
      </div>
      {paidInvalid && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger-ink">
          {t.paidInvalid}
        </p>
      )}
      {change > 0 && method === 'cash' && (
        <p data-change className="mt-1 text-sm font-semibold text-accent">
          {t.changeDue(money(change))}
        </p>
      )}

      <div role="radiogroup" aria-label={t.method} className="mt-3 grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => onMethod(value)}
            className={cn('lift min-h-11 rounded-md border px-1 text-sm font-semibold', method === value ? 'border-2 border-accent bg-tint text-accent' : 'border-line bg-card hover:bg-row-hover')}
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
          className="mt-2 h-11 w-full rounded-md border border-field-line bg-card px-3"
          maxLength={60}
        />
      )}

      {khata > 0 && (
        <div data-khata className="mt-3 rounded-lg bg-warn-bg p-3 text-warn-ink">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{t.goesOnKhata}</p>
            <p className="num text-xl font-bold">{money(khata)}</p>
          </div>
          <label className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span>{t.payBy}</span>
            <input type="date" name="due_date" min={today} value={dueDate} onChange={(e) => onDueDate(e.target.value)} className="num h-11 rounded-md border border-warn-ink/30 bg-card px-3 text-ink" />
          </label>
        </div>
      )}
      {walkInShort && <p className="mt-2 text-sm text-muted">{t.walkInFull}</p>}
      {paymentIssue && <Notice className="mt-2 py-2" tone="danger" title={describeError(new ApiError(paymentIssue.code, paymentIssue.message, paymentIssue.params), language).title} next={describeError(new ApiError(paymentIssue.code, paymentIssue.message, paymentIssue.params), language).next} />}

      <div className="mt-auto pt-3">
        {blocker && <p className="mb-2 text-sm text-muted">{blocker}</p>}
        <Button size="xl" className="w-full" disabled={blocker !== null || busy} onClick={onComplete}>
          {busy ? t.completing : t.complete} <span className="num">· F12</span>
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onHold}>
            {t.hold}
          </Button>
          <Button variant="danger" size="lg" onClick={onClear}>
            {t.clear}
          </Button>
        </div>
      </div>
    </section>
  );
}
