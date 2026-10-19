# Urdu text for review

A native Urdu speaker should check the Urdu below. **The wording in the code has not been changed by the developer: this file only lists it.** If something is wrong, write the correction in the last column; the developer will then put it into `packages/ui/src/i18n/errors.ts` (and the English column here is the meaning it must carry).

How to read the tables: `{label}`, `{barcode}`, `{sku}` and `{expected}` are replaced by the real value when the message is shown. In the Urdu text the value is kept left to right inside the right-to-left sentence. Every message has two parts, **what went wrong** and **what to do next**; both are shown.

**What is in this file (all of Phase 4):**
1. New Urdu error messages (pack sizes, quick-add, `FUTURE_DATE`, `RECEIPT_DATE_OLD`).
2. Demo-data names (not shown in the real app).
3. The Products screen text (M4): `products.*`.
4. The Add / Edit product screen text (M5): `productForm.*`.
5. The Receive stock and Purchases text (M6): `receive.*` and `purchases.*`.
6. A question for the owner: month names in Urdu.

The error messages are shown by the screens that raise them (the product form, Receive stock). The "where it shows" column says what triggers each one. Nothing in the Urdu text has been changed by the developer: this file only lists it.

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
| `RECEIPT_DATE_OLD` | This receipt is dated {days} days ago ({date}). Save anyway? | If the date is right, confirm to save it. If not, correct the date. | اس رسید کی تاریخ {days} دن پہلے کی ہے ({date})۔ پھر بھی محفوظ کریں؟ | اگر تاریخ ٹھیک ہے تو تصدیق کر کے محفوظ کریں، ورنہ تاریخ درست کریں۔ | Receive stock: the receipt date is more than 30 days ago. | |

No existing Urdu message was changed in this work.

## Other new Urdu text (demo data only, not shown in the real app)

`npm run dev:db` creates demo products so the screens have something to show. One new Urdu product name was added:

| Used for | English | Urdu | Reviewer's correction |
|---|---|---|---|
| Demo product group (Insecticide X in 250 ml, 500 ml, 1 L) | Insecticide X | کیڑے مار دوا ایکس | |

The size labels ("250 ml", "500 ml", "1 L", "1 kg", "50 kg bag") are written in English letters on purpose and are added after the product name in both languages, for example "کیڑے مار دوا ایکس 500 ml". If the shop wants Urdu unit words in labels, say so before the Products screen is built.

## New Urdu text on the Products screen (Phase 4, M4)

The Products and stock screen is the first screen with its own text. Entries that are a function show the template: `${n}`, `${name}` and `${minPacks}` are filled in when the screen is drawn. The words for litres (`لیٹر`), kilograms (`کلو`) and pieces (`عدد`) are used for the total of a whole product. Please check in particular: the filter chip wording ("کم اسٹاک · 3 سائز"), the two badges for a size that is low on stock or near expiry, the heading for the price range, and whether "ٹیکس سمیت" reads naturally under the Retail and Wholesale headings.

