# Decisions made

| Area | Decision | Effect |
|---|---|---|
| Platform | Offline desktop app, Electron + SQLite, no server | Free to run. Backups handled by the app |
| Units | Loose and sealed sales | Stock in base units with `pack_size` and `allow_loose` |
| Pack sizes | One product with several pack sizes, for example Insecticide X in 250 ml, 500 ml and 1 L (owner's answer to question 1) | `product_groups` is the parent. Each size is still a `products` row with its own stock, batches, prices, tax rate, barcode and `min_stock`. Sizes of one product share a base unit and are told apart by `pack_label`. No conversion between sizes |
| Receiving stock | Owner only (open question 15). Supplier chosen or quick-added in the form; paid in full by default, payment fields hidden. Same batch number with a different expiry offers "use the existing expiry" or "save as a new batch number"; a different cost offers only a new batch number | Cost history is never rewritten. Staff never see cost |
| API permissions | Every API channel has a policy in `apps/desktop/src/main/permissions.ts` (public, signed-in, or a capability), enforced for every call by a guard around all handlers before any service runs; a test fails if a channel has none. The renderer never sends `actor_id`, `created_by`, `approved_by` or `user_id` (the schemas refuse them): the user comes from the session | Owner-only: catalogue changes, Receive stock, quick-add of suppliers, categories and brands. Lists are for any signed-in user |
| Cost visibility | Cost is owner-only everywhere: the catalogue list gets `cost_price` only when the signed-in user is the owner (the renderer cannot ask for it), a staff sale reply has no `cost_price` on its lines, and errors that carry a cost (`BATCH_CONFLICT`) are stripped of it for anyone else | **Rule: cost must never reach staff in any reply, data or error.** The deep-scan test in `apps/desktop/tests/catalogue-api.test.ts` (every channel, as staff, good and bad input, every reply scanned for any cost key or amount) is the guard for it: a new channel or field that carries cost must be caught there before it ships. It found the staff sale-reply leak (fixed in `ca8f3a1`) |
| Catalogue changes | Only the owner changes the catalogue (default, open question 14) | Every change to a product or a size (prices, tax rates, labels, SKU, barcode, minimum stock, pack size, unit, switching on or off, renaming, moving) is written to `audit_log` with the changed fields and their old and new values |
| Batches | Batch and expiry on all products | Every stock movement has a batch |
| Pricing | Retail and wholesale price | Two price columns. Invoice stores the price type used |
| Payments | Reduce the customer's overall balance | Payments go to the ledger, not to one invoice |
| Credit | Credit limit and due dates | `credit_limit` and `due_date` |
| Returns | Must link to an invoice. Owner approves | `sales_returns.invoice_id` required |
| Supplier returns | Case by case | Small `purchase_returns` tables |
| Users | Owner plus staff | Roles. Owner-only: approve returns, change prices, view profit and cost |
| Printing | Thermal 80mm and A4 | Two templates from one invoice model |
| Language | English and Urdu | `name_en`, `name_ur`, RTL, Urdu font, bilingual search |
| Volume | 20 to 50 invoices a day | SQLite needs no tuning |
| Opening balances | Entered by hand | One `opening` ledger row per customer |
| Stock | Out of stock is blocked | Check inside the sale transaction and trigger |
| Discounts | Per item only | `line_discount`. No invoice-level discount |
| Payment methods | Cash, bank, Easypaisa, JazzCash | Optional reference number |
| Batch choice | Automatic with manual override | Earliest expiry first |
| Tax | Sales tax on invoices | Rate per product, amount saved per line |
| Tax and prices | Selling prices already include tax (owner's answer to question 6) | `line_total` is the price less the discount and tax is never added on top. `tax_amount` is the tax inside `line_total`. `subtotal` is the total without tax, and `total` is the sum of the lines. A return refunds from `line_total` in proportion, so its tax comes back in proportion too |
| Near expiry | Warn at 30 days | `settings.near_expiry_days` |
| Migration | Start fresh, no Django import | Old version used as reference only |
| ORM | None. Plain SQL migrations and typed repositories | Triggers and views live in SQL |
| Desktop shell | Electron 42 pinned exactly; Electron build of SQLite pinned and verified | See `docs/native-sqlite.md` |
| Sign in | argon2id, session in the main process, owner and staff | Owner-only rules are checked in the main process |
| Recovery | One-time owner recovery code, shown once, stored as a hash | Resets the owner password; replaced after use |
| Staff limits | Stock changes and opening balances are owner-only by default | Open question 12 |
| Security | Strict Content-Security-Policy in the built app | Relaxed only for the Vite dev server |
| Audit | Sign-ins, overrides, returns, stock changes, resets are in `audit_log` | See `docs/database-rules.md` |
