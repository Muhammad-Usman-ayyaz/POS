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
- [ ] Everything else: see `docs/build-plan.md`

## Check the database
```
npm run test:schema   # original Python checks
npm test              # Vitest
```
