// اردو متن۔ ساخت en.ts جیسی ہی ہونی چاہیے (کمپائلر اسے جانچتا ہے)۔
// Urdu text. It must have exactly the same shape as en.ts. Have a native Urdu speaker review the wording before go-live.
import type { Messages } from './en.js';

export const ur: Messages = {
  appName: 'پیسٹی سائیڈ کلب شاپ',
  loading: 'شروع ہو رہا ہے…',

  language: { label: 'زبان', en: 'EN', ur: 'اردو' },

  nav: {
    label: 'مرکزی مینو',
    pos: 'بلنگ',
    products: 'مصنوعات',
    purchases: 'خریداری',
    customers: 'گاہک اور کھاتہ',
    returns: 'واپسی',
    reports: 'رپورٹس',
    settings: 'ترتیبات',
  },

  role: { owner: 'مالک', staff: 'عملہ' },

  sidebar: { signedInAs: 'لاگ ان:', signOut: 'لاگ آؤٹ' },

  login: {
    eyebrow: 'پوائنٹ آف سیل',
    tagline: 'اس کمپیوٹر پر بلنگ، اسٹاک اور کسانوں کا کھاتہ۔ انٹرنیٹ کے بغیر چلتا ہے۔',
    title: 'لاگ ان',
    username: 'صارف نام',
    password: 'پاس ورڈ',
    submit: 'لاگ ان',
    submitting: 'لاگ ان ہو رہا ہے…',
    forgot: 'پاس ورڈ بھول گئے؟ مالک سے ری سیٹ کروائیں۔',
    useRecovery: 'مالک: ریکوری کوڈ سے پاس ورڈ بدلیں',
  },

  setup: {
    eyebrow: 'پہلی بار سیٹ اپ',
    title: 'اپنی دکان بنائیں',
    tagline: 'اس کمپیوٹر پر بلنگ، اسٹاک اور کسانوں کا کھاتہ۔ انٹرنیٹ کے بغیر چلتا ہے۔',
    thisComputer: 'یہ کمپیوٹر',
    shopName: 'دکان کا نام',
    ownerName: 'مالک کا نام',
    username: 'صارف نام',
    usernameHint: 'انگریزی چھوٹے حروف اور اعداد۔ آپ اسی سے لاگ ان کریں گے۔',
    password: 'پاس ورڈ',
    passwordHint: 'کم از کم 8 حروف۔',
    confirmPassword: 'پاس ورڈ دوبارہ لکھیں',
    submit: 'دکان بنائیں',
    submitting: 'بن رہی ہے…',
  },

  recovery: {
    title: 'اپنا ریکوری کوڈ لکھ لیں',
    lead: 'یہ کوڈ صرف ایک بار دکھایا جاتا ہے۔ اگر مالک کا پاس ورڈ بھول جائیں تو اس سے نیا پاس ورڈ بنایا جا سکتا ہے۔',
    codeLabel: 'ریکوری کوڈ',
    steps: ['اسے کاغذ پر بالکل ویسا ہی لکھیں جیسا دکھایا گیا ہے۔', 'کاغذ کسی محفوظ جگہ رکھیں، دکان کے کاؤنٹر پر نہیں۔', 'کسی اور کو نہ بتائیں۔'],
    confirm: 'میں نے اسے لکھ لیا ہے اور محفوظ جگہ رکھ دیا ہے',
    continue: 'جاری رکھیں',
  },

  reset: {
    title: 'مالک کا پاس ورڈ بدلیں',
    lead: 'دکان بناتے وقت جو ریکوری کوڈ لکھا تھا وہ درج کریں۔ یہ صرف ایک بار کام کرتا ہے۔',
    username: 'مالک کا صارف نام',
    code: 'ریکوری کوڈ',
    newPassword: 'نیا پاس ورڈ',
    submit: 'پاس ورڈ بدلیں',
    submitting: 'بدلا جا رہا ہے…',
    back: 'لاگ ان پر واپس جائیں',
    doneTitle: 'پاس ورڈ بدل گیا',
    doneLead: 'یہ آپ کا نیا ریکوری کوڈ ہے۔ پرانا کوڈ اب کام نہیں کرتا۔ اسے ابھی لکھ لیں۔',
    signIn: 'لاگ ان پر جائیں',
  },

  pages: {
    pos: { title: 'بلنگ', subtitle: 'کاؤنٹر پر تیز بلنگ۔', phase: 5 },
    products: { title: 'مصنوعات اور اسٹاک', subtitle: 'اسٹاک بیچ کے حساب سے گنا جاتا ہے۔ لاگت کا کالم صرف مالک کو نظر آتا ہے۔', phase: 4 },
    purchases: { title: 'خریداری', subtitle: 'سپلائرز سے اسٹاک وصول کریں۔', phase: 4 },
    customers: { title: 'گاہک اور کھاتہ', subtitle: 'کسانوں کے کھاتے، ادائیگیاں اور بقایا۔', phase: 6 },
    returns: { title: 'واپسی', subtitle: 'فروخت کے مقابلے میں واپس آنے والا مال۔ ہر واپسی کی منظوری مالک دیتا ہے۔', phase: 7 },
    reports: { title: 'رپورٹس', subtitle: 'فروخت، اسٹاک، کھاتہ اور منافع۔', phase: 8 },
    settings: { title: 'ترتیبات', subtitle: 'دکان کی تفصیل، صارفین اور بیک اپ۔', phase: 9 },
  },

  placeholder: {
    builtIn: (phase: number) => `یہ اسکرین مرحلہ ${phase} میں بنے گی۔`,
    note: 'لے آؤٹ، سائیڈ بار اور لاگ ان مکمل ہیں۔ یہاں ابھی دکھانے کو کچھ نہیں۔',
  },

  validation: {
    required: 'ضروری ہے',
    passwordShort: 'کم از کم 8 حروف',
    passwordMismatch: 'دونوں پاس ورڈ ایک جیسے نہیں ہیں',
    usernameFormat: 'کم از کم 3 حروف: انگریزی چھوٹے حروف، اعداد، نقطہ، ڈیش یا انڈرسکور',
    codeFormat: 'کوڈ میں 20 حروف اور اعداد ہوتے ہیں',
  },

  toast: { close: 'بند کریں' },
};
