import type { Api } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { SegmentedToggle } from '../../components/ui/segmented.js';
import { formatMoney, packText, qtyText, useI18n } from '../../i18n/index.js';
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
    if (size.pack_size === 1) return t.left(qtyText(m, language, size.base_unit as BaseUnit, size.stock_sellable));
    return packs > 0 ? t.left(`${packs} ${packs === 1 ? m.units.pack : m.units.packs}`) : t.leftLoose(qtyText(m, language, size.base_unit as BaseUnit, size.stock_sellable));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="field relative flex h-[52px] min-w-0 flex-1 items-center gap-3 rounded-md border-2 border-field-line bg-card px-4 focus-within:border-accent">
          <Search aria-hidden className="pointer-events-none size-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="search"
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[17px] text-ink shadow-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {/* The badge is a flex item after the input, not placed with `end-`: `.num` forces direction: ltr, and an element's OWN direction decides which side `end-3` is, so a placed badge stayed on the right in Urdu, on top of the icon. */}
          <kbd aria-hidden className="num rounded-[6px] border border-line px-2 py-px text-xs leading-[18px] text-muted">
            F2
          </kbd>
        </div>
        <SegmentedToggle<PriceType>
          tone="track"
          label={t.priceTypeLabel}
          value={priceType}
          onChange={onPriceType}
          className="shrink-0 gap-1 rounded-md bg-track p-1"
          options={[
            { value: 'retail', label: t.retail },
            { value: 'wholesale', label: t.wholesale },
          ]}
        />
      </div>

      {search.error != null && <ErrorNotice error={search.error} />}

      {query.trim() !== '' && (
        <div aria-busy={!upToDate} className={cn('grid max-h-[290px] grid-cols-2 gap-3 overflow-y-auto max-[1100px]:grid-cols-1', !upToDate && hits.length > 0 && 'opacity-70')}>
          {hits.map((hit) => (
            <section key={hit.group.id} data-group={hit.group.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-card p-3 shadow-card transition-[border-color,box-shadow] hover:border-card-hover hover:shadow-lift">
              <h3 className="truncate text-[15px] font-semibold leading-[1.4]">{pickName(hit.group.name_en, hit.group.name_ur, language)}</h3>
              <div className="flex flex-wrap gap-1.5">
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
                          'lift flex min-h-[64px] min-w-0 flex-1 basis-[84px] flex-col items-start rounded-sm border px-3 py-2 text-start',
                          !available && 'cursor-not-allowed border-dashed border-field-line bg-thead text-out-ink',
                          available && !selected && !warn && 'border-field-line bg-card text-ink hover:border-nav-active',
                          warn && !selected && 'border-warn-line bg-warn-bg text-warn-deep',
                          selected && 'border-2 border-accent bg-tint px-[11px] py-[7px] text-accent-dark',
                        )}
                      >
                        <span dir="auto" className="text-[13px] font-semibold leading-[1.35]">
                          {packText(m, language, size.base_unit as BaseUnit, size.pack_size) || qtyText(m, language, size.base_unit as BaseUnit, size.pack_size)}
                        </span>
                        <span className="num text-sm font-bold leading-[1.3]">{formatMoney(price(size), language)}</span>
                        <span className="text-[11.5px] leading-[1.3] opacity-80">{leftText(size)}</span>
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
          {upToDate && hits.length === 0 && <p className="col-span-2 px-2 py-3 text-muted">{t.noResults}</p>}
        </div>
      )}
    </div>
  );
}
