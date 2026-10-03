# Pesticide Club Shop POS

Offline-first desktop app for ONE pesticide, fertilizer and seed shop in Pakistan: POS billing, inventory with batches and expiry, purchases, and the farmer Khata (credit ledger). One PC, an owner plus staff. Must be free to run: no server, no subscription. UI and printing in English and Urdu. Currency is PKR, stored in paisa.

The developer is a student building this for a real client. Keep things simple, explain trade-offs briefly, and work in small steps.

## Stack
Electron, React, TypeScript, Tailwind, shadcn/ui, better-sqlite3, Zod, Recharts, SheetJS. npm workspaces. Vitest for TypeScript tests.
No ORM. The schema, triggers and views live in plain SQL migrations. Repositories are hand-written and typed.

## Layers and dependency rules
- `packages/core`: pure TypeScript. Types, Zod schemas, money math, and services (sale, return, void, purchase, payment, stock, khata). It must NOT import electron, better-sqlite3, react or fs. It talks to the outside only through interfaces in `src/ports`.
- `packages/db-sqlite`: implements the ports with better-sqlite3. The ONLY place that contains SQL. Also holds `migrations/`.
- `packages/api-contract`: the typed API between the UI and any shell: channel names, strict Zod input schemas, output types, the error envelope. Pure TypeScript: it must NOT import React, Electron or Node code, and the UI and desktop both import it.
- `packages/ui`: React pages and components, the design system (`docs/design-system.md`) and the English and Urdu texts. Never touches SQLite or Electron directly. It calls the typed API.
- `apps/desktop`: Electron main process, preload, IPC wiring, the session, roles, password hashing, backup, printing, installer.
Direction: `ui -> api-contract -> core <- db-sqlite`, and `apps/desktop` wires them together. Do not import `@pos/core/testing` from `ui` or `desktop`.
Keep this separation. SQLite is the only adapter for the core ports. Supabase comes later as a sync target fed by `change_log` (a separate sync package), not as a second adapter, so nothing else should need to change.

## Database rules (details in docs/database-rules.md)
- Schema is `packages/db-sqlite/migrations/001_init.sql`. NEVER edit an applied migration. Add `002_...sql` instead.
- Run `PRAGMA foreign_keys = ON` on every connection. WAL mode is on.
- Primary keys are UUIDs generated in the app. Money is integer paisa. Quantities are integers in the base unit (ml, g or piece). Prices are per pack.
- Stock is never stored. It is the sum of `stock_movements.qty_delta` per batch (view `v_batch_stock`).
- A customer's balance is never stored. It is the sum of `ledger_entries.amount_delta` (view `v_customer_balance`). Plus means the customer owes more.
- `stock_movements`, `ledger_entries`, `payments`, `audit_log` and all `*_items` tables are append-only. Fix mistakes with a reversing row.
- No hard deletes. Use `deleted_at`. Invoices are voided, never deleted.
- The database maintains `version` and `updated_at`. Never set them in app code.
- Cost price is copied onto each invoice line at sale time. Profit uses that copy.
- Every sale, return, payment and purchase runs inside ONE database transaction so stock, invoice and ledger change together or not at all.

## Product decisions already made
Loose and sealed sales both exist. Batch and expiry on every product. Retail and wholesale price. Payments reduce the customer's overall balance. Credit limit and due date on credit sales. Returns must link to an invoice and need owner approval. Discounts are per item only. Out-of-stock sales are blocked. Batch is picked earliest-expiry-first with manual override. Payment methods: cash, bank, Easypaisa, JazzCash. Selling prices include tax (it is never added on top). The tax rate is stored per product and the tax amount per invoice line. Near-expiry warning at 30 days. Owner-only: approve returns, change prices, view profit and cost. Thermal 80mm and A4 invoices. No data import from the old Django version.
Full list: `docs/decisions.md`. Unanswered owner questions with the defaults to use: `docs/open-questions.md`.

## Conventions
- TypeScript strict mode. No `any`. Validate everything crossing the IPC boundary with Zod.
- Use integers for money everywhere. Never floats. Format to "Rs 1,250" only at the display edge.
- Product, customer and supplier names exist in English and Urdu (`name_en`, `name_ur`). Search both. The UI supports right-to-left text and an Urdu font.
- Business rules go in `core` services and are unit tested without a database or Electron. Anything that must never be broken is also enforced by the database.
- UI text goes through `packages/ui/src/i18n` so Urdu can be added without touching components.

## Commands
- `npm run test:schema` runs the schema checks (needs Python 3). All must pass after any migration change.
- `npm test` runs Vitest (db-sqlite: schema rules, migrations, setup, backup). `npm run typecheck` runs tsc.
- `npm run dev` starts the desktop app (it opens `dev.db` in the repo root; with no `dev.db` you see the first-launch setup). `npm run dev:db` makes a `dev.db` with an owner, a staff user and demo data (the script prints the logins; it only ever replaces the repo-root `dev.db`, ignores `POS_DB_PATH`, and refuses to touch a database that holds a real shop). Never commit `dev.db`.
- `npm run native` downloads and verifies the Electron build of SQLite (see `docs/native-sqlite.md`). `npm run build` builds the app. `npm run screenshots` captures every screen at three window sizes.

## How to work
1. Read `docs/build-plan.md` and do one phase at a time. Finish and test a phase before starting the next.
2. Ask before inventing a business rule. If it is in `docs/open-questions.md`, use the stated default and note it.
3. Do not add libraries without saying why. Prefer free, offline-friendly choices.
4. Keep screens simple and fast for a busy counter: keyboard-friendly POS, large touch targets, clear errors.
5. Update the docs when a decision changes.

## Subagents
Three project subagents live in `.claude/agents/`. Claude delegates to them automatically; you can also ask for one by name.
- `schema-guardian` (read-only): checks data rules (migrations, derived stock and balances, append-only tables, soft deletes, money as integers, one transaction per operation, the flows in `docs/database-rules.md`) and runs `npm test`, `npm run typecheck` and `npm run test:schema`. Run it before every commit.
- `layer-checker` (read-only): checks the dependency rules (`ui -> api-contract -> core <- db-sqlite`, pure core, pure api-contract with no React or Electron, SQL only in db-sqlite, Zod on every IPC input). Run it before every commit.
- `test-skeptic`: plants a deliberate bug to prove each new or changed test can fail, then restores the file byte for byte. Run it whenever tests are added or changed, especially guard and rollback tests.
