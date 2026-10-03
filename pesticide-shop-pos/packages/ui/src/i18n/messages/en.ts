// All English text for the app. Urdu is in ur.ts and must have exactly the same shape (the compiler checks it).
// Text that depends on a number is a function, so each language can phrase it in its own order.

export const en = {
  appName: 'Pesticide Club Shop',
  loading: 'Starting…',

  language: { label: 'Language', en: 'EN', ur: 'اردو' },

  nav: {
    label: 'Main navigation',
    pos: 'POS',
    products: 'Products',
    purchases: 'Purchases',
    customers: 'Customers & Khata',
    returns: 'Returns',
    reports: 'Reports',
    settings: 'Settings',
  },

  role: { owner: 'Owner', staff: 'Staff' },

  sidebar: { signedInAs: 'Signed in as', signOut: 'Sign out' },

  login: {
    eyebrow: 'POINT OF SALE',
    tagline: 'Billing, stock and farmer Khata on this computer. Works without internet.',
    title: 'Sign in',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    forgot: 'Forgot your password? Ask the owner to reset it.',
    useRecovery: 'Owner: reset with your recovery code',
  },

  setup: {
    eyebrow: 'FIRST-TIME SETUP',
    title: 'Set up your shop',
    tagline: 'Billing, stock and farmer Khata on this computer. Works without internet.',
    thisComputer: 'This computer',
    shopName: 'Shop name',
    ownerName: 'Owner name',
    username: 'Username',
    usernameHint: 'Lower case letters and numbers. You will sign in with this.',
    password: 'Password',
    passwordHint: 'At least 8 characters.',
    confirmPassword: 'Type the password again',
    submit: 'Create shop',
    submitting: 'Creating…',
  },

  recovery: {
    title: 'Write down your recovery code',
    lead: 'This code is shown only once. If you forget the owner password, it lets you set a new one.',
    codeLabel: 'Recovery code',
    steps: ['Write it on paper, exactly as shown.', 'Keep the paper somewhere safe, not on the shop counter.', 'Do not tell anyone else.'],
    confirm: 'I have written it down and put it somewhere safe',
    continue: 'Continue',
  },

  reset: {
    title: 'Reset the owner password',
    lead: 'Enter the recovery code you wrote down when the shop was set up. It works once.',
    username: 'Owner username',
    code: 'Recovery code',
    newPassword: 'New password',
    submit: 'Reset password',
    submitting: 'Resetting…',
    back: 'Back to sign in',
    doneTitle: 'Password changed',
    doneLead: 'This is your NEW recovery code. The old one no longer works. Write it down now.',
    signIn: 'Go to sign in',
  },

  pages: {
    pos: { title: 'POS', subtitle: 'Fast billing at the counter.', phase: 5 },
    products: { title: 'Products and stock', subtitle: 'Stock is counted per batch. The Cost column is visible to the owner only.', phase: 4 },
    purchases: { title: 'Purchases', subtitle: 'Receive stock from suppliers.', phase: 4 },
    customers: { title: 'Customers & Khata', subtitle: 'Farmer accounts, payments and balances.', phase: 6 },
    returns: { title: 'Returns', subtitle: 'Goods brought back against a sale. The owner approves each return.', phase: 7 },
    reports: { title: 'Reports', subtitle: 'Sales, stock, Khata and profit.', phase: 8 },
    settings: { title: 'Settings', subtitle: 'Shop details, users and backups.', phase: 9 },
  },

  placeholder: {
    builtIn: (phase: number) => `This screen is built in Phase ${phase}.`,
    note: 'The layout, sidebar and sign-in are finished. Nothing to show here yet.',
  },

  validation: {
    required: 'Required',
    passwordShort: 'At least 8 characters',
    passwordMismatch: 'The two passwords are not the same',
    usernameFormat: 'At least 3 characters: small letters, numbers, dot, dash or underscore',
    codeFormat: 'The code has 20 letters and numbers',
  },

  toast: { close: 'Close' },
};

export type Messages = typeof en;
