import type { Api, CatalogueList, ListedCategory, SessionUser } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { useI18n } from '../../i18n/index.js';
import { CatalogueTable } from './catalogue-table.js';

export type Filter = 'all' | 'low' | 'near_expiry' | 'expired';
type Group = CatalogueList['hits'][number];

/**
 * Products and stock: one row per product that opens into its sizes. The cost column and the Receive stock, Add and Edit
 * buttons are for the owner only (the shell also refuses them for staff, and never sends a cost to staff).
 */
export function ProductsPage({ api, user }: { api: Api; user: SessionUser }) {
  const { m } = useI18n();
  const isOwner = user.role === 'owner';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [categories, setCategories] = useState<ListedCategory[]>([]);

  useEffect(() => {
    // Only used to say a category's name: if it fails, the column shows a dash and the rest still works.
    api.categories.list().then(setCategories, () => undefined);
  }, [api]);

  const run = useCallback((q: string) => api.catalogue.list({ query: q, filter, limit: 1000 }), [api, filter]);
  const search = useDebouncedSearch(run, query);
  const list = search.data;
  const groups: Group[] = list?.hits ?? [];
  const counts = list?.counts;
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOpen = groups.length > 0 && groups.every((g) => expanded.has(g.group.id));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.group.id)));
  const clearFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const chips: { key: Filter; text: string }[] = [
    { key: 'all', text: counts ? m.products.filterAll(counts.products) : m.products.filterLabel },
    ...(counts
      ? [
          { key: 'low' as const, text: m.products.filterLow(counts.low) },
          { key: 'near_expiry' as const, text: m.products.filterNear(counts.near_expiry) },
          { key: 'expired' as const, text: m.products.filterExpired(counts.expired) },
        ]
      : []),
  ];
  const narrowed = query.trim() !== '' || filter !== 'all';

  return (
    <div data-page="products">
      <header className="stagger mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-tight">{m.pages.products.title}</h1>
          <p className="mt-1 text-base text-muted">{m.pages.products.subtitle}</p>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link to="/products/new">{m.products.addProduct}</Link>
            </Button>
            <Button asChild>
              <Link to="/purchases/receive">{m.products.receiveStock}</Link>
            </Button>
          </div>
        )}
      </header>

      <div className="stagger mb-4 flex flex-wrap items-center gap-3" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="relative min-w-[16rem] max-w-xl flex-1">
          <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
          <Input type="search" aria-label={m.products.searchLabel} placeholder={m.products.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} className="ps-12" />
        </div>
        <div role="group" aria-label={m.products.filterLabel} className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={filter === chip.key}
              onClick={() => setFilter(chip.key)}
              className={cn(
                'lift min-h-11 rounded-full border px-4 text-base font-medium',
                filter === chip.key ? 'border-accent bg-tint text-accent-dark' : 'border-line bg-card text-ink hover:bg-row-hover',
              )}
            >
              {chip.text}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="mb-4">
          <Button variant="secondary" onClick={toggleAll}>
            {allOpen ? m.products.collapseAll : m.products.expandAll}
          </Button>
        </div>
      )}

      {search.error != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={search.error} className="max-w-xl" />
          <Button variant="secondary" onClick={search.refresh}>
            {m.products.retry}
          </Button>
        </div>
      )}

      <div aria-busy={search.loading} className={cn(search.loading && list && 'opacity-70')}>
        {list === null ? (
          search.error == null && <LoadingRows label={m.products.loading} isOwner={isOwner} />
        ) : groups.length === 0 ? (
          <EmptyState narrowed={narrowed} isOwner={isOwner} onClear={clearFilters} />
        ) : (
          <CatalogueTable groups={groups} isOwner={isOwner} expanded={expanded} onToggle={toggle} categories={categoryName} />
        )}
      </div>
    </div>
  );
}

function LoadingRows({ label, isOwner }: { label: string; isOwner: boolean }) {
  return (
    <div role="status" className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
      <p className="sr-only">{label}</p>
      <div className="h-12 bg-thead" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} data-skeleton className="stagger flex items-center gap-6 border-t border-row-line px-6 py-5" style={{ '--i': i } as React.CSSProperties}>
          <div className="h-5 w-1/4 rounded bg-row-line" />
          <div className="h-5 w-1/6 rounded bg-row-line" />
          <div className="h-5 w-1/6 rounded bg-row-line" />
          {isOwner && <div className="h-5 w-1/12 rounded bg-row-line" />}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ narrowed, isOwner, onClear }: { narrowed: boolean; isOwner: boolean; onClear: () => void }) {
  const { m } = useI18n();
  return (
    <div className="stagger grid min-h-[280px] place-items-center rounded-lg border border-line bg-card p-8 text-center shadow-card">
      <div className="max-w-md">
        {narrowed ? (
          <>
            <p className="text-xl font-semibold">{m.products.noMatchTitle}</p>
            <p className="mt-2 text-muted">{m.products.noMatchHint}</p>
            <Button variant="secondary" className="mt-5" onClick={onClear}>
              {m.products.clearFilters}
            </Button>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold">{m.products.emptyTitle}</p>
            <p className="mt-2 text-muted">{isOwner ? m.products.emptyOwner : m.products.emptyStaff}</p>
            {isOwner && (
              <Button asChild className="mt-5">
                <Link to="/products/new">{m.products.addProduct}</Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
