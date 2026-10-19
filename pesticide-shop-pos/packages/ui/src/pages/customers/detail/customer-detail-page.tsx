import { ApiError, type Api, type CustomerSummaryView, type SessionUser, type StatementView } from '@pos/api-contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorNotice, Notice } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Badge, Num } from '../../../components/ui/primitives.js';
import { formatDate, formatMoney, ltr, useI18n } from '../../../i18n/index.js';
import { cn } from '../../../lib/cn.js';
import { formatDateTime } from '../../../print/format.js';
import { SHOP_TIME_ZONE } from '../../invoices/time-zone.js';
import { Chip } from '../../pos/counter-ui.js';
import { CustomerOpeningDialog } from '../opening/customer-opening-dialog.js';
import { CustomerPaymentDialog, type PaymentResult } from '../payment/customer-payment-dialog.js';
import { balanceView, creditChipKind, lastLines, nameFor, pillOf, type StatementLineView } from './customer-detail-state.js';

/**
 * The customer page, `/customers/:id` (design: the right-hand pane of `Customer Khata.png`, as a full page): name and village, the balance,
 * credit and next-due cards, the last ten Khata lines (from `khata:statement`, with the shell's running balance), and the buttons.
 * Everything shown comes from the shell. Receive payment is for staff and owner; Opening balance is the owner's. `receiptActions` (shown in
 * the saved-payment box) and `statementActions` (beside the buttons) are slots the app fills with the print buttons.
 */
