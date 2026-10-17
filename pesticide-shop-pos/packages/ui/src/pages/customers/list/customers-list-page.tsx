import type { Api, CustomerListView, Language, SessionUser } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Badge, Num } from '../../../components/ui/primitives.js';
import { cn } from '../../../lib/cn.js';
import { useDebouncedSearch } from '../../../lib/use-debounced-search.js';
import { formatDate, formatMoney, ltr } from '../../../i18n/format.js';
import { useI18n } from '../../../i18n/index.js';
import { buildListRequest, PAGE_SIZE, type CustomerFilter } from './customer-list-requests.js';
import { balanceView, creditChipKind, displayName, pageRange } from './customer-list-state.js';

type Row = CustomerListView['rows'][number];

/**
 * The customer list (design: `Customer Khata.png`, left pane): the shop-wide Total outstanding and Overdue cards, a search box, and one card
 * per customer with the balance. Every figure comes from `customers:list`; nothing is added up here. Staff and owner see the same screen.
 * A row opens the customer page (`/customers/:id`).
 */
export function CustomersListPage({ api }: { api: Api; user: SessionUser }) {
  const { m, language } = useI18n();
  const t = m.customersList;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>('all');
  const [offset, setOffset] = useState(0);

  const run = useCallback(
    (q: string) => api.customers.list(buildListRequest({ query: q, filter, sort: 'name', language, offset })),
    [api, filter, language, offset],
  );
  const search = useDebouncedSearch(run, query);
  const list = search.data;
  const rows = list?.rows ?? [];
  const totals = list?.totals;
  const narrowed = query.trim() !== '' || filter !== 'all';

  // Any change of the search or the filter goes back to the first page.
  const onQuery = (v: string) => {
    setQuery(v);
    setOffset(0);
  };
  const onFilter = (v: CustomerFilter) => {
    setFilter(v);
    setOffset(0);
  };
  const clearFilters = () => {
    setQuery('');
    setFilter('all');
    setOffset(0);
  };

  const filters: { key: CustomerFilter; text: string }[] = [
    { key: 'all', text: t.filterAll },
    { key: 'owes', text: t.filterOwes },
    { key: 'overdue', text: t.filterOverdue },
    { key: 'advance', text: t.filterAdvance },
  ];

  return (
    <div data-page="customers">
      <header className="stagger mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] font-bold leading-tight">{t.title}</h1>
        <Button asChild size="lg">
          <Link to="/customers/new">{t.addCustomer}</Link>
        </Button>
      </header>

      <div className="mx-auto max-w-3xl">
        <div className="stagger mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ '--i': 1 } as React.CSSProperties}>
          <div data-card="outstanding" className="rounded-lg border border-line bg-card px-5 py-4 shadow-card">
            <p className="text-sm text-muted">{t.totalOutstanding}</p>
            <p data-value className="num mt-1 text-2xl font-bold">
              {totals ? formatMoney(totals.total_outstanding, language) : '—'}
            </p>
          </div>
          <div data-card="overdue" className="rounded-lg bg-warn-bg px-5 py-4">
            <p className="text-sm text-warn-ink">{t.overdue}</p>
            <p data-value className="num mt-1 text-2xl font-bold text-warn-ink">
              {totals ? formatMoney(totals.overdue_total, language) : '—'}
            </p>
          </div>
        </div>

        <div className="stagger mb-3" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
            <Input type="search" aria-label={t.searchLabel} placeholder={t.searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} className="ps-12" />
          </div>
        </div>

        <div role="group" aria-label={t.filterLabel} className="stagger mb-4 flex flex-wrap items-center gap-2" style={{ '--i': 3 } as React.CSSProperties}>
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => onFilter(f.key)}
              className={cn('lift min-h-11 rounded-full border px-4 text-base font-medium', filter === f.key ? 'border-accent bg-tint text-accent-dark' : 'border-line bg-card text-ink hover:bg-row-hover')}
            >
              {f.text}
            </button>
          ))}
          {totals && (
            <span data-count className="ms-auto text-sm text-muted">
              {t.count(totals.count)}
            </span>
          )}
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
              <ul className="flex flex-col gap-3">
                {rows.map((row, i) => (
                  <CustomerRow key={row.customer.id} row={row} language={language} index={i} />
                ))}
              </ul>
              <nav className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <RangeText offset={offset} count={rows.length} total={list.totals.count} />
                <div className="flex gap-3">
                  <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                    {t.previous}
                  </Button>
                  <Button variant="secondary" disabled={offset + rows.length >= list.totals.count} onClick={() => setOffset(offset + PAGE_SIZE)}>
                    {t.next}
                  </Button>
                </div>
              </nav>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RangeText({ offset, count, total }: { offset: number; count: number; total: number }) {
  const { m } = useI18n();
  const r = pageRange(offset, count, total);
  return (
    <p data-range className="text-muted">
      <Num>{m.customersList.showing(r.from, r.to, r.total)}</Num>
    </p>
  );
}

