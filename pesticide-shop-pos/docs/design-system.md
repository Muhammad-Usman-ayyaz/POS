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
- **Under 1366px wide** the sidebar becomes a 76px icon-only bar (monogram, icons, stacked language switch, avatar). Names stay as tooltips and for screen readers. The window cannot be smaller than **1280 x 720**.
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

`packages/ui/src/pages/pos/`, built from `docs/design/POS billing (English, 1366×768).png`, `POS billing (Urdu, right to left).png` and `Counter dialogs and states.png` (no .dc.html exists). On this route the sidebar is the 76px icon bar at **any** width and the page fills the window without its own scroll (`AppShell` sets `data-compact`; the `narrow:` Tailwind variant in `styles/index.css` means "under 1366px OR inside `data-compact`"). Left column: search box (F2) with Retail / Wholesale, cards of size buttons for the matches (price, "N left", amber for low or near expiry, green when on the bill, dashed and disabled when out of stock), then the bill table and the shortcut strip. Right column (360px): customer card (F4, credit bar, owes now, after this sale, limit) and the payment panel (total with tax, paid now, Cash / Bank / Easypaisa / JazzCash, the Khata remainder with its pay-by date, Complete sale F12, Hold bill, Clear).

- **No money arithmetic on the screen.** Totals, tax, each line's price, the effect of a discount, the Khata remainder, the over-limit check and "what needs the owner" all come from `sale:quote` (re-asked, after a 120 ms pause, whenever the cart, customer, price type, method, due date or amount paid changes). Complete sale stays off until the quote on screen is for the bill on screen. The only conversions are typing ones: rupees to paisa, a discount percent to paisa of the line's quoted price, packs to base units.
- **One `request_id` per bill**, kept for every retry of that bill (a new one only after the sale succeeds, Clear, Hold or Resume). A second click, or F12 while a sale is on its way, is ignored.
- **Cash handed over.** "Paid now" may be more than the bill for cash: the sale is sent for the bill's total (the quote is asked as paid in full) and the sale-saved box shows the change due. Change is never saved.
- **The owner at the counter.** `requires_approval` in the quote, or an `APPROVAL_REQUIRED` / `CREDIT_LIMIT_EXCEEDED` reply, opens a dialog; the sale is never re-sent without an approval. Over the limit: "Take Rs X more" (raises Paid now) or "Ask owner" (staff), "Allow over the limit" (owner, sent as `credit_override`). The approval dialog asks for the owner's username and password (`approval:request`, bound to exactly this cart and amount), empties the password at once, and re-sends the sale with the token and the same `request_id`. A token is spent by any try, so a failure asks again.
- **Line editor** (click a line, or F8 for the selected line with the cursor in the discount box): quantity with steps, batch (Auto = earliest expiry first, or one batch picked by hand, expired ones disabled; no cost is asked for), discount in percent or rupees, Remove line. Sealed sizes move by whole packs, loose sizes by 50 (or 10, or 1 for small packs).
- **Held bills (F6)** are kept in this window's browser storage (`held-bills.ts`) because the shell has the `held_bills` table but no channel for it yet. They hold items, discounts, batches and the customer, plus the price last seen so Resume can say "Price changed" and "Removed" after pricing the bill again.
- Staff never see cost: no request sends `include_cost` / `includeCost`, and a test scans every request and the page.
- The F2 badge in the search box is wrapped in a placed `span`: `.num` forces `direction: ltr`, and an element's OWN direction decides which side `end-3` is, so on the badge itself it stayed on the right in Urdu and covered the magnifier. A test fails if any element in `pages/pos/` is both placed with `start-`/`end-` and carries `num`.
- Right to left comes from logical classes only; a test fails if any file in `pages/pos/` uses `left`, `right`, `ml-`, `mr-`, `pl-`, `pr-`, `text-left` or `text-right`. Amounts and dates use `.num`; text with Urdu words in it is not isolated.

## Receipts, invoices and printing

