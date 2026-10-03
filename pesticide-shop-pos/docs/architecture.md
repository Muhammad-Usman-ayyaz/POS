# Architecture

## Goals
One shop, one PC, free to run, works with no internet. Built so that cloud backup, a phone view, a second device, multiple branches and barcode or WhatsApp features can be added later without a rewrite.

## Layers
```
Shells (swappable)    Electron desktop now (apps/desktop) | PWA or phone later | web admin later
API contract          Channel names, strict Zod input schemas, output types (packages/api-contract): pure TypeScript
UI                    React pages (packages/ui)
Core                  Pure TypeScript services and rules (packages/core)
Ports                 Interfaces the core depends on (packages/core/src/ports)
Adapter               SQLite (packages/db-sqlite): the only implementation of the ports
Sync layer (later)    A separate package that reads change_log and pushes and pulls to Supabase.
                      Supabase is a sync target, not an adapter for the core ports.
```
Dependency direction: `ui -> api-contract -> core <- db-sqlite`, and `ui -> core`. `apps/desktop` wires everything together and imports all four.
`packages/api-contract` is shared by the UI and every shell. It contains no React, no Electron and no Node code; a test and the `layer-checker` agent fail if it imports any.

## Process split in Electron
- Renderer (React) shows screens and calls a typed API exposed by the preload script. The page can call only the named functions in the contract.
- Main process owns the database, the session, password hashing, backup, printing and file access. For every call it checks that the sender is our own window, validates the input with the channel's strict Zod schema, checks the user's role, and only then calls a core service.
- The renderer never gets direct database or file access. It never says who is acting: the user comes from the session in the main process.
- Errors travel as `{ ok: false, error: { code, params } }`. The UI turns the code into English or Urdu text (`packages/ui/src/i18n/errors.ts`); the main process never sends text to display.

## Desktop security
- Window: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, no webview, no new windows, navigation limited to our own page, all permission requests denied, minimum size 1280 x 720.
- The preload script exposes one object, `posBridge`, made only of named functions. A test checks that the built preload imports nothing but `electron` and does not expose `ipcRenderer`.
- **Content-Security-Policy:** strict in the built app (`default-src 'none'`, scripts and styles only from the app itself, no inline code, no `eval`, no network). Only the Vite dev server gets a relaxed policy, because it injects an inline script for hot reload and talks over a local web socket.
- Roles: the policy is one table in `apps/desktop/src/main/permissions.ts`. The core services check the owner too where a business rule needs it (returns, price and credit overrides), so there are two layers.
- Owner recovery: a one-time code made at first launch, shown once, stored only as an argon2 hash, replaced each time it is used.
- Native SQLite for Electron: see `docs/native-sqlite.md`.

## Supabase is a sync target, not an adapter
The core ports (repositories and the unit of work) are synchronous and transactional, and SQLite is the one real implementation. Supabase will not implement them. When cloud backup or a second device arrives, a sync package reads unsynced `change_log` rows from SQLite and pushes them to Supabase (and later pulls changes back), so the core services and ports do not change.

## Why local-first
The shop must keep billing during internet or power cuts. SQLite is a single file on his PC. Cloud is added later as a copy, never as a requirement.

## Built-in sync readiness
UUID keys, `shop_id`, `branch_id`, `device_id`, `version`, soft deletes, an append-only money and stock model, and a `change_log` table written by database triggers. A future sync package only has to read unsynced `change_log` rows.

## Growth path
1. Single PC, SQLite, daily file backups (this project)
2. Cloud backup: push `change_log` to Supabase when online
3. Read-only phone view for the owner
4. Second device with two-way sync (conflict handling only for editable records)
5. Multiple branches (`branch_id` already exists)
6. Barcode scanner, WhatsApp and SMS Khata reminders, online orders, analytics

## Backup design (apps/desktop/src/main/backup)
- Safe copy with better-sqlite3 `.backup()` or `VACUUM INTO`. Never copy the live file with the OS.
- Triggers: on app close, every few hours while open, before migrations, before restore, and a "Backup now" button.
- Destinations (pluggable): second local folder, USB drive, a cloud-synced folder (Google Drive, OneDrive), Supabase Storage later.
- Retention: 14 daily, 8 weekly, 12 monthly. Optional password-encrypted zip. Checksum per file.
- Verify each backup with `PRAGMA integrity_check` and row counts, and record it in `backup_log`.
- Dashboard shows backup status: green, orange or red.
- Restore screen: list backups, verify, take a safety copy, replace, restart.
- Human-readable exports (Excel and CSV) of Khata balances, stock, sales and all tables as a last safety net.
- Test a restore on a second PC before go-live.

## Printing
Invoices render from one data model into two HTML templates: thermal 80mm and A4. Printed or saved as PDF through Electron. Urdu text needs an embedded font and right-to-left layout.
