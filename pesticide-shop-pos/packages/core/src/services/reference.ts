import { z } from 'zod';
import { normalizeSearchText, tidyText } from '../domain/catalogue.js';
import { DomainError } from '../errors.js';
import type { NewRow } from '../ports/index.js';
import { Id } from '../schemas/common.js';
import type { Brand, Category, Supplier } from '../schemas/index.js';
import { ownerUser, parseInput, type ServiceDeps } from './support.js';

// Suppliers, categories and brands: the short lists a product form and a receipt choose from. The owner adds one
// ("quick add", inside the form); anyone signed in may read the lists. A name that is already there (in the same language,
// ignoring case, spacing and Arabic/Urdu letter variants) is refused, so a quick-add cannot make a second "Insecticide".

const Text = z.string().transform(tidyText).pipe(z.string().min(1));
const Names = { name_en: Text.nullish(), name_ur: Text.nullish() };
const hasName = (i: { name_en?: string | null | undefined; name_ur?: string | null | undefined }) => i.name_en != null || i.name_ur != null;
const NAME_MESSAGE = 'Enter an English or an Urdu name';

const AddCategoryInput = z.strictObject({ actor_id: Id, ...Names }).refine(hasName, { message: NAME_MESSAGE });
const AddBrandInput = z.strictObject({ actor_id: Id, ...Names }).refine(hasName, { message: NAME_MESSAGE });
const AddSupplierInput = z
  .strictObject({
    actor_id: Id,
    ...Names,
    phone: z.string().transform(tidyText).nullish(),
    address: z.string().transform(tidyText).nullish(),
  })
  .refine(hasName, { message: NAME_MESSAGE });
export type AddCategoryInput = z.input<typeof AddCategoryInput>;
export type AddBrandInput = z.input<typeof AddBrandInput>;
export type AddSupplierInput = z.input<typeof AddSupplierInput>;

interface Named {
  name_en: string | null;
  name_ur: string | null;
}

/** The name that clashes with an existing one, or undefined. English is compared with English, Urdu with Urdu. */
function clash(existing: readonly Named[], wanted: { name_en: string | null; name_ur: string | null }): string | undefined {
  for (const field of ['name_en', 'name_ur'] as const) {
    const name = wanted[field];
    if (name === null) continue;
    const key = normalizeSearchText(name);
    if (existing.some((e) => e[field] !== null && normalizeSearchText(e[field]) === key)) return name;
  }
  return undefined;
}

export function createReferenceService(deps: ServiceDeps) {
  const base = () => ({ id: deps.ids.newId(), ...deps.scope });
  const duplicate = (name: string): DomainError => new DomainError('DUPLICATE_NAME', `"${name}" is already in the list`, { name });

  return {
    /** Anyone signed in may read the lists (the shell checks the session). */
    listCategories: (): Category[] => deps.uow.run((tx) => tx.categories.list()),
    listBrands: (): Brand[] => deps.uow.run((tx) => tx.brands.list()),
    listSuppliers: (): Supplier[] => deps.uow.run((tx) => tx.suppliers.list()),

    addCategory(rawInput: AddCategoryInput): NewRow<Category> {
      const input = parseInput(AddCategoryInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const row: NewRow<Category> = { ...base(), name_en: input.name_en ?? null, name_ur: input.name_ur ?? null };
        const same = clash(tx.categories.list(), row);
        if (same !== undefined) throw duplicate(same);
        tx.categories.insert(row);
        return row;
      });
    },

    addBrand(rawInput: AddBrandInput): NewRow<Brand> {
      const input = parseInput(AddBrandInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const row: NewRow<Brand> = { ...base(), name_en: input.name_en ?? null, name_ur: input.name_ur ?? null };
        const same = clash(tx.brands.list(), row);
        if (same !== undefined) throw duplicate(same);
        tx.brands.insert(row);
        return row;
      });
    },

    addSupplier(rawInput: AddSupplierInput): NewRow<Supplier> {
      const input = parseInput(AddSupplierInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const row: NewRow<Supplier> = {
          ...base(),
          name_en: input.name_en ?? null,
          name_ur: input.name_ur ?? null,
          phone: input.phone || null,
          address: input.address || null,
        };
        const same = clash(tx.suppliers.list(), row);
        if (same !== undefined) throw duplicate(same);
        tx.suppliers.insert(row);
        return row;
      });
    },
  };
}
export type ReferenceService = ReturnType<typeof createReferenceService>;
