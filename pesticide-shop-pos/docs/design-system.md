# Design system

The approved designs are in `docs/design/` (Sign in, POS billing in English and Urdu, Products and stock, Customer Khata). This page records the tokens taken from them. The code is in `packages/ui/src/styles/index.css`, and `packages/ui/tests/styles.test.ts` fails if a token changes by accident.

Tailwind v4 is used: the `@theme` block in that CSS file **is** the Tailwind config, and every token is also a CSS variable (`var(--color-accent)`).

## Colours

| Token | Value | Used for |
|---|---|---|
| `page` | `#F4F2EC` | page background |
| `ink` | `#1B2A22` | text |
| `muted` | `#5B675F` | secondary text, hints |
| `sidebar` | `#17261E` | sidebar and the left panel of Sign in |
| `sidebar-ink` / `sidebar-muted` | `#E7EFE9` / `#A9BDB0` | text on the dark panel |
| `nav-hover` | `#25402F` | nav item hover |
| `nav-active` | `#2F7A4E` | active nav item (white text) |
| `accent` / `accent-dark` | `#1F5D3A` / `#14412A` | main buttons, links, totals |
| `tint` / `tint-soft` | `#E3EFE6` / `#EAF3EC` | selected states, the total box |
| `card` / `line` | `#FFFFFF` / `#D9D6CC` | cards and their border |
| `thead` | `#EFEDE4` | table header |
| `row-line` / `row-hover` | `#ECE9DF` / `#F6F5EE` | table rows |
| `field-line` | `#CFCBBE` | input border |
| `focus` | `#7DBE97` | focus ring and glow |
| `warn-bg` / `warn-ink` | `#FBEBCB` / `#7A4B00` | warnings (near expiry, low stock, "Goes on Khata") |
| `danger-bg` / `danger-ink` | `#F8DADA` / `#8E1F1F` | errors, expired, destructive text |

## Type

- **IBM Plex Sans** for English and for all numbers (tabular digits). **Noto Naskh Arabic** for Urdu.
- Both are bundled from npm packages (`@fontsource/ibm-plex-sans`, `@fontsource-variable/noto-naskh-arabic`). Nothing is loaded from the internet.
- In Urdu text the font list starts with Plex, so an English shop name or a number inside Urdu is set in Plex; Arabic-script letters are not in Plex and fall through to Naskh.
- Urdu gets more line height (1.75) because Naskh letters are tall.
- Page title 32px bold. Table headers are small uppercase with letter spacing.

## Numbers stay left to right

Amounts, quantities, dates and document numbers use the `.num` class (or the `<Num>` component): `direction: ltr; unicode-bidi: isolate`, Plex, tabular digits. In text built as a plain string (an error message, a toast) the helper `ltr()` wraps them in Unicode left-to-right isolate marks instead. Numeric table columns are right-aligned, which means **end**-aligned in right-to-left. Text that has Urdu *words* in it ("14 پیک", "2 پیک اور 250 کھلا") is NOT forced left to right: the isolate scrambles it (the month ends up after the year). Only pure numbers and amounts are isolated. The Products screen keeps these as plain text in Urdu.

## Spacing, size and shape

- Spacing scale: 8, 12, 16, 24, 32 px (Tailwind `2, 3, 4, 6, 8`).
- Page padding 24px 32px. Table cells 14px 24px with a 24px column gap.
- Radii: **10** (small controls), **12** (buttons, nav items), **14** (cards, inputs, big buttons).
- Touch targets are at least **44px**. Buttons: 48 (`md`), 56 (`lg`), 68 (`xl`, the main call to action). Inputs 56.
- In a window shorter than 800px the form screens use 48px fields and a 56px button, so first-launch setup fits at 1280 x 720.

## Layout

