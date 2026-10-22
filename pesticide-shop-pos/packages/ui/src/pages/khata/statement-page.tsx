import type { Api, CustomerSummaryView, SessionUser, StatementView } from '@pos/api-contract';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { DateField } from '../../components/ui/date-field.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { cn } from '../../lib/cn.js';
import { formatDate, formatMoney, ltr } from '../../i18n/format.js';
import { useI18n, type Messages } from '../../i18n/index.js';
import { displayName } from '../customers/list/customer-list-state.js';
import { SHOP_TIME_ZONE } from '../invoices/time-zone.js';
import { BalanceOnDate } from './balance-on-date.js';
import { StatementPrintActions } from './print-actions.js';
import { uiNow } from '../../lib/clock.js';
import { buildStatementRequest, last30Range, thisMonthRange, todayIn } from './statement-requests.js';

type Line = StatementView['lines'][number];

/** "01 Oct 2026" of a stored UTC moment, in the shop's zone (the invoice screens' zone). Latin digits and English months in both languages, as in the designs. */
function entryDay(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(isoUtc));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return formatDate(`${get('year')}-${get('month')}-${get('day')}`, 'en').replace(/^(\d) /, '0$1 ');
}

/** The type pill: Opening balance / Sale / Payment · Cash / Return credit / Adjustment. */
function typeText(line: Line, t: Messages['statement']): string {
  if (line.kind === 'brought_forward') return t.broughtForward;
  const base = t.types[line.label as keyof typeof t.types];
  const method = line.payment_method as keyof typeof t.methods | null;
  return line.label === 'payment' && method && method in t.methods ? `${base} · ${t.methods[method]}` : base;
}

const pillTone = (line: Line): 'success' | 'warning' | 'neutral' | 'danger' =>
  line.label === 'payment' ? 'success' : line.label === 'return' ? 'warning' : line.label === 'adjustment' ? 'danger' : 'neutral';

/** The number a line is filed under: invoice, return, or a payment's own reference (bank, wallet) or receipt number, as in the design. */
const referenceOf = (line: Line): string => line.invoice_no ?? line.return_no ?? (line.reference_no || line.receipt_no || '');

/**
 * The customer statement (docs/design/CustomerForms.dc.html section 4, screen). Every figure is the shell's: `khata:statement` gives each running
 * balance, the brought-forward line, the totals and the closing balance; `customers:get` gives the current balance and the credit figures. Nothing is
 * added up or subtracted here. A negative balance is worded "Advance Rs X", never "Owes Rs -X".
 */
