// "Sales History" and "Invoices" are the same underlying data — every till transaction is both a
// sale record and its own invoice — so both nav items render the one real, API-backed list rather
// than maintaining two divergent views of the same table.
export { default } from './InvoicesPage';
