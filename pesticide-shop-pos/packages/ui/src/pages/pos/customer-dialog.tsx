import type { Api } from '@pos/api-contract';
import { useCallback, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { customerFrom, pickName, type Customer } from './pos-state.js';

const RESULTS = 8;

/** Choose the customer (F4): search by name in either language, village or phone, or pick the walk-in customer, who pays in full. */
export function CustomerDialog({ api, current, onPick, onClose }: { api: Api; current: Customer | null; onPick: (customer: Customer | null) => void; onClose: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.customer;
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | 'walk-in'>(current?.id ?? 'walk-in');
  const run = useCallback((q: string) => api.customers.search({ query: q, limit: RESULTS }), [api]);
  const search = useDebouncedSearch(run, query);
  const matches = search.data ?? [];
  const chosenMatch = matches.find((c) => c.id === chosen);
  const chosenName = chosen === 'walk-in' ? t.walkIn : chosenMatch ? pickName(chosenMatch.name_en, chosenMatch.name_ur, language) : current ? pickName(current.nameEn, current.nameUr, language) : t.walkIn;

  const apply = () => {
    if (chosen === 'walk-in') onPick(null);
    else if (chosenMatch) onPick(customerFrom(chosenMatch));
    else if (current && current.id === chosen) onPick(current);
  };

  return (
    <Dialog open title={t.dialogTitle} onClose={onClose}>
      <p className="mt-1 text-muted">{t.dialogLead}</p>
      <Input type="search" aria-label={t.searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} className="mt-4" autoFocus />
      {search.error != null && <ErrorNotice error={search.error} className="mt-3" />}
      <ul role="listbox" aria-label={t.dialogTitle} className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
        <li>
          <Row selected={chosen === 'walk-in'} onSelect={() => setChosen('walk-in')} onChoose={apply} title={t.walkIn} sub={t.walkInHint} right="—" rightSub={m.pos.retail} />
        </li>
        {matches.map((c) => (
          <li key={c.id}>
            <Row
              selected={chosen === c.id}
              onSelect={() => setChosen(c.id)}
              onChoose={() => onPick(customerFrom(c))}
              title={pickName(c.name_en, c.name_ur, language)}
              sub={`${c.village ?? ''}${c.village ? ' · ' : ''}${c.default_price_type === 'wholesale' ? t.wholesalePrice : t.retailPrice}`}
              right={t.owes(formatMoney(c.balance, language))}
              rightSub={c.credit_limit > 0 ? t.limit(formatMoney(c.credit_limit, language)) : t.noLimit}
            />
          </li>
        ))}
        {!search.loading && search.data !== null && matches.length === 0 && query.trim() !== '' && <li className="px-2 py-2 text-muted">{t.none}</li>}
      </ul>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t.cancel}
        </Button>
        <Button onClick={apply}>{t.use(chosenName)}</Button>
      </div>
    </Dialog>
  );
}

function Row({ selected, onSelect, onChoose, title, sub, right, rightSub }: { selected: boolean; onSelect: () => void; onChoose: () => void; title: string; sub: string; right: string; rightSub: string }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onChoose}
      className={cn('lift flex min-h-[64px] w-full items-center justify-between gap-3 rounded-md border px-4 py-2 text-start', selected ? 'border-2 border-accent bg-tint' : 'border-line bg-card hover:bg-row-hover')}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted">{sub}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block font-semibold">{right}</span>
        <span className="block text-sm text-muted">{rightSub}</span>
      </span>
    </button>
  );
}
