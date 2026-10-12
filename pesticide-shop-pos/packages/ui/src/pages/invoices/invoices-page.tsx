import type { Api, InvoiceListRow, SessionUser } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { DateField } from '../../components/ui/date-field.js';
import { Input } from '../../components/ui/input.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { formatDateTime, lineName } from '../../print/format.js';
import { InvoiceDetailDialog } from './invoice-detail.js';
import { buildListRequest, PAGE_SIZE, type StatusFilter } from './invoices-requests.js';
import { SHOP_TIME_ZONE } from './time-zone.js';

export { PAGE_SIZE, type StatusFilter };

/** The look of the From / To boxes: the same 56px box as the search field beside them (48px in a short window). */
const DATE_BOX = 'h-14 w-44 rounded-lg border-field-line px-4 text-lg font-normal text-ink [@media(max-height:800px)]:h-12';

/**
 * Invoice history: every sale, newest first, found by invoice number, customer (English or Urdu) or phone, narrowed by date and status.
 * Staff and owner see the same screen (nothing here carries cost). A row opens the sale, where it can be printed again or saved as a PDF.
 */
export function InvoicesPage({ api }: { api: Api; user: SessionUser }) {
  const { m, language } = useI18n();
  const t = m.invoices;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<InvoiceListRow | null>(null);

  const run = useCallback(
    (q: string) => api.invoices.list(buildListRequest({ query: q, status, from, to, offset })),
    [api, from, to, status, offset],
  );
  const search = useDebouncedSearch(run, query);
  const list = search.data;
  const rows = list?.rows ?? [];
  const total = list?.total ?? 0;
  const narrowed = query.trim() !== '' || status !== 'all' || from !== '' || to !== '';

  // Any change of the search or a filter goes back to the first page.
  const onQuery = (v: string) => {
    setQuery(v);
    setOffset(0);
  };
  const onStatus = (v: StatusFilter) => {
    setStatus(v);
    setOffset(0);
  };
  const onFrom = (v: string) => {
    setFrom(v);
    setOffset(0);
  };
  const onTo = (v: string) => {
    setTo(v);
    setOffset(0);
  };
  const clearFilters = () => {
    setQuery('');
    setStatus('all');
    setFrom('');
    setTo('');
    setOffset(0);
  };
  const shown = selected ? (rows.find((r) => r.id === selected.id) ?? selected) : null;

  const statuses: { key: StatusFilter; text: string }[] = [
    { key: 'all', text: t.statusAll },
    { key: 'active', text: t.statusActive },
    { key: 'voided', text: t.statusVoided },
  ];

  return (
    <div data-page="invoices">
      <header className="stagger mb-6">
        <h1 className="text-[32px] font-bold leading-tight">{m.pages.invoices.title}</h1>
        <p className="mt-1 text-base text-muted">{m.pages.invoices.subtitle}</p>
      </header>

      <div className="stagger mb-4 flex flex-wrap items-end gap-3" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="relative min-w-[16rem] max-w-xl flex-1">
          <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
          <Input type="search" aria-label={t.searchLabel} placeholder={t.searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} className="ps-12" />
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t.from}
          <DateField name="from" label={t.from} value={from} max={to || undefined} onChange={onFrom} placeholder={t.anyDate} className={DATE_BOX} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t.to}
          <DateField name="to" label={t.to} value={to} min={from || undefined} onChange={onTo} placeholder={t.anyDate} className={DATE_BOX} />
        </label>
        <div role="group" aria-label={t.statusLabel} className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={status === s.key}
              onClick={() => onStatus(s.key)}
              className={cn('lift min-h-11 rounded-full border px-4 text-base font-medium', status === s.key ? 'border-accent bg-tint text-accent-dark' : 'border-line bg-card text-ink hover:bg-row-hover')}
            >
              {s.text}
            </button>
          ))}
        </div>
      </div>

      {search.error != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={search.error} className="max-w-xl" />
          <Button variant="secondary" onClick={search.refresh}>
            {t.retry}
          </Button>
        </div>
      )}

      <div aria-busy={search.loading} className={cn(search.loading && list && 'opacity-70')}>
        {list === null ? (
          search.error == null && <LoadingRows label={t.loading} />
        ) : rows.length === 0 ? (
          <EmptyState narrowed={narrowed} onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
              <table className="w-full border-collapse">
                <thead className="bg-thead text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-6 py-3 text-start">{t.colNo}</th>
                    <th className="px-4 py-3 text-start">{t.colDate}</th>
                    <th className="px-4 py-3 text-start">{t.colCustomer}</th>
                    <th className="px-4 py-3 text-end">{t.colTotal}</th>
                    <th className="px-4 py-3 text-end">{t.colPaid}</th>
                    <th className="px-4 py-3 text-end">{t.colKhata}</th>
                    <th className="px-4 py-3 text-start">{t.colMethod}</th>
                    <th className="px-4 py-3 text-start">{t.colSoldBy}</th>
                    <th className="px-6 py-3 text-start">{t.colPrinted}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} data-invoice-row={row.invoice_no} className="stagger border-t border-row-line hover:bg-row-hover" style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
                      <td className="px-6 py-3">
                        <button type="button" aria-label={t.openLabel(row.invoice_no)} onClick={() => setSelected(row)} className="num min-h-11 font-semibold text-accent underline-offset-4 hover:underline">
                          {row.invoice_no}
                        </button>
                        {row.status === 'voided' && (
                          <Badge tone="danger" className="ms-2">
                            {t.voided}
                          </Badge>
                        )}
                      </td>
                      <td className="num px-4 py-3">{formatDateTime(row.invoice_date, SHOP_TIME_ZONE)}</td>
                      <td className="px-4 py-3">{customerName(row, language) ?? <span className="text-muted">{t.walkIn}</span>}</td>
                      <td className="num px-4 py-3 text-end font-semibold">{formatMoney(row.total, language)}</td>
                      <td className="num px-4 py-3 text-end">{formatMoney(row.paid_amount, language)}</td>
                      <td className="num px-4 py-3 text-end">{row.on_khata > 0 ? formatMoney(row.on_khata, language) : '—'}</td>
                      <td className="px-4 py-3">{m.pos.bill.methods[row.payment_method]}</td>
                      <td className="px-4 py-3">{row.sold_by}</td>
                      <td data-printed className="px-6 py-3 text-sm text-muted">
                        {t.printedTimes(row.print_count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p data-range className="text-muted">
                <Num>{t.showing(offset + 1, offset + rows.length, total)}</Num>
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  {t.previous}
                </Button>
                <Button variant="secondary" disabled={offset + rows.length >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  {t.next}
                </Button>
              </div>
            </nav>
          </>
        )}
      </div>

      {shown && <InvoiceDetailDialog api={api} row={shown} onClose={() => setSelected(null)} onPrinted={search.refresh} />}
    </div>
  );
}

