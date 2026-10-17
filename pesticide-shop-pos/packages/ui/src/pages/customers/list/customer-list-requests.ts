// The request the customer list sends, built in one place with no React, so the desktop tests can send exactly this through the real
// handlers (`customerListRules` in `@pos/ui/rules`): the screen and the shell must agree.
import type { Api, Language } from '@pos/api-contract';

export type CustomerFilter = 'all' | 'owes' | 'overdue' | 'advance';
export type CustomerSort = 'name' | 'balance' | 'overdue' | 'next_due';
export const PAGE_SIZE = 25;

export interface CustomerListFilters {
  query: string;
  filter: CustomerFilter;
  sort: CustomerSort;
  language: Language;
  offset: number;
}

type ListInput = NonNullable<Parameters<Api['customers']['list']>[0]>;

/** Only what is set is sent. The sort by name follows the language the names are shown in. Nothing about the user is sent. */
export function buildListRequest(f: CustomerListFilters): ListInput {
  return {
    ...(f.query.trim() ? { query: f.query.trim() } : {}),
    ...(f.filter !== 'all' ? { filter: f.filter } : {}),
    sort: f.sort,
    name_language: f.language,
    limit: PAGE_SIZE,
    offset: f.offset,
  };
}
