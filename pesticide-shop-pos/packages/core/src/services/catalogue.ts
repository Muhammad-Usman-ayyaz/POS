import { z } from 'zod';
import { todayUtc } from '../clock.js';
import { searchCatalogue, sizeDisplayName, tidyText, type CatalogueHit, type SearchOptions } from '../domain/catalogue.js';
import { DomainError } from '../errors.js';
import type { NewRow, ProductGroupPatch, ProductPatch, Repositories } from '../ports/index.js';
import { BaseUnit, Flag, Id, NonNegPaisa, TaxRateBp } from '../schemas/common.js';
import type { Product, ProductGroup } from '../schemas/index.js';
import { found, ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

// The product catalogue: product groups ("Product A") and their pack sizes (250 ml, 500 ml, 1 L).
// Every size is a `products` row, so sales, purchases and returns work on sizes exactly as before.
//
// Rules this file keeps (the database enforces the same ones, as a second line of defence):
//  - only an active owner may change the catalogue; price and tax-rate changes, group (de)activation and moves are audited
//  - the group is the source of truth for names, category and brand; each size holds COPIES, rewritten here in the
//    same transaction whenever the group (or the size's label) changes
//  - sizes of one group share a base unit, have unique labels, and have labels at all once there are two or more
//  - a size that has batches keeps its pack size and unit (stock is counted in them)

const Text = z.string().transform(tidyText).pipe(z.string().min(1));
const Label = z.string().transform(tidyText);
/** An optional code (barcode, SKU): empty or missing means none. */
const Code = z
  .string()
  .transform(tidyText)
  .nullish()
  .transform((v) => (v ? v : null));
/** For updates: absent means "leave it alone"; empty or null means "clear it". */
const CodeChange = z
  .string()
  .transform(tidyText)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

const SizeFields = {
  pack_label: Label.default(''),
  sku: Code,
  barcode: Code,
  base_unit: BaseUnit,
  /** Base units per pack: a 1 L bottle is 1000 ml. */
  pack_size: z.number().int().positive(),
  allow_loose: Flag.default(0),
  /** Paisa per pack, tax included. */
  retail_price: NonNegPaisa,
  wholesale_price: NonNegPaisa,
  tax_rate_bp: TaxRateBp.default(0),
  /** Base units. */
  min_stock: z.number().int().nonnegative().default(0),
};
const SizeInput = z.strictObject(SizeFields);
export type SizeInput = z.input<typeof SizeInput>;

const CreateGroupInput = z
  .strictObject({
    actor_id: Id,
    name_en: Text.nullish(),
    name_ur: Text.nullish(),
    category_id: Id.nullish(),
    brand_id: Id.nullish(),
    notes: Label.nullish(),
    /** The first sizes, created with the group. */
    sizes: z.array(SizeInput).default([]),
  })
  .refine((i) => i.name_en != null || i.name_ur != null, { message: 'Enter an English or an Urdu name' });
export type CreateGroupInput = z.input<typeof CreateGroupInput>;

const UpdateGroupInput = z
  .strictObject({
    actor_id: Id,
    group_id: Id,
    name_en: Text.nullable().optional(),
    name_ur: Text.nullable().optional(),
    category_id: Id.nullable().optional(),
    brand_id: Id.nullable().optional(),
    notes: Label.nullable().optional(),
  });
export type UpdateGroupInput = z.input<typeof UpdateGroupInput>;

const AddSizeInput = z.strictObject({
  actor_id: Id,
  group_id: Id,
  size: SizeInput,
  /** Needed when the group's only size has no label yet: it must get one now that a second size is joining. */
  existing_size_label: Label.optional(),
});
export type AddSizeInput = z.input<typeof AddSizeInput>;

const UpdateSizeInput = z.strictObject({
  actor_id: Id,
  product_id: Id,
  changes: z.strictObject({
    pack_label: Label.optional(),
    sku: CodeChange,
    barcode: CodeChange,
    base_unit: BaseUnit.optional(),
    pack_size: z.number().int().positive().optional(),
    allow_loose: Flag.optional(),
    retail_price: NonNegPaisa.optional(),
    wholesale_price: NonNegPaisa.optional(),
    tax_rate_bp: TaxRateBp.optional(),
    min_stock: z.number().int().nonnegative().optional(),
  }),
});
export type UpdateSizeInput = z.input<typeof UpdateSizeInput>;

const SetActiveInput = z.strictObject({ actor_id: Id, id: Id, is_active: z.boolean() });
export type SetActiveInput = z.input<typeof SetActiveInput>;

const MoveSizeInput = z.strictObject({
  actor_id: Id,
  product_id: Id,
  to_group_id: Id,
  /** The size's label in its new group. Needed when the new group has sizes already. */
  pack_label: Label.optional(),
  /** Needed when the new group's only size has no label yet. */
  existing_size_label: Label.optional(),
});
export type MoveSizeInput = z.input<typeof MoveSizeInput>;

const SearchInput = z.strictObject({ query: z.string().default(''), include_inactive: z.boolean().optional() });
export type SearchInput = z.input<typeof SearchInput>;

/** The columns of a group that a size copies. */
type GroupFields = Pick<ProductGroup, 'id' | 'name_en' | 'name_ur' | 'category_id' | 'brand_id' | 'is_active'>;

export interface GroupResult {
  group: ProductGroup;
  sizes: Product[];
}

const isLive = (row: { deleted_at: string | null }): boolean => row.deleted_at === null;

export function createCatalogueService(deps: ServiceDeps) {
  const rows = rowFactory(deps);

  // ---------- reads inside the transaction ----------

  const liveGroup = (tx: Repositories, id: string): ProductGroup => {
    const g = found(tx.productGroups.getById(id), 'product', id);
    if (!isLive(g)) throw new DomainError('NOT_FOUND', `product not found: ${id}`);
    return g;
  };
  const liveSize = (tx: Repositories, id: string): Product => {
    const p = found(tx.products.getById(id), 'size', id);
    if (!isLive(p)) throw new DomainError('NOT_FOUND', `size not found: ${id}`);
    return p;
  };
  const checkCategoryAndBrand = (tx: Repositories, categoryId: string | null | undefined, brandId: string | null | undefined): void => {
    if (categoryId != null && !isLive(found(tx.categories.getById(categoryId), 'category', categoryId))) throw new DomainError('NOT_FOUND', `category not found: ${categoryId}`);
    if (brandId != null && !isLive(found(tx.brands.getById(brandId), 'brand', brandId))) throw new DomainError('NOT_FOUND', `brand not found: ${brandId}`);
  };

  // ---------- the copies a size holds of its group ----------

  const copiesOf = (group: GroupFields, label: string): Pick<Product, 'name_en' | 'name_ur' | 'category_id' | 'brand_id'> => ({
    name_en: sizeDisplayName(group.name_en, label),
    name_ur: sizeDisplayName(group.name_ur, label),
    category_id: group.category_id,
    brand_id: group.brand_id,
  });

  /** Brings one size's copied names, category and brand in line with its group (and its own label). */
  const syncSize = (tx: Repositories, group: GroupFields, size: Product, label = size.pack_label): void => {
    const want = copiesOf(group, label);
    const patch: ProductPatch = {};
    if (size.pack_label !== label) patch.pack_label = label;
    if (size.name_en !== want.name_en) patch.name_en = want.name_en;
    if (size.name_ur !== want.name_ur) patch.name_ur = want.name_ur;
    if (size.category_id !== want.category_id) patch.category_id = want.category_id;
    if (size.brand_id !== want.brand_id) patch.brand_id = want.brand_id;
    if (Object.keys(patch).length > 0) tx.products.update(size.id, patch);
  };

  // ---------- rules about the sizes of one group ----------

  /** The labels a group will have after a change: all non-empty once there are several, and no two the same. */
  const checkLabels = (labels: readonly { id: string; label: string }[]): void => {
    if (labels.length > 1) {
      const missing = labels.find((l) => l.label === '');
      if (missing) throw new DomainError('PACK_LABEL_REQUIRED', 'every size needs a pack label once a product has more than one size', { sizeId: missing.id });
    }
    const seen = new Set<string>();
    for (const { label } of labels) {
      if (seen.has(label)) throw new DomainError('DUPLICATE_PACK_LABEL', `this product already has a size labelled "${label}"`, { label });
      seen.add(label);
    }
  };

  const checkUnits = (unit: string, others: readonly Product[]): void => {
    const other = others.find((o) => o.base_unit !== unit);
    if (other) throw new DomainError('MIXED_UNITS', `all sizes of one product must use the same unit (${other.base_unit}), not ${unit}`, { unit, expected: other.base_unit });
  };

  const checkCodes = (tx: Repositories, codes: { barcode?: string | null; sku?: string | null }, selfId?: string): void => {
    if (codes.barcode) {
      const clash = tx.products.findByBarcode(codes.barcode);
      if (clash && clash.id !== selfId) throw new DomainError('DUPLICATE_BARCODE', `barcode ${codes.barcode} is already used`, { barcode: codes.barcode });
    }
    if (codes.sku) {
      const clash = tx.products.findBySku(codes.sku);
      if (clash && clash.id !== selfId) throw new DomainError('DUPLICATE_SKU', `SKU ${codes.sku} is already used`, { sku: codes.sku });
    }
  };

  const insertSize = (tx: Repositories, group: GroupFields, size: z.output<typeof SizeInput>): NewRow<Product> => {
    if (group.is_active !== 1) throw new DomainError('GROUP_INACTIVE', 'this product is inactive: reactivate it before adding sizes');
    const row: NewRow<Product> = {
      id: deps.ids.newId(),
      group_id: group.id,
      pack_label: size.pack_label,
      ...copiesOf(group, size.pack_label),
      sku: size.sku,
      barcode: size.barcode,
      base_unit: size.base_unit,
      pack_size: size.pack_size,
      allow_loose: size.allow_loose,
      retail_price: size.retail_price,
      wholesale_price: size.wholesale_price,
      tax_rate_bp: size.tax_rate_bp,
      min_stock: size.min_stock,
      is_active: 1,
      ...deps.scope,
    };
    tx.products.insert(row);
    return row;
  };

  // ---------- public API ----------

  return {
    /** A new product, with its first sizes if given. Owner only. */
    createGroup(rawInput: CreateGroupInput): { group: NewRow<ProductGroup>; sizes: NewRow<Product>[] } {
      const input = parseInput(CreateGroupInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        checkCategoryAndBrand(tx, input.category_id, input.brand_id);
        checkLabels(input.sizes.map((s, i) => ({ id: `#${i + 1}`, label: s.pack_label })));
        const units = [...new Set(input.sizes.map((s) => s.base_unit))];
        if (units.length > 1) throw new DomainError('MIXED_UNITS', `all sizes of one product must use the same unit, not ${units.join(' and ')}`, { unit: units[1]!, expected: units[0]! });
        input.sizes.forEach((s) => checkCodes(tx, s));
        const codes = input.sizes.flatMap((s) => [s.barcode, s.sku]).filter((c): c is string => c !== null);
        if (new Set(codes).size !== codes.length) throw new DomainError('DUPLICATE_BARCODE', 'two of the new sizes use the same barcode or SKU');

        const group: NewRow<ProductGroup> = {
          id: deps.ids.newId(),
          name_en: input.name_en ?? null,
          name_ur: input.name_ur ?? null,
          category_id: input.category_id ?? null,
          brand_id: input.brand_id ?? null,
          notes: input.notes || null,
          is_active: 1,
          ...deps.scope,
        };
        tx.productGroups.insert(group);
        const created = input.sizes.map((s) => insertSize(tx, group, s));
        return { group, sizes: created };
      });
    },

    /** Renames a product or changes its category, brand or notes. Every size's copies are rewritten. Owner only. */
    updateGroup(rawInput: UpdateGroupInput): GroupResult {
      const input = parseInput(UpdateGroupInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const group = liveGroup(tx, input.group_id);
        const patch: ProductGroupPatch = {};
        if (input.name_en !== undefined && input.name_en !== group.name_en) patch.name_en = input.name_en;
        if (input.name_ur !== undefined && input.name_ur !== group.name_ur) patch.name_ur = input.name_ur;
        if (input.category_id !== undefined && input.category_id !== group.category_id) patch.category_id = input.category_id;
        if (input.brand_id !== undefined && input.brand_id !== group.brand_id) patch.brand_id = input.brand_id;
        if (input.notes !== undefined && (input.notes || null) !== group.notes) patch.notes = input.notes || null;

        const next = { ...group, ...patch };
        if (next.name_en === null && next.name_ur === null) throw new DomainError('INVALID_INPUT', 'a product needs an English or an Urdu name');
        checkCategoryAndBrand(tx, patch.category_id, patch.brand_id);
        if (Object.keys(patch).length > 0) tx.productGroups.update(group.id, patch);
        for (const size of tx.products.listByGroup(group.id)) syncSize(tx, next, size);
        return { group: found(tx.productGroups.getById(group.id), 'product', group.id), sizes: tx.products.listByGroup(group.id) };
      });
    },

    /**
     * Adds a size to a product. If the product's only size has no label yet, `existing_size_label` gives it one in
     * the same transaction (the two sizes must be told apart). Owner only.
     */
    addSize(rawInput: AddSizeInput): { size: NewRow<Product>; sizes: Product[] } {
      const input = parseInput(AddSizeInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const group = liveGroup(tx, input.group_id);
        const existing = tx.products.listByGroup(group.id);
        checkUnits(input.size.base_unit, existing);
        checkCodes(tx, input.size);

        const lone = existing.length === 1 && existing[0]!.pack_label === '' ? existing[0]! : undefined;
        if (lone && input.existing_size_label === undefined) {
          throw new DomainError('PACK_LABEL_REQUIRED', 'give the existing size a pack label: it is no longer the only size', { sizeId: lone.id });
        }
        if (!lone && input.existing_size_label !== undefined) {
          throw new DomainError('INVALID_INPUT', 'existing_size_label is only for a product whose single size has no label');
        }
        const labels = existing.map((e) => ({ id: e.id, label: e.id === lone?.id ? input.existing_size_label! : e.pack_label }));
        checkLabels([...labels, { id: 'new', label: input.size.pack_label }]);

        // The existing size gets its label first, so the database never sees two sizes with an empty one.
        if (lone) syncSize(tx, group, lone, input.existing_size_label!);
        const size = insertSize(tx, group, input.size);
        return { size, sizes: tx.products.listByGroup(group.id) };
      });
    },

    /** Changes one size. Price and tax-rate changes are written to the audit log. Owner only. */
    updateSize(rawInput: UpdateSizeInput): Product {
      const input = parseInput(UpdateSizeInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const size = liveSize(tx, input.product_id);
        const group = liveGroup(tx, size.group_id);
        const c = input.changes;
        const siblings = tx.products.listByGroup(group.id).filter((s) => s.id !== size.id);

        // Only what actually changes goes into the patch (an absent field means "leave it alone").
        const patch: ProductPatch = {};
        if (c.sku !== undefined && c.sku !== size.sku) patch.sku = c.sku;
        if (c.barcode !== undefined && c.barcode !== size.barcode) patch.barcode = c.barcode;
        if (c.base_unit !== undefined && c.base_unit !== size.base_unit) patch.base_unit = c.base_unit;
        if (c.pack_size !== undefined && c.pack_size !== size.pack_size) patch.pack_size = c.pack_size;
        if (c.allow_loose !== undefined && c.allow_loose !== size.allow_loose) patch.allow_loose = c.allow_loose;
        if (c.retail_price !== undefined && c.retail_price !== size.retail_price) patch.retail_price = c.retail_price;
        if (c.wholesale_price !== undefined && c.wholesale_price !== size.wholesale_price) patch.wholesale_price = c.wholesale_price;
        if (c.tax_rate_bp !== undefined && c.tax_rate_bp !== size.tax_rate_bp) patch.tax_rate_bp = c.tax_rate_bp;
        if (c.min_stock !== undefined && c.min_stock !== size.min_stock) patch.min_stock = c.min_stock;

        if (patch.base_unit !== undefined || patch.pack_size !== undefined) {
          if (tx.batches.listForProduct(size.id).length > 0) {
            throw new DomainError('PACK_SIZE_LOCKED', 'this size already has batches: its pack size and unit can no longer change', { sizeId: size.id });
          }
        }
        if (patch.base_unit !== undefined) checkUnits(patch.base_unit, siblings);
        checkCodes(tx, { barcode: patch.barcode, sku: patch.sku }, size.id);

        const label = c.pack_label ?? size.pack_label;
        checkLabels([...siblings.map((s) => ({ id: s.id, label: s.pack_label })), { id: size.id, label }]);

        const priceChanged = patch.retail_price !== undefined || patch.wholesale_price !== undefined;
        const taxChanged = patch.tax_rate_bp !== undefined;
        const audit = (action: string, before: Record<string, number>, after: Record<string, number>): void =>
          tx.audit.insert(
            rows.audit({ user_id: input.actor_id, action, table_name: 'products', row_id: size.id, details: { product_id: size.id, group_id: group.id, before, after } }),
          );
        if (priceChanged) {
          audit('price_changed', { retail_price: size.retail_price, wholesale_price: size.wholesale_price }, { retail_price: patch.retail_price ?? size.retail_price, wholesale_price: patch.wholesale_price ?? size.wholesale_price });
        }
        if (taxChanged) audit('tax_rate_changed', { tax_rate_bp: size.tax_rate_bp }, { tax_rate_bp: patch.tax_rate_bp! });

        if (Object.keys(patch).length > 0) tx.products.update(size.id, patch);
        syncSize(tx, group, { ...size, ...patch }, label);
        return found(tx.products.getById(size.id), 'size', size.id);
      });
    },

    /** Turns one size on or off. A size cannot be turned on inside an inactive product. Owner only. */
    setSizeActive(rawInput: SetActiveInput): void {
      const input = parseInput(SetActiveInput, rawInput);
      deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const size = liveSize(tx, input.id);
        const want = input.is_active ? 1 : 0;
        if (size.is_active === want) return;
        if (want === 1 && liveGroup(tx, size.group_id).is_active !== 1) {
          throw new DomainError('GROUP_INACTIVE', 'this product is inactive: reactivate it first');
        }
        tx.products.update(size.id, { is_active: want });
      });
    },

    /**
     * Turns a whole product on or off. Turning it off also turns off all its sizes (in the same transaction);
     * turning it on again turns on only the product, each size is switched on one by one. Audited. Owner only.
     */
    setGroupActive(rawInput: SetActiveInput): void {
      const input = parseInput(SetActiveInput, rawInput);
      deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const group = liveGroup(tx, input.id);
        const want = input.is_active ? 1 : 0;
        if (group.is_active === want) return;
        const turnedOff: string[] = [];
        if (want === 0) {
          for (const size of tx.products.listByGroup(group.id)) {
            if (size.is_active === 1) {
              tx.products.update(size.id, { is_active: 0 });
              turnedOff.push(size.id);
            }
          }
        }
        tx.productGroups.update(group.id, { is_active: want });
        tx.audit.insert(
          rows.audit({
            user_id: input.actor_id,
            action: want === 1 ? 'group_reactivated' : 'group_deactivated',
            table_name: 'product_groups',
            row_id: group.id,
            details: { group_id: group.id, sizes_deactivated: turnedOff },
          }),
        );
      });
    },

    /**
     * Moves a size into another product, for example to join "Insecticide 500ml" and "Insecticide 1L" into one
     * product. The sizes must share a base unit and labels must stay unique. The size's names are rewritten, and
     * if its old product is left with no sizes that product is switched off. One transaction, one audit row. Owner only.
     */
    moveSize(rawInput: MoveSizeInput): Product {
      const input = parseInput(MoveSizeInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const size = liveSize(tx, input.product_id);
        const from = liveGroup(tx, size.group_id);
        const to = liveGroup(tx, input.to_group_id);
        if (from.id === to.id) throw new DomainError('INVALID_INPUT', 'the size is already in that product');
        if (to.is_active !== 1) throw new DomainError('GROUP_INACTIVE', 'the product it is moving into is inactive');

        const targets = tx.products.listByGroup(to.id);
        checkUnits(size.base_unit, targets);
        const lone = targets.length === 1 && targets[0]!.pack_label === '' ? targets[0]! : undefined;
        if (lone && input.existing_size_label === undefined) {
          throw new DomainError('PACK_LABEL_REQUIRED', 'give the size already in that product a pack label: it is no longer the only size', { sizeId: lone.id });
        }
        if (!lone && input.existing_size_label !== undefined) {
          throw new DomainError('INVALID_INPUT', 'existing_size_label is only for a product whose single size has no label');
        }
        const label = input.pack_label ?? size.pack_label;
        checkLabels([...targets.map((t) => ({ id: t.id, label: t.id === lone?.id ? input.existing_size_label! : t.pack_label })), { id: size.id, label }]);

        if (lone) syncSize(tx, to, lone, input.existing_size_label!);
        const want = copiesOf(to, label);
        tx.products.update(size.id, { group_id: to.id, pack_label: label, ...want });

        const leftBehind = tx.products.listByGroup(from.id);
        const sourceDeactivated = leftBehind.length === 0 && from.is_active === 1;
        if (sourceDeactivated) tx.productGroups.update(from.id, { is_active: 0 });

        tx.audit.insert(
          rows.audit({
            user_id: input.actor_id,
            action: 'size_moved',
            table_name: 'products',
            row_id: size.id,
            details: { product_id: size.id, from_group_id: from.id, to_group_id: to.id, from_label: size.pack_label, to_label: label, source_deactivated: sourceDeactivated },
          }),
        );
        return found(tx.products.getById(size.id), 'size', size.id);
      });
    },

    /** Products with their sizes and stock, found by what was typed in English or Urdu (see searchCatalogue). */
    search(rawInput: SearchInput = {}): CatalogueHit[] {
      const input = parseInput(SearchInput, rawInput);
      const options: SearchOptions = input.include_inactive === undefined ? {} : { include_inactive: input.include_inactive };
      return deps.uow.run((tx) => searchCatalogue(tx.productGroups.listWithSizes(todayUtc(deps.clock)), input.query, options));
    },
  };
}
export type CatalogueService = ReturnType<typeof createCatalogueService>;
