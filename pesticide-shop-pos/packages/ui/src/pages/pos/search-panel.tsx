import type { Api } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { SegmentedToggle } from '../../components/ui/segmented.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { pickName, type BaseUnit, type PriceType, type SizePick } from './pos-state.js';

const GROUPS = 6;

type Hit = Awaited<ReturnType<Api['catalogue']['list']>>['hits'][number];
type Size = Hit['sizes'][number];

const toPick = (hit: Hit, size: Size): SizePick => ({
  productId: size.id,
  nameEn: hit.group.name_en,
  nameUr: hit.group.name_ur,
  label: size.pack_label,
  packSize: size.pack_size,
  allowLoose: size.allow_loose === 1,
  baseUnit: size.base_unit as BaseUnit,
});

/** A size can be sold only when some stock is still good (not expired). Out-of-stock sizes are shown, but cannot be pressed. */
const inStock = (size: Size): boolean => size.stock_sellable > 0;

/**
 * The search box (F2) with Retail / Wholesale beside it, and the matching products below as cards of size buttons. It waits for typing to
 * pause, like the Products screen. A barcode scanner types the code and presses Enter: when exactly one size that can be sold matches, it is added.
 */
export function SearchPanel({
  api,
  inputRef,
  query,
  onQuery,
  priceType,
  onPriceType,
  inCart,
  onAdd,
}: {
  api: Api;
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (query: string) => void;
  priceType: PriceType;
  onPriceType: (priceType: PriceType) => void;
  /** Product ids on the bill, to mark their buttons. */
  inCart: ReadonlySet<string>;
  onAdd: (size: SizePick) => void;
}) {
  const { m, language } = useI18n();
  const t = m.pos;
  const run = useCallback((q: string) => (q.trim() === '' ? Promise.resolve(null) : api.catalogue.list({ query: q, limit: GROUPS })), [api]);
  const search = useDebouncedSearch(run, query);
  const upToDate = !search.loading && search.answeredFor === query && search.data !== undefined;
  const hits = query.trim() === '' ? [] : (search.data?.hits ?? []);
  const sellable = hits.flatMap((hit) => hit.sizes.filter((s) => s.is_active === 1 && inStock(s)).map((s) => toPick(hit, s)));
  const enterWaiting = useRef(false);

  // A scanner presses Enter at once, before the answer for its code is here: wait for it, then add the one size.
  useEffect(() => {
    if (!enterWaiting.current || !upToDate) return;
    enterWaiting.current = false;
    if (sellable.length === 1) {
      onAdd(sellable[0]!);
      onQuery('');
    }
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onQuery('');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (query.trim() === '') return;
      if (upToDate) {
        if (sellable.length === 1) {
          onAdd(sellable[0]!);
          onQuery('');
        }
      } else enterWaiting.current = true;
    }
  };

  const price = (size: Size): number => (priceType === 'wholesale' ? size.wholesale_price : size.retail_price);
  const leftText = (size: Size): string => {
    if (!inStock(size)) return t.out;
    const packs = Math.floor(size.stock_sellable / Math.max(1, size.pack_size));
    return packs > 0 ? t.left(packs) : t.leftLoose(size.stock_sellable, t.unit[size.base_unit as BaseUnit]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
          <input
            ref={inputRef}
            type="search"
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-14 w-full rounded-lg border-2 border-field-line bg-card ps-12 pe-16 text-xl text-ink placeholder:text-muted/70 [@media(max-height:800px)]:h-12"
          />
          {/* The badge is wrapped: `.num` forces direction: ltr, and an element's OWN direction decides which side `end-3` is, so on the badge itself it stayed on the right in Urdu, on top of the icon. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 my-auto flex h-7 items-center">
            <kbd className="num h-7 rounded-sm border border-line px-2 text-sm leading-7 text-muted">F2</kbd>
          </span>
        </div>
        <SegmentedToggle<PriceType>
          label={t.priceTypeLabel}
          value={priceType}
          onChange={onPriceType}
          className="shrink-0 rounded-lg bg-thead p-1"
          options={[
            { value: 'retail', label: t.retail },
            { value: 'wholesale', label: t.wholesale },
          ]}
        />
      </div>

      {search.error != null && <ErrorNotice error={search.error} />}

      {query.trim() !== '' && (
        <div aria-busy={!upToDate} className={cn('flex gap-3 overflow-x-auto', !upToDate && hits.length > 0 && 'opacity-70')}>
          {hits.map((hit) => (
            <section key={hit.group.id} data-group={hit.group.id} className="min-w-0 flex-1 basis-[22rem] rounded-lg border border-line bg-card p-3 shadow-card">
              <h3 className="mb-2 truncate text-base font-bold">{pickName(hit.group.name_en, hit.group.name_ur, language)}</h3>
              <div className="flex flex-wrap gap-2">
                {hit.sizes
                  .filter((s) => s.is_active === 1)
                  .map((size) => {
                    const available = inStock(size);
                    const selected = inCart.has(size.id);
                    const warn = available && (size.flags.low || size.flags.near_expiry);
                    return (
                      <button
                        key={size.id}
                        type="button"
                        data-size={size.id}
                        disabled={!available}
                        title={available ? undefined : t.outOfStockHint}
                        onClick={() => onAdd(toPick(hit, size))}
                        className={cn(
                          'lift min-h-[64px] min-w-[96px] flex-1 rounded-md border px-3 py-1.5 text-start',
                          !available && 'cursor-not-allowed border-dashed border-field-line bg-thead text-muted opacity-80',
                          available && !selected && !warn && 'border-line bg-card hover:bg-row-hover',
                          warn && !selected && 'border-warn-ink/30 bg-warn-bg text-warn-ink',
                          selected && 'border-2 border-accent bg-tint',
                        )}
                      >
                        <span dir="auto" className="block text-sm font-semibold">
                          {size.pack_label}
                        </span>
                        <span className="num block text-base font-bold">{formatMoney(price(size), language)}</span>
                        <span className="block text-xs text-muted">{leftText(size)}</span>
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
          {upToDate && hits.length === 0 && <p className="px-2 py-3 text-muted">{t.noResults}</p>}
        </div>
      )}
    </div>
  );
}