export function CustomerDetailPage({
  api,
  user,
  receiptActions,
  statementActions,
}: {
  api: Api;
  user: SessionUser;
  receiptActions?: (result: PaymentResult) => ReactNode;
  statementActions?: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  // One page per customer: another customer never keeps the last one's dialogs or data.
  return <Detail key={id ?? ''} api={api} owner={user.role === 'owner'} customerId={id ?? ''} receiptActions={receiptActions} statementActions={statementActions} />;
}

function Detail({ api, owner, customerId, receiptActions, statementActions }: { api: Api; owner: boolean; customerId: string; receiptActions: ((r: PaymentResult) => ReactNode) | undefined; statementActions: ReactNode }) {
  const { m, language, dir } = useI18n();
  const t = m.customerDetail;
  const [summary, setSummary] = useState<CustomerSummaryView | null>(null);
  const [statement, setStatement] = useState<StatementView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<'payment' | 'opening' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, st] = await Promise.all([api.customers.get({ customer_id: customerId }), api.khata.statement({ customer_id: customerId })]);
      setSummary(s);
      setStatement(st);
    } catch (e) {
      setError(e);
    }
  }, [api, customerId]);
  useEffect(() => void load(), [load]);

  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const backLink = (
    <Link to="/customers" className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
      <Back aria-hidden className="size-4" />
      {t.back}
    </Link>
  );

  if (error != null && summary === null) {
    const gone = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <div data-page="customer-detail">
        {backLink}
        <div className="flex flex-wrap items-start gap-3">
          {gone ? <Notice title={t.notFound} className="max-w-xl" /> : <ErrorNotice error={error} className="max-w-xl" />}
          {!gone && (
            <Button variant="secondary" onClick={() => void load()}>
              {t.retry}
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (summary === null) {
    return (
      <div data-page="customer-detail">
        {backLink}
        <p role="status" className="stagger text-lg text-muted">
          {t.loading}
        </p>
      </div>
    );
  }

  const c = summary.customer;
  const name = nameFor(c, language) || t.unnamed;
  const money = (n: number) => formatMoney(n, language);
  const bal = balanceView(summary.balance);
  const credit = creditChipKind(summary);
  const days = language === 'ur' ? ltr(String(summary.overdue_days)) : String(summary.overdue_days);
  const balanceText = bal.kind === 'owes' ? t.owes(money(bal.amount)) : bal.kind === 'advance' ? t.advance(money(bal.amount)) : t.clear;
  const lines = statement ? lastLines(statement.lines) : [];

  return (
    <div data-page="customer-detail">
      {backLink}
      <header className="stagger mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 data-customer-name className="text-[32px] font-bold leading-tight">
            {name}
          </h1>
          <p className="mt-1 text-base text-muted">
            {[c.village?.trim(), c.default_price_type === 'wholesale' ? t.wholesalePrice : t.retailPrice].filter(Boolean).join(' · ')}
            {c.phone?.trim() && (
              <>
                {' · '}
                <Num>{c.phone.trim()}</Num>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary">
            <Link to={`/customers/${c.id}/edit`}>{t.edit}</Link>
          </Button>
          {statementActions}
          {owner && (
            <Button variant="secondary" data-action="opening-balance" onClick={() => setDialog('opening')}>
              {t.openingBalance}
            </Button>
          )}
          <Button data-action="receive-payment" onClick={() => setDialog('payment')}>
            {t.receivePayment}
          </Button>
        </div>
      </header>

      {error != null && <ErrorNotice error={error} className="mb-4 max-w-3xl" />}

      <div className="stagger mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ '--i': 1 } as React.CSSProperties}>
        <Card label={t.owesNow} card="balance">
          <p data-balance={bal.kind} className={cn('num text-2xl font-bold', bal.kind === 'advance' ? 'text-accent' : 'text-ink')}>
            {balanceText}
          </p>
          {summary.overdue_amount > 0 && (
            <Badge data-chip="overdue" tone="danger" className="mt-2">
              {t.overdueChip(money(summary.overdue_amount), days, summary.overdue_days)}
            </Badge>
          )}
        </Card>
        <Card label={t.creditLimit} card="limit">
          {credit === 'no_limit' ? (
            <Badge data-chip="no-limit" tone="warning" pulse>
              {t.noLimit}
            </Badge>
          ) : (
            <p className="num text-2xl font-bold">{money(c.credit_limit)}</p>
          )}
        </Card>
        <Card label={t.creditLeft} card="left">
          {credit === 'no_limit' ? (
            <Badge tone="warning" pulse>
              {t.noLimit}
            </Badge>
          ) : credit === 'over_limit' ? (
            <Badge data-chip="over-limit" tone="danger">
              {t.overLimit}
            </Badge>
          ) : (
            <p data-chip="credit-left" className="num text-2xl font-bold">
              {summary.credit_left != null ? money(summary.credit_left) : t.none}
            </p>
          )}
        </Card>
        <Card label={t.nextDue} card="due">
          <p data-next-due className="num text-2xl font-bold">
            {summary.next_due ? (language === 'ur' ? ltr(formatDate(summary.next_due, language)) : formatDate(summary.next_due, language)) : t.none}
          </p>
        </Card>
      </div>

      <section aria-label={t.ledgerLabel} className="stagger rounded-lg border border-line bg-card shadow-card" style={{ '--i': 2 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-xl font-bold">{t.ledgerTitle}</h2>
          <Link to={`/customers/${c.id}/statement`} className="inline-flex min-h-11 items-center font-semibold text-accent">
            {t.fullStatement}
          </Link>
        </div>
        {statement === null ? null : lines.length === 0 ? (
          <p data-ledger-empty className="px-5 py-8 text-center text-muted">
            {t.ledgerEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table data-ledger className="mt-3 w-full min-w-[640px] text-start">
              <thead className="bg-thead text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-start">{t.colDate}</th>
                  <th className="px-4 py-3 text-start">{t.colEntry}</th>
                  <th className="px-4 py-3 text-start">{t.colReference}</th>
                  <th className="px-4 py-3 text-end">{t.colMore}</th>
                  <th className="px-4 py-3 text-end">{t.colLess}</th>
                  <th className="px-4 py-3 text-end">{t.colBalance}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <LedgerRow key={line.entry?.id ?? `b${i}`} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-row-line bg-thead px-5 py-3 text-sm text-muted">{t.ledgerNote}</p>
      </section>

      {dialog === 'payment' && (
        <CustomerPaymentDialog
          api={api}
          customerId={c.id}
          name={name}
          village={c.village}
          balance={summary.balance}
          onClose={() => setDialog(null)}
          onSaved={() => void load()}
          receiptActions={receiptActions}
        />
      )}
      {owner && dialog === 'opening' && <CustomerOpeningDialog api={api} customerId={c.id} name={name} onClose={() => setDialog(null)} onSaved={() => void load()} />}
    </div>
  );
}

function Card({ label, card, children }: { label: string; card: string; children: ReactNode }) {
  return (
    <div data-card={card} className="rounded-lg border border-line bg-card px-5 py-4 shadow-card">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  );
}

function LedgerRow({ line }: { line: StatementLineView }) {
  const { m, language } = useI18n();
  const t = m.customerDetail;
  const money = (n: number) => formatMoney(n, language);
  const pill = pillOf(line);
  const methodKey = line.payment_method ?? '';
  const methodText = t.methods[methodKey] ?? methodKey;
  const text =
    pill === 'opening' ? t.pillOpening : pill === 'sale' ? t.pillSale : pill === 'payment' ? t.pillPayment(methodText) : pill === 'return' ? t.pillReturn : pill === 'broughtForward' ? t.pillBroughtForward : t.pillAdjustment;
  const tone = pill === 'payment' || pill === 'return' ? 'ok' : 'neutral';
  const ref = line.invoice_no ?? line.return_no ?? line.receipt_no ?? line.reference_no ?? '';
  const b = balanceView(line.running_balance);
  const date = line.entry ? formatDateTime(line.entry.entry_date, SHOP_TIME_ZONE) : '';
  return (
    <tr data-ledger-row={pill} className="border-t border-row-line">
      <td className="num px-4 py-3 text-start">{date}</td>
      <td className="px-4 py-3 text-start">
        <Chip tone={tone} data-pill={pill}>
          {text}
        </Chip>
      </td>
      <td className="num px-4 py-3 text-start">{ref}</td>
      <td data-more className="num px-4 py-3 text-end">
        {line.kind === 'entry' && line.amount_delta > 0 ? money(line.amount_delta) : ''}
      </td>
      <td data-less className="num px-4 py-3 text-end">
        {line.kind === 'entry' && line.amount_delta < 0 ? money(-line.amount_delta) : ''}
      </td>
      <td data-running className="num px-4 py-3 text-end font-bold">
        {b.kind === 'advance' ? t.advance(money(b.amount)) : money(b.amount)}
      </td>
    </tr>
  );
}
