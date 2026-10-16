# Phase 6 plan: Customers and Khata

Status: PLAN ONLY. No code until the owner approves. Designs: `docs/design/CustomerForms.dc.html` (sections 1 add/edit, 1b duplicate warning, 2 opening balance, 3 receive payment, 4 statement), its render `Customer form, opening balance, payment, statement.png`, and `Customer Khata.png` (the list). **`Khata.dc.html` does not exist** (CustomerForms links to it from its sidebar): the list and the customer page are designed only by the PNG. Quick-add from the POS has no design at all.

Assumption (open question 4): the farmer fields (father's name, CNIC, second phone, guarantor) are optional and hidden by default.

## What already exists (do not rebuild)
- core: `khata.setOpeningBalance` (one `opening` row per customer, owner), `khata.statement` (running balance over the whole ledger), `khata.overdue(customerId)` (oldest-first, per invoice), `payment.receiveFromCustomer` (a `payments` row plus a `ledger_entries` row, balance can go negative), `customers.search` (both languages).
- contract: `customers:search`, `khata:setOpeningBalance` (owner, `khata.openingBalance`). **No channel exists for payments, statement, overdue, customer create/update/list.**
- missing in core/db: customer insert/update (`CustomerRepository` has only `getById` and `list`), payment receipt numbers (no `payment` sequence), a note column, date inputs on payments and opening balances, statement date range, statement display data (invoice numbers, payment method), statement printing, CSV export.
- UI: `pages/customers` and `pages/khata` are empty; `/customers` is a placeholder.

## Decisions I recommend (the owner confirms; each has a default so work is not blocked)
| # | Decision | Recommended default |
|---|---|---|
| D1 | Who may add customers and take payments? | Any signed-in user adds customers (contact fields only) and takes payments; **owner only** for credit limit, price type, farmer fields, opening balance and its correction |
| D2 | Credit limit 0 means "no limit" (Q9). A staff quick-add would then create a customer with unlimited credit | Shop setting `default_credit_limit` (owner), applied to every new customer; staff cannot change it. If it is 0, quick-adds have no limit: shown as a loud "No limit" chip |
| D3 | Date on payments and opening balances (design has a Date field) | **Not in Phase 6**: payments are dated now; the field is shown read-only ("Today"). Back-dating changes statement order and disagrees with `balanceAsOfSale` (rowid order). Opening balance date is also "today" |
| D4 | Note on payments | Yes: nullable `payments.note` (migration 007) |
| D5 | Payment receipt with a number (design "RCP-A-000001") | Yes: new `payment` number sequence, printed 80 mm receipt for a payment (the design shows it). Stored on `payments` |
| D6 | Correcting an opening balance (design: "reversed, new one added") | One owner-only `khata:adjustOpening {customer_id, delta, reason}` writing an `adjustment` ledger row (the type already exists in the CHECK) and an audit row. No second `opening` row |
| D7 | Advance (overpayment) | Allowed; the screen shows a confirm; the balance is shown as "Advance Rs X" (negative balance) everywhere; the service takes `confirm_advance` so a client cannot skip the question |
| D8 | Farmer fields | Migration 007 adds nullable `father_name`, `cnic`, `phone2`, `guarantor`; shown only when the owner turns on setting `customers.show_farmer_fields` (default off). Data stays when hidden |
| D9 | Ledger sequence column (needed before sync) | Not now. Recorded in `docs/database-rules.md`; revisit when sync starts |
| D10 | Deleting a customer | Not built. If ever: refused unless balance is 0 and no held bills |

## Milestones (each ends with typecheck, `npm test`, `npm run test:schema`, a screenshot run, and a commit)
- **M0: migration 007 and ports.** `payments.note`; `payment` sequence row for existing devices (and in `setup.ts`); nullable farmer columns; settings keys. Schema tests, `schemas-match-db`, `migration-007.test.ts`. NEVER edit 001-006.
- **M1: core services.** Customers service (create, update contact fields, setTerms, findDuplicates, list with totals, get with summary), payment service extensions (reference required for bank/wallet, note, receipt number, `balance_after`, `confirm_advance`), statement with range + brought-forward + totals + joined display data (invoice no, return no, payment method and reference), `adjustOpening`. Pure core; SQL only in db-sqlite repositories.
- **M2: channels, policy, runtime.** Contract blocks, `permissions.ts`, `runtime.ts` (user from the session, never from the renderer), rows in the matrix test and the staff deep scan (every new channel called as staff, no cost).
- **M3: customer list screen** (Khata PNG): total outstanding and overdue cards, search, filters (all / owes / overdue / advance), rows with chips, negative balance as "Advance".
- **M4: add/edit form and Terms** (CustomerForms 1 and 1b): duplicate warning that does not block ("Open existing" / "Save as new"), farmer block behind the setting, owner-only terms section.
- **M5: customer page and payment/opening dialogs** (2 and 3): balance cards, ledger preview, Receive payment with live "balance after" from the shell, advance confirm, opening balance and correction (owner).
- **M6: statement** (4): date range, brought-forward line, totals, print 80 mm and A4 (new document kinds, English and Urdu, bidi islands for numbers, no cost, COPY rule as for invoices), CSV export through the main process, payment receipt print.
- **M7: POS quick-add.** "New customer" in the F4 picker: name, phone, village; uses `customers:create` with `default_credit_limit`; the new customer is selected at once. Needs a design (none exists).
- **M8: wrap-up.** `ui-requests` tests against the real handlers, screenshots at three sizes in both languages, the three review agents and the test-skeptic, docs.

## Files (new unless marked)
- `packages/db-sqlite/migrations/007_customers_khata.sql`; `src/customers.ts`, `src/statement.ts` (named columns, never `*`); `setup.ts` (edit); `tests/migration-007.test.ts`, `customers-db.test.ts`, `statement-db.test.ts`.
- `packages/core/src/services/customers.ts` (edit: add write side), `payment.ts`, `khata.ts` (edit); `schemas/customer.ts`; `domain/statement.ts`; tests in `packages/core/tests/support/suites/`.
- `packages/api-contract/src/contract.ts`, `types.ts` (edit, own blocks).
- `apps/desktop/src/main/permissions.ts`, `runtime.ts` (edit); `printing/` (statement documents); `tests/customers-api.test.ts`, `ui-customer-requests.test.ts`; edit `catalogue-api.test.ts` (matrix, deep scan), `permissions.test.ts`.
- `packages/ui/src/pages/customers/*` (list, form, duplicate dialog, terms), `pages/khata/*` (customer page, payment dialog, opening dialog, statement), `pages/pos/customer-dialog.tsx` (edit: quick-add), `print/statement-document.tsx`, `print/payment-receipt.tsx`, i18n en/ur, `app.tsx` routes.

## New channels and who may call them
| Channel | Who |
|---|---|
| `customers:list` (query, filter, paging, totals) | any signed-in user |
| `customers:get` (customer, balance, credit left, next due, overdue) | any signed-in user |
| `customers:findDuplicates` | any signed-in user |
| `customers:create` (contact fields; limit, price type and farmer fields only from the owner; staff get the defaults) | any signed-in user |
| `customers:update` (contact fields) | any signed-in user |
| `customers:setTerms` (credit limit, default price type, farmer fields; audited from/to; owner only) | owner (`customers.terms`) |
| `payments:receive` | any signed-in user |
| `khata:adjustOpening` | owner (`khata.openingBalance`) |
| `khata:statement` | any signed-in user |
| `khata:exportStatement` (CSV) | any signed-in user |
| `print:statement`, `print:paymentReceipt` | any signed-in user |
| existing `khata:setOpeningBalance` | owner (unchanged) |
All inputs strict Zod with no `actor_id`, `created_by` or `user_id`. Every reply and every printed page goes through the staff deep scan (no cost, no margin).

## Edge cases and how each is handled
- **Overpayment:** allowed, needs `confirm_advance`; balance goes negative; shown as "Advance Rs X" in list, picker (`Owes Rs -1,000` must never print), receipt and statement; the credit-limit check already counts it.
- **Payment of 0, negative, or to a customer who owes 0:** 0 and negative refused; paying a zero balance is an advance and needs the confirm.
- **Opening balance:** signed, non-zero, one per customer, owner only; "we owe them" is negative; never overdue (no due date); corrections only through `adjustOpening` (a reason is required).
- **Credit limit 0:** means no limit (Q9) everywhere; credit left shows "No limit", never 0 or a negative number; lowering a limit below the current balance is allowed, warned, audited, and the next credit sale needs the owner.
- **Duplicate names:** never blocked (no unique constraint); the warning shows village, phone, balance; "Save as new" resends with `confirm_duplicate`. Same name + same phone is flagged stronger.
- **Urdu names:** either name is enough; search normalises Urdu/Arabic letters and digits; the list sorts by the displayed language; Urdu names in documents are bidi-isolated.
- **Phone:** free text today; Phase 6 stores it as typed and searches digits-only (strip spaces, dashes, a leading +92/0).
- **Statement:** ties ordered by `(entry_date, rowid)`; a date range starts with a "brought forward" line; adjustment rows are labelled; refunds/voids do not exist (Q8, Q11).
- **Soft delete:** not offered (D10).
- **Held bills** keep the customer id: edit is fine, delete does not exist.
- **Two users, one counter:** `expected_version` on `customers:update` and `setTerms`; a stale edit gets `VERSION_CONFLICT`.

## Tests
- Core suites (fake and SQLite adapter): every service rule above; payment atomicity (payment row, ledger row, receipt number, audit in one unit of work); statement totals equal the ledger balance; overdue oldest-first.
- Desktop: matrix rows for every channel and role, nobody-signed-in refusals, spoofed identity refused, staff deep scan, `ui-customer-requests.test.ts` sends the screens' own requests through the real handlers.
- UI: list, form, duplicate dialog, payment dialog (live balance after, advance confirm), statement, quick-add; English and Urdu RTL; wording read from the `.dc.html` and checked against the rendered page (the Phase 5 lesson); no cost; no left/right classes.
- Print: statement and payment receipt, English and Urdu, `npm run check:pdf` extended (Urdu joined, right to left), cost scan over the output.

## Planted bugs (each is proven: write the test, plant the bug, see it fail, restore byte for byte). At least 15; target 20
1. Payment writes the ledger row with a plus sign (balance goes up).
2. Payment writes the `payments` row but the ledger row is skipped.
3. Payment and ledger rows in two transactions (audit/receipt number outside).
4. Overpayment accepted without `confirm_advance`.
5. Payment of 0 or negative accepted.
6. Reference not required for Bank/Easypaisa/JazzCash.
7. Receipt number reused after a rolled-back payment (number taken outside the transaction).
8. Staff can call `customers:setTerms` or `khata:adjustOpening`.
9. `customers:create` from staff honours a credit limit sent in the request.
10. `created_by` or `actor_id` accepted from the renderer.
11. Credit limit 0 treated as "no credit allowed" in `credit_left`.
12. `credit_left` goes negative instead of "over limit".
13. Advance shown as "Owes Rs -1,000".
14. Duplicate-name warning blocks the save, or a duplicate is silently saved without `confirm_duplicate` when the phone matches.
15. Opening balance entered twice (second `opening` row) or a correction written as a new `opening` row.
16. Statement running balance ignores the brought-forward line when a range is set.
17. Statement totals differ from the ledger balance by an adjustment row (adjustment not counted).
18. Overdue computed newest-first.
19. Stale `expected_version` accepted (lost update).
20. Statement or payment receipt shows a cost, margin or profit (deep scan and cost scan must fail).
21. Urdu statement prints numbers flipped ("L 1"-style) or the document is left to right.
22. COPY not shown on a reprinted statement/receipt.
23. POS quick-add selects the wrong customer or ignores `default_credit_limit`.
24. Farmer fields shown while the setting is off (or saved data wiped when the setting is turned off).
25. Customer search stops matching the digits-only phone.

## What in the design will not work as drawn
- **Khata.dc.html is missing.** The list and customer page follow the PNG only.
- **Extra details** (father's name, CNIC, second phone): no columns today; D8 adds them hidden. "Guarantor" is in the question but not in the design: confirm.
- **Date field on opening balance and payment:** `entry_date`/`paid_at` are always "now" (D3); read-only "Today".
- **Note field:** no column on `ledger_entries` or `payments` (D4 adds `payments.note`; the opening balance note goes into the audit row).
- **"Cannot be edited, only reversed and a new one added":** no reversal exists, and a second `opening` row is refused: D6 replaces it with an adjustment row.
- **Receipt "RCP-A-000001":** no `payment` number sequence and nowhere to store it: D5/M0.
- **Reference "needed for Bank, Easypaisa, JazzCash":** only an optional text in core today: M1 adds the rule.
- **"Balance after" and "Credit left" lines:** need numbers from the shell (the screens do no arithmetic): `payments:receive` and `customers:get` return them.
- **Overpayment checkbox:** UI only today: D7 enforces it in the service.
- **Statement:** "Debit/Credit" (HTML) vs "Owes more/Owes less" (PNG) differ: use the PNG wording; date range, brought-forward line and Totals row do not exist; "Export Excel" (PNG) vs "Export CSV" (HTML): CSV only in Phase 6; the two mocks of the same customer show different balances (Rs 2,000 vs Rs 9,000): not one dataset.
- **List cards:** "Total outstanding" needs a decision: sum of positive balances only (recommended, so an advance does not hide another customer's debt). "Overdue Rs 15,500" needs a new aggregate. "Next due" comes from the oldest unpaid invoice's `due_date`; an opening balance has no due date.
- **Overdue chips:** `khata.overdue` allocates oldest-first: this is a display rule only; the schema still has no payment-to-invoice allocation.
- **Duplicate hint "father's name":** refers to a column that does not exist unless D8 is on.
- **Quick-add from the POS:** not in `Main.dc.html` or `PosDialogs.dc.html`: needs a design before M7.
- **Phone "0300 1234567":** stored as typed; search is digits-only (see edge cases).

## Risks
- `shops` still has no update trigger (a rename does not reach `change_log`): fix in migration 007 if sync is near.
- Real-printer test (statement and payment receipt on the 80 mm thermal printer) must happen at the shop trial, like the Phase 5 documents.
- Back-dated payments are deferred (D3); if the owner insists, the ledger needs the stable sequence column first (D9).
