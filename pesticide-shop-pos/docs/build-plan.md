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
- **Idle sign-out:** sign the user out after a period with no activity, and when the screen locks. Time to be chosen with the owner.
- **Login lockout:** after several failed sign-ins in a row, make the next attempt wait (and show it). Failed sign-ins are already in `audit_log`.
- Check the Content-Security-Policy of the packaged app (`npm run screenshots` reports violations in a built app).
- **Two checks that the Phase 3 tests could not prove** (found by the test-skeptic review, left open on purpose):
  - *Archive hash.* `apps/desktop/native-binaries.json` pins the SHA-256 of both the downloaded archive and the `.node` file inside it. Only the file hash is tested (offline); a wrong archive hash would not fail any test. Add a test or a CI step that downloads the archive and checks `tarballSha256`.
  - *Atomic preferences write.* `PrefsStore` writes `preferences.json` to a temporary file and renames it over the old one, so a power cut cannot leave half a file. No test observes this: replacing it with a plain write still passes. Add a test that fails a write half way and checks that the old file is intact.

## Phase 10: Real-data trial
Enter his real products and balances. Run in parallel with his paper register for a week. Fix what he finds.

## Later
Cloud backup (Supabase), phone view, second device, barcode scanner, WhatsApp and SMS reminders.

## Starter prompt for Claude Code
> Read CLAUDE.md and docs/build-plan.md. Start Phase 1: create the db-sqlite package with a better-sqlite3 connection (foreign keys on, WAL), a migration runner for packages/db-sqlite/migrations, first-launch setup, and a backup function. Port packages/db-sqlite/tests/schema_test.py to Vitest. Keep core free of SQLite imports. Run the tests and show me the results.
