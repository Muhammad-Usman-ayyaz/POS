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

## Planted-bug proofs (run 2026-10-22)
Each bug: file backed up, ONE bug planted, relevant tests run (expected FAIL), file restored byte for byte, sha256 checked equal (all 30 restored identical). 28 were caught on the first run; 28 and 29 (screen-side defence in depth) were not, so `packages/ui/tests/returns-state.test.ts` was added and both are now caught.

| # | Bug | Result | First failing test |
|---|---|---|---|
| 1 | refund may exceed quantity sold | CAUGHT | 10 sold, 2 returned > after that, returning 9 bottles is blocked and returning the last 8 is allowed |
| 2 | tax refund not the running difference | CAUGHT | the tax in a refund is worked out the same running-difference way (migration 005 stores it as tax_refund) > ov |
| 3 | stock restored to wrong batch | CAUGHT | in-memory fakes > sales return > what comes back > a sale split over two batches returns to the batch each lin |
| 4 | non-resellable goods restocked (no write-off) | CAUGHT | in-memory fakes > sales return > what comes back > damaged goods are refunded but not put back in sellable sto |
| 5 | void allowed for staff (core) | CAUGHT | SQLite adapter > returns and voids (Phase 7) > void a whole invoice > owner only: staff and inactive users are |
| 6 | void with no reason accepted | CAUGHT | SQLite adapter > returns and voids (Phase 7) > void a whole invoice > a reason is required: empty and blank ar |
| 7 | approval token reusable | CAUGHT | staff start a return, the owner approves it > a token works ONCE: the same token again is APPROVAL_INVALID and |
| 8 | Khata compensation missing (credit sale return) | CAUGHT | in-memory fakes > customer payments and statement > statement > every line has its label, amounts, running bal |
| 9 | Khata entry for a cash sale return | CAUGHT | SQLite adapter > sales return > 10 sold, 2 returned > then 9 more bottles cannot come back, but the last 8 can |
| 10 | void does not reverse stock | CAUGHT | in-memory fakes > returns and voids (Phase 7) > void a whole invoice > marks the invoice voided (it stays on r |
| 11 | double return allowed (cumulative cap ignored) | CAUGHT | in-memory fakes > sales return > 10 sold, 2 returned > a refused return writes no audit row, and the error say |
| 12 | cost in a staff reply | CAUGHT | look, list, preview, print > forInvoice, preview, list and get: the screen gets the core's numbers, the quanti |
| 13 | renderer-supplied approved_by accepted | CAUGHT | the contract > never lets the renderer say who is acting: created_by, approved_by and user_id are refused on e |
| 14 | void channel public | CAUGHT | every channel has a permission policy > each policy is what the hand-written table says it should be (so loose |
| 15 | VOIDED mark missing | CAUGHT | the COPY and VOIDED marks (both papers, both languages) > receipt: a voided invoice says VOIDED (English) or م |
| 16 | unit shown in g/ml on slip | CAUGHT | the 80 mm return slip > says what came back in each line's own unit, the refund, the included tax, how it was  |
| 17 | expired batch accepted as resellable | CAUGHT | in-memory fakes > returns and voids (Phase 7) > what happens to the goods > a batch that has expired since the |
| 18 | write-off movement wrong type | CAUGHT | in-memory fakes > sales return > what comes back > damaged goods are refunded but not put back in sellable sto |
| 19 | void allowed after returns | CAUGHT | SQLite adapter > returns and voids (Phase 7) > void a whole invoice > after a partial return the void is refus |
| 20 | refund at today's price | CAUGHT | in-memory fakes > sales return > what comes back > refunds at the price charged: discount and tax come back in |
| 21 | COPY missing on reprint | CAUGHT | look, list, preview, print > the slip says COPY from the second print of the same kind, counted in the audit l |
| 22 | part-paid split ignores earlier credits | CAUGHT | in-memory fakes > sales return > 10 sold, 2 returned > then 9 more bottles cannot come back, but the last 8 ca |
| 23 | void leaves Khata uncompensated | CAUGHT | SQLite adapter > returns and voids (Phase 7) > void a whole invoice > a credit sale: a compensating Khata row  |
| 24 | sealed pack returned in a fraction | CAUGHT | SQLite adapter > returns and voids (Phase 7) > in the line's own unit > a sealed size comes back in whole pack |
| 25 | profit view ignores returns | CAUGHT | purchase 20 bottles, sell 10 on credit with Rs 2000 paid, return 2 resellable > stock is 12000 ml, the custome |
| 26 | token ignores quantity | CAUGHT | staff start a return, the owner approves it > a token is for EXACTLY that return: another quantity, line, cond |
| 27 | staff complete return without owner | CAUGHT | staff start a return, the owner approves it > staff without a token get APPROVAL_REQUIRED and nothing is writt |
| 28 | stepper unclamped | CAUGHT (first run uncaught; returns-state.test.ts added) |  |
| 29 | return sent without reason | CAUGHT (first run uncaught; returns-state.test.ts added) |  |
| 30 | Complete ignores preview issues | CAUGHT | Returns: the refund is the core's > a wrong word from the preview (an issue) keeps Complete off and says what  |
