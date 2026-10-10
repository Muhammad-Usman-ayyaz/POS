// The edit/add product form, without any React: what the person typed (text), how it is checked, and how it becomes the calls to
// the shell. Kept pure so the rules that matter (rupees to paisa, percent to basis points, packs to base units, the pack-size lock)
// can be tested on their own.
import type { CatalogueList } from '@pos/api-contract';

export type Unit = 'ml' | 'g' | 'piece';
type ListedGroup = CatalogueList['hits'][number];
export type SavedSize = ListedGroup['sizes'][number];

/** A size as typed. Numbers are kept as TEXT while typing; they are turned into paisa, basis points and base units on save. */
export interface SizeDraft {
  /** Identifies the card on screen (new sizes have no id yet). */
  key: string;
  /** The product id of a saved size; null for one that is not saved yet. */
  id: string | null;
  label: string;
  /** Base units per pack, as text. */
  packSize: string;
  sku: string;
  barcode: string;
  /** Rupees, as typed ("118" or "118.50"). */
  retail: string;
  wholesale: string;
  /** Percent, as typed ("18" or "2.5"). */
  taxPct: string;
  /** The low-stock alert in PACKS, as typed. Stored in base units. */
  minPacks: string;
  allowLoose: boolean;
  active: boolean;
  /** Batches this size has had. More than 0 locks the pack size. */
  batchCount: number;
  stockTotal: number;
  /** What was saved, to find what changed. Null for a new size. */
  saved: SavedSize | null;
}

export interface ProductDraft {
  nameEn: string;
  nameUr: string;
  /** '' means none. */
  categoryId: string;
  brandId: string;
  unit: Unit;
  sizes: SizeDraft[];
}

export interface SavedGroup {
  group: ListedGroup['group'];
  sizes: SavedSize[];
}

// ---------- numbers: typed text to stored values ----------

const stripped = (text: string): string => text.trim().replace(/,/g, '').replace(/^rs\.?\s*/i, '');

/** "118" is 11800 paisa, "118.5" is 11850, "118.50" is 11850. Whole numbers of paisa only; null when it is not an amount. */
export function parseRupees(text: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(stripped(text));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
}

/** 11800 to "118", 11850 to "118.50". */
export function rupeesText(paisa: number): string {
  const whole = Math.floor(paisa / 100);
  const rest = paisa % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}

/** A percentage typed as "18" or "2.5" is 1800 or 250 basis points, as the database stores it. 0 to 100 percent; null when it is not one. */
export function parseTaxPercent(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return bp <= 10_000 ? bp : null;
}

/** 1800 to "18", 250 to "2.5". */
export function taxPercentText(basisPoints: number): string {
  const text = (basisPoints / 100).toFixed(2).replace(/\.?0+$/, '');
  return text === '' ? '0' : text;
}

export function parsePackSize(text: string): number | null {
  const match = /^\d{1,9}$/.exec(text.trim());
  const n = match ? Number(match[0]) : NaN;
  return n > 0 ? n : null;
}

/** The alert typed in packs ("5", "0.5"), as base units: 5 packs of 250 ml is 1250 ml. Empty is 0. Null when it is not a count of packs or does not come to whole base units. */
export function parseMinPacks(text: string, packSize: number): number | null {
  const typed = text.trim();
  if (typed === '') return 0;
  if (!/^\d{1,6}(?:\.\d{1,3})?$/.test(typed)) return null;
  const base = Number(typed) * packSize;
  return Math.abs(base - Math.round(base)) < 1e-6 ? Math.round(base) : null;
}

/** Base units back to packs, for the form: 1250 ml of a 250 ml pack is "5". */
export function packsText(baseUnits: number, packSize: number): string {
  if (packSize <= 0) return '0';
  return String(Math.round((baseUnits / packSize) * 1000) / 1000);
}

// ---------- the draft ----------

let counter = 0;
const nextKey = (): string => `size-${(counter += 1)}`;

export function blankSize(): SizeDraft {
  return { key: nextKey(), id: null, label: '', packSize: '', sku: '', barcode: '', retail: '', wholesale: '', taxPct: '0', minPacks: '', allowLoose: false, active: true, batchCount: 0, stockTotal: 0, saved: null };
}

