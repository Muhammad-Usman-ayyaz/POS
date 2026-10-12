// The rules behind the product form and Receive stock, without any React or CSS. A separate entry (`@pos/ui/rules`) so the main process's
// tests can send the screens' own requests through the real handlers (apps/desktop/tests/ui-requests.test.ts): the screen and the shell must agree.
export * as productFormRules from './pages/products/product-form-state.js';
export * as receiveRules from './pages/purchases/receive-state.js';
export * as invoiceRules from './pages/invoices/invoices-requests.js';
