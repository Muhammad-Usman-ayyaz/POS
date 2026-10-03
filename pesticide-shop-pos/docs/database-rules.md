# Database rules and service flows

The schema is in `packages/db-sqlite/migrations/001_init.sql`, plus later numbered migrations (`002_invoice_payment_method.sql` adds `invoices.payment_method`; `003_user_recovery_code.sql` adds `users.recovery_code_hash`; `004_product_groups.sql` adds product groups and pack sizes). Never edit an applied migration. The database refuses many bad writes by itself (negative stock, selling expired batches, over-returns, editing history). The services below create the rows. The database does NOT create stock or ledger rows automatically.

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

## Products: groups and pack sizes (migration 004)
A shopkeeper's "product" (Insecticide X) is a **product group**. Each pack size of it (250 ml, 500 ml, 1 L) is a row in `products`, so batches, stock movements, invoice lines and every foreign key work on SIZES exactly as before. Every size keeps its own stock, batches, prices, tax rate, barcode, SKU and `min_stock`, because sealed bottles of different sizes are different physical stock. There is no conversion between sizes.
- `product_groups`: `name_en`, `name_ur`, `category_id`, `brand_id`, `notes`, `is_active`, and the usual editable columns (`version`, `updated_at`, `deleted_at`, change_log triggers, no hard delete). The group is the **source of truth** for names, category and brand.
- `products.group_id` (which group) and `products.pack_label` ("500 ml"). The label may be empty only while the group has a single size; once a group has two or more live sizes every size needs a label, and labels are unique within the group.
- **Denormalized copies.** `products.name_en`, `name_ur`, `category_id` and `brand_id` are copies of the group's values, kept so invoices, error messages and views that read `products.name_*` keep working: `name = group name` when the label is empty, otherwise `group name || ' ' || pack_label`, in each language; `category_id` and `brand_id` equal the group's. Only the catalogue service writes them, in the same transaction that changes the group or the label. `v_product_group_mismatch` lists any size where a copy has drifted and must stay empty.
- **`group_id` is never NULL, but the column is declared nullable.** SQLite cannot add a NOT NULL foreign-key column to an existing table, and rebuilding `products` (which every other table references) needs foreign keys switched off outside the migration transaction. Two triggers (`trg_products_group_id_required_ins` and `_upd`) refuse a NULL on insert and on update instead. The Zod `Product.group_id` is strict, and `packages/db-sqlite/tests/schemas-match-db.test.ts` names this as its one exception (and checks that both triggers exist and work).
- Rules the database enforces (the service checks the same ones first, to give a clear error): sizes of one group share a `base_unit` (so group stock can be added up); labels are unique per group among live sizes; a size cannot be active inside an inactive group, or live inside a deleted one; a group with active sizes cannot be deactivated and one with live sizes cannot be deleted. Barcodes and SKUs are unique across all sizes ever made.
- **Backfill.** The migration gives every existing product its own group (a fresh UUID) with the product's names, category, brand, `is_active` and `deleted_at`, and `pack_label = ''`, so no name changes. Joining separate products into one is done with the `moveSize` service.
- **Services** (`createCatalogueService`, owner only): `createGroup` (with optional first sizes), `updateGroup` (rewrites every size's copies), `addSize` (if the group's only size has an empty label, `existing_size_label` labels it in the same transaction), `updateSize`, `setSizeActive`, `setGroupActive` (deactivating switches off every size; reactivating switches on only the group), `moveSize` (same unit, unique label, names rewritten, an emptied source group is switched off, one audit row) and `search`. A size that has batches keeps its pack size and unit.
- **Search** is done in core, the same on every backend: both languages, lower case, Eastern Arabic (٠-٩) and Urdu (۰-۹) digits read as 0-9, Arabic and Urdu letter variants (ي ى to ی, ك to ک, ه ة ۃ to ہ) read as one, diacritics and joiners dropped, "500 ml" the same as "500ml". Every word typed must match. A barcode or SKU matches only when typed or scanned in full.
- **Printed invoices.** `invoice_items` stores `product_id`, not a name, so renaming a group would change how an old invoice reads. Before printing is built (Phase 5), a name snapshot must be stored on `invoice_items` at sale time (see `docs/build-plan.md`).

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
`v_batch_stock`, `v_product_stock` (one row per SIZE: total and sellable stock, with its group and label), `v_low_stock` (per size, against that size's own `min_stock`), `v_group_stock` (a whole product: its sizes added up, size count, how many sizes are low), `v_product_group_mismatch` (must stay empty), `v_near_expiry` (uses `settings.near_expiry_days`, default 30), `v_expired_stock`, `v_customer_balance`, `v_supplier_balance`, `v_invoice_item_returnable`, `v_profit_by_day`.
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
| `price_changed` / `tax_rate_changed` | a size's retail or wholesale price, or its tax rate, was changed (before and after are in `details`) | the owner |
| `group_deactivated` / `group_reactivated` | a product was switched off (with the sizes it switched off) or on | the owner |
| `size_moved` | a size was moved to another product (both groups, both labels, whether the old product was switched off) | the owner |
| `stock_adjustment` / `stock_write_off` | a stock count correction or a write-off | who did it |
| `owner_password_reset` / `owner_password_reset_failed` / `recovery_code_regenerated` | owner recovery | the owner, or NULL |

Passwords and recovery codes are never written to the log.

## Users and the recovery code
`users.password_hash` and `users.recovery_code_hash` are argon2id hashes made in the main process. The core services never see them: `UserRepository` leaves them out. The owner's recovery code is made at first launch, shown once, and replaced each time it is used or regenerated.

## Sync support
Triggers write `change_log` on every insert and update. Set `synced_at` after a successful sync. Unsynced rows cannot be deleted.
