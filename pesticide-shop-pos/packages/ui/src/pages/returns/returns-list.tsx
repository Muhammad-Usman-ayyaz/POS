import type { Api, ReturnDetailView, ReturnListRow } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { Num } from '../../components/ui/primitives.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { formatDate, formatMoney, useI18n } from '../../i18n/index.js';
import { lineName } from '../../print/format.js';
import { ReturnDetailBody } from './return-complete.js';

export const PAGE_SIZE = 25;

function ReturnDetailDialog({ api, row, onClose }: { api: Api; row: ReturnListRow; onClose: () => void }) {
  const { m } = useI18n();
  const [detail, setDetail] = useState<ReturnDetailView | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    api.returns.get({ return_id: row.id }).then(
      (d) => alive && setDetail(d),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [api, row.id]);
  return (
    <Dialog open title={m.returns.list.detailTitle(row.return_no)} onClose={onClose} className="max-w-[920px]">
      {error != null && <ErrorNotice error={error} className="mt-4" />}
      {detail === null && error == null && <p role="status" className="mt-4 text-muted">{m.returns.loading}</p>}
      {detail && <ReturnDetailBody api={api} detail={detail} />}
      <div className="mt-3 flex justify-end">
        <Button onClick={onClose}>{m.returns.list.close}</Button>
      </div>
    </Dialog>
  );
}

/** Past returns, newest first, found by credit note number, invoice number, customer (English or Urdu) or phone. A row opens the return. */
export function ReturnsList({ api }: { api: Api }) {
  const { m, language } = useI18n();
  const t = m.returns.list;
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReturnListRow | null>(null);
  const run = useCallback((q: string) => api.returns.list({ ...(q.trim() ? { query: q.trim() } : {}), limit: PAGE_SIZE, offset }), [api, offset]);
  const search = useDebouncedSearch(run, query);
  const list = search.data;
  const rows = list?.rows ?? [];
  const total = list?.total ?? 0;

  return (
    <div data-returns-list>
      <div className="relative mb-4 max-w-xl">
        <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
        <Input
          type="search"
          aria-label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
          className="ps-12"
        />
      </div>
      {search.error != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={search.error} className="max-w-xl" />
          <Button variant="secondary" onClick={search.refresh}>
            {m.returns.retry}
          </Button>
        </div>
      )}
      <div aria-busy={search.loading} className={cn(search.loading && list && 'opacity-70')}>
        {list === null ? (
          search.error == null && <p role="status" className="text-muted">{m.returns.loading}</p>
        ) : rows.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-lg border border-line bg-card p-8 text-center shadow-card">
            <div>
              <p className="text-xl font-semibold">{query.trim() ? t.noMatch : t.empty}</p>
              {!query.trim() && <p className="mt-2 text-muted">{t.emptyHint}</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
              <table className="w-full border-collapse">
                <thead className="bg-thead text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-6 py-3 text-start">{t.colNo}</th>
                    <th className="px-4 py-3 text-start">{t.colDate}</th>
                    <th className="px-4 py-3 text-start">{t.colInvoice}</th>
                    <th className="px-4 py-3 text-start">{t.colCustomer}</th>
                    <th className="px-4 py-3 text-end">{t.colRefund}</th>
                    <th className="px-4 py-3 text-start">{t.colPaidBack}</th>
                    <th className="px-4 py-3 text-start">{t.colBy}</th>
                    <th className="px-6 py-3 text-start">{t.colPrinted}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} data-return-row={row.return_no} className="border-t border-row-line hover:bg-row-hover">
                      <td className="px-6 py-3">
                        <button type="button" aria-label={t.open(row.return_no)} onClick={() => setSelected(row)} className="num min-h-11 font-semibold text-accent underline-offset-4 hover:underline">
                          {row.return_no}
                        </button>
                      </td>
                      <td className="num px-4 py-3">{formatDate(row.return_date, language)}</td>
                      <td className="num px-4 py-3">{row.invoice_no}</td>
                      <td className="px-4 py-3">{lineName({ name_en: row.customer_name_en, name_ur: row.customer_name_ur }, language) || <span className="text-muted">{m.returns.walkIn}</span>}</td>
                      <td className="num px-4 py-3 text-end font-semibold">{formatMoney(row.total, language)}</td>
                      <td className="px-4 py-3">
                        {row.cash_amount > 0 && <span className="num me-2">{`${t.cash} ${formatMoney(row.cash_amount, language)}`}</span>}
                        {row.khata_amount > 0 && <span className="num">{`${t.khata} ${formatMoney(row.khata_amount, language)}`}</span>}
                      </td>
                      <td className="px-4 py-3">{row.requested_by ?? row.approved_by}</td>
                      <td className="px-6 py-3 text-sm text-muted">{t.printedTimes(row.print_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted">
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
      {selected && <ReturnDetailDialog api={api} row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