- **Sidebar 232px**, dark green, with line icons from `lucide-react`. Active item: `nav-active` with white bold text. The EN / اردو switch and "Signed in as" sit at the bottom.
- **Under 1366px wide** the sidebar becomes a 72px icon-only bar (monogram, icons, stacked language switch, avatar), as in `Main.dc.html`. Names stay as tooltips and for screen readers. The window cannot be smaller than **1280 x 720**.
- **Sign in, setup and password reset** share one split layout: dark panel (41% of the width) with the shop name, form on the other side.
- **Right to left (Urdu):** `dir="rtl"` and `lang="ur"` go on the app root (and `<html>`). The layout flips by itself because everything uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`, `text-start`) and CSS grid. Never use `left` or `right` in a component. Direction-specific icons (the Return arrow, Sign out) are mirrored.

## Motion (CSS only)

| Effect | How |
|---|---|
| Rows and cards fade up with a small stagger | `.stagger`, 0.42s, `style="--i: n"` gives a 60ms step |
| Buttons lift 1px on hover, press to scale .98 | `.lift` |
| Credit bars grow in | `.grow-in`, from the start edge |
| Warning badges pulse gently | `.pulse-soft` |
| Fields get a soft focus glow | base style on `input:focus` |
| The total pops once | `.pop-once` |

Under `prefers-reduced-motion: reduce` **all** animation and transitions are switched off (the last block in the CSS). A test checks that the block exists, covers everything, and stays last.

## Messages and errors

- All text comes from `packages/ui/src/i18n` (`messages/en.ts`, `messages/ur.ts`). The two files must have the same shape; the compiler checks it. Have a native Urdu speaker review the wording before go-live.
- `packages/ui/src/i18n/errors.ts` is the one place that turns an error code into words. It has an entry for every `DomainErrorCode`, in English and Urdu, each with what went wrong and what to do next, built from the error's params ("Only 3 packs left in this batch"). The server never sends text to show.
- `<ErrorNotice error={e} />` shows an error inline (red box; amber with `tone="warning"`). `useToast().showError(e)` shows the same message as a toast that goes away after six seconds.

## Products and stock screen

`packages/ui/src/pages/products/`. Built from `docs/design/Products with sizes.png` (the PNGs are the only design source; there is no .dc.html). A product row opens into its sizes. The product row says "N sizes", the whole stock in litres or kg, the **Retail range** and a badge for each of low, near expiry and expired sizes. A size row has stock (packs), cost (owner only), retail and wholesale (both "incl. tax"), tax, next expiry and its badge; "Low stock · min 5" is in packs. The chips count sizes. The Edit button is 44 px. Staff get no Cost and Actions columns and no Add product, Receive stock or Edit. Search waits 150 ms after typing stops (`useDebouncedSearch`). It has loading, empty, nothing-found and error states.

## Add / Edit product screen

`packages/ui/src/pages/products/product-form-page.tsx`, built from `docs/design/Edit product, sizes and locked pack size.png` (there is no AddProduct.dc.html). Owner only: staff who open the address are sent back to the list. The product holds the English and Urdu name, category, brand and the **base unit (shown at product level only; a size shows only its pack size number and the unit as text)**. Each size card has label, pack size, SKU, barcode, retail and wholesale price (both "incl. tax"), tax rate in percent (stored as basis points: 18 is 1800), the low-stock alert **in packs** (stored in base units) and a loose-sale checkbox. Under the retail price: "Rs 118 includes Rs 18 tax" (the tax inside the price, never added to it).

A size that has batches shows its pack size as a **locked button**. Pressing it, or a `PACK_SIZE_LOCKED` reply from the shell, opens "This pack size can no longer be changed" with the next step **Add a new size**, which closes the message and adds a new size card with the cursor on its label. **Remove** exists only on a size that is not saved yet; a saved size has **Switch off** (or **Switch on**), saved with the product. Category and brand have a small quick-add form under the drop-down.

A new product is saved in one call. An edit sends only what changed, in this order: the product's own fields, the changed sizes, the new sizes, then switching sizes on or off. These are separate calls, so if one fails the earlier ones stay saved: the form is then reloaded to show what is saved, with a note.

## Receive stock screen

`packages/ui/src/pages/purchases/`, built from `docs/design/Receive stock, batch conflict.png` (there is no ReceiveStock.dc.html). Owner only: staff are sent to Purchases, which is a page with a link to Receive stock (shown to the owner only) until the list of past receipts is built. Header: supplier (with quick-add), supplier invoice number, date received (today by default; a past date is allowed, a future one is refused; more than 30 days ago the shell asks and the screen shows "This receipt is dated N days ago. Save anyway?"). Lines: product and size (the same fast search as Products, with the typing delay; a scanned barcode plus Enter adds the one size it matches), batch number, expiry, packs, cost per pack, line total. **Packs are turned into base units before sending** (12 packs of a 1000 ml bottle is 12000). The footer shows lines, packs and the total cost, and says it is paid in full. There is no Save draft.

**Batch clashes** are found on the screen as soon as the numbers are typed, from the batches the size already has (`stock:batchesOf`, which lists every batch, empty ones too): a different cost is checked first (then only "Save as new batch number" is offered, because a cost is never rewritten); a different expiry with the same cost offers "Use expiry <existing date>" (puts the EXISTING date in the field) and "Save as new batch number" (fills in the next free number, which can be edited); the same batch number twice for one size on the receipt shows the duplicate-line message on the second line. The Receive button is off while any clash is open, while the existing batches are still being looked at, and while a line or the header is not valid; the reason is written beside it. If the shell still says `BATCH_CONFLICT` (the screen's list was out of date), the batches are asked for again and the clash shows on its line.

## POS screen

`packages/ui/src/pages/pos/`, built from `docs/design/Main.dc.html` (English), `PosUrdu.dc.html` (Urdu) and `PosDialogs.dc.html` (the dialogs and states), which are plain HTML and CSS and are the exact reference (the PNGs are renders of them). On this route the sidebar is the 72px icon bar at **any** width and the page fills the window without its own scroll (`AppShell` sets `data-compact`; the `narrow:` Tailwind variant in `styles/index.css` means "under 1366px OR inside `data-compact`"). Left column: search box (F2) with Retail / Wholesale, cards of size buttons for the matches (price, "N left", amber for low or near expiry, green when on the bill, dashed and disabled when out of stock), then the bill table and the shortcut strip. Right column (340px): customer card (F4, credit bar, owes now, after this sale, limit) and the payment panel (total with tax, paid now, Cash / Bank / Easypaisa / JazzCash, the Khata remainder with its pay-by date, Complete sale F12, Hold bill, Clear).

- **No money arithmetic on the screen.** Totals, tax, each line's price, the effect of a discount, the Khata remainder, the over-limit check and "what needs the owner" all come from `sale:quote` (re-asked, after a 120 ms pause, whenever the cart, customer, price type, method, due date or amount paid changes). Complete sale stays off until the quote on screen is for the bill on screen. The only conversions are typing ones: rupees to paisa, a discount percent to paisa of the line's quoted price, packs to base units.
- **One `request_id` per bill**, kept for every retry of that bill (a new one only after the sale succeeds, Clear, Hold or Resume). A second click, or F12 while a sale is on its way, is ignored.
- **Cash handed over.** "Paid now" may be more than the bill for cash: the sale is sent for the bill's total (the quote is asked as paid in full) and the sale-saved box shows the change due. Change is never saved.
- **The owner at the counter.** `requires_approval` in the quote, or an `APPROVAL_REQUIRED` / `CREDIT_LIMIT_EXCEEDED` reply, opens a dialog; the sale is never re-sent without an approval. Over the limit: "Take Rs X more" (raises Paid now) or "Ask owner" (staff), "Allow over the limit" (owner, sent as `credit_override`). The approval dialog asks for the owner's username and password (`approval:request`, bound to exactly this cart and amount), empties the password at once, and re-sends the sale with the token and the same `request_id`. A token is spent by any try, so a failure asks again.
- **Line editor** (click a line, or F8 for the selected line with the cursor in the discount box): quantity with steps, batch (Auto = earliest expiry first, or one batch picked by hand, expired ones disabled; no cost is asked for), discount in percent or rupees, Remove line. Sealed sizes move by whole packs, loose sizes by 50 (or 10, or 1 for small packs).
- **Held bills (F6)** live in the database and are reached with `bills:hold`, `bills:list`, `bills:resume` and `bills:discard` (nothing is kept in the browser's storage). A held bill holds the choices only (items, discount as entered, batch, customer, price type): no price. The F6 button shows the count from the database and its tooltip names who held them; each row of the dialog says "held by <name> · time" (the name comes from the shell, never from the screen). Any signed-in user may resume or discard any bill. Resume takes the bill off hold first (once; a bill someone else already took says "not there any more" and nothing comes to the bill), puts it on the screen at once, then prices it again with `sale:quote`. "Price changed" and "Batch changed" only appear for a bill held in this run of the app (the price the cashier saw is remembered in memory, never saved); "Removed" always. Keyboard behaviour is unchanged (F6 opens the dialog and refreshes the list).
- Staff never see cost: no request sends `include_cost` / `includeCost`, and a test scans every request and the page.
- The F2 badge in the search box is a flex item after the input (as in the design), not a placed element: `.num` forces `direction: ltr`, and an element's OWN direction decides which side `end-3` is, so a badge placed with `end-3` stayed on the right in Urdu and covered the magnifier. A test fails if any element in `pages/pos/` is both placed with `start-`/`end-` and carries `num`.
- **Numbers in the Paid now field** read `1,000` (separators go in as the amount is typed; paisa are left as typed until the field is left; the quote key uses the amount, so tidying the text never asks for a new quote). The field is always left to right, in Urdu too, so it is `Rs  1,000`, never `1,000Rs`.
- **Dates** (the pay-by date here, From / To on Invoices, the date received and every expiry on Receive stock) use `DateField` (`components/ui/date-field.tsx`), see "Dates" in the design system section below. Never a bare browser date input.
- **Counter dialogs** use `<Dialog counter eyebrow lead>`: 16px corners, 24px padding, 14px between parts, a grey chip, a 20px title and a 14px lead, 420px wide, buttons 48px (`Button size="dialog"`). The sale-saved box is Save PDF, New sale, Print receipt (main); when not even a PDF could be made, a "Could not print" box offers Skip, Save PDF and Try again. The over-limit box has no Cancel (Escape or a press outside closes it), as in the design. A held bill resumed also says "Batch changed" when the batch it would take is not the one it was holding.
- **Touch size:** the design draws some buttons 36 or 40px (quantity steps, Change, payment methods, Hold, Clear, the pay-by box); they stay 44px, which is the rule of this system and of `PosDialogs.dc.html` ("Targets are 44 px or larger"). Everything else is the design's value.
- **Not possible yet:** the design's `Invoice INV-A-000002 · 3 lines` shows the next invoice number; the shell allocates it when the sale is saved and has no channel to read it ahead, so the screen says `New bill · 3 lines`. The "Includes tax" line shows what `sale:quote` says (`Rs 91` for a taxed bill; the demo data is 0% tax, so the screenshots show `Rs 0`).
- Right to left comes from logical classes only; a test fails if any file in `pages/pos/` uses `left`, `right`, `ml-`, `mr-`, `pl-`, `pr-`, `text-left` or `text-right`. Amounts and dates use `.num`; text with Urdu words in it is not isolated.

## Receipts, invoices and printing

Built from `docs/design/80 mm receipts, English and Urdu.png` and `A4 invoice, English and Urdu.png`. The components are in `packages/ui/src/print/` (pure: the same data and language always give the same page, nothing is read from the screen's language or session); `apps/desktop/src/main/printing/` puts the page on paper or in a PDF.

- **Two papers, from one invoice model** (`InvoiceDocumentData`, built by `invoices:receipt`): the 80 mm receipt (printable about 72 mm, as long as its content) and the A4 invoice. Each in English and Urdu. The Urdu page is `dir="rtl"` and `lang="ur"`: labels start on the right, amounts sit on the left, the A4 table starts with `#` on the right.
- **Fonts are inside the page.** `renderDocumentHtml` writes the stylesheet with IBM Plex Sans 400/600/700 and Noto Naskh Arabic (Arabic-script subset) as `data:font/woff2;base64,...`. The page's own Content-Security-Policy is `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:`, so it cannot load anything. The desktop app bundles the font files into the main process with Vite `?inline`; nothing is read from node_modules or the PC at print time. The stack in Urdu is Plex first (English shop name, numbers), then Naskh, as on screen.
- **Numbers and Latin text stay left to right** with `.num` (amounts, dates, document numbers) and `.ltr` (a Latin run such as "1 L" inside an Urdu name: left alone, the bidi rules would show it as "L 1"). Date and time are `12 Oct 2026, 10:42` in the shop's time zone (default Asia/Karachi), English month names and Latin digits in both languages.
- **What is on a line:** the name as sold (`invoice_items.name_en/name_ur`: group name plus pack label), then `2 × Rs 500` for whole packs or `250 g × Rs 200/kg` for a loose sale (`Fertilizer · loose`). The receipt shows each line before discount and one `Discount` line, then Total, `Includes tax`, `Paid · Cash`, `On Khata`, `Your balance now` (as of that sale) and `Pay by`. The A4 invoice has `# / Item / Batch / Qty / Rate / Disc. / Tax / Amount` (the Tax column is an addition to the design: tax per line), the totals block, two signature lines and the thank-you line. A walk-in sale has no customer, balance, Khata or Pay by lines.
- **Footer:** the last line is the standard thank-you line (`Thank you. Please keep this receipt.`) unless the owner has typed a receipt footer in Settings (up to 200 characters, `print.receipt_footer`): then that text replaces it on BOTH papers. It is printed as plain text (escaped, never markup) and wraps.
- **Header:** the shop name (editable by the owner in Settings, stored in the `shops` row) only is real. Address and phone are the owner's print settings and print as `[Address and phone]` (italic, grey) until entered.
- **COPY:** a boxed `COPY` (Urdu `COPY · نقل`) at the top of a receipt, under the title on an invoice, from the second print of that kind of document for the invoice. A voided invoice prints `VOIDED` the same way.
- **No cost, batch cost, margin or profit appears in any document** (the data type has no such field and the queries never select it). The batch NUMBER is on the A4 invoice only.
- **PDF fallback:** when there is no printer, the chosen printer is gone, or printing fails, the same page is saved as a PDF and opened. `print:document` then replies `status: 'pdf_saved'` with `fallback`; the screen must show that as a plain notice ("Saved as PDF: no printer found", with the file's path) and not as an error. Only a failure to make even the PDF is an error.
- To look at the pages without a printer: the HTML from `renderDocumentHtml` opens in any browser.

## Invoice history

`packages/ui/src/pages/invoices/`, route `/invoices`, the "Invoices" item in the sidebar right after POS (the sidebar now has eight pages; there was no other place in the shell that a cashier would find, and the icon bar has room). No design PNG exists for it: it follows the Products screen (same header, search box, filter chips, table card, loading rows, empty and error states). Staff and owner see the same screen; nothing on it carries cost.

- **List** (`invoices:list`): newest first, 25 a page. Search by invoice number, customer name (English or Urdu) or phone, sent 150 ms after typing stops. From / To dates (the UTC invoice date, as the shell filters) and chips All / Active / Voided. From / To are `DateField`s: "Any date" until chosen, then `5 Dec 2026` in both languages (not the browser's `mm/dd/yyyy`), still sent as YYYY-MM-DD. Any change of search or filter goes back to the first page; Previous / Next and "26-50 of 60" below the table. Columns: invoice number (the button that opens it; a Voided badge), date, customer or "Walk-in", total, paid, on Khata, method, sold by, and "Printed N times".
- **Detail** (`invoices:get`, a dialog): date, customer and village, sold by, method, pay-by date, the lines as they were sold (name at sale time, quantity as "2" packs or "250 g" loose, price per pack or per kg, discount, the tax inside the line, line total) and the totals. Dates use `Asia/Karachi`, like the documents.
- **Print buttons** (`print-actions.tsx`, shared with the POS sale-saved box): Print receipt, Print A4 invoice, Save receipt as PDF, Save invoice as PDF, each one `print:document` with `{ invoice_id, kind, output }` (no language: the shell uses the print settings). One print at a time. A reply with `status: 'pdf_saved'` (asked for, or `fallback` no_printer / print_failed) is a green notice ("Saved as PDF", the reason, and the file path) and never an error box; `is_copy` adds a COPY badge and a line saying the page says COPY. Only a failure of the call itself (not even a PDF could be made) is an error. After a print the list is asked again so "Printed N times" follows.
- **Default print format** (setting `print_format`, `80mm` or `a4`, default `80mm`): the POS box shows one main Print button for the default paper ("Print receipt" or "Print A4 invoice") and Save PDF for the same paper; the history lists the default paper's Print button first (marked `data-print-default`) and keeps the other paper's buttons. The buttons wait until `print:getConfig` has answered (a failed read means the receipt).

## Customers list

`packages/ui/src/pages/customers/list/`, route `/customers` (sidebar "Customers & Khata"). Source: the left pane of `docs/design/Customer Khata.png` (`Khata.dc.html` does not exist; `CustomerForms.dc.html` only has the overdue chip wording). Staff and owner see the same screen; nothing on it carries cost.

- **Header and cards:** "Customers" (32px) and an Add customer button (to `/customers/new`). Two cards: "Total outstanding" (white) and "Overdue" (warning tint), both the shell's shop-wide totals (`totals.total_outstanding`, `totals.overdue_total`); they do not move with the search or filter. The count of matching customers sits beside the chips.
- **Search:** "Name, village or phone", sent 150 ms after typing stops, trimmed; English or Urdu names and digits-only phones work (the shell normalises). Chips All / Owes / Overdue / Advance are the request `filter`. Any change of search or filter goes back to page 1. Sorted by name in the current language (`sort: 'name'`, `name_language`); there is no sort control because the PNG has none.
- **Row** (a link to `/customers/:id`, Enter opens it, at least 44px): name in the current language (the other when missing), village and phone; the balance as "Owes Rs 2,000" or "Advance Rs 1,000" (a negative balance is never "Owes Rs -1,000"), "Rs 0" when clear; credit chip: "No limit" (warning colour, pulsing; credit limit 0), "Over limit", or "Rs 8,000 left"; red chip "Overdue Rs 15,500 · 12 days"; "Next due 31 Oct 2026". No arithmetic: all from `customers:list`.
- **States:** loading rows, "No customers yet" with Add customer, "Nothing matches" with Clear search and filter, an error notice with Try again. Paging "26–50 of 60" with Previous / Next.
- **Urdu:** right to left, logical classes only; amounts, days and dates are left-to-right isolates.

## Settings screen

`packages/ui/src/pages/settings/`, route `/settings`. The shop-details part of this form was compared with `Settings.dc.html` (see the conformance notes); Staff, Backup and About are other phases. It follows the Products and Receive stock forms (cards with a heading and hint, `Field` labels, 56px inputs and drop-downs, the same buttons, `ErrorNotice` for errors, a toast on save), The print format, footer and shop name controls follow the same design.

- **Owner only.** Staff see a calm "Only the owner can change settings" card with no form and no request to the shell (the shell refuses `print:setConfig` for staff as well, `print.configure`).
- **Printing:** the printer (`printers:list`, with "System default printer" as the first option, the system's default marked, and a saved printer that is no longer on this PC shown as "not found on this PC"), and the receipt and A4 invoice language (English / اردو).
- **Shop header:** the shop name in Urdu, the address and the phone (the placeholders print until they are filled in).
- **Save sends only what changed** (`print:setConfig`): an emptied box goes as `null`, "System default printer" as `printer_name: null`. Nothing changed means the button is off and nothing is sent. The form is loaded from `print:getConfig` and reloaded from the reply on save.
- Right to left from logical classes only (a test scans the folder); the Urdu name box is `dir="rtl"`, the phone box `dir="ltr"`.
- **Shop name, footer and print format** (owner only, same `print:setConfig`): the shop's English name (the first field; cannot be empty, 80 characters; saving it asks the app for its state again so the sidebar shows it at once), the receipt footer (a text field with a 0 / 200 counter; the standard thank-you line is its placeholder; empty means the standard line) and the default print format (two-button choice like the languages, "80 mm receipt" / "A4 invoice").
- **What cannot be set here yet:** the time zone; the contract has no field for it.

## Customer form

`packages/ui/src/pages/customers/form/`, routes `/customers/new` and `/customers/:id/edit`, built from `docs/design/CustomerForms.dc.html` sections 1 (add or edit) and 1b (duplicate warning). One component for both; Edit loads `customers:get` and sends `expected_version`.

- **Fields:** name (English), name (Urdu) (at least one; inline "Write a name in English or Urdu", cleared as soon as it is put right), phone (left to right), village, notes. Labels are the small bold capitals of the product form.
- **Owner:** a Terms row with Retail / Wholesale (the grey track toggle) and Credit limit (typed in rupees through `parseRupees`, sent as paisa; "0 = no limit"; blank, negative, text, more than two decimals are refused inline). A new customer's box starts with the shop's default limit. When the shop setting `show_farmer_fields` is on, a block "Add farmer details" (collapsed; opens by itself when the customer already has details) holds father's name, CNIC, second phone and guarantor.
- **Staff:** no terms inputs and no farmer block. A note says "The credit limit is set by the owner." and shows the shop default (new customer) or the customer's own limit (edit), read-only; a limit of 0 shows the loud amber "No limit" chip. The staff create request has contact fields only (a limit in it would be refused with `FIELD_NOT_ALLOWED`).
- **Save:** create sends everything in one `customers:create` (owner: with the limit, price type and farmer details). Edit sends only the changed contact fields through `customers:update`, then, for the owner and only if the terms changed, `customers:setTerms` with the version the update returned. If the second call fails the form reloads and says what was saved. After a save: a toast and `/customers/:id` (the page is a later milestone).
- **Duplicate warning (1b):** when create answers `DUPLICATE_CUSTOMER`, `customers:findDuplicates` lists the matches in a dialog: name, village, phone and "Owes Rs X" or "Advance Rs X" (never a minus sign). Buttons: Cancel (back to the form), "Open existing <name>" (one per match, to `/customers/:id`) and "Save as new" (the same request again with `confirm_duplicate: true`). It never blocks. `customers:update` does not check duplicates (core rule); the form does not add that.
- **Version conflict:** a calm amber notice "Someone changed this customer" with a Reload button that loads the customer again (nothing typed is saved).
- **below_balance:** when `setTerms` says the limit is under what the customer owes, an amber toast: "The limit is below what the customer owes; the next credit sale will need the owner".
- **Settings, Customers section** (`pages/settings/customer-settings-section.tsx`; owner only, staff see the existing owner-only message): default credit limit (rupees) and Show farmer details (On / Off), through `customers:getSettings` / `customers:setSettings`; only changed fields are sent; a toast on save. The section list on the left of Settings now has two items.
- Right to left from logical classes only (a test scans the folder); the English name box is `dir="auto"`, the Urdu name box `dir="rtl"`, the phone and the amounts `dir="ltr"`.
- **Not as drawn:** the design's "Extra details" switch is the shop setting here (Settings, Customers) and the block is a collapsed button, with a Guarantor field the design does not show; the design has no Terms heading, the price type sits above the limit as drawn; the design's helper text ("Owner question 4 is still open...") is a design note, not screen text; the duplicate warning is a dialog over the form, not an inline panel, so the same code serves several matches.

## Customer statement, payment receipt and CSV (Phase 6 M6)

Built from `docs/design/CustomerForms.dc.html` section 3 (Receive payment: the words of the payment) and section 4 (statement screen and "80 mm print"). Screen: `packages/ui/src/pages/khata/` (`statement-page.tsx`, route `/customers/:id/statement`; `print-actions.tsx`; `statement-requests.ts`). Documents: `packages/ui/src/print/` (`statement-document.tsx`, `payment-receipt-document.tsx`, `khata-render.tsx`, `khata-labels.ts`, `khata-format.ts`, `statement-csv.ts`). Data: `packages/db-sqlite/src/khata-documents.ts` (named columns, never a cost). Channels: `print:statement`, `print:paymentReceipt`, `khata:exportStatement` (any signed-in user; strict inputs with no user id).

- **The screen has no arithmetic.** `khata:statement` gives every running balance, the brought-forward line, the totals (Owes more, Owes less) and the closing balance; `customers:get` gives the current balance, credit limit and credit left (the cards). A test feeds numbers that do not add up on purpose and checks the page shows the shell's. A negative balance is "Advance Rs X" (table, closing line, card), never "Owes Rs -X"; zero is "Clear".
- **Layout as drawn:** customer name (both languages), village and phone, the overdue chip, three cards (Current balance, Credit limit, Credit left; "No limit" at limit 0), the table with type pills (Opening balance, Sale, Payment · Cash / Bank / Easypaisa / JazzCash, Return credit, Adjustment), reference (invoice no, return no, receipt no, or a bank or wallet payment's own reference), the totals row, the closing line "He owes Rs X" and the legend. **Added to the design:** two date boxes (`DateField`, `12 Oct 2026`) with the quick ranges This month / Last 30 days / All, and a brought-forward row when a range starts later than the first entry. **Not as drawn:** the columns say Owes more / Owes less (the plan's wording), not Debit / Credit; the design has no range controls; the Print, Print A4, Save PDF (A4) and Export CSV buttons replace the one Print statement button (Print statement = the 80 mm slip).
- **Buttons** (`StatementPrintActions({ api, customerId, from, to })`, ready for the customer page's `statementActions` slot; `PaymentReceiptActions({ api, paymentId })` for the payment dialog's `receiptActions` slot): they send `print:statement` / `print:paymentReceipt` with no language (the shell uses the print settings), and show a saved PDF as the same calm notice as the invoices (`PrintOutcome`, with the path and a COPY hint). A second click while one is on its way is ignored.
- **80 mm statement** (as the design's print mock): shop, `[Address and phone]` placeholder, STATEMENT, customer · village, the range, then two lines per entry (`01 Oct` and `+ Rs 4,000`; `Sale INV-A-000001` and `Bal 4,000`), a brought-forward line when there is one, the two totals, `He owes Rs X` / `Advance Rs X` / `Clear`, `Credit limit` (left out when the limit is 0 or unknown), the legend (`+ owes more, - owes less`: the design says "he owes more"), the thank-you line (or the owner's receipt footer). A negative running balance reads `Adv 500`.
- **A4 statement: NO DESIGN EXISTS.** It follows the A4 invoice (header, customer box, table, closing, thank-you tokens) and the screen's columns (Date, Type, Reference, Owes more, Owes less, Balance). A long history paginates: the column heads and a 14 mm top and bottom margin repeat on every page (spacer rows in the table's head and foot, because the printer margin is 0), a row is never split (`break-inside: avoid`; every row can have a note line), and the totals and the closing balance are ONE row so a page break cannot strand the closing balance. `npm run check:pdf` prints a 90-row statement and proves it.
- **Payment receipt (80 mm).** The design draws only the form that makes it ("Save and print receipt"); the slip uses the form's words: shop, PAYMENT RECEIPT, receipt number (left out for a payment made before migration 007), date and time (Asia/Karachi), Received from, Method, Reference number, Note (only when given), **Amount received**, **Balance after**. Balance after is the balance right after THAT payment (ledger rows up to and including the payment's own row, by `rowid`: the same limit as `balanceAsOfSale`, see `docs/database-rules.md`), worded "He owes Rs X", "Advance Rs X" or "Clear". Later sales or payments never change a reprint.
- **COPY:** `statement_printed` and `payment_receipt_printed` audit rows (see `docs/database-rules.md`). A statement says COPY when the same customer, paper, range and closing balance were printed before; a payment receipt from its second print. A saved PDF counts as a print; a failure to make even a PDF records nothing.
- **Urdu:** the same Urdu document rules as the receipt (`dir="rtl"`, Naskh from the page's own fonts, Latin runs in `.ltr` isolates, numbers and dates in `.num`). Wording is in `docs/urdu-review.md`. Every typed text (names, village, reference, note, shop name, footer) is escaped by React; a test sends markup through every document.
- **CSV** (`khata:exportStatement`): the MAIN process opens the system Save-as box (`printing/save-dialog.ts`, an injected `SaveDialog`, a fake in tests) and writes the file only after a path is chosen; cancelling writes nothing and replies `{ status: 'cancelled' }`; `{ status: 'saved', path }` otherwise. No download link. The file is UTF-8 **with a byte order mark** (so Excel reads Urdu), CRLF rows, columns `Date, Type, Reference, Receipt no, Note, Owes more (Rs), Owes less (Rs), Balance (Rs)`, one row per line (a brought-forward row first when a range is set) and a Totals row (the shell's totals and closing balance). Amounts are exact rupee text from whole paisa, no floats (`1250.50`, `5000`, an advance is `-500`). Cells with a comma, quote or line break are quoted; a typed text that starts with `=`, `+`, `-` or `@` (or a tab) gets a leading `'`, so a spreadsheet cannot run it. English column words, whatever the screen language. Excel `.xlsx` is not built (the design's PNG says Export Excel, its HTML says Export CSV: CSV only, as the plan decided).
- **Known limit:** the statement range is by UTC day (a core rule), so an entry made between midnight and 05:00 in Pakistan falls on the previous UTC day; the quick ranges use the shop's own today.

## Urdu in the PDF: checking it

`npm run check:pdf` (it is NOT a Vitest test: it needs a real Electron window, so it is a script like `npm run screenshots`). It builds the app with the development tools, makes the 80 mm receipt and the A4 invoice in Urdu with Electron's real `printToPDF` (the same `electron-driver.ts` the app prints with), with an Urdu customer, three Urdu product names that end in a Latin size (`1 L`, `50 kg`, `250 ml`), `Rs 1,200` style amounts, and reads the PDFs back. It saves PDFs, text dumps and one PNG per page in `apps/desktop/.pdf-check/` and exits 1 if a check fails. Source: `apps/desktop/src/main/pdf-check.ts`.

What it checks (50 checks):
- **Fonts:** the PDF's `/FontName` entries are Noto Naskh Arabic (Chromium embeds this variable font as glyph drawings, "Type 3") and IBM Plex Sans, and nothing else (a missing font would show up as SegoeUI or Tahoma: tried).
- **Shaping:** the text layer holds Arabic *contextual* forms (initial, medial, final), which only exist when the letters were shaped and joined.
- **Order:** the Urdu strings read back whole in logical order with `pdftotext` (xpdf or poppler; skipped with a message if it is not installed). The Latin runs (`1 L`, `Rs 1,200`, the invoice number, the date) are whole in pdf.js's text, there is no `L 1` flip, and on each product line the Latin size stands to the LEFT of the Urdu name (right-to-left lines start at the right edge).
- **The picture:** pdf.js (`pdfjs-dist`, a devDependency used only by this check; it is the one PDF renderer that runs inside the Electron we already have, with no system tool) draws each page to a PNG. A program cannot tell "joined" from "almost joined", so the two PNGs are LOOKED at by a person. The current ones are `docs/design/Built 80 mm receipt (Urdu PDF).png` and `docs/design/Built A4 invoice (Urdu PDF).png` (exports of what was built, not designs).
- Proven by planting bugs: removing the `.ltr` islands in `bidi.tsx` fails the Latin-run and position checks (the runs flip); removing the Naskh `@font-face` fails the font checks (a fallback font is embedded instead).

Not covered: a real thermal printer (the check stops at the PDF; the driver's `print` path uses the same page and the same fonts, but ink on paper has not been seen), and Windows' own PDF viewers (Edge, Acrobat) were not compared.

## Checking the look

`npm run screenshots` builds the app and saves a picture of every screen (English and Urdu) at 1280x720, 1366x768 and 1920x1080 into `apps/desktop/.screenshots/`, with a report of anything that overflows, is clipped, is smaller than 44px, or needs scrolling. It also fails if the page logs a warning, which includes any Content-Security-Policy violation. The walk now shows populated screens: it first makes four real invoices through the real handlers (a walk-in sale, a Khata sale to Rashid printed twice so it says COPY, a Khata sale to Sajid, a seed sale) with pretend printers (`screenshotPrinting`, nothing is sent to a printer and no PDF is opened), then captures the POS with a held bill and a three-line bill for a customer, the customer picker, the line editor, the held bills box, the sale-saved box, the over-limit and owner-approval boxes (as staff), the invoice list and an invoice's detail (English and Urdu), and Settings (owner English and Urdu, staff English).

## Dates: never ambiguous

`DateField` is the only way to ask for a date. It reads and shows `12 Oct 2026` (Latin digits, English month, in English AND Urdu, per open question 17; the box is always left to right). It is a text box plus a calendar button; a hidden native date input is the calendar (it keeps `min` and `max`, and always holds `YYYY-MM-DD`). The value in and out is `YYYY-MM-DD`, or `''` for no date.
Typed text is read strictly by `parseDateText` (`i18n/parse-date.ts`). Accepted: `12 Oct 2026`, `12-Oct-2026`, `12 October 2026` (any capitals), `2026-10-12`. Refused with "Write the date like 12 Oct 2026" (Urdu has the same words, the example kept left to right): `05/10/2026`, `5/10/26`, `05-10-2026` and every other numeric day/month form, because a Pakistani reads 05/10 as 5 October and the browser as 10 May; two-digit years; month first. Impossible dates (`31 Feb`, `29 Feb 2025`) and years outside 2000-2100 get their own message. Nothing rolls over and nothing is guessed. While the text is not a date the field sends `''`, so a form cannot go on with the old date; it tells the screen through `onTextInvalid` so the screen does not add its own "Enter the date" next to it. The message waits until the box is left (or Enter), so it does not shout mid-word. `min` and `max` guide the calendar only; the screen owns the rule for a typed date (Receive stock: not after today).
A test scans `packages/ui/src`: the browser date input appears only in `date-field.tsx`, and `toLocaleDateString` / `toLocaleString` appear nowhere.
