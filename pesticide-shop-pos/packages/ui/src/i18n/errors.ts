import { ApiError } from '@pos/api-contract';
import type { Language } from '@pos/api-contract';
import type { DomainErrorCode, ErrorParams } from '@pos/core';
import { isBaseUnit, type BaseUnitCode } from '@pos/core';
import { formatDate, formatMoney, ltr } from './format.js';
import { en as enMessages } from './messages/en.js';
import { ur as urMessages } from './messages/ur.js';
import { legacyText, packText, qtyText, stockText, unitName } from './units.js';

const MESSAGES_FOR = { en: enMessages, ur: urMessages } as const;

/** The stored unit an error carries in its params (`unit`), or pieces when it has none. */
const unitOf = (params: ErrorParams): BaseUnitCode => (isBaseUnit(params.unit) ? params.unit : 'piece');

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
  /** A quantity from the params (stored base units), said in kg, L or pieces and packs; the params carry `packSize` and `unit`. */
  qty(params: ErrorParams, key: string): string;
  /** The size of one pack from the params, in kg, L or pieces. */
  pack(params: ErrorParams): string;
  /** A stored unit code as its standard unit word. */
  unit(code: string): string;
  /** Old text that may still carry the old small units, shown in kg or L. */
  text(text: string): string;
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
    const left = t.qty(p, 'available');
    return {
      title: `Only ${left} left in ${t.s(p, 'scope') === 'batch' ? 'this batch' : 'stock'}`,
      next: t.s(p, 'scope') === 'batch' ? 'Lower the quantity, or choose another batch.' : 'Lower the quantity, or receive more stock first.',
    };
  },
  WHOLE_PACKS_ONLY: (p, t) => ({ title: 'This product is sold in whole packs only', next: `Enter whole packs. One pack is ${t.pack(p)}.` }),
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
    title: `Only ${t.qty(p, 'returnable')} can still be returned`,
    next: 'Lower the quantity. Goods already returned cannot be returned again.',
  }),
  EMPTY_RETURN: () => ({ title: 'Nothing is selected to return', next: 'Choose at least one item and a quantity.' }),
  RETURN_REASON_REQUIRED: () => ({ title: 'Choose a reason for every item', next: 'Pick why each item is coming back.' }),
  EXPIRED_NOT_RESELLABLE: () => ({ title: 'This batch has expired, so the goods cannot go back on the shelf', next: 'Mark the item as damaged or expired: it is written off.' }),
  VOID_REASON_REQUIRED: () => ({ title: 'A reason is needed to void a bill', next: 'Type why this bill is being voided.' }),
  VOID_HAS_RETURNS: () => ({ title: 'This bill already has returns, so it cannot be voided', next: 'Return the rest of the items instead.' }),
  INVALID_INPUT: () => ({ title: 'Some details are missing or not valid', next: 'Check the fields marked in red and try again.' }),
  NOT_FOUND: () => ({ title: 'We could not find that record', next: 'Go back, refresh the screen and try again.' }),
  NOT_AUTHORIZED: () => ({ title: 'Only the owner can do this', next: 'Ask the owner to sign in and do it, or to approve it.' }),
  PRODUCT_INACTIVE: () => ({ title: 'This product is not for sale', next: 'Choose another product, or ask the owner to switch it back on.' }),
  CREDIT_LIMIT_EXCEEDED: (p, t) => ({
    title: `This sale is over the credit limit of ${t.money(t.n(p, 'limit'))}`,
    next: `The customer owes ${t.money(t.n(p, 'owed'))} and this sale adds ${t.money(t.n(p, 'adds'))}. Take a payment now, lower the amount, or ask the owner to approve it.`,
  }),
  BATCH_CONFLICT: () => ({ title: 'That batch number already exists with a different expiry or cost', next: 'Use the same expiry and cost as before, or choose a new batch number.' }),
  OPENING_BALANCE_EXISTS: () => ({ title: 'This customer already has an opening balance', next: 'The owner can correct it from the same box.' }),
  NO_OPENING_BALANCE: () => ({ title: 'This customer has no opening balance to correct', next: 'Enter an opening balance first.' }),
  NOT_SUPPORTED: () => ({ title: 'This is not available yet', next: 'Use Khata credit for now.' }),
  RECEIPT_DATE_OLD: (p, t) => ({ title: `This receipt is dated ${t.num(t.n(p, 'days'))} days ago (${t.date(t.s(p, 'date'))}). Save anyway?`, next: 'If the date is right, confirm to save it. If not, correct the date.' }),
  FUTURE_DATE: (p, t) => ({ title: `The date ${t.date(t.s(p, 'date'))} is after today`, next: 'Pick today or an earlier day.' }),
  DUPLICATE_NAME: (p, t) => ({ title: `"${t.s(p, 'name')}" is already in the list`, next: 'Pick it from the list instead of adding it again.' }),
  DUPLICATE_PACK_LABEL: (p, t) => ({ title: `This product already has a size of ${t.text(t.s(p, 'label'))}`, next: 'Each size needs a different pack size. Change this one, or edit the existing size.' }),
  DUPLICATE_BARCODE: (p, t) => ({ title: `Barcode ${t.s(p, 'barcode')} is already used by another size`, next: 'Check the barcode on the pack. Each size has its own barcode.' }),
  DUPLICATE_SKU: (p, t) => ({ title: `SKU ${t.s(p, 'sku')} is already used by another size`, next: 'Type a different SKU.' }),
  MIXED_UNITS: (p, t) => ({ title: `All sizes of one product must be measured the same way (${t.unit(t.s(p, 'expected'))})`, next: 'Use kg with kg, or L with L. If this is a different product, make it a new product.' }),
  GROUP_INACTIVE: () => ({ title: 'This product is switched off', next: 'Switch the product on first, then its sizes.' }),
  PACK_LABEL_REQUIRED: () => ({ title: 'Every size needs a pack size', next: 'Type the pack size on each one, for example 0.5 L or 1 kg, so they can be told apart.' }),
  PACK_SIZE_LOCKED: () => ({ title: 'This size already has stock records', next: 'Its pack size and unit can no longer change. Add a new size instead.' }),
  REQUEST_ID_REUSED: () => ({ title: 'This bill was already used for a different sale', next: 'Start the bill again.' }),
  HELD_BILL_GONE: () => ({ title: 'This held bill is not there any more', next: 'Someone else may have resumed or discarded it. Open the held bills again to see what is left.' }),
  VERSION_CONFLICT: () => ({ title: 'Someone else changed this customer', next: 'Open the customer again to see the new details, then make your change.' }),
  DUPLICATE_CUSTOMER: () => ({ title: 'A customer with this name or phone number already exists', next: 'Open the existing customer, or save this one as a new customer anyway.' }),
  ADVANCE_NOT_CONFIRMED: () => ({ title: 'This is more than the customer owes', next: 'Confirm that the extra is an advance, or enter a smaller amount.' }),
  REFERENCE_REQUIRED: () => ({ title: 'This payment method needs a reference number', next: 'Type the transaction number from the bank, Easypaisa or JazzCash.' }),
  FIELD_NOT_ALLOWED: () => ({ title: 'Only the owner can set the credit limit, price type or farmer details', next: 'Leave those fields empty. The owner can add them later.' }),
  APPROVAL_REQUIRED: () => ({ title: 'The owner has to approve this', next: 'Ask the owner to approve it with their password.' }),
  APPROVAL_INVALID: () => ({ title: 'The owner\'s approval does not work for this bill', next: 'It may have run out (it lasts one minute), been used already, or been given for a different bill. Ask the owner to approve again.' }),
  TOO_MANY_ATTEMPTS: (p, t) => ({ title: 'Too many wrong passwords', next: `Wait ${t.num(t.n(p, 'seconds'))} seconds and try again.` }),
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
    const left = t.qty(p, 'available');
    return {
      title: t.s(p, 'scope') === 'batch' ? `اس بیچ میں صرف ${left} باقی ہے` : `اسٹاک میں صرف ${left} باقی ہے`,
      next: t.s(p, 'scope') === 'batch' ? 'مقدار کم کریں، یا دوسرا بیچ چنیں۔' : 'مقدار کم کریں، یا پہلے مزید اسٹاک وصول کریں۔',
    };
  },
  WHOLE_PACKS_ONLY: (p, t) => ({ title: 'یہ مصنوعہ صرف پورے پیک میں بکتا ہے', next: `پورے پیک لکھیں۔ ایک پیک ${t.pack(p)} کا ہے۔` }),
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
    title: `صرف ${t.qty(p, 'returnable')} واپس ہو سکتا ہے`,
    next: 'مقدار کم کریں۔ جو مال پہلے واپس ہو چکا وہ دوبارہ واپس نہیں ہو سکتا۔',
  }),
  EMPTY_RETURN: () => ({ title: 'واپسی کے لیے کچھ نہیں چنا گیا', next: 'کم از کم ایک آئٹم اور اس کی مقدار چنیں۔' }),
  RETURN_REASON_REQUIRED: () => ({ title: 'ہر آئٹم کی وجہ چنیں', next: 'ہر آئٹم کے واپس آنے کی وجہ منتخب کریں۔' }),
  EXPIRED_NOT_RESELLABLE: () => ({ title: 'اس بیچ کی میعاد ختم ہو چکی ہے، مال شیلف پر واپس نہیں جا سکتا', next: 'آئٹم کو خراب یا میعاد ختم کے طور پر درج کریں: وہ ضائع کر دیا جائے گا۔' }),
  VOID_REASON_REQUIRED: () => ({ title: 'بل منسوخ کرنے کی وجہ لکھنا ضروری ہے', next: 'لکھیں کہ یہ بل کیوں منسوخ ہو رہا ہے۔' }),
  VOID_HAS_RETURNS: () => ({ title: 'اس بل پر واپسیاں ہو چکی ہیں، اس لیے اسے منسوخ نہیں کیا جا سکتا', next: 'اس کے بجائے باقی آئٹم واپس کریں۔' }),
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
  NO_OPENING_BALANCE: () => ({ title: 'اس گاہک کا کوئی ابتدائی بقایا نہیں جسے درست کیا جائے', next: 'پہلے ابتدائی بقایا درج کریں۔' }),
  NOT_SUPPORTED: () => ({ title: 'یہ سہولت ابھی دستیاب نہیں', next: 'فی الحال کھاتے میں کریڈٹ استعمال کریں۔' }),
  RECEIPT_DATE_OLD: (p, t) => ({ title: `اس رسید کی تاریخ ${t.num(t.n(p, 'days'))} دن پہلے کی ہے (${t.date(t.s(p, 'date'))})۔ پھر بھی محفوظ کریں؟`, next: 'اگر تاریخ ٹھیک ہے تو تصدیق کر کے محفوظ کریں، ورنہ تاریخ درست کریں۔' }),
  FUTURE_DATE: (p, t) => ({ title: `تاریخ ${t.date(t.s(p, 'date'))} آج کے بعد کی ہے`, next: 'آج کی یا اس سے پہلے کی تاریخ چنیں۔' }),
  DUPLICATE_NAME: (p, t) => ({ title: `"${t.s(p, 'name')}" فہرست میں پہلے سے موجود ہے`, next: 'اسے دوبارہ شامل کرنے کے بجائے فہرست میں سے چنیں۔' }),
  DUPLICATE_PACK_LABEL: (p, t) => ({ title: `اس پروڈکٹ میں ${t.text(t.s(p, 'label'))} کا سائز پہلے سے موجود ہے`, next: 'ہر سائز کا پیک سائز الگ ہونا چاہیے۔ اسے بدلیں، یا موجودہ سائز میں تبدیلی کریں۔' }),
  DUPLICATE_BARCODE: (p, t) => ({ title: `بارکوڈ ${ltr(t.s(p, 'barcode'))} کسی اور سائز میں استعمال ہو رہا ہے`, next: 'پیک پر بارکوڈ دیکھیں۔ ہر سائز کا اپنا بارکوڈ ہوتا ہے۔' }),
  DUPLICATE_SKU: (p, t) => ({ title: `SKU ${ltr(t.s(p, 'sku'))} کسی اور سائز میں استعمال ہو رہا ہے`, next: 'کوئی دوسرا SKU لکھیں۔' }),
  MIXED_UNITS: (p, t) => ({ title: `ایک پروڈکٹ کے تمام سائز ایک ہی پیمانے میں ہونے چاہئیں (${t.unit(t.s(p, 'expected'))})`, next: 'کلو کے ساتھ کلو، یا لیٹر کے ساتھ لیٹر۔ اگر یہ الگ پروڈکٹ ہے تو نئی پروڈکٹ بنائیں۔' }),
  GROUP_INACTIVE: () => ({ title: 'یہ پروڈکٹ بند ہے', next: 'پہلے پروڈکٹ کو چالو کریں، پھر اس کے سائز۔' }),
  PACK_LABEL_REQUIRED: () => ({ title: 'ہر سائز کا پیک سائز ضروری ہے', next: 'ہر سائز پر پیک سائز لکھیں، مثلاً 0.5 لیٹر یا 1 کلو، تاکہ ان میں فرق کیا جا سکے۔' }),
  PACK_SIZE_LOCKED: () => ({ title: 'اس سائز کا اسٹاک ریکارڈ موجود ہے', next: 'اس کا پیک سائز اور پیمانہ اب تبدیل نہیں ہو سکتا۔ اس کے بجائے نیا سائز شامل کریں۔' }),
  REQUEST_ID_REUSED: () => ({ title: 'یہ بل پہلے ہی ایک اور فروخت کے لیے استعمال ہو چکا ہے', next: 'بل دوبارہ شروع کریں۔' }),
  HELD_BILL_GONE: () => ({ title: 'یہ رکا ہوا بل اب موجود نہیں', next: 'ہو سکتا ہے کسی اور نے اسے کھول لیا ہو یا ختم کر دیا ہو۔ رکے ہوئے بل دوبارہ کھول کر دیکھیں۔' }),
  VERSION_CONFLICT: () => ({ title: 'اس گاہک کی تفصیل کسی اور نے بدل دی ہے', next: 'گاہک کو دوبارہ کھول کر نئی تفصیل دیکھیں، پھر اپنی تبدیلی کریں۔' }),
  DUPLICATE_CUSTOMER: () => ({ title: 'اس نام یا فون نمبر کا گاہک پہلے سے موجود ہے', next: 'پہلے سے موجود گاہک کھولیں، یا پھر بھی اسے نئے گاہک کے طور پر محفوظ کریں۔' }),
  ADVANCE_NOT_CONFIRMED: () => ({ title: 'یہ رقم گاہک کے بقایا سے زیادہ ہے', next: 'تصدیق کریں کہ اضافی رقم پیشگی ہے، یا کم رقم لکھیں۔' }),
  REFERENCE_REQUIRED: () => ({ title: 'اس طریقے سے رقم لینے کے لیے ریفرنس نمبر چاہیے', next: 'بینک، ایزی پیسہ یا جاز کیش کا ٹرانزیکشن نمبر لکھیں۔' }),
  FIELD_NOT_ALLOWED: () => ({ title: 'ادھار کی حد، ریٹ کی قسم اور کسان کی تفصیل صرف مالک مقرر کر سکتا ہے', next: 'یہ خانے خالی چھوڑ دیں۔ مالک بعد میں بھر سکتا ہے۔' }),
  APPROVAL_REQUIRED: () => ({ title: 'اس کے لیے مالک کی منظوری چاہیے', next: 'مالک سے ان کے پاس ورڈ کے ساتھ منظوری لیں۔' }),
  APPROVAL_INVALID: () => ({ title: 'مالک کی منظوری اس بل کے لیے کام نہیں کر رہی', next: 'ہو سکتا ہے اس کا وقت ختم ہو گیا ہو (یہ ایک منٹ چلتی ہے)، یہ پہلے استعمال ہو چکی ہو، یا کسی اور بل کے لیے دی گئی ہو۔ مالک سے دوبارہ منظوری لیں۔' }),
  TOO_MANY_ATTEMPTS: (p, t) => ({ title: 'غلط پاس ورڈ بہت بار لکھا گیا', next: `${t.num(t.n(p, 'seconds'))} سیکنڈ انتظار کریں اور دوبارہ کوشش کریں۔` }),
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
  const m = MESSAGES_FOR[language];
  const plain = language === 'ur' ? ltr : (text: string): string => text;
  return {
    n: (params, key) => (typeof params[key] === 'number' ? (params[key] as number) : 0),
    s: (params, key) => (typeof params[key] === 'string' ? (params[key] as string) : ''),
    money: (paisa) => formatMoney(paisa, language),
    qty: (params, key) => stockText(m, language, unitOf(params), Math.max(1, typeof params.packSize === 'number' ? params.packSize : 1), typeof params[key] === 'number' ? (params[key] as number) : 0),
    pack: (params) => packText(m, language, unitOf(params), typeof params.packSize === 'number' ? params.packSize : 1) || qtyText(m, language, unitOf(params), 1),
    unit: (code) => unitName(m, isBaseUnit(code) ? code : 'piece', 2),
    text: (text) => legacyText(m, text),
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
