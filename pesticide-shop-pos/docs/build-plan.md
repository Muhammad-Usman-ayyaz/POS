# Build plan

Do one phase at a time. Finish it, test it, then move on. Each phase should leave something usable.

## Phase 0: Scaffold and database (done)
Folder structure, `001_init.sql`, schema checks, docs.

## Phase 1: Database package (`packages/db-sqlite`)
- Open the database with better-sqlite3: `foreign_keys = ON`, WAL mode.
- Migration runner: reads `migrations/*.sql` in order, tracks `schema_version`, takes a backup copy before migrating.
- First-launch setup: shop, branch, device, owner user, default settings.
- Backup function using `.backup()` and an integrity check.
- Port the schema checks to Vitest.

## Phase 2: Core (`packages/core`)
- Types and Zod schemas for every entity.
- Money helpers (paisa, formatting, rounding, tax).
- Ports (repository interfaces) and a unit-of-work interface for transactions.
- Services with unit tests: stock, purchase, sale (batch picking), payment, khata, return.

## Phase 3: Desktop shell (`apps/desktop`)
Part 1 (done): the shell.
- Electron main, preload and renderer (electron-vite, React, Tailwind, shadcn-style components). The typed API contract is in `packages/api-contract`; every input is validated with Zod in the main process.
- First-launch setup (with the one-time owner recovery code), sign in, a session held in the main process, owner and staff roles. Owner-only rules are enforced in the main process.
- Layout: sidebar (icon-only under 1366px), page placeholders, English and Urdu with right-to-left, remembered language, one catalogue of error messages, toast and inline error components.
- Design system: `docs/design-system.md`. Native SQLite for Electron: `docs/native-sqlite.md`.
- Audit log rows for sign-ins, owner overrides, approved returns, stock adjustments and write-offs, password resets.
Later parts of this phase: none planned; the screens come in Phases 4 to 8.

## Phase 4: Catalog and stock in
Categories, brands, products as groups with pack sizes (each size has its own prices, tax, barcode, minimum stock and loose option; the catalogue service and search are done), suppliers, batches, purchases, stock list with low-stock and near-expiry.
- **DONE in M3 - what the shell (main process) enforces for M2's data:** core has no roles, so the main process must (1) pass `include_cost: true` to `catalogue.list` only for the owner; (2) make Receive stock (`purchase.record`) and every call that can raise `BATCH_CONFLICT` owner-only (`stock.receive`, open question 15); (3) never send a staff session any cost: not in `catalogue:list`, not in `stock:batchesOf`, and not in the params of an error (`BATCH_CONFLICT` carries `existingCost` and `newCost`, so strip them from the error for anyone but the owner); (4) take `actor_id` and `created_by` from the session, never from the renderer. A test must scan every staff reply for any cost value.
- **DONE in M3 - pre-warm the catalogue after the owner's writes.** After every catalogue write and every Receive stock, the main process rebuilds the search index and the stock picture in the background (right after replying), so the owner never waits for the ~400 ms rebuild when the next list or search arrives. Not after a sale: that would stall the counter, and the Products screen loads its stock picture once (about 190 ms) when it is opened.
- **Products screen requirement: the pack-size-lock message.** A size that already has batches keeps its pack size and unit (`PACK_SIZE_LOCKED`). The screen must show that error with its next step ("Add a new size instead"), using the catalogue in `packages/ui/src/i18n/errors.ts`, and should not offer the pack size and unit fields as editable once the size has batches. Check the English and Urdu text against `docs/urdu-review.md` first.
- **DONE in M3 - owner-only enforcement for every catalogue call goes into `apps/desktop/src/main/permissions.ts` and the IPC contract** (`packages/api-contract`), not only into core. For each of `createGroup`, `updateGroup`, `addSize`, `updateSize`, `setSizeActive`, `setGroupActive` and `moveSize`: a strict Zod input schema with no `actor_id` (the main process takes the signed-in user from the session), a row in the permissions table marking it owner-only, and a test in `apps/desktop/tests/permissions.test.ts` that a staff session is refused before the service runs. `search` is open to any signed-in user. Open question 14 says how to relax it.
- **Test when a service adds soft delete** (no service soft-deletes a size or a category yet, so these paths are written but unproven):
  - A label can be reused after the size that had it is soft-deleted (`uq_products_group_label` only covers live sizes).
  - The soft-delete trigger paths on `products` (`UPDATE OF deleted_at`): a deleted size no longer counts for the same-unit, label-required and live-in-group rules, and cannot be un-deleted into a group that now clashes.
  - `createGroup` and `updateGroup` refuse a soft-deleted category or brand (`checkCategoryAndBrand` in `packages/core/src/services/catalogue.ts`).
  - A group that still has live sizes cannot be soft-deleted, and one with only deleted sizes can.

## Phase 5: POS and invoices
Fast keyboard-friendly billing, product search in English and Urdu, batch auto-pick with override, discounts per item, retail or wholesale, tax, thermal and A4 printing.
- **Requirement before printing is built: store a product name snapshot on `invoice_items` at sale time** (`name_en` and `name_ur`, as the size was called when it was sold, group name plus pack label). `invoice_items` keeps only `product_id`, and names now come from `product_groups`, so renaming a group would otherwise change how every old invoice reads and prints. Add it in its own migration with the sale service change and tests (an old invoice keeps its old name after a rename). It was deliberately NOT done in migration 004.

