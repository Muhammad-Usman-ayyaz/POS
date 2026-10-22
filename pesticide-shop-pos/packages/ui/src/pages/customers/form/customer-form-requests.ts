// The rules behind the customer form, without React or CSS: what the form holds, what is wrong with it, and the requests it sends.
// A separate module (exposed through `@pos/ui/rules`) so the desktop tests send the form's own requests through the real handlers.
// Money is typed in rupees and sent as whole paisa through the shared `parseRupees`. No user, role or created_by is ever put in a request:
// the shell takes the user from the session.
import type { Api, CustomerSettingsView, CustomerSummaryView, DuplicateMatchView } from '@pos/api-contract';
import { parseRupees } from '../../products/product-form-state.js';
import { groupedRupeesText } from '../../pos/pos-state.js';

export type SavedCustomer = CustomerSummaryView['customer'];
export type PriceType = 'retail' | 'wholesale';
type CreateInput = Parameters<Api['customers']['create']>[0];
type UpdateInput = Parameters<Api['customers']['update']>[0];
type TermsInput = Parameters<Api['customers']['setTerms']>[0];
type DuplicatesInput = NonNullable<Parameters<Api['customers']['findDuplicates']>[0]>;
type SettingsInput = NonNullable<Parameters<Api['customers']['setSettings']>[0]>;

/** What the form holds, as text: an empty box is "". */
export interface CustomerDraft {
  nameEn: string;
  nameUr: string;
  phone: string;
  village: string;
  notes: string;
  /** Owner only. */
  priceType: PriceType;
  /** Owner only. Rupees as typed; "0" means no limit. */
  creditLimit: string;
  fatherName: string;
  cnic: string;
  phone2: string;
  guarantor: string;
  landSize: string;
  crop: string;
}

/** A new customer starts with the shop's default limit (the owner sees it in the box; staff never send it). */
export const newDraft = (defaultLimitPaisa = 0): CustomerDraft => ({
  nameEn: '',
  nameUr: '',
  phone: '',
  village: '',
  notes: '',
  priceType: 'retail',
  creditLimit: groupedRupeesText(defaultLimitPaisa),
  fatherName: '',
  cnic: '',
  phone2: '',
  guarantor: '',
  landSize: '',
  crop: '',
});

export const draftFromCustomer = (c: SavedCustomer): CustomerDraft => ({
  nameEn: c.name_en ?? '',
  nameUr: c.name_ur ?? '',
  phone: c.phone ?? '',
  village: c.village ?? '',
  notes: c.notes ?? '',
  priceType: c.default_price_type,
  creditLimit: groupedRupeesText(c.credit_limit),
  fatherName: c.father_name ?? '',
  cnic: c.cnic ?? '',
  phone2: c.phone2 ?? '',
  guarantor: c.guarantor ?? '',
  landSize: c.land_size ?? '',
  crop: c.crop ?? '',
});

/** Nothing but spaces, tabs, line breaks or invisible marks (zero-width space, direction marks): no name. */
export const isBlankName = (text: string): boolean => text.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '') === '';

export interface CustomerProblems {
  /** Neither name was written. */
  name: boolean;
  /** The credit limit is not an amount in rupees (owner only). */
  creditLimit: boolean;
}

/** Staff have no credit limit box, so it is never a problem for them. */
export function checkDraft(draft: CustomerDraft, owner: boolean): CustomerProblems {
  return {
    name: isBlankName(draft.nameEn) && isBlankName(draft.nameUr),
    creditLimit: owner && parseRupees(draft.creditLimit) === null,
  };
}
export const hasProblems = (p: CustomerProblems): boolean => p.name || p.creditLimit;

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const same = (draftText: string, saved: string | null): boolean => draftText.trim() === (saved ?? '').trim();

/**
 * A new customer. Everyone sends the contact fields. Only the OWNER's request carries the credit limit and price type (and the farmer
 * details, when the shop shows them and something is written): a staff request with any of them is refused by the shell.
 */
