# Pesticide Club Shop ERP — Project Guide

Read this before changing anything. It exists so a future AI assistant (or a new developer) can
modify this codebase correctly on the first try, without re-deriving the architecture from scratch
or accidentally breaking a pattern the rest of the app depends on.

This is an agri-retail POS/inventory/khata ERP for a pesticide/fertilizer/seed shop, built against
the original written proposal (`PROJECT_PROPOSAL` — ask the user for it if you need the literal
wording; it is not checked into this repo). Every module below maps to a section of that proposal.

## Tech stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui (Radix primitives) +
  React Query (`@tanstack/react-query`) + Chart.js (via `react-chartjs-2`) + ReportLab-generated
  PDFs served from the backend.
- **Backend**: Django 5 + Django REST Framework + SimpleJWT (JWT auth) + PostgreSQL (SQLite usable
  for local dev/tests via `DB_ENGINE=sqlite`).
- **Testing**: Django `TestCase`/`APITestCase` for the backend (fast, no browser). Playwright for
  real end-to-end browser tests (`frontend/e2e/`).

## Repository layout

```
backend/
  config/            Django settings, root urls.py
  apps/
    core/            SoftDeleteModel, roles_permission(), StandardPagination — shared by every app
    accounts/        Custom User model (email login, roles), JWT views, Employees CRUD
    catalog/         Products, Categories, Brands, Batches (batch = a received lot with its own expiry)
    inventory/       StockMovement ledger, stock adjustments, apply_stock_movement() (THE only path
                      allowed to change a batch's quantity)
    suppliers/       Supplier directory (contacts only — no financial actions live here)
    purchases/       Purchase (goods received) + SupplierPayment, cancel/pay actions
    customers/       Customer directory (contacts only — no financial actions live here either)
    khata/           KhataCharge / KhataPayment — the farmer credit ledger
    sales/           Sale + SaleItem — POS transactions, invoice PDF generation
    returns/         SalesReturn + SalesReturnItem — customer returns against a completed sale
    reports/         Read-only aggregation endpoints for Dashboard/Reports (no models of its own)
    audit/           AuditLog — who did what, for the proposal's "audit log" security requirement
frontend/
  src/
    features/<name>/ One folder per domain: types.ts, api.ts (React Query hooks), components/
    pages/           One page component per route, composed from features/
    app/routes.tsx   Route table + role guards
    layouts/         DashboardLayout (sidebar/nav), AuthLayout
    lib/             Shared infra: api client, resource.ts hook factory, notify, queryClient, chart.ts
    index.css        ALL color tokens live here (see "Design system" below) + shared animation classes
  e2e/               Playwright specs, one file per domain, mirroring apps/ above
```

## Core architectural patterns — follow these, don't reinvent them

### 1. Soft delete
`apps.core.models.SoftDeleteModel` gives a model `is_deleted`/`deleted_at`/`deleted_by`, an
alive-only `objects` manager, and an `all_objects` manager for admin/history use. Used by
`Category`, `Brand`, `Product`, `Customer`, `Supplier`. Never hard-delete a record that other rows
reference (sales, purchases, movements) — the delete would either cascade-destroy history or fail a
FK constraint. `Employee.destroy()` follows the same spirit without using this base class:
deactivating (`is_active=False`) instead of deleting, because a departed employee's name must still
render as `created_by` on old records.

### 2. Role-based permissions
`apps.core.permissions.roles_permission(*write_roles, read_roles=None)` returns a DRF permission
class: `read_roles` (default: any signed-in user) may GET; only `write_roles` may write. One line
per ViewSet keeps the whole role matrix legible. Roles: `OWNER`, `MANAGER`, `SALESMAN`,
`ACCOUNTANT` (`apps.accounts.models.UserRole`).

The **frontend must mirror the backend's restriction**, but only as a UX nicety — the API is the
real enforcement point. `frontend/src/features/auth/permissions.ts`'s `ROUTE_ROLES` map lists the
*exceptions*; a path not listed is open to every signed-in role. Don't add a route restriction on
just one side.

### 3. Atomic stock ledger
`apps.inventory.services.apply_stock_movement(*, batch, movement_type, quantity, user, reference,
note)` is **the only function allowed to change `Batch.quantity`**. It locks the batch row
(`select_for_update`), applies the signed delta (inbound types: `PURCHASE_IN`, `ADJUSTMENT_IN`,
`SALE_REVERSED`; everything else is outbound), blocks the result going negative, and writes an
immutable `StockMovement` row in the same transaction. Every place stock changes — purchases,
sales, adjustments, cancellations — calls this function. Never edit `batch.quantity` directly.

### 4. Khata (credit ledger) pattern
`KhataCharge` and `KhataPayment` are immutable, append-only rows (a mistake is corrected with an
offsetting entry or by cancelling the sale/deleting the charge, never by editing one in place). A
customer's `outstanding_balance` is **never stored** — it's `Sum(charges) - Sum(payments)`,
annotated live via a single-level `OuterRef` subquery (see the correctness note below). Payments
are not tied to a specific charge; overpaying is a legitimate advance, not an error.