function CustomerRow({ row, language, index }: { row: Row; language: Language; index: number }) {
  const { m } = useI18n();
  const t = m.customersList;
  const name = displayName(row.customer, language) || t.unnamed;
  const bal = balanceView(row.balance);
  const credit = creditChipKind(row);
  const village = row.customer.village?.trim();
  const phone = row.customer.phone?.trim();
  const money = (n: number) => formatMoney(n, language);
  const days = language === 'ur' ? ltr(String(row.overdue_days)) : String(row.overdue_days);
  const balanceText = bal.kind === 'owes' ? t.owes(money(bal.amount)) : bal.kind === 'advance' ? t.advance(money(bal.amount)) : money(0);

  return (
    <li className="stagger" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
      <Link
        to={`/customers/${row.customer.id}`}
        aria-label={t.openLabel(name)}
        data-customer-row={row.customer.id}
        className="lift flex min-h-11 flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-card px-4 py-3 shadow-card hover:bg-row-hover"
      >
        <span className="flex min-w-0 flex-col">
          <span data-name className="text-lg font-semibold text-ink">
            {name}
          </span>
          {(village || phone) && (
            <span className="text-sm text-muted">
              {village}
              {village && phone && ' · '}
              {phone && <Num>{phone}</Num>}
            </span>
          )}
        </span>
        <span className="flex flex-col items-end gap-1.5">
          <span data-balance={bal.kind} className={cn('text-base font-bold', bal.kind === 'advance' ? 'text-accent' : 'text-ink')}>
            {balanceText}
          </span>
          <span className="flex flex-wrap justify-end gap-1.5">
            {credit === 'no_limit' && (
              <Badge data-chip="no-limit" tone="warning" pulse>
                {t.noLimit}
              </Badge>
            )}
            {credit === 'over_limit' && (
              <Badge data-chip="over-limit" tone="danger">
                {t.overLimit}
              </Badge>
            )}
            {credit === 'left' && row.credit_left != null && (
              <Badge data-chip="credit-left" tone="neutral">
                {t.creditLeft(money(row.credit_left))}
              </Badge>
            )}
            {row.overdue_amount > 0 && (
              <Badge data-chip="overdue" tone="danger">
                {t.overdueChip(money(row.overdue_amount), days, row.overdue_days)}
              </Badge>
            )}
          </span>
          {row.next_due && (
            <span data-next-due className="text-sm text-muted">
              {t.nextDue(language === 'ur' ? ltr(formatDate(row.next_due, language)) : formatDate(row.next_due, language))}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="sr-only">{label}</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} data-skeleton className="stagger h-20 rounded-lg border border-line bg-card shadow-card" style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
}

function EmptyState({ narrowed, onClear }: { narrowed: boolean; onClear: () => void }) {
  const { m } = useI18n();
  const t = m.customersList;
  return (
    <div className="stagger grid min-h-[240px] place-items-center rounded-lg border border-line bg-card p-8 text-center shadow-card">
      <div className="max-w-md">
        <p className="text-xl font-semibold">{narrowed ? t.noMatchTitle : t.emptyTitle}</p>
        <p className="mt-2 text-muted">{narrowed ? t.noMatchHint : t.emptyHint}</p>
        {narrowed ? (
          <Button variant="secondary" className="mt-5" onClick={onClear}>
            {t.clearFilters}
          </Button>
        ) : (
          <Button asChild className="mt-5">
            <Link to="/customers/new">{t.addCustomer}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
