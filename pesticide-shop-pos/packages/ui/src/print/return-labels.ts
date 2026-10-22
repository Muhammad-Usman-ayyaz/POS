// The words on a printed return slip (80 mm) and credit note (A4), English and Urdu. Plain data (a document is rendered in the language chosen for
// THAT document, whatever the screen shows). English words follow docs/design/Returns.dc.html ("Credit note", "Refund total", "Included tax", "Refunded to",
// "owes now"); the Urdu wording is listed for review in docs/urdu-review.md. No word here may name a cost (the cost scan looks for them).

import type { DocumentLanguage, ReturnReason } from '@pos/core';

export interface ReturnDocumentLabels {
  returnSlip: string;
  creditNote: string;
  copy: string;
  returnNo: string;
  forInvoice: string;
  customer: string;
  approvedBy: string;
  refundTotal: string;
  includedTax: string;
  refundedTo: string;
  cashBack: string;
  khataCredit: string;
  owesNow: string;
  advance: string;
  clear: string;
  backToStock: string;
  writtenOff: string;
  invoiceUnchanged: (invoiceNo: string) => string;
  thanks: string;
  addressPlaceholder: string;
  loose: string;
  colNumber: string;
  colItem: string;
  colBatch: string;
  colQty: string;
  colRate: string;
  colTax: string;
  colRefund: string;
  colReason: string;
  colStock: string;
  customerSignature: string;
  authorisedSignature: string;
  reasons: Record<ReturnReason, string>;
  note: string;
}

export const RETURN_LABELS: Record<DocumentLanguage, ReturnDocumentLabels> = {
  en: {
    returnSlip: 'RETURN SLIP',
    creditNote: 'CREDIT NOTE',
    copy: 'COPY',
    returnNo: 'Credit note',
    forInvoice: 'Invoice',
    customer: 'Customer',
    approvedBy: 'Approved by',
    refundTotal: 'Refund total',
    includedTax: 'Included tax',
    refundedTo: 'Refunded to',
    cashBack: 'Cash back',
    khataCredit: 'Taken off Khata',
    owesNow: 'Owes now',
    advance: 'Advance',
    clear: 'Clear',
    backToStock: 'Back to stock',
    writtenOff: 'Written off',
    invoiceUnchanged: (no) => `Invoice ${no} is unchanged.`,
    thanks: 'Thank you. Please keep this slip.',
    addressPlaceholder: '[Address and phone]',
    loose: 'loose',
    colNumber: '#',
    colItem: 'Item',
    colBatch: 'Batch',
    colQty: 'Qty',
    colRate: 'Rate',
    colTax: 'Tax',
    colRefund: 'Refund',
    colReason: 'Reason',
    colStock: 'Stock',
    customerSignature: 'Customer signature',
    authorisedSignature: 'Authorised signature',
    reasons: { changed_mind: 'Customer changed mind', wrong_item: 'Wrong item', damaged: 'Damaged', leaked: 'Leaked in transit', expired: 'Expired', other: 'Other' },
    note: 'Note',
  },
  ur: {
    returnSlip: 'واپسی کی پرچی',
    creditNote: 'کریڈٹ نوٹ',
    // The word COPY is printed as it is (the owner asked for it), with the Urdu word beside it.
    copy: 'COPY · نقل',
    returnNo: 'کریڈٹ نوٹ',
    forInvoice: 'بل',
    customer: 'گاہک',
    approvedBy: 'منظور کنندہ',
    refundTotal: 'کل واپسی رقم',
    includedTax: 'ٹیکس سمیت',
    refundedTo: 'رقم کی واپسی',
    cashBack: 'نقد واپس',
    khataCredit: 'کھاتے سے کم',
    owesNow: 'اب ان کے ذمے',
    advance: 'ایڈوانس',
    clear: 'حساب صاف',
    backToStock: 'واپس اسٹاک میں',
    writtenOff: 'ضائع کیا گیا',
    invoiceUnchanged: (no) => `بل ${no} میں کوئی تبدیلی نہیں۔`,
    thanks: 'شکریہ۔ یہ پرچی سنبھال کر رکھیں۔',
    addressPlaceholder: '[پتہ اور فون]',
    loose: 'کھلی',
    colNumber: 'نمبر',
    colItem: 'آئٹم',
    colBatch: 'بیچ',
    colQty: 'مقدار',
    colRate: 'ریٹ',
    colTax: 'ٹیکس',
    colRefund: 'واپسی',
    colReason: 'وجہ',
    colStock: 'اسٹاک',
    customerSignature: 'گاہک کے دستخط',
    authorisedSignature: 'مجاز دستخط',
    reasons: { changed_mind: 'گاہک نے ارادہ بدل دیا', wrong_item: 'غلط چیز', damaged: 'خراب', leaked: 'راستے میں لیک ہو گئی', expired: 'میعاد ختم', other: 'دیگر' },
    note: 'نوٹ',
  },
};
