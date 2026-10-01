# Pesticide Club Shop POS

Offline-first desktop app for ONE pesticide, fertilizer and seed shop in Pakistan: POS billing, inventory with batches and expiry, purchases, and the farmer Khata (credit ledger). One PC, an owner plus staff. Must be free to run: no server, no subscription. UI and printing in English and Urdu. Currency is PKR, stored in paisa.

The developer is a student building this for a real client. Keep things simple, explain trade-offs briefly, and work in small steps.

## Stack
Electron, React, TypeScript, Tailwind, shadcn/ui, better-sqlite3, Zod, Recharts, SheetJS. npm workspaces. Vitest for TypeScript tests.
No ORM. The schema, triggers and views live in plain SQL migrations. Repositories are hand-written and typed.

## Layers and dependency rules
- `packages/core`: pure TypeScript. Types, Zod schemas, money math, and services (sale, return, void, purchase, payment, stock, khata). It must NOT import electron, better-sqlite3, react or fs. It talks to the outside only through interfaces in `src/ports`.
- `packages/db-sqlite`: implements the ports with better-sqlite3. The ONLY place that contains SQL. Also holds `migrations/`.
- `packages/ui`: React pages and components. Never touches SQLite or Electron directly. It calls a typed API.
- `apps/desktop`: Electron main process, preload, IPC wiring, backup, printing, installer.
Direction: `ui -> core <- db-sqlite`, and `apps/desktop` wires them together.
Keep this separation. Later the SQLite adapter will be joined by a Supabase adapter and a sync layer, and nothing else should need to change.

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
Loose and sealed sales both exist. Batch and expiry on every product. Retail and wholesale price. Payments reduce the customer's overall balance. Credit limit and due date on credit sales. Returns must link to an invoice and need owner approval. Discounts are per item only. Out-of-stock sales are blocked. Batch is picked earliest-expiry-first with manual override. Payment methods: cash, bank, Easypaisa, JazzCash. Sales tax is stored per product and per invoice line. Near-expiry warning at 30 days. Owner-only: approve returns, change prices, view profit and cost. Thermal 80mm and A4 invoices. No data import from the old Django version.
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
- Add `npm run dev` when the desktop app is created.

## How to work
1. Read `docs/build-plan.md` and do one phase at a time. Finish and test a phase before starting the next.
2. Ask before inventing a business rule. If it is in `docs/open-questions.md`, use the stated default and note it.
3. Do not add libraries without saying why. Prefer free, offline-friendly choices.
4. Keep screens simple and fast for a busy counter: keyboard-friendly POS, large touch targets, clear errors.
5. Update the docs when a decision changes.
