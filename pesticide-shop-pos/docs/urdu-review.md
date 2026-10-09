# Urdu text for review

A native Urdu speaker should check the Urdu below. **The wording in the code has not been changed by the developer: this file only lists it.** If something is wrong, write the correction in the last column; the developer will then put it into `packages/ui/src/i18n/errors.ts` (and the English column here is the meaning it must carry).

How to read the tables: `{label}`, `{barcode}`, `{sku}` and `{expected}` are replaced by the real value when the message is shown. In the Urdu text the value is kept left to right inside the right-to-left sentence. Every message has two parts, **what went wrong** and **what to do next**; both are shown.

No screen shows these messages yet: the Products screen is built in Phase 4. The "where it shows" column says what will trigger each one, and which core call raises it.

## New Urdu error messages (pack sizes, and Phase 4 quick-add)

| Code | English: what went wrong | English: what to do next | Urdu: what went wrong | Urdu: what to do next | Where it shows | Reviewer's correction |
|---|---|---|---|---|---|---|
| `DUPLICATE_NAME` | "{name}" is already in the list | Pick it from the list instead of adding it again. | "{name}" فہرست میں پہلے سے موجود ہے | اسے دوبارہ شامل کرنے کے بجائے فہرست میں سے چنیں۔ | Product form and Receive stock: quick-adding a category, brand or supplier whose name is already in the list (`addCategory`, `addBrand`, `addSupplier`). {name} is the name typed. | |
| `DUPLICATE_PACK_LABEL` | This product already has a size called "{label}" | Give this size a different label, such as 500 ml or 1 L. | اس پروڈکٹ میں "{label}" نام کا سائز پہلے سے موجود ہے | اس سائز کے لیے دوسرا لیبل لکھیں، مثلاً 500 ml یا 1 L۔ | Products screen: adding a size, changing a size's label, or moving a size into another product, when that product already has a size with this label (`addSize`, `updateSize`, `moveSize`, `createGroup`). {label} is the label typed. | |
| `DUPLICATE_BARCODE` | Barcode {barcode} is already used by another size | Check the barcode on the pack. Each size has its own barcode. | بارکوڈ {barcode} کسی اور سائز میں استعمال ہو رہا ہے | پیک پر بارکوڈ دیکھیں۔ ہر سائز کا اپنا بارکوڈ ہوتا ہے۔ | Products screen: saving a size whose barcode is already on another size (`createGroup`, `addSize`, `updateSize`). {barcode} is the barcode typed or scanned. | |
| `DUPLICATE_SKU` | SKU {sku} is already used by another size | Type a different SKU. | SKU {sku} کسی اور سائز میں استعمال ہو رہا ہے | کوئی دوسرا SKU لکھیں۔ | Products screen: saving a size whose SKU is already on another size (`createGroup`, `addSize`, `updateSize`). {sku} is the SKU typed. | |
| `MIXED_UNITS` | All sizes of one product must be measured the same way ({expected}) | Use ml with ml, or g with g. If this is a different product, make it a new product. | ایک پروڈکٹ کے تمام سائز ایک ہی پیمانے میں ہونے چاہئیں ({expected}) | ml کے ساتھ ml، یا g کے ساتھ g۔ اگر یہ الگ پروڈکٹ ہے تو نئی پروڈکٹ بنائیں۔ | Products screen: adding or moving a size, or changing a size's unit, so that one product would mix ml with g or pieces (`createGroup`, `addSize`, `updateSize`, `moveSize`). {expected} is the unit the other sizes use. | |
| `GROUP_INACTIVE` | This product is switched off | Switch the product on first, then its sizes. | یہ پروڈکٹ بند ہے | پہلے پروڈکٹ کو چالو کریں، پھر اس کے سائز۔ | Products screen: adding a size to, moving a size into, or switching on a size of a product that is switched off (`addSize`, `moveSize`, `setSizeActive`). | |
| `PACK_LABEL_REQUIRED` | Every size needs a label | Write the size on each one, for example 500 ml or 1 L, so they can be told apart. | ہر سائز کا لیبل ضروری ہے | ہر سائز پر لکھیں، مثلاً 500 ml یا 1 L، تاکہ ان میں فرق کیا جا سکے۔ | Products screen: a product with two or more sizes where one has no label: creating it, adding a second size without giving the first a label, or clearing a label (`createGroup`, `addSize`, `updateSize`, `moveSize`). | |
| `PACK_SIZE_LOCKED` | This size already has stock records | Its pack size and unit can no longer change. Add a new size instead. | اس سائز کا اسٹاک ریکارڈ موجود ہے | اس کا پیک سائز اور پیمانہ اب تبدیل نہیں ہو سکتا۔ اس کے بجائے نیا سائز شامل کریں۔ | Products screen: changing the pack size or unit of a size that already has batches (`updateSize`). Must be shown with the next step (add a new size instead). | |
| `FUTURE_DATE` | The date {date} is after today | Pick today or an earlier day. | تاریخ {date} آج کے بعد کی ہے | آج کی یا اس سے پہلے کی تاریخ چنیں۔ | Receive stock: the receipt date is in the future. | |

No existing Urdu message was changed in this work.

## Other new Urdu text (demo data only, not shown in the real app)

`npm run dev:db` creates demo products so the screens have something to show. One new Urdu product name was added:

| Used for | English | Urdu | Reviewer's correction |
|---|---|---|---|
| Demo product group (Insecticide X in 250 ml, 500 ml, 1 L) | Insecticide X | کیڑے مار دوا ایکس | |

The size labels ("250 ml", "500 ml", "1 L", "1 kg", "50 kg bag") are written in English letters on purpose and are added after the product name in both languages, for example "کیڑے مار دوا ایکس 500 ml". If the shop wants Urdu unit words in labels, say so before the Products screen is built.