export function StatementPage({ api }: { api: Api; user: SessionUser }) {
  const { id } = useParams<{ id: string }>();
  const { m, language } = useI18n();
  const t = m.statement;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statement, setStatement] = useState<StatementView | null>(null);
  const [summary, setSummary] = useState<CustomerSummaryView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const rangeBad = from !== '' && to !== '' && from > to;

  useEffect(() => {
    if (!id || rangeBad) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([api.khata.statement(buildStatementRequest(id, from, to)), api.customers.get({ customer_id: id })]).then(
      ([s, c]) => {
        if (!alive) return;
        setStatement(s);
        setSummary(c);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setError(e);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [api, id, from, to, rangeBad, attempt]);

  const quick = useCallback(
    (which: 'month' | '30' | 'all') => {
      const today = todayIn(SHOP_TIME_ZONE, uiNow());
      const r = which === 'month' ? thisMonthRange(today) : which === '30' ? last30Range(today) : { from: '', to: '' };
      setFrom(r.from);
      setTo(r.to);
    },
    [],
  );

  const money = (n: number) => formatMoney(n, language);
  const balanceText = (n: number): string => (n < 0 ? t.advance(money(-n)) : money(n));
  const name = summary ? displayName(summary.customer, language) || t.unnamed : '';
  const otherName = summary ? (language === 'ur' ? summary.customer.name_en : summary.customer.name_ur)?.trim() : '';

  if (!id) return null;
  return (
    <div data-page="statement">
      <header className="stagger mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/customers/${id}`} className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            {t.back}
          </Link>
          <h1 className="text-[32px] font-bold leading-tight">{t.title}</h1>
          {summary && (
            <div className="mt-1">
              <p data-customer-name className="text-xl font-bold">
                {name}
                {otherName && name !== otherName && <span className="ms-3 text-lg font-semibold text-muted">{otherName}</span>}
              </p>
              <p className="text-sm text-muted">
                {summary.customer.village}
                {summary.customer.village && summary.customer.phone && ' · '}
                {summary.customer.phone && <Num>{summary.customer.phone}</Num>}
              </p>
              {summary.overdue_amount > 0 && (
                <Badge tone="warning" className="mt-2">
                  {m.customersList.overdueChip(money(summary.overdue_amount), language === 'ur' ? ltr(String(summary.overdue_days)) : String(summary.overdue_days), summary.overdue_days)}
                </Badge>
              )}
            </div>
          )}
        </div>
        <StatementPrintActions api={api} customerId={id} from={rangeBad ? '' : from} to={rangeBad ? '' : to} />
      </header>

      {summary && (
        <div className="stagger mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" style={{ '--i': 1 } as React.CSSProperties}>
          <div data-card="balance" className="rounded-lg border border-line bg-card px-5 py-4 shadow-card">
            <p className="text-sm font-semibold text-muted">{t.currentBalance}</p>
            <p data-value className="num mt-1 text-2xl font-bold">
              {balanceText(summary.balance)}
            </p>
          </div>
          <div data-card="limit" className="rounded-lg border border-line bg-card px-5 py-4 shadow-card">
            <p className="text-sm font-semibold text-muted">{t.creditLimit}</p>
            <p data-value className="num mt-1 text-2xl font-bold">
              {summary.no_limit ? t.noLimit : money(summary.customer.credit_limit)}
            </p>
          </div>
          <div data-card="left" className="rounded-lg bg-warn-bg px-5 py-4">
            <p className="text-sm font-semibold text-warn-ink">{t.creditLeft}</p>
            <p data-value className="num mt-1 text-2xl font-bold text-warn-ink">
              {summary.credit_left === null ? t.noLimit : money(summary.credit_left)}
            </p>
          </div>
        </div>
      )}

      <section aria-label={t.rangeLabel} className="stagger mb-4 flex flex-wrap items-end gap-3" style={{ '--i': 2 } as React.CSSProperties}>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t.from}
          <DateField name="from" label={t.from} value={from} onChange={setFrom} className="h-12 w-44" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t.to}
          <DateField name="to" label={t.to} value={to} onChange={setTo} className="h-12 w-44" />
        </label>
        <div role="group" aria-label={t.quickLabel} className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" data-quick="month" onClick={() => quick('month')}>
            {t.thisMonth}
          </Button>
          <Button variant="secondary" size="sm" data-quick="30" onClick={() => quick('30')}>
            {t.last30}
          </Button>
          <Button variant="secondary" size="sm" data-quick="all" onClick={() => quick('all')}>
            {t.all}
          </Button>
        </div>
      </section>
      <div className="mb-4">
        <BalanceOnDate api={api} customerId={id} />
      </div>
      {rangeBad && (
        <p role="alert" data-range-error className="mb-4 text-sm font-semibold text-danger-ink">
          {t.rangeInvalid}
        </p>
      )}

      {error != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={error} className="max-w-xl" />
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            {t.retry}
          </Button>
        </div>
      )}

      <div aria-busy={loading} className={cn(loading && statement && 'opacity-70')}>
        {statement === null ? (
          error == null && !rangeBad && (
            <p data-loading role="status" className="stagger text-lg font-semibold text-muted">
              {t.loading}
            </p>
          )
        ) : statement.lines.length === 0 ? (
          <div data-empty className="rounded-lg border border-line bg-card px-6 py-10 text-center shadow-card">
            <p className="text-xl font-bold">{t.emptyTitle}</p>
            <p className="mt-1 text-muted">{t.emptyHint}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
              <table data-statement-table className="w-full min-w-[640px] border-collapse text-start">
                <thead className="bg-th text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">{t.colDate}</th>
                    <th className="px-4 py-3 text-start">{t.colType}</th>
                    <th className="px-4 py-3 text-start">{t.colReference}</th>
                    <th className="px-4 py-3 text-end">{t.colOwesMore}</th>
                    <th className="px-4 py-3 text-end">{t.colOwesLess}</th>
                    <th className="px-4 py-3 text-end">{t.colBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((line, i) => {
                    const brought = line.kind === 'brought_forward';
                    return (
                      <tr key={line.entry?.id ?? `bf-${i}`} data-line={line.kind} data-label={line.label} className="border-t border-line">
                        <td className="px-4 py-3">{line.entry ? <Num>{entryDay(line.entry.entry_date)}</Num> : ''}</td>
                        <td className="px-4 py-3">
                          <Badge tone={brought ? 'neutral' : pillTone(line)}>{typeText(line, t)}</Badge>
                          {line.note && <span className="ms-2 text-sm text-muted">{line.note}</span>}
                        </td>
                        <td className="px-4 py-3">{referenceOf(line) && <Num>{referenceOf(line)}</Num>}</td>
                        <td data-col="more" className="px-4 py-3 text-end">{!brought && line.amount_delta > 0 ? <Num>{money(line.amount_delta)}</Num> : ''}</td>
                        <td data-col="less" className="px-4 py-3 text-end">{!brought && line.amount_delta < 0 ? <Num>{money(-line.amount_delta)}</Num> : ''}</td>
                        <td data-col="balance" className="px-4 py-3 text-end font-bold"><Num>{balanceText(line.running_balance)}</Num></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr data-totals className="border-t-2 border-ink bg-th font-bold">
                    <td className="px-4 py-3" colSpan={3}>{t.totals}</td>
                    <td data-total="more" className="px-4 py-3 text-end"><Num>{money(statement.totals.owes_more)}</Num></td>
                    <td data-total="less" className="px-4 py-3 text-end"><Num>{money(statement.totals.owes_less)}</Num></td>
                    <td data-total="closing" className="px-4 py-3 text-end"><Num>{balanceText(statement.closing_balance)}</Num></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div data-closing={statement.closing_balance > 0 ? 'owes' : statement.closing_balance < 0 ? 'advance' : 'clear'} className="mt-4 flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-line bg-card px-5 py-4 shadow-card">
              <span className="text-lg font-semibold">{t.closing}</span>
              <span data-closing-value className="text-2xl font-bold text-accent-dark">
                {statement.closing_balance > 0 ? <>{t.heOwes} <Num>{money(statement.closing_balance)}</Num></> : statement.closing_balance < 0 ? t.advance(money(-statement.closing_balance)) : t.clear}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">{t.legend}</p>
          </>
        )}
      </div>
    </div>
  );
}
