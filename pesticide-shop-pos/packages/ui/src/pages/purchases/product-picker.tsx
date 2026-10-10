import type { Api } from '@pos/api-contract';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useI18n } from '../../i18n/index.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';

export interface PickedSize {
  productId: string;
  nameEn: string | null;
  nameUr: string | null;
  label: string;
  packSize: number;
}

const RESULTS = 15;

/**
 * Find a product size to add as a line. The same fast search as the Products screen (it waits for typing to pause), by name in English or
 * Urdu, by size, SKU or barcode. A barcode scanner types the code and presses Enter: if exactly one size matches, it is added.
 */
export function ProductPicker({ api, onPick, onClose }: { api: Api; onPick: (size: PickedSize) => void; onClose: () => void }) {
  const { m, language } = useI18n();
  const f = m.receive;
  const [query, setQuery] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);

  const run = useCallback((q: string) => api.catalogue.list({ query: q, limit: RESULTS }), [api]);
  const search = useDebouncedSearch(run, query);
  // The list is the answer to what is typed only when the search has caught up with it (it waits for typing to pause).
  const upToDate = !search.loading && search.answeredFor === query && search.data !== null;
  const enterWaiting = useRef(false);

  const sizes: PickedSize[] = (search.data?.hits ?? []).flatMap((hit) =>
    hit.sizes
      .filter((s) => s.is_active === 1)
      .map((s) => ({ productId: s.id, nameEn: hit.group.name_en, nameUr: hit.group.name_ur, label: s.pack_label, packSize: s.pack_size })),
  );

  // A scanner types the code and presses Enter at once: the answer for that code may not be here yet. Wait for it, then add the one size.
  useEffect(() => {
    if (!enterWaiting.current || !upToDate) return;
    enterWaiting.current = false;
    if (sizes.length === 1) onPick(sizes[0]!);
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Enter') {
      event.preventDefault(); // Enter must never submit the receipt
      if (upToDate) {
        if (sizes.length === 1) onPick(sizes[0]!);
      } else {
        enterWaiting.current = true;
      }
    }
  };

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
          <Input ref={box} type="search" aria-label={f.searchLabel} placeholder={f.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} className="ps-12" />
        </div>
        <Button variant="secondary" onClick={onClose}>
          {f.closeSearch}
        </Button>
      </div>
      {search.error != null && <ErrorNotice error={search.error} className="mt-3" />}
      <ul aria-busy={!upToDate} className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
        {sizes.map((size) => (
          <li key={size.productId}>
            <button type="button" onClick={() => onPick(size)} className="lift flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-base hover:bg-row-hover">
              <span className="font-semibold">{(language === 'ur' ? (size.nameUr ?? size.nameEn) : (size.nameEn ?? size.nameUr)) ?? ''}</span>
              {size.label !== '' && <span dir="auto" className="rounded-full bg-row-line/60 px-2 py-0.5 text-sm">{size.label}</span>}
            </button>
          </li>
        ))}
        {!search.loading && search.data !== null && sizes.length === 0 && <li className="px-3 py-3 text-muted">{f.noResults}</li>}
      </ul>
    </div>
  );
}
