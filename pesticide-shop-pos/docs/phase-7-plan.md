# Phase 7 plan: returns and voids

Written before the build (2026-10-22). Decisions are in `docs/decisions.md` (rows "Phase 7"); this file is the working plan.

## Milestones
1. **M1 Rules and data** - migration 009 (cash / Khata split on a return, who started it, a reason per line, void guards, a stricter `v_profit_by_day`), the core domain (`splitRefund`, `planVoid`, line rules) and `salesReturn.preview / create / voidInvoice`, both backends (fakes and SQLite) under one test suite.
2. **M2 Channels** - the shell: `returns:preview`, `returns:forInvoice`, `returns:list`, `returns:get`, `invoices:void`, `approval:requestReturn`, `print:returnSlip`, and the changed `salesReturn:create` (staff may start, the owner's one-use token approves). Policies, role matrix, spoofed identity, nobody-signed-in and staff deep-scan tests.
3. **M3 Slip** - return slip / credit note, 80 mm and A4, English and Urdu, COPY on a reprint from the audit log, real text with the embedded font, no cost, kg / L / piece; added to `npm run check:pdf`.
4. **M4 Screens** - from `docs/design/Returns.dc.html`: Returns page (find invoice, lines, quantities, reason, resellable toggle, refund summary, approval dialog, complete panel), void dialog, returns list; entry points from invoice detail. English and Urdu at 1280x720, 1366x768 and 1920x1080 (screenshots tool extended).
5. **M5 Proof** - 20+ planted bugs (backup, plant, see FAIL, restore, sha256), docs (build-plan, decisions, open-questions, database-rules, design-system, urdu-review), full test runs twice.

## Channels (all new ones get a `CHANNEL_POLICY` line, matrix rows, a meta-test)
| Channel | Who | Notes |
|---|---|---|
| `returns:preview` | signed in | the core's numbers for a draft return; writes nothing; no cost |
| `returns:forInvoice` | signed in | the lines with sold / returned / returnable, unit, price as sold, whether the batch has expired |
| `returns:list` | signed in | past returns, search and paging |
| `returns:get` | signed in | one return with its lines (the "Return complete" panel and the slip) |
| `salesReturn:create` (changed) | signed in; staff need a token | owner: no token. Staff: `approval_token` for exactly this return, spent once. `approved_by`, `requested_by` come from the shell |
| `approval:requestReturn` | signed in | the owner types their own password; token bound to the invoice, the lines, the conditions and the person asking |
| `invoices:void` | owner (`invoices.void`) | reason required |
| `print:returnSlip` | signed in | prints or saves PDF; COPY from `audit_log` |

Setting for Q8 (`refund_paid_part_to_khata`) rides on the existing owner-only `customers:setSettings`.

## Edge cases (each has a test)
partial return of a discounted line; return after a price change (sold price); beyond sold quantity refused; double return (cumulative cap); expired batch (not resellable); 0.5 kg from 2.5 kg; sealed packs only in packs; already-voided invoice refused; void after a partial return (refused: return the rest); unit rounding to the paisa (parts add up to the line); returns vs `v_profit_by_day` (revenue, tax, cost, write-offs, voided); cash sale, credit sale, part-paid sale, walk-in, setting on; reason required for every line.

## Planted bugs (>= 20, each must FAIL a test; restore verified by sha256)
1. refund exceeds sold quantity allowed
2. tax refund wrong (not the running difference)
3. stock restored to the wrong batch
4. non-resellable goods restocked
5. void allowed for staff (service)
6. void with no reason accepted
7. approval token reusable
8. Khata compensation missing for a credit sale return
9. Khata entry created for a cash sale return
10. void without reversing stock
11. double return allowed (cumulative cap ignored)
12. cost in a staff reply (return lines)
13. renderer-supplied `approved_by` accepted
14. channel public (no policy)
15. VOIDED mark missing on the slip / invoice screen
16. unit shown in g / ml on the slip
17. expired batch accepted as resellable
18. write-off movement missing for damaged goods
19. void of an invoice with returns allowed
20. refund uses today's price instead of the sold price
21. COPY missing on a slip reprint
22. part-paid split puts everything on Khata
23. void leaves Khata uncompensated for a credit sale
24. sealed pack returned in a fraction
25. the profit view forgets to take the return off

## Out of scope
Supplier returns (Phase 4 left them as tables only); a cash drawer report (Phase 8); sync.
