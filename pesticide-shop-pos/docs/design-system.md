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
- Right to left comes from logical classes only; a test fails if any file in `pages/pos/` uses `left`, `right`, `ml-`, `mr-`, `pl-`, `pr-`, `text-left` or `text-right`. Amounts and dates use `.num`; text with Urdu words in it is not isolated.

## Checking the look

`npm run screenshots` builds the app and saves a picture of every screen (English and Urdu) at 1280x720, 1366x768 and 1920x1080 into `apps/desktop/.screenshots/`, with a report of anything that overflows, is clipped, is smaller than 44px, or needs scrolling. It also fails if the page logs a warning, which includes any Content-Security-Policy violation.
