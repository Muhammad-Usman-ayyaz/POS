import { ApiError } from '@pos/api-contract';
import type { Language } from '@pos/api-contract';
import type { DomainErrorCode, ErrorParams } from '@pos/core';
import { formatDate, formatMoney, formatQty, ltr } from './format.js';

// THE one place that turns an error code into words, in English and Urdu.
// Every DomainErrorCode must have an entry (the type below makes the compiler check that), and every entry says
// what went wrong AND what to do next. The numbers come from the error's params (amounts in paisa, quantities in
// base units); the server never sends text to show.

export interface ErrorText {
  /** What went wrong, in one short sentence. */
  title: string;
  /** What to do next. */
  next: string;
}

/** Helpers an entry can use, already set to the current language. */
interface Say {
  /** A number from the params, or 0. */
  n(params: ErrorParams, key: string): number;
  /** A string from the params, or "". */
  s(params: ErrorParams, key: string): string;
  money(paisa: number): string;
  /** A quantity in base units, said in packs. */
  qty(qty: number, packSize: number): string;
  date(iso: string): string;
  /** A plain number kept left to right. */
  num(value: number): string;
}

type Entry = (params: ErrorParams, say: Say) => ErrorText;
type Catalogue = Record<DomainErrorCode, Entry>;

const en: Catalogue = {
  INVALID_MONEY: () => ({ title: 'That amount is not valid', next: 'Type rupees like 1,250 or 1,250.50.' }),
  INVALID_QUANTITY: () => ({ title: 'The quantity must be a whole number above zero', next: 'Type 1 or more.' }),
  INSUFFICIENT_STOCK: (p, t) => {
    const left = t.qty(t.n(p, 'available'), t.n(p, 'packSize'));
    return {
      title: `Only ${left} left in ${t.s(p, 'scope') === 'batch' ? 'this batch' : 'stock'}`,
      next: t.s(p, 'scope') === 'batch' ? 'Lower the quantity, or choose another batch.' : 'Lower the quantity, or receive more stock first.',
    };
  },
  WHOLE_PACKS_ONLY: (p, t) => ({ title: 'This product is sold in whole packs only', next: `Enter whole packs. One pack is ${t.num(t.n(p, 'packSize'))}.` }),
  BATCH_EXPIRED: (p, t) => ({ title: `This batch expired on ${t.date(t.s(p, 'expiry'))}`, next: 'Choose a batch that has not expired.' }),
  BATCH_NOT_AVAILABLE: () => ({ title: 'That batch does not belong to this product', next: 'Choose one of the batches shown for the product.' }),
  ALLOCATION_MISMATCH: () => ({ title: 'The batch quantities do not add up to the line', next: 'Make the batch quantities add up to the quantity you want to sell.' }),
  DISCOUNT_EXCEEDS_LINE: (p, t) => ({ title: `The discount ${t.money(t.n(p, 'discount'))} is more than the price ${t.money(t.n(p, 'linePrice'))}`, next: 'Lower the discount.' }),
  OVERPAID: (p, t) => ({ title: `${t.money(t.n(p, 'paid'))} is more than the total ${t.money(t.n(p, 'total'))}`, next: `Enter ${t.money(t.n(p, 'total'))} or less.` }),
  CREDIT_NEEDS_CUSTOMER: () => ({ title: 'A walk-in sale must be paid in full', next: 'Choose a customer to put the rest on Khata, or enter the full amount.' }),
  INVOICE_VOIDED: () => ({ title: 'This bill has been cancelled', next: 'Goods cannot be returned against a cancelled bill.' }),
  ITEM_NOT_ON_INVOICE: () => ({ title: 'That item is not on this bill', next: 'Pick the item from the bill you are returning against.' }),
  DUPLICATE_LINE: () => ({ title: 'The same item is listed twice', next: 'Combine them into one line.' }),
  RETURN_EXCEEDS_SOLD: (p, t) => ({
    title: `Only ${t.qty(t.n(p, 'returnable'), t.n(p, 'packSize'))} can still be returned`,
    next: 'Lower the quantity. Goods already returned cannot be returned again.',
  }),
  EMPTY_RETURN: () => ({ title: 'Nothing is selected to return', next: 'Choose at least one item and a quantity.' }),
  INVALID_INPUT: () => ({ title: 'Some details are missing or not valid', next: 'Check the fields marked in red and try again.' }),
  NOT_FOUND: () => ({ title: 'We could not find that record', next: 'Go back, refresh the screen and try again.' }),
  NOT_AUTHORIZED: () => ({ title: 'Only the owner can do this', next: 'Ask the owner to sign in and do it, or to approve it.' }),
  PRODUCT_INACTIVE: () => ({ title: 'This product is not for sale', next: 'Choose another product, or ask the owner to switch it back on.' }),
  CREDIT_LIMIT_EXCEEDED: (p, t) => ({
    title: `This sale is over the credit limit of ${t.money(t.n(p, 'limit'))}`,
    next: `The customer owes ${t.money(t.n(p, 'owed'))} and this sale adds ${t.money(t.n(p, 'adds'))}. Take a payment now, lower the amount, or ask the owner to approve it.`,
  }),
  BATCH_CONFLICT: () => ({ title: 'That batch number already exists with a different expiry or cost', next: 'Use the same expiry and cost as before, or choose a new batch number.' }),
  OPENING_BALANCE_EXISTS: () => ({ title: 'This customer already has an opening balance', next: 'Add a correction as a new entry instead.' }),
  NOT_SUPPORTED: () => ({ title: 'This is not available yet', next: 'Use Khata credit for now.' }),
  NOT_SIGNED_IN: () => ({ title: 'Please sign in first', next: 'Sign in to continue.' }),
  INVALID_CREDENTIALS: () => ({ title: 'Wrong username or password', next: 'Check both and try again. If the owner forgot the password, use the recovery code.' }),
  INVALID_RECOVERY_CODE: () => ({ title: 'That recovery code is not right', next: 'Check the code you wrote down: 20 letters and numbers. Each code works once.' }),
  ALREADY_SET_UP: () => ({ title: 'This shop is already set up', next: 'Sign in instead.' }),
  INTERNAL: () => ({ title: 'Something went wrong', next: 'Try again. If it keeps happening, close the app and open it again.' }),
};

