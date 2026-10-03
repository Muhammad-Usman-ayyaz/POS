# Pesticide Club Shop POS

Offline-first desktop POS, inventory and Khata for a pesticide, fertilizer and seed shop.

## Folder layout
```
CLAUDE.md                 Rules and context for Claude Code. Read first.
docs/                     Architecture, database rules, decisions, build plan, open questions
  database-design.xlsx    Every table, column and relationship
packages/
  core/                   Pure TypeScript: types, schemas, money, services, ports
  db-sqlite/              SQLite adapter, migrations, repositories
    migrations/001_init.sql
    tests/schema_test.py  Checks the schema and business rules
  ui/                     React pages, components, i18n, print layouts
apps/
  desktop/                Electron main, preload, IPC, backup, printing, installer
scripts/                  Dev and release helpers
```

## Status
- [x] Database design and `001_init.sql` (39 schema checks pass)
- [x] Phase 1: db-sqlite package (connection, migration runner, first-launch setup, backup, Vitest)
- [x] Phase 2, slices 1-2: Zod schemas for every table, money helpers, batch allocation, line and invoice totals, return limits (packages/core)
- [x] Phase 2, slice 3: ports (repositories, unit of work, id and number generators) and services: stock, purchase, sale, payment, khata, sales return
- [x] Phase 2, slice 4: SQLite repositories and unit of work; one shared service suite runs on the fakes AND on SQLite; end-to-end scenario
- [ ] Phase 2: cash refunds and voids (blocked on open questions 8 and 11)
- [x] Phase 3, part 1: desktop shell (Electron, typed API in packages/api-contract, first-launch setup and owner recovery code, sign in, owner and staff roles, layout, English and Urdu, error messages). Run it with `npm run dev`; see CLAUDE.md
- [ ] Everything else: see `docs/build-plan.md`

## Check the database
```
npm run test:schema   # original Python checks
npm test              # Vitest
```