Built from `docs/design/80 mm receipts, English and Urdu.png` and `A4 invoice, English and Urdu.png`. The components are in `packages/ui/src/print/` (pure: the same data and language always give the same page, nothing is read from the screen's language or session); `apps/desktop/src/main/printing/` puts the page on paper or in a PDF.

- **Two papers, from one invoice model** (`InvoiceDocumentData`, built by `invoices:receipt`): the 80 mm receipt (printable about 72 mm, as long as its content) and the A4 invoice. Each in English and Urdu. The Urdu page is `dir="rtl"` and `lang="ur"`: labels start on the right, amounts sit on the left, the A4 table starts with `#` on the right.
- **Fonts are inside the page.** `renderDocumentHtml` writes the stylesheet with IBM Plex Sans 400/600/700 and Noto Naskh Arabic (Arabic-script subset) as `data:font/woff2;base64,...`. The page's own Content-Security-Policy is `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:`, so it cannot load anything. The desktop app bundles the font files into the main process with Vite `?inline`; nothing is read from node_modules or the PC at print time. The stack in Urdu is Plex first (English shop name, numbers), then Naskh, as on screen.
- **Numbers and Latin text stay left to right** with `.num` (amounts, dates, document numbers) and `.ltr` (a Latin run such as "1 L" inside an Urdu name: left alone, the bidi rules would show it as "L 1"). Date and time are `12 Oct 2026, 10:42` in the shop's time zone (default Asia/Karachi), English month names and Latin digits in both languages.
- **What is on a line:** the name as sold (`invoice_items.name_en/name_ur`: group name plus pack label), then `2 × Rs 500` for whole packs or `250 g × Rs 200/kg` for a loose sale (`Fertilizer · loose`). The receipt shows each line before discount and one `Discount` line, then Total, `Includes tax`, `Paid · Cash`, `On Khata`, `Your balance now` (as of that sale) and `Pay by`. The A4 invoice has `# / Item / Batch / Qty / Rate / Disc. / Tax / Amount` (the Tax column is an addition to the design: tax per line), the totals block, two signature lines and the thank-you line. A walk-in sale has no customer, balance, Khata or Pay by lines.
- **Header:** the shop name only is real. Address and phone are the owner's print settings and print as `[Address and phone]` (italic, grey) until entered.
- **COPY:** a boxed `COPY` (Urdu `COPY · نقل`) at the top of a receipt, under the title on an invoice, from the second print of that kind of document for the invoice. A voided invoice prints `VOIDED` the same way.
- **No cost, batch cost, margin or profit appears in any document** (the data type has no such field and the queries never select it). The batch NUMBER is on the A4 invoice only.
- **PDF fallback:** when there is no printer, the chosen printer is gone, or printing fails, the same page is saved as a PDF and opened. `print:document` then replies `status: 'pdf_saved'` with `fallback`; the screen must show that as a plain notice ("Saved as PDF: no printer found", with the file's path) and not as an error. Only a failure to make even the PDF is an error.
- To look at the pages without a printer: the HTML from `renderDocumentHtml` opens in any browser.

## Invoice history

`packages/ui/src/pages/invoices/`, route `/invoices`, the "Invoices" item in the sidebar right after POS (the sidebar now has eight pages; there was no other place in the shell that a cashier would find, and the icon bar has room). No design PNG exists for it: it follows the Products screen (same header, search box, filter chips, table card, loading rows, empty and error states). Staff and owner see the same screen; nothing on it carries cost.

- **List** (`invoices:list`): newest first, 25 a page. Search by invoice number, customer name (English or Urdu) or phone, sent 150 ms after typing stops. From / To dates (the UTC invoice date, as the shell filters) and chips All / Active / Voided. Any change of search or filter goes back to the first page; Previous / Next and "26-50 of 60" below the table. Columns: invoice number (the button that opens it; a Voided badge), date, customer or "Walk-in", total, paid, on Khata, method, sold by, and "Printed N times".
- **Detail** (`invoices:get`, a dialog): date, customer and village, sold by, method, pay-by date, the lines as they were sold (name at sale time, quantity as "2" packs or "250 g" loose, price per pack or per kg, discount, the tax inside the line, line total) and the totals. Dates use `Asia/Karachi`, like the documents.
- **Print buttons** (`print-actions.tsx`, shared with the POS sale-saved box): Print receipt, Print A4 invoice, Save receipt as PDF, Save invoice as PDF, each one `print:document` with `{ invoice_id, kind, output }` (no language: the shell uses the print settings). One print at a time. A reply with `status: 'pdf_saved'` (asked for, or `fallback` no_printer / print_failed) is a green notice ("Saved as PDF", the reason, and the file path) and never an error box; `is_copy` adds a COPY badge and a line saying the page says COPY. Only a failure of the call itself (not even a PDF could be made) is an error. After a print the list is asked again so "Printed N times" follows.
- The POS box shows only Print receipt and Save receipt as PDF.

## Settings screen

`packages/ui/src/pages/settings/`, route `/settings`. **This form was NOT checked against Settings.dc.html: that file is missing.** It follows the Products and Receive stock forms (cards with a heading and hint, `Field` labels, 56px inputs and drop-downs, the same buttons, `ErrorNotice` for errors, a toast on save), so a design review is still owed.

- **Owner only.** Staff see a calm "Only the owner can change settings" card with no form and no request to the shell (the shell refuses `print:setConfig` for staff as well, `print.configure`).
- **Printing:** the printer (`printers:list`, with "System default printer" as the first option, the system's default marked, and a saved printer that is no longer on this PC shown as "not found on this PC"), and the receipt and A4 invoice language (English / اردو).
- **Shop header:** the shop name in Urdu, the address and the phone (the placeholders print until they are filled in).
- **Save sends only what changed** (`print:setConfig`): an emptied box goes as `null`, "System default printer" as `printer_name: null`. Nothing changed means the button is off and nothing is sent. The form is loaded from `print:getConfig` and reloaded from the reply on save.
- Right to left from logical classes only (a test scans the folder); the Urdu name box is `dir="rtl"`, the phone box `dir="ltr"`.
- **What cannot be set here yet:** the shop's English name (set at setup) and the time zone; the contract has no field for them.

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