const ur: Catalogue = {
  INVALID_MONEY: () => ({ title: 'یہ رقم درست نہیں', next: 'روپے اس طرح لکھیں: 1,250 یا 1,250.50۔' }),
  INVALID_QUANTITY: () => ({ title: 'مقدار صفر سے زیادہ پورا عدد ہونی چاہیے', next: '1 یا اس سے زیادہ لکھیں۔' }),
  INSUFFICIENT_STOCK: (p, t) => {
    const left = t.qty(t.n(p, 'available'), t.n(p, 'packSize'));
    return {
      title: t.s(p, 'scope') === 'batch' ? `اس بیچ میں صرف ${left} باقی ہے` : `اسٹاک میں صرف ${left} باقی ہے`,
      next: t.s(p, 'scope') === 'batch' ? 'مقدار کم کریں، یا دوسرا بیچ چنیں۔' : 'مقدار کم کریں، یا پہلے مزید اسٹاک وصول کریں۔',
    };
  },
  WHOLE_PACKS_ONLY: (p, t) => ({ title: 'یہ مصنوعہ صرف پورے پیک میں بکتا ہے', next: `پورے پیک لکھیں۔ ایک پیک ${t.num(t.n(p, 'packSize'))} کا ہے۔` }),
  BATCH_EXPIRED: (p, t) => ({ title: `اس بیچ کی میعاد ${t.date(t.s(p, 'expiry'))} کو ختم ہو گئی`, next: 'ایسا بیچ چنیں جس کی میعاد ختم نہ ہوئی ہو۔' }),
  BATCH_NOT_AVAILABLE: () => ({ title: 'یہ بیچ اس مصنوعہ کا نہیں ہے', next: 'مصنوعہ کے دکھائے گئے بیچوں میں سے کوئی چنیں۔' }),
  ALLOCATION_MISMATCH: () => ({ title: 'بیچوں کی مقدار لائن کی مقدار کے برابر نہیں', next: 'بیچوں کی مقدار کو بیچی جانے والی مقدار کے برابر کریں۔' }),
  DISCOUNT_EXCEEDS_LINE: (p, t) => ({ title: `رعایت ${t.money(t.n(p, 'discount'))} قیمت ${t.money(t.n(p, 'linePrice'))} سے زیادہ ہے`, next: 'رعایت کم کریں۔' }),
  OVERPAID: (p, t) => ({ title: `${t.money(t.n(p, 'paid'))} کل رقم ${t.money(t.n(p, 'total'))} سے زیادہ ہے`, next: `${t.money(t.n(p, 'total'))} یا اس سے کم لکھیں۔` }),
  CREDIT_NEEDS_CUSTOMER: () => ({ title: 'عام گاہک کا بل پورا ادا ہونا ضروری ہے', next: 'باقی رقم کھاتے میں ڈالنے کے لیے گاہک چنیں، یا پوری رقم لکھیں۔' }),
  INVOICE_VOIDED: () => ({ title: 'یہ بل منسوخ ہو چکا ہے', next: 'منسوخ بل کے مقابلے میں مال واپس نہیں ہو سکتا۔' }),
  ITEM_NOT_ON_INVOICE: () => ({ title: 'یہ آئٹم اس بل میں نہیں ہے', next: 'جس بل پر واپسی کر رہے ہیں اسی میں سے آئٹم چنیں۔' }),
  DUPLICATE_LINE: () => ({ title: 'ایک ہی آئٹم دو بار لکھا ہے', next: 'انہیں ایک لائن میں ملا دیں۔' }),
  RETURN_EXCEEDS_SOLD: (p, t) => ({
    title: `صرف ${t.qty(t.n(p, 'returnable'), t.n(p, 'packSize'))} واپس ہو سکتا ہے`,
    next: 'مقدار کم کریں۔ جو مال پہلے واپس ہو چکا وہ دوبارہ واپس نہیں ہو سکتا۔',
  }),
  EMPTY_RETURN: () => ({ title: 'واپسی کے لیے کچھ نہیں چنا گیا', next: 'کم از کم ایک آئٹم اور اس کی مقدار چنیں۔' }),
  INVALID_INPUT: () => ({ title: 'کچھ تفصیلات غائب ہیں یا درست نہیں', next: 'سرخ نشان والے خانے دیکھیں اور دوبارہ کوشش کریں۔' }),
  NOT_FOUND: () => ({ title: 'یہ ریکارڈ نہیں ملا', next: 'واپس جائیں، اسکرین تازہ کریں اور دوبارہ کوشش کریں۔' }),
  NOT_AUTHORIZED: () => ({ title: 'یہ کام صرف مالک کر سکتا ہے', next: 'مالک سے کہیں کہ لاگ ان کر کے یہ کام کرے یا منظوری دے۔' }),
  PRODUCT_INACTIVE: () => ({ title: 'یہ مصنوعہ فروخت کے لیے نہیں ہے', next: 'دوسرا مصنوعہ چنیں، یا مالک سے اسے دوبارہ چالو کروائیں۔' }),
  CREDIT_LIMIT_EXCEEDED: (p, t) => ({
    title: `یہ فروخت ${t.money(t.n(p, 'limit'))} کی ادھار حد سے زیادہ ہے`,
    next: `گاہک پر ${t.money(t.n(p, 'owed'))} باقی ہے اور اس فروخت سے ${t.money(t.n(p, 'adds'))} مزید بنتا ہے۔ ابھی کچھ رقم لیں، رقم کم کریں، یا مالک سے منظوری لیں۔`,
  }),
  BATCH_CONFLICT: () => ({ title: 'یہ بیچ نمبر پہلے سے موجود ہے مگر میعاد یا لاگت مختلف ہے', next: 'پہلے والی میعاد اور لاگت لکھیں، یا نیا بیچ نمبر رکھیں۔' }),
  OPENING_BALANCE_EXISTS: () => ({ title: 'اس گاہک کا ابتدائی بقایا پہلے سے درج ہے', next: 'اس کے بجائے نئے اندراج کے طور پر درستی کریں۔' }),
  NOT_SUPPORTED: () => ({ title: 'یہ سہولت ابھی دستیاب نہیں', next: 'فی الحال کھاتے میں کریڈٹ استعمال کریں۔' }),
  NOT_SIGNED_IN: () => ({ title: 'پہلے لاگ ان کریں', next: 'جاری رکھنے کے لیے لاگ ان کریں۔' }),
  INVALID_CREDENTIALS: () => ({ title: 'صارف نام یا پاس ورڈ غلط ہے', next: 'دونوں دوبارہ دیکھیں۔ اگر مالک پاس ورڈ بھول گیا ہے تو ریکوری کوڈ استعمال کریں۔' }),
  INVALID_RECOVERY_CODE: () => ({ title: 'ریکوری کوڈ درست نہیں', next: 'اپنا لکھا ہوا کوڈ دیکھیں: 20 حروف اور اعداد۔ ہر کوڈ ایک ہی بار کام کرتا ہے۔' }),
  ALREADY_SET_UP: () => ({ title: 'یہ دکان پہلے سے سیٹ اپ ہو چکی ہے', next: 'اس کے بجائے لاگ ان کریں۔' }),
  INTERNAL: () => ({ title: 'کچھ گڑبڑ ہو گئی', next: 'دوبارہ کوشش کریں۔ بار بار ہو تو ایپ بند کر کے دوبارہ کھولیں۔' }),
};

