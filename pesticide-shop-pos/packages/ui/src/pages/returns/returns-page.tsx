import type { Api, InvoiceForReturnView, InvoiceListRow, ReturnPreviewView, SessionUser } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorNotice, Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { formatDate, formatMoney, useI18n } from '../../i18n/index.js';
import { customerText, lineName } from '../../print/format.js';
import { RefundSummary } from './refund-summary.js';
import { ReturnApprovalDialog } from './return-approval-dialog.js';
import { ReturnComplete } from './return-complete.js';
import { ReturnLines } from './return-lines.js';
import { ReturnsList } from './returns-list.js';
import { createRequest, emptyDraft, previewRequest, readiness, returnedState, type Condition, type Draft, type DraftLine } from './returns-state.js';
import { VoidCard } from './void-card.js';

type Tab = 'new' | 'list';

/**
 * Returns: find a sale, pick what comes back (in each line's own unit), say why and whether it can be sold again, see the refund the core worked out,
 * and complete it. The owner completes it directly; staff start it and the owner approves it in a box (their own password, one use). Voiding a whole
 * invoice is on the same page, for the owner. Built from docs/design/Returns.dc.html; what the design lacks is in docs/decisions.md.
 */
export function ReturnsPage({ api, user }: { api: Api; user: SessionUser }) {
  const { m, language } = useI18n();
  const t = m.returns;
  const isOwner = user.role === 'owner';
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('new');
  const [query, setQuery] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(params.get('invoice'));
  const [view, setView] = useState<InvoiceForReturnView | null>(null);
  const [viewError, setViewError] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<ReturnPreviewView | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [madeId, setMadeId] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, language);

  // ---- the sale ----
  const loadView = useCallback(
    async (id: string) => {
      setViewError(null);
      try {
        const loaded = await api.returns.forInvoice({ invoice_id: id });
        setView(loaded);
        setDraft(emptyDraft(loaded));
        setPreview(null);
        setNote('');
      } catch (e) {
        setView(null);
        setViewError(e);
      }
    },
    [api],
  );
  useEffect(() => {
    if (invoiceId) void loadView(invoiceId);
    else setView(null);
  }, [invoiceId, loadView]);

  const choose = (id: string) => {
    setMadeId(null);
    setError(null);
    setInvoiceId(id);
    setParams(id ? { invoice: id } : {}, { replace: true });
  };

  // ---- the core's numbers, asked again (after a short pause) whenever the draft changes ----
  const sequence = useRef(0);
  useEffect(() => {
    if (!view) return;
    const request = previewRequest(view, draft);
    const mine = ++sequence.current;
    if (!request) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      api.returns.preview(request).then(
        (p) => {
          if (mine !== sequence.current) return;
          setPreview(p);
          setPreviewError(null);
        },
        (e: unknown) => {
          if (mine !== sequence.current) return;
          setPreview(null);
          setPreviewError(e);
        },
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [api, view, draft]);

  const change = (id: string, patch: Partial<DraftLine>) => setDraft((d) => ({ ...d, [id]: { ...(d[id] as DraftLine), ...patch } }));
  const refunds = new Map((preview?.lines ?? []).map((l) => [l.invoice_item_id, l.refund_amount]));
  const state = view ? readiness(view, draft, preview) : ({ ok: false, why: 'nothing' } as const);

  const finish = async (token?: string) => {
    if (!view) return;
    const request = createRequest(view, draft, note, token);
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api.salesReturn.create(request);
      setAsking(false);
      setMadeId(made.sales_return.id);
      if (invoiceId) void loadView(invoiceId);
    } catch (e) {
      setAsking(false);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const status = view ? (view.invoice.status === 'voided' ? 'voided' : returnedState(view)) : null;

  return (
    <div data-page="returns">
      <header className="stagger mb-6">
        <h1 className="text-[32px] font-bold leading-tight">{m.pages.returns.title}</h1>
        <p className="mt-1 text-base text-muted">{m.pages.returns.subtitle}</p>
      </header>

      <div role="tablist" aria-label={m.pages.returns.title} className="mb-5 flex gap-2">
        {(['new', 'list'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn('lift min-h-11 rounded-full border px-5 text-base font-medium', tab === key ? 'border-accent bg-tint text-accent-dark' : 'border-line bg-card hover:bg-row-hover')}
          >
            {key === 'new' ? t.tabNew : t.tabList}
          </button>
        ))}
      </div>

      {tab === 'list' ? (
        <ReturnsList api={api} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="flex min-w-0 flex-col gap-6">
            <FindInvoice api={api} query={query} onQuery={setQuery} selectedId={invoiceId} onChoose={(row) => choose(row.id)} />

            {viewError != null && (
              <div className="flex flex-wrap items-start gap-3">
                <ErrorNotice error={viewError} className="max-w-xl" />
                {invoiceId && (
                  <Button variant="secondary" onClick={() => void loadView(invoiceId)}>
                    {t.retry}
                  </Button>
                )}
              </div>
            )}

            {view && madeId === null && (
              <section data-invoice-card className="min-w-0 rounded-lg border border-line bg-card p-6 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">
                      <Num>{t.invoiceTitle(view.invoice.invoice_no)}</Num>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {t.meta(
                        customerText(view, language) ?? t.walkIn,
                        formatDate(view.invoice.invoice_date.slice(0, 10), language),
                        money(view.invoice.total),
                        view.invoice.tax_total > 0 ? t.taxIncluded(money(view.invoice.tax_total)) : '',
                      )}
                    </p>
                  </div>
                  <Badge data-status-chip={status} tone={status === 'voided' ? 'danger' : status === 'none' ? 'success' : 'warning'}>
                    {status === 'voided' ? t.chipVoided : status === 'none' ? t.chipNone : status === 'some' ? t.chipSome : t.chipAll}
                  </Badge>
                </div>
                {view.invoice.status === 'voided' && (
                  <div className="mt-4" data-voided-banner>
                    <Notice tone="warning" title={t.voidedBanner(view.invoice.void_reason ?? '')} />
                  </div>
                )}
                <div className="mt-4">
                  <ReturnLines view={view} draft={draft} refunds={refunds} canChooseCondition={isOwner} onChange={change} />
                </div>
                {view.invoice.status === 'active' && (
                  <div className="mt-4 max-w-xl">
                    <label htmlFor="return-note" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
                      {t.noteLabel}
                    </label>
                    <Input id="return-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
                  </div>
                )}
              </section>
            )}

            {view && madeId !== null && <ReturnComplete api={api} returnId={madeId} onAnother={() => setMadeId(null)} />}

            {view && isOwner && madeId === null && <VoidCard api={api} view={view} onVoided={() => invoiceId && void loadView(invoiceId)} />}
          </div>

          {view && madeId === null && view.invoice.status === 'active' && (
            <RefundSummary
              view={view}
              draft={draft}
              preview={preview}
              previewError={previewError}
              isOwner={isOwner}
              ready={state.ok}
              busy={busy}
              error={error}
              onComplete={() => void finish()}
              onAskOwner={() => setAsking(true)}
            />
          )}
        </div>
      )}

      {asking && view && (
        <ReturnApprovalDialog
          api={api}
          view={view}
          draft={draft}
          onCondition={(id, condition: Condition) => change(id, { condition })}
          onGranted={(token) => void finish(token)}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

/** "Find invoice": a search box and the matching recent invoices. A press on one loads it below. */
function FindInvoice({ api, query, onQuery, selectedId, onChoose }: { api: Api; query: string; onQuery: (q: string) => void; selectedId: string | null; onChoose: (row: InvoiceListRow) => void }) {
  const { m, language } = useI18n();
  const t = m.returns;
  const run = useCallback((q: string) => api.invoices.list({ ...(q.trim() ? { query: q.trim() } : {}), status: 'active', limit: 5 }), [api]);
  const search = useDebouncedSearch(run, query);
  const rows = search.data?.rows ?? [];
  return (
    <section data-find-invoice className="rounded-lg border border-line bg-card p-6 shadow-card">
      <label htmlFor="return-search" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
        {t.findLabel}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
        <Input id="return-search" type="search" aria-label={t.searchLabel} placeholder={t.searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} className="ps-12" />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t.recent}</div>
        {search.error != null && <ErrorNotice error={search.error} />}
        {search.data === null && search.error == null && <p role="status" className="text-muted">{t.loading}</p>}
        {search.data && rows.length === 0 && <p className="text-muted">{t.noInvoices}</p>}
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                data-find-row={row.invoice_no}
                aria-pressed={selectedId === row.id}
                onClick={() => onChoose(row)}
                className={cn('flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start hover:bg-row-hover', selectedId === row.id && 'bg-tint')}
              >
                <span>
                  <Num className="block font-semibold">{row.invoice_no}</Num>
                  <span className="text-sm text-muted">
                    {lineName({ name_en: row.customer_name_en, name_ur: row.customer_name_ur }, language) || t.walkIn} · <Num>{formatDate(row.invoice_date.slice(0, 10), language)}</Num>
                  </span>
                </span>
                <Num className="font-semibold">{formatMoney(row.total, language)}</Num>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
