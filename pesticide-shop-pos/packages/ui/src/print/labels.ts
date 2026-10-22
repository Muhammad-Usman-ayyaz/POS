// The words printed on receipts and invoices, in English and Urdu. Plain data: no React, no i18n context (a document is rendered
// in the language chosen for THAT document, whatever language the screen is in). Urdu wording is listed in docs/urdu-review.md.

import type { DocumentLanguage, UnitWords } from '@pos/core';

export interface DocumentLabels {
  receipt: string;
  invoice: string;
  copy: string;
  invoiceNo: string;
  customer: string;
  discount: string;
  total: string;
  includesTax: string;
  paid: string;
  onKhata: string;
  balanceNow: string;
  payBy: string;
  thanks: string;
  loose: string;
  addressPlaceholder: string;
  // A4 table
  colNumber: string;
  colItem: string;
  colBatch: string;
  colQty: string;
  colRate: string;
  colDiscount: string;
  colTax: string;
  colAmount: string;
  customerSignature: string;
  authorisedSignature: string;
  voided: string;
  methods: Record<'cash' | 'bank' | 'easypaisa' | 'jazzcash', string>;
  /** The words for kg, L and piece(s). The numbers come from the units module in packages/core. */
  units: UnitWords;
  pack: string;
  packs: string;
}

export const LABELS: Record<DocumentLanguage, DocumentLabels> = {
  en: {
    receipt: 'Receipt',
    invoice: 'Invoice',
    copy: 'COPY',
    invoiceNo: 'Invoice',
    customer: 'Customer',
    discount: 'Discount',
    total: 'Total',
    includesTax: 'Includes tax',
    paid: 'Paid',
    onKhata: 'On Khata',
    balanceNow: 'Your balance now',
    payBy: 'Pay by',
    thanks: 'Thank you. Please keep this receipt.',
    loose: 'loose',
    addressPlaceholder: '[Address and phone]',
    colNumber: '#',
    colItem: 'Item',
    colBatch: 'Batch',
    colQty: 'Qty',
    colRate: 'Rate',
    colDiscount: 'Disc.',
    colTax: 'Tax',
    colAmount: 'Amount',
    customerSignature: 'Customer signature',
    authorisedSignature: 'Authorised signature',
    voided: 'VOIDED',
    methods: { cash: 'Cash', bank: 'Bank', easypaisa: 'Easypaisa', jazzcash: 'JazzCash' },
    units: { kg: 'kg', L: 'L', piece: { one: 'piece', other: 'pieces' } },
    pack: 'pack',
    packs: 'packs',
  },
  ur: {
    receipt: 'رسید',
    invoice: 'بل',
    // The word COPY is printed as it is (the owner asked for it), with the Urdu word beside it.
    copy: 'COPY · نقل',
    invoiceNo: 'بل',
    customer: 'گاہک',
    discount: 'رعایت',
    total: 'کل رقم',
    includesTax: 'ٹیکس سمیت',
    paid: 'ادا شدہ',
    onKhata: 'کھاتے میں باقی',
    balanceNow: 'آپ کا کل بقایا',
    payBy: 'ادائیگی کی تاریخ',
    thanks: 'شکریہ۔ رسید سنبھال کر رکھیں۔',
    loose: 'کھلی',
    addressPlaceholder: '[پتہ اور فون]',
    colNumber: 'نمبر',
    colItem: 'آئٹم',
    colBatch: 'بیچ',
    colQty: 'مقدار',
    colRate: 'ریٹ',
    colDiscount: 'رعایت',
    colTax: 'ٹیکس',
    colAmount: 'رقم',
    customerSignature: 'گاہک کے دستخط',
    authorisedSignature: 'مجاز دستخط',
    voided: 'منسوخ',
    methods: { cash: 'نقد', bank: 'بینک', easypaisa: 'ایزی پیسہ', jazzcash: 'جیز کیش' },
    units: { kg: 'کلو', L: 'لیٹر', piece: { one: 'عدد', other: 'عدد' } },
    pack: 'پیک',
    packs: 'پیک',
  },
};
