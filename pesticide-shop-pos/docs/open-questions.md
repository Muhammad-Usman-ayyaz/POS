# Open questions for the owner

Use the default until he answers. Record his answer here and update `docs/decisions.md`.

| # | Question | Why it matters | Default for now | Owner's answer |
|---|---|---|---|---|
| 1 | Are 500ml and 1L bottles separate products or one product with pack sizes? **RESOLVED** | Prices on products or on a pack table | Was: separate products | **One product with several pack sizes** (for example Insecticide X in 250 ml, 500 ml and 1 L). Each size keeps its own stock, batches, prices, tax rate, barcode and minimum stock, because bottles of different sizes are different physical stock. Recorded in `docs/decisions.md` and `docs/database-rules.md` (migration 004) |
| 2 | Does he buy from suppliers on credit? | Show the supplier ledger in the UI | Tables exist, UI hidden | |
| 3 | Track shop expenses and daily cash closing? | Expenses and cash closing screens | `expenses` table exists, UI hidden | |
| 4 | Farmer details: father's name, CNIC, second phone, guarantor? | More optional customer columns | Name, phone, village, notes | |
| 5 | Does he use a barcode scanner? | Barcode search in the POS | Optional `barcode` column | |
| 6 | Do selling prices already include tax? **RESOLVED** | Line total and tax calculation | Was: not decided | **Yes, prices include tax.** Tax is never added on top: `line_total = price - discount`, and the tax inside it is `ROUND(line_total * rate / (10000 + rate))`. Recorded in `docs/decisions.md` and `docs/database-rules.md` |
| 7 | Can staff void invoices? | Voiding reverses a whole sale | Owner only | |
| 8 | Cash refund and void: exact ledger entries | Needed before coding returns and voids | Not decided | |
| 9 | Credit limit: does a limit of 0 mean "no limit"? Can the owner let one sale go over the limit? | Decides when a credit sale is refused | 0 means no limit is set. A limit above 0 is enforced, counting any opening balance. The owner can override one sale, and the override is written to `audit_log` | |
| 10 | Walk-in sales: does he need to know whether the customer paid by cash, bank, Easypaisa or JazzCash? | Cash-in-drawer and bank reports | Saved on the invoice (`invoices.payment_method`, default cash) | |
| 11 | Cash refunds: when a customer returns goods and is paid back in cash, what is recorded, and can it be more than they paid? | Needed before cash refunds are coded (see also 8) | Not built. Returns only credit the customer's Khata | |
| 12 | Can staff adjust stock, write off damaged or expired goods, enter opening stock, or enter a customer's opening balance? | Decides who may change stock and balances by hand | Owner only. To relax it, add `'staff'` to that capability in `apps/desktop/src/main/permissions.ts` (one line each, plus the tests in `apps/desktop/tests/permissions.test.ts`). Every such change is in `audit_log` either way | |
| 13 | Is the tax rate the same for every product, or different per product? (Left over from question 6) | Whether the product form needs a tax rate field, and which rate a new product starts with | Per product: `tax_rate_bp` on each product (0 unless set), copied onto each invoice line. Prices include tax either way | |
| 14 | Can staff add or edit products, sizes, prices and tax rates? | Decides who may change the catalogue | Owner only (the catalogue service refuses anyone else). To relax it, change the check in `packages/core/src/services/catalogue.ts` and `apps/desktop/src/main/permissions.ts`. Price and tax-rate changes, switching a product off and moving a size are in `audit_log` either way | |
