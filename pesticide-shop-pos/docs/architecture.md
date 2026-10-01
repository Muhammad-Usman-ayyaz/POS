# Architecture

## Goals
One shop, one PC, free to run, works with no internet. Built so that cloud backup, a phone view, a second device, multiple branches and barcode or WhatsApp features can be added later without a rewrite.

## Layers
```
Shells (swappable)    Electron desktop now | PWA or phone later | web admin later
UI                    React pages (packages/ui)
Core                  Pure TypeScript services and rules (packages/core)
Ports                 Interfaces the core depends on (packages/core/src/ports)
Adapters              SQLite now (packages/db-sqlite) | Supabase later
Sync layer (later)    Reads change_log, pushes and pulls to Supabase
```
Dependency direction: `ui -> core <- db-sqlite`. `apps/desktop` wires everything together.

## Process split in Electron
- Renderer (React) shows screens and calls a typed API exposed by the preload script.
- Main process owns the database, backup, printing and file access. IPC handlers validate input with Zod, then call core services.
- The renderer never gets direct database or file access.

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
