// Customer search with Urdu names: hamza, yeh and kaf variants, diacritics, and Eastern Arabic / Urdu digits in a phone. One table, both search
// paths (customers.search at the counter and customers.list on the Khata page), both backends.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { services, type ServiceWorld, type WorldFactory } from '../world.js';

// What is stored, and how a person might type it.
const STORED = {
  ahmed: { name_ur: 'أحمد', name_en: null, phone: null }, // alef with hamza above
  ibrahim: { name_ur: 'إبراہیم', name_en: null, phone: null }, // alef with hamza below, Urdu yeh
  kareem: { name_ur: 'كريم', name_en: null, phone: null }, // Arabic kaf and Arabic yeh
  haroon: { name_ur: 'ہارون', name_en: null, phone: null }, // heh goal
  muhammad: { name_ur: 'مُحَمَّد', name_en: null, phone: null }, // with harakat
  ali: { name_ur: 'علی', name_en: null, phone: null }, // Urdu yeh
  ilm: { name_ur: 'علم', name_en: null, phone: null }, // a different name that starts the same
  phoned: { name_ur: null, name_en: 'Phoned Farmer', phone: '٠٣٠٠-١٢٣٤٥٦٧' }, // Eastern Arabic digits stored
  phoned2: { name_ur: null, name_en: 'Urdu Digit Farmer', phone: '۰۳۲۱ ۷۶۵۴۳۲۱' }, // Urdu digits stored, with a space
} as const;

type Key = keyof typeof STORED;

const CASES: [string, string, Key[]][] = [
  // hamza on alef
  ['hamza above typed plain', 'احمد', ['ahmed']],
  ['hamza above typed with the hamza', 'أحمد', ['ahmed']],
  ['hamza below typed plain', 'ابراہیم', ['ibrahim']],
  ['hamza below typed with the hamza', 'إبراہیم', ['ibrahim']],
  ['hamza above typed for a name stored with hamza below', 'أبراہیم', ['ibrahim']],
  // yeh
  ['Arabic yeh finds an Urdu yeh name', 'علي', ['ali']],
  ['alef maksura finds an Urdu yeh name', 'علىٰ', ['ali']],
  ['Urdu yeh finds an Arabic yeh and kaf name', 'کریم', ['kareem']],
  // kaf
  ['Arabic kaf and yeh find the same name', 'كريم', ['kareem']],
  ['Arabic kaf alone, the rest Urdu', 'كریم', ['kareem']],
  ['a prefix in Arabic letters', 'كر', ['kareem']],
  // heh
  ['Arabic heh finds a heh goal name', 'هارون', ['haroon']],
  ['teh marbuta typed for heh', 'ةارون', ['haroon']],
  // diacritics
  ['a plain name finds a name stored with harakat', 'محمد', ['muhammad']],
  ['harakat typed in the query are ignored', 'مُحَمَّد', ['muhammad']],
  ['a tatweel in the query is ignored', 'محـمد', ['muhammad']],
  // similar but different names stay apart
  ['علی does not find علم', 'علی', ['ali']],
  ['علم does not find علی', 'علم', ['ilm']],
  ['a shared first letter finds both', 'ع', ['ali', 'ilm']],
  // phone digits
  ['Latin digits find Eastern Arabic digits stored', '03001234567', ['phoned']],
  ['Latin digits with a dash find them too', '0300-1234567', ['phoned']],
  ['Eastern Arabic digits typed', '٠٣٠٠١٢٣٤٥٦٧', ['phoned']],
  ['Urdu digits typed find Urdu digits stored with a space', '۰۳۲۱۷۶۵۴۳۲۱', ['phoned2']],
  ['Latin digits find Urdu digits stored with a space', '0321 7654321', ['phoned2']],
  ['the +92 form', '+92 300 1234567', ['phoned']],
  ['the last seven digits', '1234567', ['phoned']],
  ['a number nobody has', '٠٣٩٩٩٩٩٩٩٩٩', []],
  ['a name nobody has', 'زبیدہ', []],
];

export function defineCustomerSearchUrduTests(make: WorldFactory): void {
  describe('customer search in Urdu', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    const idOf = new Map<Key, string>();
    beforeEach(async () => {
      w = await make();
      s = services(w);
      idOf.clear();
      for (const [key, row] of Object.entries(STORED) as [Key, (typeof STORED)[Key]][]) idOf.set(key, w.addCustomer({ ...row, village: null }));
    });
    afterEach(() => w.close());

    const keys = (ids: string[]): Key[] => ids.map((id) => [...idOf.entries()].find(([, v]) => v === id)![0]).sort();

    it.each(CASES)('search at the counter: %s (%s)', (_label, query, expected) => {
      expect(keys(s.customers.search({ query }).filter((m) => [...idOf.values()].includes(m.id)).map((m) => m.id))).toEqual([...expected].sort());
    });

    it.each(CASES)('the Khata list finds the same people: %s (%s)', (_label, query, expected) => {
      expect(keys(s.customers.list({ query }).rows.map((r) => r.customer.id).filter((id) => [...idOf.values()].includes(id)))).toEqual([...expected].sort());
    });

    it('duplicate detection reads the same spellings alike (a plain احمد is a duplicate of أحمد)', () => {
      const dup = s.customers.findDuplicates({ name_ur: 'احمد' });
      expect(dup.map((d) => d.customer_id)).toEqual([idOf.get('ahmed')]);
      expect(s.customers.findDuplicates({ name_ur: 'كريم' }).map((d) => d.customer_id)).toEqual([idOf.get('kareem')]);
      expect(s.customers.findDuplicates({ phone: '03001234567' }).map((d) => d.customer_id)).toEqual([idOf.get('phoned')]);
    });
  });
}