const CATALOGUES: Record<Language, Catalogue> = { en, ur };

/** Every code that has a message. A test checks this against the core's list of codes. */
export const errorCodes = Object.keys(en) as DomainErrorCode[];

function sayIn(language: Language): Say {
  const plain = language === 'ur' ? ltr : (text: string): string => text;
  return {
    n: (params, key) => (typeof params[key] === 'number' ? (params[key] as number) : 0),
    s: (params, key) => (typeof params[key] === 'string' ? (params[key] as string) : ''),
    money: (paisa) => formatMoney(paisa, language),
    qty: (qty, packSize) => formatQty(qty, packSize, language),
    date: (iso) => plain(formatDate(iso, language)),
    num: (value) => plain(String(value)),
  };
}

/** The words for an error code and its params. */
export function errorText(code: DomainErrorCode, params: ErrorParams, language: Language): ErrorText {
  const entry = CATALOGUES[language][code] ?? CATALOGUES[language].INTERNAL;
  return entry(params, sayIn(language));
}

/** The words for anything that was thrown: an ApiError uses its code, anything else is "something went wrong". */
export function describeError(error: unknown, language: Language): ErrorText & { code: DomainErrorCode } {
  if (error instanceof ApiError) return { code: error.code, ...errorText(error.code, error.params, language) };
  return { code: 'INTERNAL', ...errorText('INTERNAL', {}, language) };
}