export function buildCreateRequest(draft: CustomerDraft, opts: { owner: boolean; showFarmer: boolean; confirmDuplicate?: boolean }): CreateInput {
  const fields: CreateInput['fields'] = {
    ...(draft.nameEn.trim() ? { name_en: draft.nameEn.trim() } : {}),
    ...(draft.nameUr.trim() ? { name_ur: draft.nameUr.trim() } : {}),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    ...(draft.village.trim() ? { village: draft.village.trim() } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
  if (opts.owner) {
    fields.credit_limit = parseRupees(draft.creditLimit) as number;
    fields.default_price_type = draft.priceType;
    if (opts.showFarmer) {
      if (draft.fatherName.trim()) fields.father_name = draft.fatherName.trim();
      if (draft.cnic.trim()) fields.cnic = draft.cnic.trim();
      if (draft.phone2.trim()) fields.phone2 = draft.phone2.trim();
      if (draft.guarantor.trim()) fields.guarantor = draft.guarantor.trim();
      if (draft.landSize.trim()) fields.land_size = draft.landSize.trim();
      if (draft.crop.trim()) fields.crop = draft.crop.trim();
    }
  }
  return { fields, ...(opts.confirmDuplicate ? { confirm_duplicate: true } : {}) };
}

/** The duplicate check for a typed name or phone (also what the warning lists). */
export function buildDuplicatesRequest(draft: CustomerDraft): DuplicatesInput {
  return {
    ...(draft.nameEn.trim() ? { name_en: draft.nameEn.trim() } : {}),
    ...(draft.nameUr.trim() ? { name_ur: draft.nameUr.trim() } : {}),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
  };
}

/**
 * The edit of the contact fields: ONLY what changed (an emptied box is null), with the version the form loaded.
 * null when no contact field changed, so nothing is sent.
 */
export function buildUpdateRequest(saved: SavedCustomer, draft: CustomerDraft, expectedVersion: number): UpdateInput | null {
  const fields: UpdateInput['fields'] = {};
  if (!same(draft.nameEn, saved.name_en)) fields.name_en = orNull(draft.nameEn);
  if (!same(draft.nameUr, saved.name_ur)) fields.name_ur = orNull(draft.nameUr);
  if (!same(draft.phone, saved.phone)) fields.phone = orNull(draft.phone);
  if (!same(draft.village, saved.village)) fields.village = orNull(draft.village);
  if (!same(draft.notes, saved.notes)) fields.notes = orNull(draft.notes);
  if (Object.keys(fields).length === 0) return null;
  return { customer_id: saved.id, fields, expected_version: expectedVersion };
}

/**
 * The owner's terms: the credit limit in whole paisa, the price type and the farmer details that changed. null when nothing about the
 * terms changed. The farmer details are never sent while the shop has them switched off.
 */
export function buildTermsRequest(saved: SavedCustomer, draft: CustomerDraft, opts: { expectedVersion: number; showFarmer: boolean }): TermsInput | null {
  const limit = parseRupees(draft.creditLimit) as number;
  const farmer: Partial<Pick<TermsInput, 'father_name' | 'cnic' | 'phone2' | 'guarantor' | 'land_size' | 'crop'>> = {};
  if (opts.showFarmer) {
    if (!same(draft.fatherName, saved.father_name)) farmer.father_name = orNull(draft.fatherName);
    if (!same(draft.cnic, saved.cnic)) farmer.cnic = orNull(draft.cnic);
    if (!same(draft.phone2, saved.phone2)) farmer.phone2 = orNull(draft.phone2);
    if (!same(draft.guarantor, saved.guarantor)) farmer.guarantor = orNull(draft.guarantor);
    if (!same(draft.landSize, saved.land_size)) farmer.land_size = orNull(draft.landSize);
    if (!same(draft.crop, saved.crop)) farmer.crop = orNull(draft.crop);
  }
  if (limit === saved.credit_limit && draft.priceType === saved.default_price_type && Object.keys(farmer).length === 0) return null;
  return { customer_id: saved.id, credit_limit: limit, default_price_type: draft.priceType, ...farmer, expected_version: opts.expectedVersion };
}

/** Is any farmer detail on the customer? (The block opens by itself then, so saved data is never hidden from the owner.) */
export const hasFarmerDetails = (c: SavedCustomer): boolean => [c.father_name, c.cnic, c.phone2, c.guarantor, c.land_size, c.crop].some((v) => (v ?? '').trim() !== '');

/** What a duplicate row shows about the balance. Never a negative amount: an advance has its own word. */
export function balanceKind(match: Pick<DuplicateMatchView, 'balance'>): 'owes' | 'advance' {
  return match.balance < 0 ? 'advance' : 'owes';
}

// ---------- Settings: Customers ----------

export interface CustomerSettingsDraft {
  /** Rupees as typed. */
  defaultLimit: string;
  showFarmer: boolean;
}
export const settingsDraftFrom = (s: CustomerSettingsView): CustomerSettingsDraft => ({ defaultLimit: groupedRupeesText(s.default_credit_limit), showFarmer: s.show_farmer_fields });
export const settingsLimitInvalid = (d: CustomerSettingsDraft): boolean => parseRupees(d.defaultLimit) === null;

/** ONLY the settings that changed. Nothing changed gives {}. */
export function buildCustomerSettingsRequest(saved: CustomerSettingsView, draft: CustomerSettingsDraft): SettingsInput {
  const out: SettingsInput = {};
  const limit = parseRupees(draft.defaultLimit);
  if (limit !== null && limit !== saved.default_credit_limit) out.default_credit_limit = limit;
  if (draft.showFarmer !== saved.show_farmer_fields) out.show_farmer_fields = draft.showFarmer;
  return out;
}
