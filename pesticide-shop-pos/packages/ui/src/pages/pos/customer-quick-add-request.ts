// The rules behind the POS quick-add, without React or CSS (exposed through `@pos/ui/rules`, so the desktop tests send the same requests through the real handlers).
// It reuses the customer form's own builders: a quick-add is a customer draft with only the contact fields filled, sent as a NON-owner request even when
// the owner is signed in. So the request never carries a credit limit, a price type, farmer details, created_by or a role: the shell applies the shop's
// default credit limit and the retail price type (plan D2), and the owner sets terms on the customer page.
import type { Api } from '@pos/api-contract';
import { buildCreateRequest, buildDuplicatesRequest, isBlankName, newDraft, type CustomerDraft, type SavedCustomer } from '../customers/form/customer-form-requests.js';
import type { Customer } from './pos-state.js';

type CreateInput = Parameters<Api['customers']['create']>[0];
type DuplicatesInput = NonNullable<Parameters<Api['customers']['findDuplicates']>[0]>;

/** What the compact form holds. A single name box: the script of the text decides which name it is. */
export interface QuickAddForm {
  name: string;
  phone: string;
  village: string;
}

/** Arabic, Urdu and the presentation forms: any of these letters makes the name an Urdu name. */
const URDU_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const hasUrduScript = (text: string): boolean => URDU_SCRIPT.test(text);

/** Digits, spaces, plus and dashes only: what was typed in the search box is a phone number, not a name. */
const looksLikePhone = (text: string): boolean => /^\+?[\d\s-]{5,}$/.test(text.trim());

/** The form the search text starts: a phone-like text pre-fills the phone, anything else the name. */
export const startForm = (typed: string): QuickAddForm => (looksLikePhone(typed) ? { name: '', phone: typed.trim(), village: '' } : { name: typed.trim(), phone: '', village: '' });

export const quickAddDraft = (form: QuickAddForm): CustomerDraft => {
  const name = isBlankName(form.name) ? '' : form.name.trim();
  return { ...newDraft(), nameEn: name && !hasUrduScript(name) ? name : '', nameUr: name && hasUrduScript(name) ? name : '', phone: form.phone, village: form.village };
};

export const quickAddNameMissing = (form: QuickAddForm): boolean => isBlankName(form.name);

/** The create request: contact fields only (never `owner: true`), plus confirm_duplicate on "Save as new". */
export const buildQuickAddRequest = (form: QuickAddForm, confirmDuplicate = false): CreateInput => buildCreateRequest(quickAddDraft(form), { owner: false, showFarmer: false, confirmDuplicate });

export const buildQuickAddDuplicatesRequest = (form: QuickAddForm): DuplicatesInput => buildDuplicatesRequest(quickAddDraft(form));

/** The new customer as the bill holds one (price type from the reply, not assumed). */
export const billCustomerFrom = (c: Pick<SavedCustomer, 'id' | 'name_en' | 'name_ur' | 'village' | 'default_price_type'>): Customer => ({
  id: c.id,
  nameEn: c.name_en,
  nameUr: c.name_ur,
  village: c.village,
  defaultPriceType: c.default_price_type,
});
