// The words on a printed customer statement and payment receipt, English and Urdu. Plain data (a document is rendered in the language chosen for
// THAT document, whatever the screen shows). English words are the ones in docs/design/CustomerForms.dc.html sections 3 and 4; Urdu wording is listed
// for review in docs/urdu-review.md.

import type { DocumentLanguage, DocumentPaymentMethod, StatementLabel } from '@pos/core';

export interface KhataDocumentLabels {
  statement: string;
  paymentReceipt: string;
  copy: string;
  customer: string;
  /** Statement table */
  colDate: string;
  colType: string;
  colReference: string;
  colOwesMore: string;
  colOwesLess: string;
  colBalance: string;
  totals: string;
  /** Line types */
  types: Record<StatementLabel, string>;
  returnCredit: string;
  /** 80 mm: "Bal 4,000" / "Adv 500" */
  balShort: string;
  advShort: string;
  /** Closing */
  heOwes: string;
  advance: string;
  clear: string;
  creditLimit: string;
  totalOwesMore: string;
  totalOwesLess: string;
  /** Shown under the 80 mm statement: what the + and - mean. */
  legend80: string;
  /** Shown under the A4 statement. */
  legendA4: string;
  /** Range: `{from} to {to}`, `From {from}`, `Up to {to}`, or all of it. */
  rangeBoth: (from: string, to: string) => string;
  rangeFrom: (from: string) => string;
  rangeTo: (to: string) => string;
  rangeAll: string;
  thanks: string;
  addressPlaceholder: string;
  /** Payment receipt */
  receiptNo: string;
  receivedFrom: string;
  method: string;
  reference: string;
  note: string;
  amountReceived: string;
  balanceAfter: string;
  methods: Record<DocumentPaymentMethod, string>;
}

export const KHATA_LABELS: Record<DocumentLanguage, KhataDocumentLabels> = {
  en: {
    statement: 'STATEMENT',
    paymentReceipt: 'PAYMENT RECEIPT',
    copy: 'COPY',
    customer: 'Customer',
    colDate: 'Date',
    colType: 'Type',
    colReference: 'Reference',
    colOwesMore: 'Owes more',
    colOwesLess: 'Owes less',
    colBalance: 'Balance',
    totals: 'Totals',
    types: { brought_forward: 'Brought forward', opening: 'Opening balance', sale: 'Sale', payment: 'Payment', return: 'Return credit', adjustment: 'Adjustment' },
    returnCredit: 'Return credit',
    balShort: 'Bal',
    advShort: 'Adv',
    heOwes: 'He owes',
    advance: 'Advance',
    clear: 'Clear',
    creditLimit: 'Credit limit',
    totalOwesMore: 'Total owes more',
    totalOwesLess: 'Total owes less',
    legend80: '+ owes more, - owes less',
    legendA4: 'Owes more: he owes more after this line. Owes less: he owes less. Entries are never edited or deleted.',
    rangeBoth: (from, to) => `${from} to ${to}`,
    rangeFrom: (from) => `From ${from}`,
    rangeTo: (to) => `Up to ${to}`,
    rangeAll: 'All entries',
    thanks: 'Thank you.',
    addressPlaceholder: '[Address and phone]',
    receiptNo: 'Receipt',
    receivedFrom: 'Received from',
    method: 'Method',
    reference: 'Reference number',
    note: 'Note',
    amountReceived: 'Amount received',
    balanceAfter: 'Balance after',
    methods: { cash: 'Cash', bank: 'Bank', easypaisa: 'Easypaisa', jazzcash: 'JazzCash' },
  },
  ur: {
    statement: 'کھاتے کی تفصیل',
    paymentReceipt: 'ادائیگی کی رسید',
    copy: 'COPY · نقل',
    customer: 'گاہک',
    colDate: 'تاریخ',
    colType: 'قسم',
    colReference: 'حوالہ',
    colOwesMore: 'بقایا بڑھا',
    colOwesLess: 'بقایا کم ہوا',
    colBalance: 'بقایا',
    totals: 'میزان',
    types: { brought_forward: 'پچھلا بقایا', opening: 'ابتدائی بقایا', sale: 'فروخت', payment: 'ادائیگی', return: 'واپسی کا کریڈٹ', adjustment: 'ایڈجسٹمنٹ' },
    returnCredit: 'واپسی کا کریڈٹ',
    balShort: 'بقایا',
    advShort: 'ایڈوانس',
    heOwes: 'ان کے ذمے',
    advance: 'ایڈوانس',
    clear: 'حساب صاف',
    creditLimit: 'ادھار کی حد',
    totalOwesMore: 'کل بقایا بڑھا',
    totalOwesLess: 'کل بقایا کم ہوا',
    legend80: '+ بقایا بڑھا، - بقایا کم ہوا',
    legendA4: 'بقایا بڑھا: اس اندراج کے بعد ان کے ذمے زیادہ۔ بقایا کم ہوا: ان کے ذمے کم۔ اندراج کبھی بدلے یا مٹائے نہیں جاتے۔',
    rangeBoth: (from, to) => `${from} تا ${to}`,
    rangeFrom: (from) => `${from} سے`,
    rangeTo: (to) => `${to} تک`,
    rangeAll: 'تمام اندراجات',
    thanks: 'شکریہ۔',
    addressPlaceholder: '[پتہ اور فون]',
    receiptNo: 'رسید',
    receivedFrom: 'وصول کنندہ از',
    method: 'طریقہ',
    reference: 'حوالہ نمبر',
    note: 'نوٹ',
    amountReceived: 'وصول شدہ رقم',
    balanceAfter: 'اس کے بعد بقایا',
    methods: { cash: 'نقد', bank: 'بینک', easypaisa: 'ایزی پیسہ', jazzcash: 'جیز کیش' },
  },
};
