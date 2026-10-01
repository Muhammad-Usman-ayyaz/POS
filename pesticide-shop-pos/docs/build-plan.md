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
- Electron main, preload, typed IPC, login screen, owner and staff roles.
- Layout, navigation, English and Urdu switch with right-to-left support.

## Phase 4: Catalog and stock in
Categories, brands, products (loose and pack setup, prices, tax), suppliers, batches, purchases, stock list with low-stock and near-expiry.

## Phase 5: POS and invoices
Fast keyboard-friendly billing, product search in English and Urdu, batch auto-pick with override, discounts per item, retail or wholesale, tax, thermal and A4 printing.

## Phase 6: Customers and Khata
Customers, credit limit and due date, payments, customer statement (printable and shareable), opening balances.

## Phase 7: Returns and voids
Resolve open question 8 first. Return flow with owner approval, void invoice, return slip.

## Phase 8: Dashboard, reports, exports
Daily sales, pending payments, low stock, near-expiry, top products, profit (owner only). Excel and CSV exports.

## Phase 9: Backup, restore, installer
Backup module with destinations, retention, verification and alerts. Restore screen. Windows installer. Test a restore on a second PC.

## Phase 10: Real-data trial
Enter his real products and balances. Run in parallel with his paper register for a week. Fix what he finds.

## Later
Cloud backup (Supabase), phone view, second device, barcode scanner, WhatsApp and SMS reminders.

## Starter prompt for Claude Code
> Read CLAUDE.md and docs/build-plan.md. Start Phase 1: create the db-sqlite package with a better-sqlite3 connection (foreign keys on, WAL), a migration runner for packages/db-sqlite/migrations, first-launch setup, and a backup function. Port packages/db-sqlite/tests/schema_test.py to Vitest. Keep core free of SQLite imports. Run the tests and show me the results.