A `Sale` can post part of its total to khata: `Sale.paid_amount` is how much was collected at the
counter, `Sale.balance` (`total_amount - paid_amount`) is what gets posted as one `KhataCharge`
(zero balance ⇒ no charge at all). `payment_method=KHATA` is shorthand for "pay nothing now".
Cancelling a sale deletes the `KhataCharge` it posted and reverses the stock via `SALE_REVERSED`.

### 5. Critical ORM lesson: `OuterRef` depth
`OuterRef('pk')` must correlate **directly** against the outer queryset it's annotating. Wrapping
it inside another `Subquery(...)` two levels deep silently breaks the correlation (Django returns
the same value for every outer row — a real bug that shipped once in `apps.suppliers.views` and was
caught by a regression test with multiple suppliers, only one of which had activity). Always use a
single-level `OuterRef('pk')` against the model you're annotating, as done in `apps.customers.views`
and `apps.reports.services.dashboard_summary`.

### 6. Audit log
`apps.audit.services.log_action(actor, action, summary, target_type='', target_id=None)` is the
only way to write an `AuditLog` row — never expose write access through the API. Call it from the
service/view layer at the exact point a critical action completes (see `apps.sales.services`,
`apps.returns.services`, `apps.purchases.views`, `apps.customers.views`, `apps.inventory.views`,
`apps.accounts.views.EmployeeViewSet`/`CustomTokenObtainPairView` for the full current list). If you
add a new kind of critical action (a new financial transaction type, a new destructive admin
action), add a `log_action()` call for it and a new entry in
`frontend/src/features/audit/types.ts`'s `AUDIT_ACTION_LABELS`.

### 7. Frontend resource hooks
`frontend/src/lib/resource.ts`'s `createResource<T, TInput>('endpoint')` generates
`useList`/`useDetail`/`useCreate`/`useUpdate`/`useRemove` React Query hooks for a standard
paginated DRF ViewSet in one line — see any `features/<name>/api.ts` for the pattern. Non-standard
endpoints (an unpaginated list, a merged ledger, a custom action) get a hand-written hook next to
the resource, not bolted onto `createResource`.

### 8. Toasts and errors
Use `notify()`/`notifyError()` from `frontend/src/lib/notify.ts` (sonner-based) for all user
feedback — never a bespoke toast implementation. Use `getErrorMessage()` from
`frontend/src/lib/apiError.ts` to turn an Axios/DRF error into display text.

## Design system ("Lagoon" palette)

**Every color in the app is a CSS custom property in `frontend/src/index.css`.** No component
hardcodes a hex value (the two exceptions, `SalesTrendChart`/`CategoryDoughnutChart`, read the same
variables at runtime via `getComputedStyle` and only fall back to a literal hex if that fails). This
means re-theming the whole app is a token edit in `index.css`, never a per-page rewrite — that's how
the previous "Mint Ice" palette became "Lagoon" (`#176B87` / `#30A7A0` / `#7AC7C4` / `#E7CFA6`) in
one commit. If you add a new page, use the existing Tailwind utility classes
(`bg-primary`, `text-on-surface`, `bg-surface-container-lowest`, etc.) — never inline a color.

Dark mode is wired via `next-themes` (`ThemeProvider` in `app/App.tsx`, toggle in Settings). The
`--erp-*` tokens have a `.dark` override block; **if you add a new `--erp-*` token, add its dark
counterpart too** — a glass-morphism dark-mode bug (light-only `rgba(255,255,255,…)` fills on every
`.glass-*` class) shipped once for exactly this reason and had to be fixed with a `.dark .glass-*`
override block.

Shared animation classes (`erp-animate-page`, `erp-stagger-item`/`erp-stagger-1`…`8`,
`erp-card-hover`, `erp-btn-press`, `glass-card`/`glass-toolbar`/`glass-header`/`glass-modal`/
`glass-dropdown`/`glass-toast`/`glass-pill`) live in `index.css` too. **Every new list/detail page
should use them** — a whole phase of prior work (see git log) was just retrofitting pages that had
shipped without these classes. `erp-animate-page` is already applied globally by `DashboardLayout`
to every routed page; per-page use of it is optional/redundant but harmless.

All of this respects `prefers-reduced-motion` (global `@media` block in `index.css`) — don't add an
animation that bypasses it.

## Backend app map (what each one owns)