export function sizeFromSaved(size: SavedSize): SizeDraft {
  return {
    key: size.id,
    id: size.id,
    label: size.pack_label,
    packSize: String(size.pack_size),
    sku: size.sku ?? '',
    barcode: size.barcode ?? '',
    retail: rupeesText(size.retail_price),
    wholesale: rupeesText(size.wholesale_price),
    taxPct: taxPercentText(size.tax_rate_bp),
    minPacks: size.min_stock === 0 ? '' : packsText(size.min_stock, size.pack_size),
    allowLoose: size.allow_loose === 1,
    active: size.is_active === 1,
    batchCount: size.batch_count,
    stockTotal: size.stock_total,
    saved: size,
  };
}

export function newDraft(): ProductDraft {
  return { nameEn: '', nameUr: '', categoryId: '', brandId: '', unit: 'ml', sizes: [blankSize()] };
}

export function draftFromSaved(saved: SavedGroup): ProductDraft {
  return {
    nameEn: saved.group.name_en ?? '',
    nameUr: saved.group.name_ur ?? '',
    categoryId: saved.group.category_id ?? '',
    brandId: saved.group.brand_id ?? '',
    unit: saved.sizes[0]?.base_unit ?? 'ml',
    sizes: saved.sizes.map(sizeFromSaved),
  };
}

/** A saved size with batches keeps its pack size and unit. */
export const isLocked = (size: SizeDraft): boolean => size.id !== null && size.batchCount > 0;

/** The unit is the product's, so it can change only while no saved size has batches and at most one size is saved (there is nothing to disagree with). */
export function unitEditable(draft: ProductDraft): boolean {
  const savedSizes = draft.sizes.filter((s) => s.id !== null);
  return savedSizes.length <= 1 && !savedSizes.some(isLocked);
}

// ---------- checking ----------

export type FieldProblem = 'labelRequired' | 'packInvalid' | 'retailInvalid' | 'wholesaleInvalid' | 'taxInvalid' | 'minInvalid';
export interface DraftProblems {
  name: boolean;
  sizes: Record<string, Partial<Record<'label' | 'packSize' | 'retail' | 'wholesale' | 'tax' | 'minPacks', FieldProblem>>>;
}

/** What is wrong with the form before it is sent. (The shell checks everything again; this is so the person sees it next to the field.) */
export function checkDraft(draft: ProductDraft): DraftProblems {
  const problems: DraftProblems = { name: draft.nameEn.trim() === '' && draft.nameUr.trim() === '', sizes: {} };
  const several = draft.sizes.length > 1;
  for (const size of draft.sizes) {
    const p: DraftProblems['sizes'][string] = {};
    if (several && size.label.trim() === '') p.label = 'labelRequired';
    const pack = parsePackSize(size.packSize);
    if (pack === null) p.packSize = 'packInvalid';
    if (parseRupees(size.retail) === null) p.retail = 'retailInvalid';
    if (parseRupees(size.wholesale) === null) p.wholesale = 'wholesaleInvalid';
    if (parseTaxPercent(size.taxPct) === null) p.tax = 'taxInvalid';
    if (pack !== null && parseMinPacks(size.minPacks, pack) === null) p.minPacks = 'minInvalid';
    if (Object.keys(p).length > 0) problems.sizes[size.key] = p;
  }
  return problems;
}

export const hasProblems = (p: DraftProblems): boolean => p.name || Object.keys(p.sizes).length > 0;

// ---------- the calls ----------

export interface SizePayload {
  pack_label: string;
  sku: string | null;
  barcode: string | null;
  base_unit: Unit;
  pack_size: number;
  allow_loose: 0 | 1;
  retail_price: number;
  wholesale_price: number;
  tax_rate_bp: number;
  min_stock: number;
}

/** A size as the shell wants it. Call only after checkDraft found nothing. */
export function sizePayload(size: SizeDraft, unit: Unit): SizePayload {
  const pack = parsePackSize(size.packSize) as number;
  return {
    pack_label: size.label.trim(),
    sku: size.sku.trim() === '' ? null : size.sku.trim(),
    barcode: size.barcode.trim() === '' ? null : size.barcode.trim(),
    base_unit: unit,
    pack_size: pack,
    // A piece cannot be sold in parts.
    allow_loose: unit !== 'piece' && size.allowLoose ? 1 : 0,
    retail_price: parseRupees(size.retail) as number,
    wholesale_price: parseRupees(size.wholesale) as number,
    tax_rate_bp: parseTaxPercent(size.taxPct) as number,
    min_stock: parseMinPacks(size.minPacks, pack) as number,
  };
}

