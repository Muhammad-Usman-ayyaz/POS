// The rules behind the product form and Receive stock, without any React or CSS. A separate entry (`@pos/ui/rules`) so the main process's
// tests can send the screens' own requests through the real handlers (apps/desktop/tests/ui-requests.test.ts): the screen and the shell must agree.
export * as productFormRules from './pages/products/product-form-state.js';
export * as receiveRules from './pages/purchases/receive-state.js';
export * as invoiceRules from './pages/invoices/invoices-requests.js';
export * as customerListRules from './pages/customers/list/customer-list-requests.js';
// BEGIN customers form
export * as customerFormRules from './pages/customers/form/customer-form-requests.js';
// END customers form
// BEGIN customers detail
export * as customerDetailRules from './pages/customers/detail/customer-detail-state.js';
export * as customerPaymentRules from './pages/customers/payment/customer-payment-requests.js';
export * as customerOpeningRules from './pages/customers/opening/customer-opening-requests.js';
// END customers detail
