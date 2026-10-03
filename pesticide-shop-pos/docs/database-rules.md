# Database rules and service flows

The schema is in `packages/db-sqlite/migrations/001_init.sql`, plus later numbered migrations (`002_invoice_payment_method.sql` adds `invoices.payment_method`; `003_user_recovery_code.sql` adds `users.recovery_code_hash`). Never edit an applied migration. The database refuses many bad writes by itself (negative stock, selling expired batches, over-returns, editing history). The services below create the rows. The database does NOT create stock or ledger rows automatically.

## Units and money
- `products.base_unit` is ml, g or piece. `pack_size` is base units per pack (1L bottle = 1000 ml).
- Quantities (`qty`, `qty_delta`, `min_stock`) are integers in the base unit.
- Prices (`retail_price`, `wholesale_price`, `unit_price`, `cost_price`) are paisa per pack. **Selling prices (retail, wholesale, `unit_price`) include tax.** Tax is never added on top.
- `line_total = ROUND(qty * unit_price / pack_size) - line_discount`. Round once per line. This is what the customer pays for the line, tax included.
- `tax_amount = ROUND(line_total * tax_rate_bp / (10000 + tax_rate_bp))`: the tax that is inside `line_total`, taken out of the discounted line. Rounded once, halves up. A line of Rs 1,180 at 18 percent has Rs 180 tax and Rs 1,000 without it.
- `invoices.subtotal = SUM(line_total - tax_amount)`, `tax_total = SUM(tax_amount)`, `total = subtotal + tax_total`, which is exactly `SUM(line_total)`. The view `v_invoice_mismatch` (total against the sum of the lines) must stay empty. Each line's tax is rounded on its own and the invoice only adds them up, so rounding can never make the two differ. The line without tax is `line_total - tax_amount`, never rounded separately.
- A cart line over two batches is two `invoice_items` rows. The discount is shared between them by price, and each row has its own `line_total` and `tax_amount`.
- `tax_rate_bp` is basis points. 1800 means 18 percent. It is set per product and copied onto each invoice line.
- `v_profit_by_day` counts revenue as `line_total - tax_amount` (the sale without its tax) and takes the matching share off for returns. It needed no change when prices became tax-inclusive.
- Migration 001's header comment still shows the old formula (`... + tax_amount`). It is a comment only: no table, constraint or view depends on it, and an applied migration is never edited. This file is the rule.
- Products with `allow_loose = 0` can only be sold in whole packs.

## Ledger sign
Positive `amount_delta` means the customer owes more (or we owe the supplier more). Payments and returns are negative.

## Record a sale (one transaction)
1. Take the next invoice number for this device from `number_sequences` (format like `INV-A-000123`).
2. Insert `invoices`, with `payment_method` (cash, bank, easypaisa or jazzcash, default cash) for the amount paid at sale. Credit sales need a customer. A walk-in sale must be paid in full. The unit price of each line is looked up from the product (`retail_price` or `wholesale_price` by the invoice's price type); the cashier cannot type a price. A different price is an owner-approved `price_override` on that line, and the approval is written to `audit_log`.
   A credit sale (a customer, with something unpaid) is refused if the customer's balance plus the unpaid amount would pass `customers.credit_limit`. A limit of 0 means no limit is set, so nothing is checked. The balance includes the opening balance. An owner can approve a sale over the limit with a `credit_override`, which is written to `audit_log`.
3. For each line, choose batch(es) earliest-expiry-first, skipping expired batches. One `invoice_items` row per batch used. Copy the batch `cost_price` onto the line.
4. Insert a `stock_movements` row (`sale`, negative qty) per invoice item.
5. If there is a customer: insert `ledger_entries` (`invoice`, plus total). If money was paid now, insert `payments` (`in`, with the same method as `invoices.payment_method`) and a `ledger_entries` row (`payment`, minus amount).
6. Walk-in money lives on `invoices.paid_amount` and `invoices.payment_method` only. `payments` and `ledger_entries` need a real customer or supplier.
7. Cash received report = `payments` (in, cash) + walk-in `invoices.paid_amount` where `payment_method` is cash. Do not add `paid_amount` of customer invoices: that money is already in `payments`.

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

## Audit log
`audit_log` is append-only. Rows are written in the same transaction as the change they record, and the user is always the one signed in (taken from the session, never from the screen):

| action | when | user_id |
|---|---|---|
| `login` / `login_failed` | every sign-in; failed ones say why (`unknown_user`, `wrong_password`, `inactive_user`) | the user, or NULL for an unknown name |
| `price_override` / `credit_limit_override` | an owner approved a different price or a sale over the credit limit | the owner |
| `return_approved` | an approved sales return | the owner |
| `stock_adjustment` / `stock_write_off` | a stock count correction or a write-off | who did it |
| `owner_password_reset` / `owner_password_reset_failed` / `recovery_code_regenerated` | owner recovery | the owner, or NULL |

Passwords and recovery codes are never written to the log.

## Users and the recovery code
`users.password_hash` and `users.recovery_code_hash` are argon2id hashes made in the main process. The core services never see them: `UserRepository` leaves them out. The owner's recovery code is made at first launch, shown once, and replaced each time it is used or regenerated.

## Sync support
Triggers write `change_log` on every insert and update. Set `synced_at` after a successful sync. Unsynced rows cannot be deleted.
