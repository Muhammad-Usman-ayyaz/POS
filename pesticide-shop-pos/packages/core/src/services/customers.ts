import { z } from 'zod';
import { normalizeSearchText } from '../domain/catalogue.js';
import { parseInput, type ServiceDeps } from './support.js';

const SearchInput = z.strictObject({
  query: z.string().max(100).default(''),
  limit: z.number().int().min(1).max(50).default(20),
});
export type CustomerSearchInput = z.input<typeof SearchInput>;

/** A customer as the counter needs to see them: who, their usual price type, how much they may owe, and what they owe now. */
export interface CustomerMatch {
  id: string;
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  phone: string | null;
  default_price_type: 'retail' | 'wholesale';
  /** 0 means no limit is set. */
  credit_limit: number;
  /** What they owe now (opening balance included). Plus means they owe. */
  balance: number;
}

/** Finding a customer at the counter. Read-only: customers are created and edited in the Khata screens (Phase 6). */
export function createCustomerDirectoryService(deps: ServiceDeps) {
  return {
    /**
     * Live customers whose name (either language), village or phone contains every word typed, best matches first (a name that starts with the
     * first word, then by name). Matching is the catalogue's: either language, Arabic and Urdu digits and letter variants read alike.
     * An empty search lists the first customers by name.
     */
    search(rawInput: CustomerSearchInput = {}): CustomerMatch[] {
      const input = parseInput(SearchInput, rawInput);
      return deps.uow.run((tx) => {
        const words = normalizeSearchText(input.query).split(' ').filter((w) => w !== '');
        const matches = tx.customers.list().flatMap((c) => {
          const names = [c.name_en, c.name_ur].map((n) => normalizeSearchText(n ?? '')).filter((n) => n !== '');
          const haystack = [...names, normalizeSearchText(c.village ?? ''), normalizeSearchText(c.phone ?? '')].join(' ');
          if (!words.every((w) => haystack.includes(w))) return [];
          const startsWithName = words.length > 0 && names.some((n) => n.startsWith(words[0]!));
          return [{ customer: c, rank: startsWithName ? 0 : 1 }];
        });
        matches.sort((a, b) => a.rank - b.rank); // stable: the list is already in name order
        return matches.slice(0, input.limit).map(({ customer: c }) => ({
          id: c.id,
          name_en: c.name_en,
          name_ur: c.name_ur,
          village: c.village,
          phone: c.phone,
          default_price_type: c.default_price_type,
          credit_limit: c.credit_limit,
          balance: tx.ledger.balance('customer', c.id),
        }));
      });
    },
  };
}
export type CustomerDirectoryService = ReturnType<typeof createCustomerDirectoryService>;
