# Open questions for the owner

Use the default until he answers. Record his answer here and update `docs/decisions.md`.

| # | Question | Why it matters | Default for now | Owner's answer |
|---|---|---|---|---|
| 1 | Are 500ml and 1L bottles separate products or one product with pack sizes? | Prices on products or on a pack table | Separate products | |
| 2 | Does he buy from suppliers on credit? | Show the supplier ledger in the UI | Tables exist, UI hidden | |
| 3 | Track shop expenses and daily cash closing? | Expenses and cash closing screens | `expenses` table exists, UI hidden | |
| 4 | Farmer details: father's name, CNIC, second phone, guarantor? | More optional customer columns | Name, phone, village, notes | |
| 5 | Does he use a barcode scanner? | Barcode search in the POS | Optional `barcode` column | |
| 6 | Tax rate the same for everything or per product? Do prices already include tax? | Line total and tax calculation | Rate per product. Inclusive pricing not decided | |
| 7 | Can staff void invoices? | Voiding reverses a whole sale | Owner only | |
| 8 | Cash refund and void: exact ledger entries | Needed before coding returns and voids | Not decided | |
| 9 | Credit limit: does a limit of 0 mean "no limit"? Can the owner let one sale go over the limit? | Decides when a credit sale is refused | 0 means no limit is set. A limit above 0 is enforced, counting any opening balance. The owner can override one sale, and the override is written to `audit_log` | |
| 10 | Walk-in sales: does he need to know whether the customer paid by cash, bank, Easypaisa or JazzCash? | Cash-in-drawer and bank reports | Saved on the invoice (`invoices.payment_method`, default cash) | |
| 11 | Cash refunds: when a customer returns goods and is paid back in cash, what is recorded, and can it be more than they paid? | Needed before cash refunds are coded (see also 8) | Not built. Returns only credit the customer's Khata | |