| Key | English | Urdu | Reviewer's correction |
|---|---|---|---|
| `products.products` | { title: 'Products and stock', subtitle: 'Stock is counted per batch. The Cost column is visible to the owner only.', phase: 4 } | { title: 'مصنوعات اور اسٹاک', subtitle: 'اسٹاک بیچ کے حساب سے گنا جاتا ہے۔ لاگت کا کالم صرف مالک کو نظر آتا ہے۔', phase: 4 } | |
| `products.purchases` | { title: 'Purchases', subtitle: 'Receive stock from suppliers.', phase: 4 } | { title: 'خریداری', subtitle: 'سپلائرز سے اسٹاک وصول کریں۔', phase: 4 } | |
| `products.customers` | { title: 'Customers & Khata', subtitle: 'Farmer accounts, payments and balances.', phase: 6 } | { title: 'گاہک اور کھاتہ', subtitle: 'کسانوں کے کھاتے، ادائیگیاں اور بقایا۔', phase: 6 } | |
| `products.returns` | { title: 'Returns', subtitle: 'Goods brought back against a sale. The owner approves each return.', phase: 7 } | { title: 'واپسی', subtitle: 'فروخت کے مقابلے میں واپس آنے والا مال۔ ہر واپسی کی منظوری مالک دیتا ہے۔', phase: 7 } | |
| `products.reports` | { title: 'Reports', subtitle: 'Sales, stock, Khata and profit.', phase: 8 } | { title: 'رپورٹس', subtitle: 'فروخت، اسٹاک، کھاتہ اور منافع۔', phase: 8 } | |
| `products.settings` | { title: 'Settings', subtitle: 'Shop details, users and backups.', phase: 9 } | { title: 'ترتیبات', subtitle: 'دکان کی تفصیل، صارفین اور بیک اپ۔', phase: 9 } | |
| `products.builtIn` | (phase: number) => `This screen is built in Phase ${phase}.` | (phase: number) => `یہ اسکرین مرحلہ ${phase} میں بنے گی۔` | |
| `products.note` | 'The layout, sidebar and sign-in are finished. Nothing to show here yet.' | 'لے آؤٹ، سائیڈ بار اور لاگ ان مکمل ہیں۔ یہاں ابھی دکھانے کو کچھ نہیں۔' | |
| `products.searchLabel` | 'Search products' | 'پروڈکٹ تلاش کریں' | |
| `products.searchPlaceholder` | 'Search in English or اردو' | 'انگریزی یا اردو میں تلاش کریں' | |
| `products.addProduct` | 'Add product' | 'نئی پروڈکٹ' | |
| `products.receiveStock` | 'Receive stock' | 'اسٹاک وصول کریں' | |
| `products.edit` | 'Edit' | 'ترمیم' | |
| `products.editLabel` | (name: string) => `Edit ${name}` | (name: string) => `${name} میں ترمیم` | |
| `products.expandAll` | 'Expand all' | 'سب کھولیں' | |
| `products.collapseAll` | 'Collapse all' | 'سب بند کریں' | |
| `products.showSizes` | (name: string) => `Show the sizes of ${name}` | (name: string) => `${name} کے سائز دکھائیں` | |
| `products.hideSizes` | (name: string) => `Hide the sizes of ${name}` | (name: string) => `${name} کے سائز چھپائیں` | |
| `products.filterLabel` | 'Filter' | 'فلٹر' | |
| `products.filterAll` | (n: number) => `All · ${n} ${n === 1 ? 'product' : 'products'}` | (n: number) => `سب · ${n} پروڈکٹ` | |
| `products.filterLow` | (n: number) => `Low stock · ${n} ${n === 1 ? 'size' : 'sizes'}` | (n: number) => `کم اسٹاک · ${n} سائز` | |
| `products.filterNear` | (n: number) => `Near expiry · ${n} ${n === 1 ? 'size' : 'sizes'}` | (n: number) => `میعاد قریب · ${n} سائز` | |
| `products.filterExpired` | (n: number) => `Expired · ${n} ${n === 1 ? 'size' : 'sizes'}` | (n: number) => `میعاد ختم · ${n} سائز` | |
| `products.inclTax` | 'incl. tax' | 'ٹیکس سمیت' | |
| `products.sizes` | (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}` | (n: number) => `${n} سائز` | |
| `products.retailRange` | 'Retail range' | 'ریٹیل قیمت کی حد' | |
| `products.singleSize` | 'Single size' | 'ایک سائز' | |
| `products.unitLitres` | 'L' | 'لیٹر' | |
| `products.unitKg` | 'kg' | 'کلو' | |
| `products.unitPieces` | (n: number): string => (n === 1 ? 'piece' : 'pieces') | (_n: number): string => 'عدد' | |
| `products.badgeLow` | (minPacks: string) => `Low stock · min ${minPacks}` | (minPacks: string) => `کم اسٹاک · کم از کم ${minPacks}` | |
| `products.badgeNearExpiry` | 'Near expiry' | 'میعاد قریب' | |
| `products.badgeExpired` | 'Expired' | 'میعاد ختم' | |
| `products.groupLow` | (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'} low` | (n: number) => `${n} سائز کم` | |
| `products.groupNear` | (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'} near expiry` | (n: number) => `${n} سائز کی میعاد قریب` | |
| `products.groupExpired` | (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'} expired` | (n: number) => `${n} سائز کی میعاد ختم` | |
| `products.loading` | 'Loading products…' | 'پروڈکٹس لوڈ ہو رہی ہیں…' | |
| `products.retry` | 'Try again' | 'دوبارہ کوشش کریں' | |
| `products.emptyTitle` | 'No products yet' | 'ابھی کوئی پروڈکٹ نہیں' | |
| `products.emptyOwner` | 'Add your first product to start counting stock.' | 'اسٹاک گننا شروع کرنے کے لیے پہلی پروڈکٹ شامل کریں۔' | |
| `products.emptyStaff` | 'The owner has not added any products yet.' | 'مالک نے ابھی کوئی پروڈکٹ شامل نہیں کی۔' | |
| `products.noMatchTitle` | 'Nothing matches' | 'کچھ نہیں ملا' | |
| `products.noMatchHint` | 'Check the spelling, or clear the search and the filter.' | 'ہجے دیکھیں، یا تلاش اور فلٹر صاف کریں۔' | |
| `products.clearFilters` | 'Clear search and filter' | 'تلاش اور فلٹر صاف کریں' | |
| `products.columns.product` (table heading) | Product / size | پروڈکٹ / سائز | |
| `products.columns.category` (table heading) | Category | قسم | |
| `products.columns.stock` (table heading) | Stock | اسٹاک | |
| `products.columns.cost` (table heading) | Cost | لاگت | |
| `products.columns.retail` (table heading) | Retail | ریٹیل | |
| `products.columns.wholesale` (table heading) | Wholesale | تھوک | |
| `products.columns.tax` (table heading) | Tax | ٹیکس | |
| `products.columns.nextExpiry` (table heading) | Next expiry | اگلی میعاد | |
| `products.columns.actions` (table heading) | Actions | عمل | |

## Question for the owner: month names in Urdu

Dates are shown with English month names and Latin digits in Urdu mode too ("15 Aug 2028"), as in the approved design, so that no month name is mistranslated. Does the owner want Urdu month names instead (جنوری, فروری, مارچ, اپریل, مئی, جون, جولائی, اگست, ستمبر, اکتوبر, نومبر, دسمبر)? The Urdu names are already in `packages/ui/src/i18n/format.ts`; switching is one change in `formatDate`.

## New Urdu text on the Add / Edit product screen (Phase 4, M5)

`${...}` parts are filled in when the screen is drawn. Please check in particular: the pack-size lock message (`lockTitle`, `lockBody`, `lockNextLead`, `lockNext`, the two buttons), because it explains why something cannot be changed; "کھلی فروخت" for loose sale and its `sellBy` line; the tax line `taxInfo` ("... میں ... ٹیکس شامل ہے", the price already includes the tax); and the word for a batch, "بیچ".

| Key | English | Urdu | Reviewer's correction |
|---|---|---|---|
| `productForm.back` | 'Products' | 'پروڈکٹس' | |
| `productForm.addTitle` | 'Add product' | 'نئی پروڈکٹ' | |
| `productForm.editTitle` | (name: string) => `Edit product · ${name}` | (name: string) => `پروڈکٹ میں ترمیم · ${name}` | |
| `productForm.subtitle` | 'The product holds the name and category. Each size has its own pack, barcode and prices.' | 'پروڈکٹ کا نام اور قسم ایک ہوتی ہے۔ ہر سائز کا اپنا پیک، بارکوڈ اور قیمتیں ہیں۔' | |
| `productForm.cancel` | 'Cancel' | 'منسوخ کریں' | |
| `productForm.save` | 'Save product' | 'پروڈکٹ محفوظ کریں' | |
| `productForm.saving` | 'Saving…' | 'محفوظ ہو رہی ہے…' | |
| `productForm.saved` | 'Product saved' | 'پروڈکٹ محفوظ ہو گئی' | |
| `productForm.loading` | 'Loading product…' | 'پروڈکٹ لوڈ ہو رہی ہے…' | |
| `productForm.notFound` | 'This product was not found' | 'یہ پروڈکٹ نہیں ملی' | |
| `productForm.partial` | 'Some changes were saved before this problem. The form now shows what is saved.' | 'اس مسئلے سے پہلے کچھ تبدیلیاں محفوظ ہو چکی ہیں۔ فارم اب وہی دکھا رہا ہے جو محفوظ ہے۔' | |
| `productForm.nameEn` | 'Name (English)' | 'نام (English)' | |
| `productForm.nameUr` | 'Name (اردو)' | 'نام (اردو)' | |
| `productForm.category` | 'Category' | 'قسم' | |
| `productForm.brand` | 'Brand' | 'برانڈ' | |
| `productForm.none` | 'None' | 'کوئی نہیں' | |
| `productForm.baseUnit` | 'Base unit' | 'بنیادی پیمانہ' | |
| `productForm.unitOptions` | { ml: 'Millilitre (ml)', g: 'Gram (g)', piece: 'Piece' } | { ml: 'ملی لیٹر (ml)', g: 'گرام (g)', piece: 'عدد' } | |
| `productForm.unitShort` | { ml: 'ml', g: 'g', piece: 'pcs' } | { ml: 'ml', g: 'g', piece: 'عدد' } | |
| `productForm.unitHint` | 'Stock is stored in the base unit, so a 1 L pack is 1,000 ml.' | 'اسٹاک بنیادی پیمانے میں رکھا جاتا ہے، اس لیے 1 لیٹر کا پیک 1,000 ملی لیٹر ہے۔' | |
| `productForm.unitLocked` | 'The unit cannot change once a size has stock records.' | 'جب کسی سائز کا اسٹاک ریکارڈ موجود ہو تو پیمانہ تبدیل نہیں ہو سکتا۔' | |
| `productForm.newCategory` | '+ New category' | '+ نئی قسم' | |
| `productForm.newBrand` | '+ New brand' | '+ نیا برانڈ' | |
| `productForm.quickAdd` | 'Add' | 'شامل کریں' | |
| `productForm.quickCancel` | 'Cancel' | 'منسوخ کریں' | |
| `productForm.sizesHeading` | 'Sizes' | 'سائز' | |
| `productForm.addSize` | '+ Add a size' | '+ سائز شامل کریں' | |
| `productForm.sizeN` | (n: number) => `Size ${n}` | (n: number) => `سائز ${n}` | |
| `productForm.chipHasStock` | (batches: number) => `Has stock · ${batches} ${batches === 1 ? 'batch' : 'batches'}` | (batches: number) => `اسٹاک موجود · ${batches} بیچ` | |
| `productForm.chipNew` | 'New' | 'نیا' | |
| `productForm.chipOff` | 'Switched off' | 'بند' | |
| `productForm.remove` | 'Remove' | 'ہٹائیں' | |
| `productForm.removeLabel` | (n: number) => `Remove size ${n}` | (n: number) => `سائز ${n} ہٹائیں` | |
| `productForm.switchOff` | 'Switch off' | 'بند کریں' | |
| `productForm.switchOn` | 'Switch on' | 'چالو کریں' | |
| `productForm.sizeLabel` | 'Size label' | 'سائز کا لیبل' | |
| `productForm.packSize` | 'Pack size' | 'پیک سائز' | |
| `productForm.sku` | 'SKU' | 'SKU' | |
| `productForm.barcode` | 'Barcode' | 'بارکوڈ' | |
| `productForm.barcodePlaceholder` | 'Scan or type' | 'اسکین کریں یا لکھیں' | |
| `productForm.retail` | 'Retail price (incl. tax)' | 'ریٹیل قیمت (ٹیکس سمیت)' | |
| `productForm.wholesale` | 'Wholesale price (incl. tax)' | 'تھوک قیمت (ٹیکس سمیت)' | |
| `productForm.taxRate` | 'Tax rate %' | 'ٹیکس کی شرح %' | |
| `productForm.lowStock` | 'Low-stock alert at' | 'کم اسٹاک کا الرٹ' | |
| `productForm.packsWord` | 'packs' | 'پیک' | |
| `productForm.looseSale` | 'Loose sale' | 'کھلی فروخت' | |
| `productForm.sellBy` | (unit: string) => `Sell by ${unit}` | (unit: string) => `${unit} کے حساب سے بیچیں` | |
| `productForm.locked` | 'Locked' | 'مقفل' | |
| `productForm.lockedHint` | 'This pack size is locked. Press to see why.' | 'یہ پیک سائز مقفل ہے۔ وجہ دیکھنے کے لیے دبائیں۔' | |
| `productForm.taxInfo` | (price: string, tax: string) => `${price} includes ${tax} tax` | (price: string, tax: string) => `${price} میں ${tax} ٹیکس شامل ہے` | |
| `productForm.noTax` | 'No tax' | 'ٹیکس نہیں' | |
| `productForm.lockTitle` | 'This pack size can no longer be changed' | 'اس پیک سائز کو اب تبدیل نہیں کیا جا سکتا' | |
| `productForm.lockBody` | (label: string, stock: string, batches: number) => `The ${label} size already has ${stock} in stock across ${batches} ${batches === 1 ? 'batch' : 'batches'}. Changing the pack size would change what that stock means and make old bills wrong.` | (label: string, stock: string, batches: number) => `${label} سائز کا ${stock} اسٹاک ${batches} بیچ میں موجود ہے۔ پیک سائز بدلنے سے اس اسٹاک کا مطلب بدل جائے گا اور پرانے بل غلط ہو جائیں گے۔` | |
| `productForm.lockNextLead` | 'What to do instead:' | 'اس کے بجائے:' | |
| `productForm.lockNext` | 'add a new size with the pack size you want, then switch the old one off when it runs out. You can still change its name, barcode and prices.' | 'مطلوبہ پیک سائز کے ساتھ نیا سائز شامل کریں، پھر پرانا ختم ہونے پر اسے بند کر دیں۔ آپ اس کا نام، بارکوڈ اور قیمتیں اب بھی بدل سکتے ہیں۔' | |
| `productForm.keepSize` | 'Keep current size' | 'موجودہ سائز رکھیں' | |
| `productForm.addNewSize` | 'Add a new size' | 'نیا سائز شامل کریں' | |
| `productForm.problems.name` | 'Enter an English or an Urdu name' | 'انگریزی یا اردو نام لکھیں' | |
| `productForm.problems.labelRequired` | 'Write the size, for example 500 ml' | 'سائز لکھیں، مثلاً 500 ml' | |
| `productForm.problems.packInvalid` | 'Enter a whole number above 0' | 'صفر سے زیادہ پورا عدد لکھیں' | |
| `productForm.problems.retailInvalid` | 'Enter an amount such as 190 or 190.50' | 'رقم لکھیں، مثلاً 190 یا 190.50' | |
| `productForm.problems.wholesaleInvalid` | 'Enter an amount such as 170 or 170.50' | 'رقم لکھیں، مثلاً 170 یا 170.50' | |
| `productForm.problems.taxInvalid` | 'Enter a percentage from 0 to 100, for example 18' | '0 سے 100 تک فیصد لکھیں، مثلاً 18' | |
| `productForm.problems.minInvalid` | 'Enter a number of packs (0 is fine)' | 'پیکس کی تعداد لکھیں (0 بھی ٹھیک ہے)' | |

## New Urdu text on Receive stock and Purchases (Phase 4, M6)

`${...}` parts are filled in when the screen is drawn. Please check in particular: the batch-clash messages (`receive.clash.*`), because the owner must understand why a batch number cannot be reused ("بیچ" for batch, "میعاد" for expiry, "لاگت" for cost); the button "نئے بیچ نمبر کے طور پر محفوظ کریں" (save as a new batch number); the question about an old receipt date (`receive.oldDate.*`); and the reasons shown beside the disabled Receive button (`receive.why.*`).

| Key | English | Urdu | Reviewer's correction |
|---|---|---|---|
| `receive.receive.back` | 'Products' | 'پروڈکٹس' | |
| `receive.receive.title` | 'Receive stock' | 'اسٹاک وصول کریں' | |
| `receive.receive.subtitle` | 'Add what arrived from a supplier. Each line becomes a batch with its own expiry.' | 'جو مال سپلائر سے آیا وہ لکھیں۔ ہر لائن اپنی میعاد کے ساتھ ایک بیچ بن جاتی ہے۔' | |
| `receive.receive.supplier` | 'Supplier' | 'سپلائر' | |
| `receive.receive.supplierPick` | 'Choose a supplier' | 'سپلائر چنیں' | |
| `receive.receive.newSupplier` | '+ New supplier' | '+ نیا سپلائر' | |
| `receive.receive.invoiceNo` | 'Supplier invoice no.' | 'سپلائر کا بل نمبر' | |
| `receive.receive.dateReceived` | 'Date received' | 'وصولی کی تاریخ' | |
| `receive.receive.columns` | { product: 'Product and size', batch: 'Batch no.', expiry: 'Expiry', packs: 'Packs', cost: 'Cost / pack', total: 'Line total' } | { product: 'پروڈکٹ اور سائز', batch: 'بیچ نمبر', expiry: 'میعاد', packs: 'پیک', cost: 'لاگت / پیک', total: 'لائن کا کل' } | |
| `receive.receive.addLine` | '+ Add a line (search product or scan barcode)' | '+ لائن شامل کریں (پروڈکٹ تلاش کریں یا بارکوڈ اسکین کریں)' | |
| `receive.receive.searchLabel` | 'Search a product or scan a barcode' | 'پروڈکٹ تلاش کریں یا بارکوڈ اسکین کریں' | |
| `receive.receive.searchPlaceholder` | 'Search in English or اردو' | 'انگریزی یا اردو میں تلاش کریں' | |
| `receive.receive.noResults` | 'No product matches' | 'کوئی پروڈکٹ نہیں ملی' | |
| `receive.receive.closeSearch` | 'Close' | 'بند کریں' | |
| `receive.receive.emptyLines` | 'No lines yet. Add the first product that arrived.' | 'ابھی کوئی لائن نہیں۔ جو پہلی پروڈکٹ آئی وہ شامل کریں۔' | |
| `receive.receive.removeLine` | (name: string) => `Remove ${name}` | (name: string) => `${name} ہٹائیں` | |
| `receive.receive.summary` | (lines: number, packs: number) => `${lines} ${lines === 1 ? 'line' : 'lines'} · ${packs} ${packs === 1 ? 'pack' : 'packs'}` | (lines: number, packs: number) => `${lines} لائن · ${packs} پیک` | |
| `receive.receive.totalCost` | 'Total cost' | 'کل لاگت' | |
| `receive.receive.paidInFull` | 'Paid in full when received.' | 'وصولی پر پوری ادائیگی ہو جاتی ہے۔' | |
| `receive.receive.receive` | 'Receive stock' | 'اسٹاک وصول کریں' | |
| `receive.receive.receiving` | 'Receiving…' | 'وصول ہو رہا ہے…' | |
| `receive.receive.received` | (total: string) => `Stock received · ${total}` | (total: string) => `اسٹاک وصول ہو گیا · ${total}` | |
| `receive.receive.why.noLines` | 'Add at least one line.' | 'کم از کم ایک لائن شامل کریں۔' | |
| `receive.receive.why.header` | 'Check the supplier and the date.' | 'سپلائر اور تاریخ دیکھیں۔' | |
| `receive.receive.why.fix` | 'Fix the highlighted lines first.' | 'پہلے نشان زد لائنیں درست کریں۔' | |
| `receive.receive.why.clash` | 'Resolve the batch clashes first.' | 'پہلے بیچ کے ٹکراؤ حل کریں۔' | |
| `receive.receive.why.loading` | 'Checking the existing batches…' | 'موجودہ بیچ دیکھے جا رہے ہیں…' | |
| `receive.receive.clash.expiryTitle` | (batch: string) => `Batch ${batch} is already used for this size, with a different expiry` | (batch: string) => `بیچ ${batch} اس سائز کے لیے پہلے سے موجود ہے، مگر میعاد مختلف ہے` | |
| `receive.receive.clash.expiryBody` | (batch: string, existing: string, typed: string) => `Existing ${batch} expires ${existing}. You typed ${typed}. One batch number can only have one expiry.` | (batch: string, existing: string, typed: string) => `موجودہ ${batch} کی میعاد ${existing} ہے۔ آپ نے ${typed} لکھی۔ ایک بیچ نمبر کی ایک ہی میعاد ہو سکتی ہے۔` | |
| `receive.receive.clash.costTitle` | (batch: string) => `Batch ${batch} is already used for this size, with a different cost` | (batch: string) => `بیچ ${batch} اس سائز کے لیے پہلے سے موجود ہے، مگر لاگت مختلف ہے` | |
| `receive.receive.clash.costBody` | (existing: string, typed: string) => `The existing batch cost ${existing} a pack. You typed ${typed}. The cost of a batch is never changed, so this needs a new batch number.` | (existing: string, typed: string) => `موجودہ بیچ کی لاگت ${existing} فی پیک تھی۔ آپ نے ${typed} لکھی۔ بیچ کی لاگت کبھی نہیں بدلی جاتی، اس لیے نیا بیچ نمبر چاہیے۔` | |
| `receive.receive.clash.useExpiry` | (date: string) => `Use expiry ${date}` | (date: string) => `میعاد ${date} رکھیں` | |
| `receive.receive.clash.newBatch` | 'Save as new batch number' | 'نئے بیچ نمبر کے طور پر محفوظ کریں' | |
| `receive.receive.clash.newBatchHint` | 'A new batch number was filled in. You can change it.' | 'نیا بیچ نمبر بھر دیا گیا ہے۔ آپ اسے بدل سکتے ہیں۔' | |
| `receive.receive.problems.batchRequired` | 'Enter the batch number' | 'بیچ نمبر لکھیں' | |
| `receive.receive.problems.expiryInvalid` | 'Enter the expiry date' | 'میعاد کی تاریخ لکھیں' | |
| `receive.receive.problems.packsInvalid` | 'Enter a whole number of packs above 0' | 'صفر سے زیادہ پیک کی پوری تعداد لکھیں' | |
| `receive.receive.problems.costInvalid` | 'Enter an amount such as 400 or 400.50' | 'رقم لکھیں، مثلاً 400 یا 400.50' | |
| `receive.receive.problems.supplier` | 'Choose a supplier' | 'سپلائر چنیں' | |
| `receive.receive.problems.dateInvalid` | 'Enter the date' | 'تاریخ لکھیں' | |
| `receive.receive.problems.dateFuture` | 'The date cannot be after today' | 'تاریخ آج کے بعد کی نہیں ہو سکتی' | |
| `receive.receive.oldDate.title` | (days: number) => `This receipt is dated ${days} days ago` | (days: number) => `اس رسید کی تاریخ ${days} دن پہلے کی ہے` | |
| `receive.receive.oldDate.body` | 'Save anyway?' | 'پھر بھی محفوظ کریں؟' | |
| `receive.receive.oldDate.saveAnyway` | 'Save anyway' | 'پھر بھی محفوظ کریں' | |
| `receive.receive.oldDate.changeDate` | 'Change the date' | 'تاریخ بدلیں' | |
| `receive.receive.loading` | 'Loading…' | 'لوڈ ہو رہا ہے…' | |
| `purchases.purchases.note` | 'Receive stock from here. The list of past receipts is built later.' | 'یہاں سے اسٹاک وصول کریں۔ پرانی رسیدوں کی فہرست بعد میں بنے گی۔' | |
| `purchases.purchases.receiveLink` | 'Receive stock' | 'اسٹاک وصول کریں' | |

## New Urdu error messages (Phase 5, M1: the owner's approval at the counter)

Written by the developer, not by a native speaker: please check. `{seconds}` is replaced by the number of seconds.

| Code | English: what went wrong | English: what to do next | Urdu: what went wrong | Urdu: what to do next | Reviewer's correction |
|---|---|---|---|---|---|
| `REQUEST_ID_REUSED` | This bill was already used for a different sale | Start the bill again. | یہ بل پہلے ہی ایک اور فروخت کے لیے استعمال ہو چکا ہے | بل دوبارہ شروع کریں۔ | |
| `HELD_BILL_GONE` | This held bill is not there any more | Someone else may have resumed or discarded it. Open the held bills again to see what is left. | یہ رکا ہوا بل اب موجود نہیں | ہو سکتا ہے کسی اور نے اسے کھول لیا ہو یا ختم کر دیا ہو۔ رکے ہوئے بل دوبارہ کھول کر دیکھیں۔ | |
| `APPROVAL_REQUIRED` | The owner has to approve this | Ask the owner to approve it with their password. | اس کے لیے مالک کی منظوری چاہیے | مالک سے ان کے پاس ورڈ کے ساتھ منظوری لیں۔ | |
| `APPROVAL_INVALID` | The owner's approval does not work for this bill | It may have run out (it lasts one minute), been used already, or been given for a different bill. Ask the owner to approve again. | مالک کی منظوری اس بل کے لیے کام نہیں کر رہی | ہو سکتا ہے اس کا وقت ختم ہو گیا ہو (یہ ایک منٹ چلتی ہے)، یہ پہلے استعمال ہو چکی ہو، یا کسی اور بل کے لیے دی گئی ہو۔ مالک سے دوبارہ منظوری لیں۔ | |
| `TOO_MANY_ATTEMPTS` | Too many wrong passwords | Wait {seconds} seconds and try again. | غلط پاس ورڈ بہت بار لکھا گیا | {seconds} سیکنڈ انتظار کریں اور دوبارہ کوشش کریں۔ | |

## New Urdu text on receipts and invoices (Phase 5, M5/M6)

Written by the developer, not by a native speaker: please check. Numbers, dates, invoice numbers and "Rs" stay in Latin digits and letters, as in the approved designs. The English month names are kept (see the question about month names above). The Urdu text is in `packages/ui/src/print/labels.ts`.

| Where | English | Urdu | Reviewer's correction |
|---|---|---|---|
| Title of the receipt | Receipt | رسید | |
| Title of the A4 invoice, and the label before the invoice number | Invoice | بل | |
| Reprint mark (the word COPY is printed as it is, as the owner asked, with the Urdu word beside it) | COPY | COPY · نقل | |
| Cancelled invoice mark | VOIDED | منسوخ | |
| Customer | Customer | گاہک | |
| Discount | Discount | رعایت | |
| Total | Total | کل رقم | |
| Tax is inside the total | Includes tax | ٹیکس سمیت | |
| Amount paid, then the method | Paid · Cash | ادا شدہ · نقد | |
| Methods | Cash, Bank, Easypaisa, JazzCash | نقد، بینک، ایزی پیسہ، جیز کیش | |
| What went on the customer's Khata with this sale | On Khata | کھاتے میں باقی | |
| The customer's balance right after this sale | Your balance now | آپ کا کل بقایا | |
| Due date | Pay by | ادائیگی کی تاریخ | |
| Footer | Thank you. Please keep this receipt. | شکریہ۔ رسید سنبھال کر رکھیں۔ | |
| Placeholder until the owner gives the address and phone | [Address and phone] | [پتہ اور فون] | |
| Marks a loose sale after the name (the design writes "کھلی"; the Products screen says "کھلا": which one for each product?) | loose | کھلی | |
| A4 table headings | # / Item / Batch / Qty / Rate / Disc. / Tax / Amount | نمبر / آئٹم / بیچ / مقدار / ریٹ / رعایت / ٹیکس / رقم | |
| A4 signatures | Customer signature / Authorised signature | گاہک کے دستخط / مجاز دستخط | |
| Units in a loose quantity and its rate ("250 گرام × Rs 200/کلو") | g, kg, ml, L, pc | گرام، کلو، ملی لیٹر، لیٹر، عدد | |

## New Urdu text on the Settings screen: print format, footer, shop name (NEEDS REVIEW)

Written by the developer, not yet checked by a native speaker. The keys are `settings.*` in `packages/ui/src/i18n/messages/ur.ts`.

| Where | English | Urdu in the app | Correction |
|---|---|---|---|
| `settings.shopName` (label) | Shop name | دکان کا نام | |
| `settings.shopNameHint` | Printed on every receipt and invoice and shown in the sidebar. | ہر رسید اور بل پر چھپتا ہے اور سائیڈ بار میں نظر آتا ہے۔ | |
| `settings.printFormat` (label) | Default print format | چھپائی کا ڈیفالٹ انداز | |
| `settings.format80` | 80 mm receipt | 80 ملی میٹر رسید | |
| `settings.formatA4` | A4 invoice | A4 بل | |
| `settings.printFormatHint` | What the Print button prints. The other paper stays one tap away. | چھاپنے کا بٹن یہی کاغذ چھاپتا ہے۔ دوسرا کاغذ ایک ٹیپ کی دوری پر رہتا ہے۔ | |
| `settings.receiptFooter` (label) | Receipt footer text | رسید کے نیچے کی عبارت | |
| `settings.receiptFooterPlaceholder` (also the standard printed line) | Thank you. Please keep this receipt. | شکریہ۔ رسید سنبھال کر رکھیں۔ | |
| `settings.receiptFooterHint` | Printed at the bottom of receipts and invoices instead of the standard thank-you line. Left empty, the standard line is printed. | رسید اور بل کے نیچے عام شکریے کی سطر کی جگہ چھپتی ہے۔ خالی ہو تو عام سطر چھپتی ہے۔ | |

## Customer form and Customers settings (Phase 6 M4): the developer's Urdu, NOT reviewed

`customerForm.*` and `customerSettings.*`. Only the Urdu field label "نام (اردو)" is the design's own. Everything else below is the developer's wording and needs a native speaker. (The error messages `DUPLICATE_CUSTOMER`, `VERSION_CONFLICT` and `FIELD_NOT_ALLOWED` are older and listed with the Phase 6 errors.)

| Key | English | Urdu | Reviewer's correction |
|---|---|---|---|
| `customerForm.back` | Customers & Khata | گاہک اور کھاتہ | |
| `customerForm.addTitle` | Add customer | نیا گاہک | |
| `customerForm.editTitle` | Edit customer · {name} | گاہک میں تبدیلی · {name} | |
| `customerForm.subtitle` | Write a name and how to reach the customer. One name is enough. | نام اور رابطے کی تفصیل لکھیں۔ ایک نام کافی ہے۔ | |
| `customerForm.cancel` / `dupCancel` | Cancel | منسوخ | |
| `customerForm.save` | Save customer | گاہک محفوظ کریں | |
| `customerForm.saving` / `saved` | Saving… / Customer saved | محفوظ ہو رہا ہے… / گاہک محفوظ ہو گیا | |
| `customerForm.loading` / `notFound` / `retry` | Loading customer… / This customer was not found / Try again | گاہک کھل رہا ہے… / یہ گاہک نہیں ملا / دوبارہ کوشش کریں | |
| `customerForm.nameEn` | Name (English) | نام (English) | |
| `customerForm.nameUr` | Name (اردو) | نام (اردو) (from the design) | |
| `customerForm.phone` / `village` / `notes` | Phone / Village / Notes | فون / گاؤں / نوٹ | |
| `customerForm.problems.name` | Write a name in English or Urdu | انگریزی یا اردو میں نام لکھیں | |
| `customerForm.problems.creditLimit` | Write the limit in rupees, such as 10000, or 0 for no limit | حد روپوں میں لکھیں، مثلاً 10000، یا بغیر حد کے لیے 0 | |
| `customerForm.termsHeading` / `termsHint` | Terms / Only the owner sets these. | شرائط / یہ صرف مالک مقرر کرتا ہے۔ | |
| `customerForm.priceType` | Default price type | عام ریٹ کی قسم | |
| `customerForm.retail` / `wholesale` | Retail / Wholesale | پرچون / تھوک | |
| `customerForm.creditLimit` / `creditLimitHint` | Credit limit / 0 = no limit | ادھار کی حد / 0 = کوئی حد نہیں | |
| `customerForm.staffLimitNote` | The credit limit is set by the owner. | ادھار کی حد مالک مقرر کرتا ہے۔ | |
| `customerForm.staffDefaultLimit` | A new customer starts with {amount}. | نیا گاہک {amount} کی حد سے شروع ہوتا ہے۔ | |
| `customerForm.staffCustomerLimit` | This customer's limit is {amount}. | اس گاہک کی حد {amount} ہے۔ | |
| `customerForm.noLimit` | No limit | کوئی حد نہیں | |
| `customerForm.addFarmer` / `hideFarmer` | Add farmer details / Hide farmer details | کسان کی تفصیل شامل کریں / کسان کی تفصیل چھپائیں | |
| `customerForm.farmerHeading` / `farmerHint` | Extra details / Optional. They are never needed to save. | اضافی تفصیل / اختیاری۔ محفوظ کرنے کے لیے ضروری نہیں۔ | |
| `customerForm.fatherName` / `cnic` / `phone2` / `guarantor` | Father's name / CNIC / Second phone / Guarantor | والد کا نام / شناختی کارڈ نمبر / دوسرا فون / ضامن | |
| `customerForm.dupTitle` | A customer named {name} is already saved. | {name} نام کا گاہک پہلے سے محفوظ ہے۔ | |
| `customerForm.dupTitlePhone` | A customer with this phone number is already saved. | اس فون نمبر کا گاہک پہلے سے محفوظ ہے۔ | |
| `customerForm.dupHint` | If this is another person, add the village or father's name so staff can tell them apart. | اگر یہ کوئی اور شخص ہے تو گاؤں یا والد کا نام لکھ دیں تاکہ عملہ فرق کر سکے۔ | |
| `customerForm.dupOpen` | Open existing {name} | موجودہ {name} کھولیں | |
| `customerForm.dupSaveNew` | Save as new | نیا محفوظ کریں | |
| `customerForm.owes` / `advance` | Owes {amount} / Advance {amount} | بقایا {amount} / پیشگی {amount} | |
| `customerForm.conflictTitle` / `conflictBody` / `reload` | Someone changed this customer / Reload to see the new details, then make your change again. / Reload | اس گاہک کی تفصیل کسی اور نے بدل دی ہے / نئی تفصیل دیکھنے کے لیے دوبارہ کھولیں، پھر اپنی تبدیلی کریں۔ / دوبارہ کھولیں | |
| `customerForm.partial` | The contact details were saved, but the terms were not. The form now shows what is saved. | رابطے کی تفصیل محفوظ ہو گئی مگر شرائط محفوظ نہیں ہوئیں۔ فارم میں اب جو محفوظ ہے وہی نظر آ رہا ہے۔ | |
| `customerForm.belowBalance` | The limit is below what the customer owes; the next credit sale will need the owner | حد گاہک کے بقایا سے کم ہے؛ اگلی ادھار فروخت کے لیے مالک کی منظوری چاہیے ہوگی | |
| `customerSettings.sectionLabel` / `heading` | Customers | گاہک | |
| `customerSettings.hint` | What a new customer starts with, and what the customer form shows. | نئے گاہک کی شروعات کیا ہو، اور گاہک کے فارم میں کیا نظر آئے۔ | |
| `customerSettings.defaultLimit` / `defaultLimitHint` | Default credit limit / Given to every new customer. 0 = no limit. | ادھار کی عام حد / ہر نئے گاہک کو ملتی ہے۔ 0 = کوئی حد نہیں۔ | |
| `customerSettings.limitInvalid` | Write the limit in rupees, such as 10000, or 0 for no limit | حد روپوں میں لکھیں، مثلاً 10000، یا بغیر حد کے لیے 0 | |
| `customerSettings.showFarmer` / `showFarmerHint` | Show farmer details / Father's name, CNIC, second phone and guarantor on the customer form. Details already saved stay when this is off. | کسان کی تفصیل دکھائیں / گاہک کے فارم میں والد کا نام، شناختی کارڈ، دوسرا فون اور ضامن۔ بند کرنے پر پہلے سے محفوظ تفصیل مٹتی نہیں۔ | |
| `customerSettings.on` / `off` | On / Off | چالو / بند | |
| `customerSettings.save` / `saving` / `saved` | Save / Saving… / Settings saved | محفوظ کریں / محفوظ ہو رہا ہے… / ترتیبات محفوظ ہو گئیں | |
| `customerSettings.nothingChanged` / `loading` / `retry` | Nothing changed yet / Loading… / Try again | ابھی کچھ نہیں بدلا / کھل رہا ہے… / دوبارہ کوشش کریں | |

## Customer page, payment and opening balance (Phase 6 M5): the developer's Urdu, NOT reviewed

`customerDetail.*`, `customerPayment.*` and `customerOpening.*` in `ur.ts` are all the developer's wording and need a native speaker. Check first: ابتدائی بقایا (opening balance), ادائیگی وصول کریں (receive payment), ایڈوانس (advance, as on the customers list), واپسی کا کریڈٹ (return credit), "ان کے ذمے ہمارے / ہمارے ذمے ان کے" (They owe us / We owe them), and the sentence for OPENING_BALANCE_EXISTS.