export type SaveStep =
  | { kind: 'createGroup'; input: { name_en?: string; name_ur?: string; category_id: string | null; brand_id: string | null; sizes: SizePayload[] } }
  | { kind: 'updateGroup'; input: { group_id: string; name_en?: string | null; name_ur?: string | null; category_id?: string | null; brand_id?: string | null } }
  | { kind: 'updateSize'; key: string; input: { product_id: string; changes: Partial<SizePayload> } }
  | { kind: 'addSize'; key: string; input: { group_id: string; size: SizePayload } }
  | { kind: 'setSizeActive'; key: string; input: { id: string; is_active: boolean } };

/**
 * What to send, in order. A new product is ONE call (all or nothing). Editing is: the product's own fields, then the saved sizes
 * that changed, then the new sizes, then switching sizes on or off. Only what changed is sent, and the pack size and unit of a size
 * that has batches are never sent (they cannot change).
 */
export function buildSaveSteps(draft: ProductDraft, saved: SavedGroup | null): SaveStep[] {
  const nameEn = draft.nameEn.trim();
  const nameUr = draft.nameUr.trim();
  if (saved === null) {
    return [
      {
        kind: 'createGroup',
        input: {
          ...(nameEn === '' ? {} : { name_en: nameEn }),
          ...(nameUr === '' ? {} : { name_ur: nameUr }),
          category_id: draft.categoryId === '' ? null : draft.categoryId,
          brand_id: draft.brandId === '' ? null : draft.brandId,
          sizes: draft.sizes.map((s) => sizePayload(s, draft.unit)),
        },
      },
    ];
  }

  const steps: SaveStep[] = [];
  const group: Extract<SaveStep, { kind: 'updateGroup' }>['input'] = { group_id: saved.group.id };
  if (nameEn !== (saved.group.name_en ?? '')) group.name_en = nameEn === '' ? null : nameEn;
  if (nameUr !== (saved.group.name_ur ?? '')) group.name_ur = nameUr === '' ? null : nameUr;
  if (draft.categoryId !== (saved.group.category_id ?? '')) group.category_id = draft.categoryId === '' ? null : draft.categoryId;
  if (draft.brandId !== (saved.group.brand_id ?? '')) group.brand_id = draft.brandId === '' ? null : draft.brandId;
  if (Object.keys(group).length > 1) steps.push({ kind: 'updateGroup', input: group });

  for (const size of draft.sizes) {
    if (size.id === null || size.saved === null) continue;
    const was = size.saved;
    // A locked size keeps the pack size it has, whatever the draft says, so the alert is converted with the real one.
    const now = sizePayload(isLocked(size) ? { ...size, packSize: String(was.pack_size) } : size, isLocked(size) ? was.base_unit : draft.unit);
    const changes: Partial<SizePayload> = {};
    if (now.pack_label !== was.pack_label) changes.pack_label = now.pack_label;
    if (now.sku !== was.sku) changes.sku = now.sku;
    if (now.barcode !== was.barcode) changes.barcode = now.barcode;
    if (!isLocked(size)) {
      if (now.pack_size !== was.pack_size) changes.pack_size = now.pack_size;
      if (now.base_unit !== was.base_unit) changes.base_unit = now.base_unit;
    }
    if (now.allow_loose !== was.allow_loose) changes.allow_loose = now.allow_loose;
    if (now.retail_price !== was.retail_price) changes.retail_price = now.retail_price;
    if (now.wholesale_price !== was.wholesale_price) changes.wholesale_price = now.wholesale_price;
    if (now.tax_rate_bp !== was.tax_rate_bp) changes.tax_rate_bp = now.tax_rate_bp;
    // The alert is typed in packs; compare in base units, with the pack size it will have.
    if (now.min_stock !== was.min_stock) changes.min_stock = now.min_stock;
    if (Object.keys(changes).length > 0) steps.push({ kind: 'updateSize', key: size.key, input: { product_id: size.id, changes } });
  }

  for (const size of draft.sizes) {
    if (size.id !== null) continue;
    steps.push({ kind: 'addSize', key: size.key, input: { group_id: saved.group.id, size: sizePayload(size, draft.unit) } });
  }

  for (const size of draft.sizes) {
    if (size.id === null || size.saved === null) continue;
    if (size.active !== (size.saved.is_active === 1)) steps.push({ kind: 'setSizeActive', key: size.key, input: { id: size.id, is_active: size.active } });
  }
  return steps;
}
