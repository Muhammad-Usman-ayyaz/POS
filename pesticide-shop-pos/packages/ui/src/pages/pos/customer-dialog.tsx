import type { Api } from '@pos/api-contract';
import { useCallback, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedSearch } from '../../lib/use-debounced-search.js';
import { Actions } from './counter-ui.js';
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
    <Dialog counter open title={t.dialogTitle} lead={t.dialogLead} onClose={onClose}>
      <div className="field flex h-12 items-center gap-2.5 rounded-md border border-field-line bg-card px-3.5 focus-within:border-accent">
        <input
          type="search"
          aria-label={t.searchLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-base shadow-none [&::-webkit-search-cancel-button]:hidden"
          autoFocus
        />
      </div>
      {search.error != null && <ErrorNotice error={search.error} />}
      <ul role="listbox" aria-label={t.dialogTitle} className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        <li>
          <Row selected={chosen === 'walk-in'} onSelect={() => setChosen('walk-in')} onChoose={apply} title={t.walkIn} sub={t.walkInHint} right="—" rightSub={t.retailPrice} />
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
      <Actions>
        <Button variant="secondary" size="dialog" onClick={onClose}>
          {t.cancel}
        </Button>
        <Button size="dialog" onClick={apply}>
          {t.use(chosenName)}
        </Button>
      </Actions>
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
      className={cn('lift flex min-h-[60px] w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-start', selected ? 'border-2 border-accent bg-tint' : 'border border-row-line bg-card hover:bg-row-hover')}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-[13px] text-muted">{sub}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block font-semibold">{right}</span>
        <span className="block text-xs text-muted">{rightSub}</span>
      </span>
    </button>
  );
}