const customerName = (row: InvoiceListRow, language: 'en' | 'ur'): string | null => {
  const text = lineName({ name_en: row.customer_name_en, name_ur: row.customer_name_ur }, language);
  return text === '' ? null : text;
};

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
      <p className="sr-only">{label}</p>
      <div className="h-12 bg-thead" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} data-skeleton className="stagger flex items-center gap-6 border-t border-row-line px-6 py-5" style={{ '--i': i } as React.CSSProperties}>
          <div className="h-5 w-1/6 rounded bg-row-line" />
          <div className="h-5 w-1/6 rounded bg-row-line" />
          <div className="h-5 w-1/4 rounded bg-row-line" />
          <div className="h-5 w-1/12 rounded bg-row-line" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ narrowed, onClear }: { narrowed: boolean; onClear: () => void }) {
  const { m } = useI18n();
  const t = m.invoices;
  return (
    <div className="stagger grid min-h-[280px] place-items-center rounded-lg border border-line bg-card p-8 text-center shadow-card">
      <div className="max-w-md">
        <p className="text-xl font-semibold">{narrowed ? t.noMatchTitle : t.emptyTitle}</p>
        <p className="mt-2 text-muted">{narrowed ? t.noMatchHint : t.emptyHint}</p>
        {narrowed && (
          <Button variant="secondary" className="mt-5" onClick={onClear}>
            {t.clearFilters}
          </Button>
        )}
      </div>
    </div>
  );
}
