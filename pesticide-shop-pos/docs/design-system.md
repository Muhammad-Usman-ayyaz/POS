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

Amounts, quantities, dates and document numbers use the `.num` class (or the `<Num>` component): `direction: ltr; unicode-bidi: isolate`, Plex, tabular digits. In text built as a plain string (an error message, a toast) the helper `ltr()` wraps them in Unicode left-to-right isolate marks instead. Numeric table columns are right-aligned, which means **end**-aligned in right-to-left.

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

## Checking the look

`npm run screenshots` builds the app and saves a picture of every screen (English and Urdu) at 1280x720, 1366x768 and 1920x1080 into `apps/desktop/.screenshots/`, with a report of anything that overflows, is clipped, is smaller than 44px, or needs scrolling. It also fails if the page logs a warning, which includes any Content-Security-Policy violation.