| App | Owns | Notable |
|---|---|---|
| `core` | `SoftDeleteModel`, `roles_permission()`, `StandardPagination` | No models of its own beyond the abstract base |
| `accounts` | Custom `User` (email login), JWT endpoints, `EmployeeViewSet` | Employees mounted at top-level `/api/employees/`, not under `/api/auth/` |
| `catalog` | `Category`, `Brand`, `Product`, `Batch` | A product's stock = `Sum(its batches' quantity)`; `Batch` is not soft-deleted |
| `inventory` | `StockMovement`, `apply_stock_movement()` | The append-only ledger every other app writes through |
| `suppliers` | `Supplier` (directory only) | Payables are computed via `apps.purchases`, not stored here |
| `purchases` | `Purchase`, `PurchaseItem`, `SupplierPayment` | Immutable once received; `cancel` reverses stock, blocked if payments exist |
| `customers` | `Customer` (directory only) | Balance/charged/paid are annotated, not stored (see pattern #4) |
| `khata` | `KhataCharge`, `KhataPayment` | `serialize_ledger()` merges both into one sorted feed for a customer or shop-wide |
| `sales` | `Sale`, `SaleItem`, invoice PDF | `create_sale()`/`cancel_sale()` in `services.py` are the only entry points |
| `returns` | `SalesReturn`, `SalesReturnItem` | "Returns & Claims": a customer bringing back some/all items from a completed sale. Separate from `Sale.cancel` (whole-sale reversal) — the original Sale is never edited. `create_return()` restocks via `apply_stock_movement(..., RETURN_IN)` and settles the refund as either a cash refund (recorded on the return only) or a `KhataPayment(method=ADJUSTMENT)` credit |
| `reports` | Pure aggregation, no models | Dashboard summary, sales/purchase trends, profit analysis, category/product/supplier breakdowns |
| `audit` | `AuditLog` | Read-only API; written only via `log_action()` |

## Frontend route map

See `frontend/src/app/routes.tsx` for the authoritative list and
`frontend/src/features/auth/permissions.ts` for role restrictions. Nav is in
`frontend/src/layouts/DashboardLayout.tsx`, gated with the same `canAccess()` helper — **update
both files together** when changing a route's access.

Two intentional redirects exist for pages that were removed after being found redundant:
`/payments` and `/record-payment` → `/khata` (Payments was just Khata filtered to payment entries).

## Known gaps (from the proposal audit)

As of the last audit against the original proposal, everything is implemented **except**:
- **Automatic backups** (daily/weekly/monthly DB backup + recovery) — proposal's Data Security
  section names this explicitly; nothing exists for it yet. Needs a decision on storage target
  (local disk vs. cloud) before building, since this repo has no deployment infra defined.

Everything else named in the proposal — including audit logs, split/partial sale payments, and
profit/purchase analytics — has been built. If the proposal is re-shared, re-check it section by
section against the code rather than trusting this summary to stay current forever.

## Running & testing locally

See `README.md` for full setup. Quick reference:

```bash
# Backend (from backend/, with DB_ENGINE=sqlite for local dev without Postgres)
DB_ENGINE=sqlite SQLITE_PATH=./db.sqlite3 python manage.py migrate
python manage.py seed_demo_catalog        # products, categories, brands
python manage.py seed_demo_procurement    # suppliers + one part-paid purchase
python manage.py seed_demo_khata          # 3 demo farmers with khata history
python manage.py seed_demo_sales          # a couple of demo POS sales (cash + khata)
python manage.py seed_e2e_users           # fixed Owner/Salesman accounts the Playwright specs expect
python manage.py runserver 8000
python manage.py test                     # full backend suite

# Frontend (from frontend/)
npm run dev                               # Vite dev server (hardcoded to port 5180 in vite.config.ts)
npm run build                             # tsc -b && vite build — always run this, not just tsc, before calling a change done
npx playwright test                       # full e2e suite; starts its own Vite server on :5173
```

**Verify a change by running the app, not just by reading the diff.** `tsc -b && vite build`
passing means the types line up; it does not mean the feature works. For anything touching a flow
a Playwright spec covers, run that spec (or add one) and read its output.

If Playwright logins start failing mid-suite with a redirect back to `/login`, the per-IP
`LOGIN_THROTTLE_RATE` (default `10/min`) is exhausted by the suite's own repeated logins — raise it
for local test runs: `LOGIN_THROTTLE_RATE=1000/min python manage.py runserver 8000`.

If the backend returns stale/404 responses after a code change, check for a leftover server process
still bound to port 8000 (`netstat -ano | grep :8000`) — this has caused confusing "the route
doesn't exist" debugging sessions more than once.

## Adding a new module — the checklist

1. Backend: new `apps.<name>` (or add to an existing app if it's clearly the same domain). Models →
   serializers → services.py for anything with business logic beyond a plain CRUD save → views.py
   using `roles_permission()` → urls.py → register in `config/settings.py` `INSTALLED_APPS` and
   `config/urls.py`. Write tests in the same PR, not after.
2. If the new thing is a "critical activity" (money, stock, or an account change), call
   `apps.audit.services.log_action()` at the point it happens.
3. Frontend: `features/<name>/types.ts` + `api.ts` (prefer `createResource()`) + `components/` for
   dialogs/forms → `pages/<Name>Page.tsx` using the shared list-page shell (glass header banner,
   glass toolbar with search, `erp-stagger-item` cards/table, `Pagination`) → route in
   `app/routes.tsx` → nav link in `layouts/DashboardLayout.tsx` (both gated identically) → role
   entry in `features/auth/permissions.ts` only if it's genuinely restricted.
4. Add an e2e spec in `frontend/e2e/` exercising the real flow through the browser, not just the
   API.
5. Run the full verification block above before calling it done.
