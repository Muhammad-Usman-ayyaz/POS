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

## Phase 4: Catalog and stock in (done)
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
- **DONE in M6 - Receive stock** (`packages/ui/src/pages/purchases/`): see the "Receive stock screen" section of `docs/design-system.md`. Purchases is now a page that leads to it. `use-debounced-search` also reports which text its answer is for (`answeredFor`), so a scanner's Enter cannot pick from a stale list.
- **PHASE 4 DONE (M0 to M7).** Pack sizes (migration 004), the catalogue service and fast search, the shell's policy for every channel (owner-only cost), the Products screen, Add / Edit product, Receive stock, back-dated receipts (audited, 30-day confirmation), and Purchases as a page that leads to Receive stock. `apps/desktop/tests/ui-requests.test.ts` sends the screens' own requests through the real handlers on a real SQLite database: what the screens send is accepted by the strict contract, is stored the way they mean it (tax 18 percent is 1800, packs become base units), and the screen's clash detection agrees with the shell's `BATCH_CONFLICT`.
- **PHASE 4: WHAT IS STILL NOT PROVEN, or not built:**
  - **Edits are not atomic.** A new product is saved in one call; an edit is several calls (product, sizes, new sizes, switch on/off). A failure stops the rest, the earlier steps stay saved, and the form reloads and says so. Atomic edits need a core service that changes a product and all its sizes in one transaction.
  - **The real Electron window never saves.** The screenshot tool opens every screen but does not press Save, so create / edit / receive are proven by the UI tests (fake API) and by `ui-requests.test.ts` (real handlers, no window), not by a click in the real app.
  - **"Today" is the UTC date** (open question 16): between 00:00 and 05:00 in Pakistan the future-date check and the 30-day check are a day off.
  - **The date fields use the computer's own date format** (a US setting shows MM/DD/YYYY). Check the shop PC's regional setting.
  - **Migration 005 is not done**, so the database view `v_low_stock` still lists a size with no minimum as low, while the Products screen does not (the screen is right). The plan is below; it waits for the owner's OK.
  - **Urdu wording has not been reviewed by a native speaker** (`docs/urdu-review.md`), and open question 17 (Urdu month names) is unanswered.
  - **Receiving is always paid in full** (supplier credit is hidden, open question 2) and packs are whole numbers (no half packs, no loose receiving).
  - **No list of past receipts**: Purchases only leads to Receive stock.
  - **A soft-deleted batch** still clashes in the shell but the screen cannot see it; nothing in the app soft-deletes a batch yet.
  - **Soft-delete paths for sizes, categories and brands** (the list above) are written but unproven: no service soft-deletes them yet.
  - **Known, not fixed: a one-pixel overflow on the first-launch recovery-code screen.** The screenshot report flags the form column of that screen (`03-recovery-en`) as 1 px wider than its box, at one or two of the three sizes, and not always the same ones (it appeared at 1366x768 and 1920x1080 in one run, at 1920x1080 and 1280x720 in the next, and at none in another). The page itself never scrolls sideways and nothing is visibly cut off. It is not a one-line fix: capping the code's font size (tried and reverted) did not remove it, so the cause is elsewhere in that layout (`pages/recovery-code-step.tsx`, `split-layout.tsx`). The screen is from Phase 3, not Phase 4.
  - **One guard is redundant and so untested:** the `requireCapability(user, 'stock.receive')` line inside the `stock:receive` handler. The channel policy in `permissions.ts` already refuses staff before the handler runs (tested), so removing the inner line changes nothing. It stays as defence in depth; a test would need access to the unguarded handlers.
  - **A restore must rebuild the services** (see the note below) when the restore feature is built in Phase 9.
  - **Screenshots are not part of the test run**: they are made by `npm run screenshots` (several minutes) and checked by hand and by their report.json.
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
