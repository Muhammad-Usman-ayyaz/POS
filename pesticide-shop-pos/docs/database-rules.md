# Database rules and service flows

The schema is in `packages/db-sqlite/migrations/001_init.sql`. The database refuses many bad writes by itself (negative stock, selling expired batches, over-returns, editing history). The services below create the rows. The database does NOT create stock or ledger rows automatically.

## Units and money
- `products.base_unit` is ml, g or piece. `pack_size` is base units per pack (1L bottle = 1000 ml).
- Quantities (`qty`, `qty_delta`, `min_stock`) are integers in the base unit.
- Prices (`retail_price`, `wholesale_price`, `cost_price`, `unit_price`) are paisa per pack.
- `line_total = ROUND(qty * unit_price / pack_size) - line_discount + tax_amount`. Round once per line.
- `invoices.subtotal = SUM(line_total - tax_amount)`, `tax_total = SUM(tax_amount)`, `total = subtotal + tax_total`. The view `v_invoice_mismatch` must stay empty.
- `tax_rate_bp` is basis points. 1800 means 18 percent.
- Products with `allow_loose = 0` can only be sold in whole packs.

## Ledger sign
Positive `amount_delta` means the customer owes more (or we owe the supplier more). Payments and returns are negative.

## Record a sale (one transaction)
1. Take the next invoice number for this device from `number_sequences` (format like `INV-A-000123`).
2. Insert `invoices`. Credit sales need a customer. A walk-in sale must be paid in full.
3. For each line, choose batch(es) earliest-expiry-first, skipping expired batches. One `invoice_items` row per batch used. Copy the batch `cost_price` onto the line.
4. Insert a `stock_movements` row (`sale`, negative qty) per invoice item.
5. If there is a customer: insert `ledger_entries` (`invoice`, plus total). If money was paid now, insert `payments` (`in`) and a `ledger_entries` row (`payment`, minus amount).
6. Walk-in cash lives on `invoices.paid_amount` only. `payments` and `ledger_entries` need a real customer or supplier.
7. Cash received report = `payments` (in, cash) + walk-in `invoices.paid_amount`.

## Record a customer payment
Insert `payments` (`in`) and `ledger_entries` (`payment`, minus amount). Payments reduce the overall balance, not one invoice.

## Return (customer brings goods back)
1. Owner approves. A return must link to an active invoice.
2. Insert `sales_returns` and `sales_return_items`, each pointing at the exact `invoice_items` row. Quantity may not exceed `v_invoice_item_returnable.qty_returnable`.
3. Refund amount comes from the original line price, not today's price. Discounts return proportionally.
4. Resellable items: insert `stock_movements` (`sale_return`, plus qty) on the same batch. Damaged or expired items do not go back into sellable stock.
5. Khata credit refund: insert `ledger_entries` (`return`, minus refund).
6. Cash refund and voiding an invoice: ledger and payment entries for these must be designed with the owner before coding. Void is a status change plus reversing rows. Never delete the invoice.

## Purchase (stock in)
1. Create or pick the `batches` row (batch number, expiry, cost price).
2. Insert `purchases` and `purchase_items`.
3. Insert `stock_movements` (`purchase`, plus qty) per batch.
4. If supplier credit is tracked: `ledger_entries` for the supplier (`purchase`, plus total) and `payments` (`out`) with a ledger row (`payment`, minus amount).

## Opening data
- Opening customer balance: one `ledger_entries` row, `entry_type = 'opening'`.
- Opening stock: one `stock_movements` row, `movement_type = 'opening'`, per batch.

## Reports from views
`v_batch_stock`, `v_product_stock` (total and sellable), `v_low_stock`, `v_near_expiry` (uses `settings.near_expiry_days`, default 30), `v_expired_stock`, `v_customer_balance`, `v_supplier_balance`, `v_invoice_item_returnable`, `v_profit_by_day`.
Overdue invoices are not a view yet: since payments hit the overall balance, treat payments as paying the oldest invoices first and calculate overdue in the service.

## First launch
The app must create the `shops`, `branches` and `devices` rows, the owner user, and default `settings` (for example `near_expiry_days = 30`) because every other table references them.

## Sync support
Triggers write `change_log` on every insert and update. Set `synced_at` after a successful sync. Unsynced rows cannot be deleted.