## Phase 6: Customers and Khata
Customers, credit limit and due date, payments, customer statement (printable and shareable), opening balances.

## Phase 7: Returns and voids
Resolve open question 8 first. Return flow with owner approval, void invoice, return slip.

## Phase 8: Dashboard, reports, exports
Daily sales, pending payments, low stock, near-expiry, top products, profit (owner only). Excel and CSV exports.

## Phase 9: Backup, restore, installer
Backup module with destinations, retention, verification and alerts. Restore screen. Windows installer. Test a restore on a second PC.
- **The installer must ship the native SQLite file** (`better_sqlite3.node`, the Electron build pinned in `apps/desktop/native-binaries.json`) and the `@node-rs/argon2` binding, unpacked outside the asar archive, at `<resources>/native/<platform>-<arch>-electron<abi>/`. Test an INSTALLED build, not only `npm run dev`. See `docs/native-sqlite.md` (it also compares this with letting electron-builder rebuild).
- **DONE in M4 - the Products screen** (`packages/ui/src/pages/products/`): product rows that open into sizes, filter chips that count sizes, search with the typing delay, Edit button, empty, loading and error states, staff view without cost, English and Urdu. The Add product, Edit and Receive stock buttons lead to placeholder pages until M5 (forms) and the Receive stock screen. The screenshot tool now seeds the demo shop and a staff login, and takes the Products screens as owner and staff at every size.
- **DONE in M5 - Add / Edit product** (`packages/ui/src/pages/products/product-form-*.ts(x)`, `size-card.tsx`): see the "Add / Edit product screen" section of `docs/design-system.md`. One API addition: `catalogue:list` takes `group_id` to load a single product with its switched-off sizes. Edits are not atomic (see `docs/decisions.md`, "Product form").
- **A restore must rebuild the services.** The catalogue caches in `createCatalogueService` rely on the database connection's change counter (`total_changes()`), which restarts at 0 on a new connection. When the restore feature swaps or reopens the database, it must build new services (or clear the caches), or search and the Products screen could show stale stock.
- **Idle sign-out:** sign the user out after a period with no activity, and when the screen locks. Time to be chosen with the owner.
- **Login lockout:** after several failed sign-ins in a row, make the next attempt wait (and show it). Failed sign-ins are already in `audit_log`.
- Check the Content-Security-Policy of the packaged app (`npm run screenshots` reports violations in a built app).
- **Two checks that the Phase 3 tests could not prove** (found by the test-skeptic review, left open on purpose):
  - *Archive hash.* `apps/desktop/native-binaries.json` pins the SHA-256 of both the downloaded archive and the `.node` file inside it. Only the file hash is tested (offline); a wrong archive hash would not fail any test. Add a test or a CI step that downloads the archive and checks `tarballSha256`.
  - *Atomic preferences write.* `PrefsStore` writes `preferences.json` to a temporary file and renames it over the old one, so a power cut cannot leave half a file. No test observes this: replacing it with a plain write still passes. Add a test that fails a write half way and checks that the old file is intact.

## Migration 005 (planned, not started: waits for the owner's OK on its plan)
- **`sales_return_items.tax_refund`** (`NOT NULL DEFAULT 0`, checked `0 <= tax_refund <= refund_amount`), stored by the return service from `planReturn`'s `tax_refund`. Existing rows are backfilled with the running-difference share of their line's tax (integer arithmetic, halves up), which needs a temporary drop and re-creation of `trg_sales_return_items_no_update`; `change_log` rows are written for the backfilled rows. A guard trigger refuses a cumulative `tax_refund` above the line's `tax_amount`.
- **`v_profit_by_day`** is rebuilt to take a return's revenue as `-(refund_amount - tax_refund)`, so profit matches the refund to the paisa.
- **`v_low_stock`** is rebuilt to require `min_stock > 0` (`WHERE is_active = 1 AND min_stock > 0 AND stock_sellable <= min_stock`), so the view agrees with the Products screen, where a size with no minimum is never low. Then the test "KNOWN DIFFERENCE until migration 005" in `packages/db-sqlite/tests/e2e-sqlite.test.ts` must be changed to expect the view to NOT list such a size, and `docs/database-rules.md` loses its "does not have the above-0 part yet" note.

## Phase 10: Real-data trial
Enter his real products and balances. Run in parallel with his paper register for a week. Fix what he finds.

## Later
- **When sync is built, re-check the catalogue cache.** `catalogueSignature()` (packages/db-sqlite repositories) is a count plus a sum of `version` for products and product groups, and the search cache relies on both only ever going up. Applying a remote row must never write `version` directly or lower it, and a hard delete must stay impossible; otherwise the signature could stay the same after a change and search would show stale products.
Cloud backup (Supabase), phone view, second device, barcode scanner, WhatsApp and SMS reminders.

## Starter prompt for Claude Code
> Read CLAUDE.md and docs/build-plan.md. Start Phase 1: create the db-sqlite package with a better-sqlite3 connection (foreign keys on, WAL), a migration runner for packages/db-sqlite/migrations, first-launch setup, and a backup function. Port packages/db-sqlite/tests/schema_test.py to Vitest. Keep core free of SQLite imports. Run the tests and show me the results.
