// The product catalogue: product groups ("Insecticide X") and their pack sizes (250 ml, 500 ml, 1 L).
// Runs on every backend. The groups here are made THROUGH THE SERVICE with fresh ids, so a mix-up between a group id
// and a size id cannot hide behind ids that happen to be equal (the seeded world uses different ids on purpose, too).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type Row, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineCatalogueTests(make: WorldFactory): void {
  describe('catalogue (product groups and sizes)', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make();
      s = services(w);
    });
    afterEach(() => w.close());

    const owner = ID.owner;
    const size = (label: string, packSize: number, o: Row = {}) => ({
      pack_label: label, base_unit: 'ml' as const, pack_size: packSize, retail_price: packSize * 50, wholesale_price: packSize * 46, ...o,
    });
    /** Insecticide X in three sizes, with a category and a brand. */
    const makeX = () =>
      s.catalogue.createGroup({
        actor_id: owner, name_en: 'Insecticide X', name_ur: 'کیڑے مار دوا ایکس', category_id: ID.catInsecticide, brand_id: ID.brandX,
        sizes: [size('250 ml', 250, { barcode: '8961000250250' }), size('500 ml', 500, { barcode: '8961000250500' }), size('1 L', 1000, { barcode: '8961000251000' })],
      });
    const row = (table: 'products' | 'product_groups', id: string): Row => {
      const r = w.rows(table).find((x) => x.id === id);
      if (!r) throw new Error(`no ${table} row ${id}`);
      return r;
    };
    const auditActions = () => w.rows('audit_log').map((a) => a.action);
    const stockSize = (productId: string, qty: number, batchNo = 'B1', days = 200) =>
      s.stock.openingStock({ product_id: productId, batch_no: batchNo, expiry_date: w.day(days), cost_price: 1000, qty, created_by: owner });

    describe('createGroup', () => {
      it('makes the group and its sizes, each size named "group name + label" in English and Urdu', () => {
        const r = makeX();
        expect(r.group).toMatchObject({ name_en: 'Insecticide X', name_ur: 'کیڑے مار دوا ایکس', category_id: ID.catInsecticide, brand_id: ID.brandX, notes: null, is_active: 1 });
        expect(r.sizes.map((x) => [x.pack_label, x.name_en, x.name_ur, x.pack_size, x.is_active])).toEqual([
          ['250 ml', 'Insecticide X 250 ml', 'کیڑے مار دوا ایکس 250 ml', 250, 1],
          ['500 ml', 'Insecticide X 500 ml', 'کیڑے مار دوا ایکس 500 ml', 500, 1],
          ['1 L', 'Insecticide X 1 L', 'کیڑے مار دوا ایکس 1 L', 1000, 1],
        ]);
        expect(w.rows('product_groups').filter((g) => g.name_en === 'Insecticide X')).toHaveLength(1);
        expect(w.rows('products').filter((p) => p.group_id === r.group.id)).toHaveLength(3);
      });

      it('each size holds copies of the group category and brand, and keeps its own price, tax, barcode and minimum stock', () => {
        const r = s.catalogue.createGroup({
          actor_id: owner, name_en: 'Insecticide X', category_id: ID.catInsecticide, brand_id: ID.brandX,
          sizes: [size('250 ml', 250, { tax_rate_bp: 1800, min_stock: 1000, barcode: 'A1', sku: 'S1' }), size('1 L', 1000, { tax_rate_bp: 500, min_stock: 5000, barcode: 'A2', allow_loose: 1 })],
        });
        expect(r.sizes[0]).toMatchObject({ category_id: ID.catInsecticide, brand_id: ID.brandX, tax_rate_bp: 1800, min_stock: 1000, barcode: 'A1', sku: 'S1', retail_price: 12_500, wholesale_price: 11_500, allow_loose: 0 });
        expect(r.sizes[1]).toMatchObject({ category_id: ID.catInsecticide, brand_id: ID.brandX, tax_rate_bp: 500, min_stock: 5000, barcode: 'A2', sku: null, retail_price: 50_000, allow_loose: 1 });
      });

      it('FRESH IDS: the group id and every size id are different, and each size points at its own group', () => {
        const r = makeX();
        const all = [r.group.id, ...r.sizes.map((x) => x.id)];
        expect(new Set(all).size).toBe(all.length);
        for (const x of r.sizes) {
          expect(x.group_id).toBe(r.group.id);
          expect(x.id).not.toBe(x.group_id);
        }
        // a group id is not a size id, and the other way round
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: r.group.id, changes: { min_stock: 1 } }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: owner, group_id: r.sizes[0]!.id, name_en: 'Nope' }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: r.sizes[0]!.id, size: size('2 L', 2000) }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.setSizeActive({ actor_id: owner, id: r.group.id, is_active: false }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.setGroupActive({ actor_id: owner, id: r.sizes[0]!.id, is_active: false }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: r.group.id, to_group_id: ID.gBottle, pack_label: 'x' }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: r.sizes[0]!.id, to_group_id: r.sizes[1]!.id, pack_label: 'x' }))).toBe('NOT_FOUND');
      });

      it('a product with one size needs no label: the size is named after the group alone', () => {
        const r = s.catalogue.createGroup({ actor_id: owner, name_en: 'Weedicide Z', sizes: [size('', 1000)] });
        expect(r.sizes[0]).toMatchObject({ pack_label: '', name_en: 'Weedicide Z', name_ur: null });
      });

      it('a product can be made with no sizes yet, and gets them later', () => {
        const r = s.catalogue.createGroup({ actor_id: owner, name_ur: 'کھاد' });
        expect(r.sizes).toEqual([]);
        expect(row('product_groups', r.group.id)).toMatchObject({ name_en: null, name_ur: 'کھاد' });
      });

      it('names and labels are tidied: no outer or doubled spaces', () => {
        const r = s.catalogue.createGroup({ actor_id: owner, name_en: '  Insecticide   X ', sizes: [size(' 250   ml ', 250), size('500 ml', 500)] });
        expect(r.group.name_en).toBe('Insecticide X');
        expect(r.sizes.map((x) => x.name_en)).toEqual(['Insecticide X 250 ml', 'Insecticide X 500 ml']);
      });

      it.each([
        ['two sizes where one has no label', { sizes: [size('250 ml', 250), size('', 500)] }, 'PACK_LABEL_REQUIRED'],
        ['two sizes with the same label', { sizes: [size('250 ml', 250), size('250 ml', 500)] }, 'DUPLICATE_PACK_LABEL'],
        ['two sizes in different units', { sizes: [size('250 ml', 250), size('500 g', 500, { base_unit: 'g' })] }, 'MIXED_UNITS'],
        ['two sizes with the same barcode', { sizes: [size('250 ml', 250, { barcode: 'B' }), size('500 ml', 500, { barcode: 'B' })] }, 'DUPLICATE_BARCODE'],
        ['a barcode another product already uses', { sizes: [size('250 ml', 250, { barcode: 'TAKEN' })] }, 'DUPLICATE_BARCODE'],
        ['a SKU another product already uses', { sizes: [size('250 ml', 250, { sku: 'TAKEN-SKU' })] }, 'DUPLICATE_SKU'],
        ['a category that does not exist', { category_id: uuid(999), sizes: [] }, 'NOT_FOUND'],
        ['a brand that does not exist', { brand_id: uuid(999), sizes: [] }, 'NOT_FOUND'],
        ['a negative price', { sizes: [size('250 ml', 250, { retail_price: -1 })] }, 'INVALID_INPUT'],
        ['a fractional price (money is whole paisa)', { sizes: [size('250 ml', 250, { retail_price: 10.5 })] }, 'INVALID_INPUT'],
        ['a tax rate over 100 percent', { sizes: [size('250 ml', 250, { tax_rate_bp: 10_001 })] }, 'INVALID_INPUT'],
        ['a pack size of zero', { sizes: [size('250 ml', 0)] }, 'INVALID_INPUT'],
        ['a field that does not exist', { colour: 'red', sizes: [] }, 'INVALID_INPUT'],
      ])('refuses %s, and writes nothing', (_label, extra, code) => {
        // something already uses TAKEN and TAKEN-SKU
        s.catalogue.createGroup({ actor_id: owner, name_en: 'Existing', sizes: [size('', 100, { barcode: 'TAKEN', sku: 'TAKEN-SKU' })] });
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: owner, name_en: 'New', ...extra } as never))).toBe(code);
        expect(w.snapshot()).toEqual(before);
      });

      it('needs a name in English or Urdu', () => {
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: owner }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: owner, name_en: '   ' }))).toBe('INVALID_INPUT');
      });

      it('is owner only: staff, an inactive user and a stranger are refused, with nothing written', () => {
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: ID.staff, name_en: 'X' }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: ID.inactive, name_en: 'X' }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.catalogue.createGroup({ actor_id: uuid(999), name_en: 'X' }))).toBe('NOT_FOUND');
        expect(w.snapshot()).toEqual(before);
      });

      it('is one transaction: a failure on the second size leaves no group and no first size', () => {
        const before = w.snapshot();
        w.failOnInsert('products', 2);
        expect(() => makeX()).toThrow('injected failure on insert #2 into products');
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
        expect(w.inTransaction()).toBe(false);
      });
    });

    describe('sales, purchases and returns work on sizes, unchanged, and every size keeps its own stock', () => {
      it('buying two sizes and selling one: only that size loses stock, and the invoice line is for the size', () => {
        const x = makeX();
        const [s250, s500] = x.sizes;
        stockSize(s250!.id, 10_000);
        stockSize(s500!.id, 10_000);

        const sold = s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: s250!.id, qty: 500 }] });
        expect(sold.items).toHaveLength(1);
        expect(sold.items[0]).toMatchObject({ product_id: s250!.id, qty: 500, unit_price: 12_500, line_total: 25_000 });
        expect(sold.invoice.total).toBe(25_000);

        const stockOf = (id: string) => s.stock.batchesOf(id).reduce((sum, b) => sum + b.stock, 0);
        expect(stockOf(s250!.id)).toBe(9500);
        expect(stockOf(s500!.id)).toBe(10_000); // the other size is untouched
      });

      it('batches belong to the size: a 500 ml batch cannot be sold as the 250 ml size', () => {
        const x = makeX();
        const [s250, s500] = x.sizes;
        stockSize(s500!.id, 10_000);
        expect(codeOf(() => s.sale.create({ created_by: ID.staff, paid_amount: 12_500, lines: [{ product_id: s250!.id, qty: 250 }] }))).toBe('INSUFFICIENT_STOCK');
        expect(s.stock.batchesOf(s250!.id)).toEqual([]);
      });

      it('a return goes back to the size it came from, at the price it was sold at', () => {
        const x = makeX();
        const s1l = x.sizes[2]!;
        stockSize(s1l.id, 5000);
        const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 0, lines: [{ product_id: s1l.id, qty: 2000 }] });
        s.catalogue.updateSize({ actor_id: owner, product_id: s1l.id, changes: { retail_price: 99_999 } }); // the price changes after the sale
        const back = s.salesReturn.create({ invoice_id: sold.invoice.id, approved_by: owner, refund_method: 'khata_credit', items: [{ invoice_item_id: sold.items[0]!.id, qty: 1000, condition: 'resellable' }] });
        expect(back.sales_return.total).toBe(50_000 * 1); // one 1 L pack at the old price Rs 500
        expect(s.stock.batchesOf(s1l.id).reduce((sum, b) => sum + b.stock, 0)).toBe(4000);
      });

      it('the sale picks up a changed price, and the old invoice keeps the old one', () => {
        const x = makeX();
        const s500 = x.sizes[1]!;
        stockSize(s500.id, 10_000);
        const first = s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: s500.id, qty: 500 }] });
        s.catalogue.updateSize({ actor_id: owner, product_id: s500.id, changes: { retail_price: 30_000 } });
        const second = s.sale.create({ created_by: ID.staff, paid_amount: 30_000, lines: [{ product_id: s500.id, qty: 500 }] });
        expect(first.items[0]!.unit_price).toBe(25_000);
        expect(second.items[0]!.unit_price).toBe(30_000);
        expect(row('products', s500.id).retail_price).toBe(30_000);
        expect(w.rows('invoice_items').find((i) => i.id === first.items[0]!.id)!.unit_price).toBe(25_000);
      });

      it('a size that is switched off cannot be sold, and one that is switched on again can', () => {
        const x = makeX();
        const s500 = x.sizes[1]!;
        stockSize(s500.id, 10_000);
        s.catalogue.setSizeActive({ actor_id: owner, id: s500.id, is_active: false });
        expect(codeOf(() => s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: s500.id, qty: 500 }] }))).toBe('PRODUCT_INACTIVE');
        s.catalogue.setSizeActive({ actor_id: owner, id: s500.id, is_active: true });
        expect(() => s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: s500.id, qty: 500 }] })).not.toThrow();
      });
    });

    describe('addSize', () => {
      it('adds a size to a product that has labelled sizes, named and copied like the others', () => {
        const x = makeX();
        const r = s.catalogue.addSize({ actor_id: owner, group_id: x.group.id, size: size('2 L', 2000, { barcode: 'NEW' }) });
        expect(r.size).toMatchObject({ group_id: x.group.id, pack_label: '2 L', name_en: 'Insecticide X 2 L', name_ur: 'کیڑے مار دوا ایکس 2 L', category_id: ID.catInsecticide, brand_id: ID.brandX, is_active: 1 });
        expect(r.size.id).not.toBe(x.group.id);
        expect(r.sizes.map((p) => p.pack_label)).toEqual(['250 ml', '500 ml', '1 L', '2 L']);
        expect(auditActions()).toEqual([]); // adding a size is not a price change
      });

      describe('a product whose only size has no label (the existing size must get one in the same transaction)', () => {
        const single = () => s.catalogue.createGroup({ actor_id: owner, name_en: 'Weedicide Z', name_ur: 'جڑی بوٹی مار', category_id: ID.catInsecticide, sizes: [size('', 1000)] });

        it('is refused without a label for the existing size, naming that size, and writes nothing', () => {
          const g = single();
          const before = w.snapshot();
          const e = errorOf(() => s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('500 ml', 500) }));
          expect(e.code).toBe('PACK_LABEL_REQUIRED');
          expect(e.params).toEqual({ sizeId: g.sizes[0]!.id });
          expect(w.snapshot()).toEqual(before);
        });

        it('labels the existing size and adds the new one together, renaming both', () => {
          const g = single();
          const r = s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('500 ml', 500), existing_size_label: '1 L' });
          expect(row('products', g.sizes[0]!.id)).toMatchObject({ pack_label: '1 L', name_en: 'Weedicide Z 1 L', name_ur: 'جڑی بوٹی مار 1 L', group_id: g.group.id });
          expect(r.size).toMatchObject({ pack_label: '500 ml', name_en: 'Weedicide Z 500 ml' });
          expect(r.sizes.map((p) => p.pack_label)).toEqual(['500 ml', '1 L']); // smallest pack first
        });

        it('is all or nothing: if adding the new size fails, the existing size keeps its empty label', () => {
          const g = single();
          const before = w.snapshot();
          w.failOnInsert('products', 1);
          expect(() => s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('500 ml', 500), existing_size_label: '1 L' })).toThrow('injected failure');
          w.clearFailure();
          expect(w.snapshot()).toEqual(before);
          expect(row('products', g.sizes[0]!.id)).toMatchObject({ pack_label: '', name_en: 'Weedicide Z' });
        });

        it('refuses a label for the existing size that equals the new size label', () => {
          const g = single();
          expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('1 L', 1000), existing_size_label: '1 L' }))).toBe('DUPLICATE_PACK_LABEL');
        });

        it('refuses to add a size with no label of its own, and an empty label for the existing size', () => {
          const g = single();
          expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('', 500), existing_size_label: '1 L' }))).toBe('PACK_LABEL_REQUIRED');
          expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('500 ml', 500), existing_size_label: '' }))).toBe('PACK_LABEL_REQUIRED');
        });

        it('the existing size keeps its stock, batches and price through the relabelling', () => {
          const g = single();
          const batchId = stockSize(g.sizes[0]!.id, 7000);
          s.catalogue.addSize({ actor_id: owner, group_id: g.group.id, size: size('500 ml', 500), existing_size_label: '1 L' });
          expect(row('products', g.sizes[0]!.id)).toMatchObject({ retail_price: 50_000, pack_size: 1000 });
          expect(w.stockOf(batchId)).toBe(7000);
        });
      });

      it('refuses an existing_size_label when the product does not need one', () => {
        const x = makeX();
        expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: x.group.id, size: size('2 L', 2000), existing_size_label: 'x' }))).toBe('INVALID_INPUT');
      });

      it.each([
        ['a label the product already has', size('500 ml', 999), 'DUPLICATE_PACK_LABEL'],
        ['a different unit', size('2 kg', 2000, { base_unit: 'g' }), 'MIXED_UNITS'],
        ['a barcode in use', size('2 L', 2000, { barcode: '8961000250250' }), 'DUPLICATE_BARCODE'],
        ['no label when the product has several sizes', size('', 2000), 'PACK_LABEL_REQUIRED'],
      ])('refuses %s, and writes nothing', (_label, newSize, code) => {
        const x = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: x.group.id, size: newSize }))).toBe(code);
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses an inactive product, an unknown product, and anyone but the owner', () => {
        const x = makeX();
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false });
        expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: x.group.id, size: size('2 L', 2000) }))).toBe('GROUP_INACTIVE');
        expect(codeOf(() => s.catalogue.addSize({ actor_id: owner, group_id: uuid(999), size: size('2 L', 2000) }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.addSize({ actor_id: ID.staff, group_id: x.group.id, size: size('2 L', 2000) }))).toBe('NOT_AUTHORIZED');
      });
    });

    describe('updateGroup: the group is the source of truth, and every size copy follows in the same transaction', () => {
      it('renaming rewrites the English and Urdu name of EVERY size, including a switched-off one', () => {
        const x = makeX();
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[1]!.id, is_active: false });
        const r = s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_en: 'Insecticide Y', name_ur: 'کیڑے مار دوا وائی' });
        expect(r.group).toMatchObject({ name_en: 'Insecticide Y', name_ur: 'کیڑے مار دوا وائی' });
        expect(r.sizes.map((p) => [p.name_en, p.name_ur])).toEqual([
          ['Insecticide Y 250 ml', 'کیڑے مار دوا وائی 250 ml'],
          ['Insecticide Y 500 ml', 'کیڑے مار دوا وائی 500 ml'],
          ['Insecticide Y 1 L', 'کیڑے مار دوا وائی 1 L'],
        ]);
        for (const p of x.sizes) expect(row('products', p.id).name_en).toMatch(/^Insecticide Y /);
      });

      it('changing the category or brand copies it onto every size', () => {
        const x = makeX();
        s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, category_id: ID.catFertilizer, brand_id: null });
        for (const p of x.sizes) expect(row('products', p.id)).toMatchObject({ category_id: ID.catFertilizer, brand_id: null });
        expect(row('product_groups', x.group.id)).toMatchObject({ category_id: ID.catFertilizer, brand_id: null });
      });

      it('a size keeps its own price, stock, barcode and minimum when the group is renamed', () => {
        const x = makeX();
        stockSize(x.sizes[0]!.id, 6000);
        s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_en: 'Insecticide Y' });
        expect(row('products', x.sizes[0]!.id)).toMatchObject({ retail_price: 12_500, barcode: '8961000250250', pack_size: 250 });
        expect(s.stock.batchesOf(x.sizes[0]!.id).map((b) => b.stock)).toEqual([6000]);
      });

      it('an Urdu name can be removed while the English one stays; removing both is refused', () => {
        const x = makeX();
        const r = s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_ur: null });
        expect(r.sizes.map((p) => p.name_ur)).toEqual([null, null, null]);
        expect(r.sizes.map((p) => p.name_en)).toEqual(['Insecticide X 250 ml', 'Insecticide X 500 ml', 'Insecticide X 1 L']);
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_en: null }))).toBe('INVALID_INPUT');
        expect(w.snapshot()).toEqual(before);
      });

      it('notes can be set and cleared, and a change that changes nothing writes nothing', () => {
        const x = makeX();
        expect(s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, notes: ' keep dry ' }).group.notes).toBe('keep dry');
        expect(s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, notes: '' }).group.notes).toBeNull();
        const before = w.snapshot();
        s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_en: 'Insecticide X', category_id: ID.catInsecticide });
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses an unknown category, an unknown product and anyone but the owner, and writes nothing', () => {
        const x = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, category_id: uuid(999) }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: owner, group_id: uuid(999), name_en: 'x' }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: ID.staff, group_id: x.group.id, name_en: 'x' }))).toBe('NOT_AUTHORIZED');
        expect(w.snapshot()).toEqual(before);
      });

      it('a change refused halfway through validation (an unknown brand) leaves the name as it was', () => {
        const x = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.updateGroup({ actor_id: owner, group_id: x.group.id, name_en: 'Renamed', brand_id: uuid(999) }))).toBe('NOT_FOUND');
        expect(w.snapshot()).toEqual(before);
        expect(row('product_groups', x.group.id).name_en).toBe('Insecticide X');
      });
    });

    describe('updateSize', () => {
      it('a price change writes an audit row with the old and new price, and the owner who did it', () => {
        const x = makeX();
        const s500 = x.sizes[1]!;
        s.catalogue.updateSize({ actor_id: owner, product_id: s500.id, changes: { retail_price: 26_000, wholesale_price: 24_000 } });
        expect(row('products', s500.id)).toMatchObject({ retail_price: 26_000, wholesale_price: 24_000 });
        expect(w.rows('audit_log')).toEqual([expect.objectContaining({ user_id: owner, action: 'price_changed', table_name: 'products', row_id: s500.id })]);
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toEqual({
          product_id: s500.id, group_id: x.group.id, before: { retail_price: 25_000, wholesale_price: 23_000 }, after: { retail_price: 26_000, wholesale_price: 24_000 },
        });
      });

      it('changing only the retail price still records the unchanged wholesale price', () => {
        const x = makeX();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[1]!.id, changes: { retail_price: 26_000 } });
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toMatchObject({ before: { retail_price: 25_000, wholesale_price: 23_000 }, after: { retail_price: 26_000, wholesale_price: 23_000 } });
      });

      it('a tax-rate change writes its own audit row', () => {
        const x = makeX();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { tax_rate_bp: 1800 } });
        expect(auditActions()).toEqual(['tax_rate_changed']);
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toMatchObject({ before: { tax_rate_bp: 0 }, after: { tax_rate_bp: 1800 } });
        expect(row('products', x.sizes[0]!.id).tax_rate_bp).toBe(1800);
      });

      it('a price and a tax-rate change together write two audit rows', () => {
        const x = makeX();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { retail_price: 13_000, tax_rate_bp: 500 } });
        expect(auditActions()).toEqual(['price_changed', 'tax_rate_changed']);
      });

      it('setting a price or tax rate to what it already is writes nothing: no audit row, no new version', () => {
        const x = makeX();
        const before = w.snapshot();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[1]!.id, changes: { retail_price: 25_000, wholesale_price: 23_000, tax_rate_bp: 0, min_stock: 0 } });
        expect(w.snapshot()).toEqual(before);
      });

      it('minimum stock, loose selling and codes change without an audit row, and each size is changed alone', () => {
        const x = makeX();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { min_stock: 3000, allow_loose: 1, sku: 'NEW-SKU' } });
        expect(row('products', x.sizes[0]!.id)).toMatchObject({ min_stock: 3000, allow_loose: 1, sku: 'NEW-SKU' });
        expect(row('products', x.sizes[1]!.id)).toMatchObject({ min_stock: 0, allow_loose: 0, sku: null }); // the neighbours are untouched
        expect(auditActions()).toEqual([]);
      });

      it('a barcode left out of the change is left alone; null or empty clears it; setting its own value is fine', () => {
        const x = makeX();
        const id = x.sizes[0]!.id;
        s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { min_stock: 1 } });
        expect(row('products', id).barcode).toBe('8961000250250');
        s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { barcode: '8961000250250' } });
        expect(row('products', id).barcode).toBe('8961000250250');
        s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { barcode: null } });
        expect(row('products', id).barcode).toBeNull();
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[1]!.id, changes: { barcode: '' } });
        expect(row('products', x.sizes[1]!.id).barcode).toBeNull();
      });

      it('refuses a barcode or SKU another size already uses', () => {
        const x = makeX();
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { barcode: '8961000250500' } }))).toBe('DUPLICATE_BARCODE');
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[1]!.id, changes: { sku: 'SKU-1' } });
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { sku: 'SKU-1' } }))).toBe('DUPLICATE_SKU');
      });

      it('changing the label renames the size; a label another size has, or an empty one beside others, is refused', () => {
        const x = makeX();
        const r = s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { pack_label: '0.25 L' } });
        expect(r).toMatchObject({ pack_label: '0.25 L', name_en: 'Insecticide X 0.25 L', name_ur: 'کیڑے مار دوا ایکس 0.25 L' });
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { pack_label: '500 ml' } }))).toBe('DUPLICATE_PACK_LABEL');
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { pack_label: '' } }))).toBe('PACK_LABEL_REQUIRED');
      });

      it('the pack size and unit can change while the size has no batches, and are locked once it has', () => {
        const x = makeX();
        const id = x.sizes[0]!.id;
        s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { pack_size: 200 } });
        expect(row('products', id).pack_size).toBe(200);
        const batchId = stockSize(id, 2000);
        const before = w.snapshot();
        const e = errorOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { pack_size: 250 } }));
        expect(e.code).toBe('PACK_SIZE_LOCKED');
        expect(e.params).toEqual({ sizeId: id });
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: id, changes: { base_unit: 'g' } }))).toBe('PACK_SIZE_LOCKED');
        expect(w.snapshot()).toEqual(before);
        expect(w.stockOf(batchId)).toBe(2000);
      });

      it('a unit that differs from the other sizes is refused', () => {
        const x = makeX();
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { base_unit: 'g' } }))).toBe('MIXED_UNITS');
      });

      it('a single size may change its unit freely while it has no batches', () => {
        const g = s.catalogue.createGroup({ actor_id: owner, name_en: 'Solo', sizes: [size('', 1000)] });
        s.catalogue.updateSize({ actor_id: owner, product_id: g.sizes[0]!.id, changes: { base_unit: 'g' } });
        expect(row('products', g.sizes[0]!.id).base_unit).toBe('g');
      });

      it('is owner only, an unknown size is not found, and an empty change writes nothing', () => {
        const x = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: ID.staff, product_id: x.sizes[0]!.id, changes: { retail_price: 1 } }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: uuid(999), changes: { retail_price: 1 } }))).toBe('NOT_FOUND');
        expect(codeOf(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { colour: 'red' } as never }))).toBe('INVALID_INPUT');
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: {} });
        expect(w.snapshot()).toEqual(before);
      });

      it('a price change that fails halfway leaves the price and the audit log as they were', () => {
        const x = makeX();
        const before = w.snapshot();
        w.failOnInsert('audit_log', 2); // the price audit row goes in; the tax audit row is the second and fails
        expect(() => s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { retail_price: 13_000, tax_rate_bp: 500 } })).toThrow('injected failure');
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
      });
    });

    describe('deactivating', () => {
      it('turning a product off turns off every size, in one transaction, with one audit row naming them', () => {
        const x = makeX();
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[0]!.id, is_active: false }); // already off: must not be listed
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false });
        expect(row('product_groups', x.group.id).is_active).toBe(0);
        for (const p of x.sizes) expect(row('products', p.id).is_active).toBe(0);
        expect(w.rows('audit_log')).toEqual([expect.objectContaining({ user_id: owner, action: 'group_deactivated', table_name: 'product_groups', row_id: x.group.id })]);
        const details = JSON.parse(w.rows('audit_log')[0]!.details as string) as { group_id: string; sizes_deactivated: string[] };
        expect(details.group_id).toBe(x.group.id);
        expect([...details.sizes_deactivated].sort()).toEqual([x.sizes[1]!.id, x.sizes[2]!.id].sort());
      });

      it('after that no size of it can be sold, and a search does not show it', () => {
        const x = makeX();
        stockSize(x.sizes[1]!.id, 10_000);
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false });
        expect(codeOf(() => s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: x.sizes[1]!.id, qty: 500 }] }))).toBe('PRODUCT_INACTIVE');
        expect(s.catalogue.search({ query: 'insecticide x' })).toEqual([]);
        expect(s.catalogue.search({ query: 'insecticide x', include_inactive: true })).toHaveLength(1);
      });

      it('turning it back on turns on only the product; each size is switched on by hand (and not before the product is on)', () => {
        const x = makeX();
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false });
        expect(codeOf(() => s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[0]!.id, is_active: true }))).toBe('GROUP_INACTIVE');
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: true });
        expect(row('product_groups', x.group.id).is_active).toBe(1);
        expect(x.sizes.map((p) => row('products', p.id).is_active)).toEqual([0, 0, 0]);
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[0]!.id, is_active: true });
        expect(row('products', x.sizes[0]!.id).is_active).toBe(1);
        expect(auditActions()).toEqual(['group_deactivated', 'group_reactivated']);
      });

      it('doing nothing (already off, already on) writes nothing', () => {
        const x = makeX();
        const before = w.snapshot();
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: true });
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[0]!.id, is_active: true });
        expect(w.snapshot()).toEqual(before);
      });

      it('is all or nothing: if the audit row cannot be written, no size and not the product is switched off', () => {
        const x = makeX();
        const before = w.snapshot();
        w.failOnInsert('audit_log', 1);
        expect(() => s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false })).toThrow('injected failure');
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
        expect(x.sizes.map((p) => row('products', p.id).is_active)).toEqual([1, 1, 1]);
      });

      it('is owner only', () => {
        const x = makeX();
        expect(codeOf(() => s.catalogue.setGroupActive({ actor_id: ID.staff, id: x.group.id, is_active: false }))).toBe('NOT_AUTHORIZED');
        expect(codeOf(() => s.catalogue.setSizeActive({ actor_id: ID.staff, id: x.sizes[0]!.id, is_active: false }))).toBe('NOT_AUTHORIZED');
      });
    });

    describe('moveSize', () => {
      /** "Insecticide 500ml" and "Insecticide 1L" were set up as two separate products; the owner joins them. */
      const twoSeparate = () => {
        const a = s.catalogue.createGroup({ actor_id: owner, name_en: 'Insecticide 500ml', name_ur: 'کیڑے مار 500', category_id: ID.catInsecticide, sizes: [size('', 500, { barcode: 'M500' })] });
        const b = s.catalogue.createGroup({ actor_id: owner, name_en: 'Insecticide 1L', name_ur: 'کیڑے مار 1L', category_id: ID.catFertilizer, brand_id: ID.brandX, sizes: [size('', 1000)] });
        return { a, b };
      };

      it('moves a size into another product: new group, new label, names and category copied from the new group', () => {
        const { a, b } = twoSeparate();
        const target = makeX(); // has three labelled sizes
        const moved = s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' });
        expect(moved).toMatchObject({ id: a.sizes[0]!.id, group_id: target.group.id, pack_label: '750 ml', name_en: 'Insecticide X 750 ml', name_ur: 'کیڑے مار دوا ایکس 750 ml', category_id: ID.catInsecticide, brand_id: ID.brandX });
        expect(row('products', b.sizes[0]!.id).group_id).toBe(b.group.id); // the other product is untouched
      });

      it('an emptied source product is switched off; one that still has sizes is not', () => {
        const { a } = twoSeparate();
        const target = makeX();
        s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' });
        expect(row('product_groups', a.group.id).is_active).toBe(0);
        expect(row('product_groups', target.group.id).is_active).toBe(1);

        const y = s.catalogue.createGroup({ actor_id: owner, name_en: 'Other', sizes: [size('100 ml', 100), size('200 ml', 200)] });
        s.catalogue.moveSize({ actor_id: owner, product_id: y.sizes[0]!.id, to_group_id: target.group.id, pack_label: '100 ml' });
        expect(row('product_groups', y.group.id).is_active).toBe(1); // still has its 200 ml
      });

      it('joining two single-size products: the target size must get a label too, in the same transaction, and one audit row is written', () => {
        const { a, b } = twoSeparate();
        const before = w.snapshot();
        const e = errorOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: b.group.id, pack_label: '500 ml' }));
        expect(e.code).toBe('PACK_LABEL_REQUIRED');
        expect(e.params).toEqual({ sizeId: b.sizes[0]!.id });
        expect(w.snapshot()).toEqual(before);

        s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: b.group.id, pack_label: '500 ml', existing_size_label: '1 L' });
        expect(row('products', b.sizes[0]!.id)).toMatchObject({ pack_label: '1 L', name_en: 'Insecticide 1L 1 L' });
        expect(row('products', a.sizes[0]!.id)).toMatchObject({ group_id: b.group.id, pack_label: '500 ml', name_en: 'Insecticide 1L 500 ml', category_id: ID.catFertilizer, brand_id: ID.brandX });
        expect(w.rows('audit_log')).toHaveLength(1);
      });

      it('writes one audit row with the owner, both groups, both labels and whether the old product was switched off', () => {
        const { a } = twoSeparate();
        const target = makeX();
        s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' });
        expect(w.rows('audit_log')).toEqual([expect.objectContaining({ user_id: owner, action: 'size_moved', table_name: 'products', row_id: a.sizes[0]!.id })]);
        expect(JSON.parse(w.rows('audit_log')[0]!.details as string)).toEqual({
          product_id: a.sizes[0]!.id, from_group_id: a.group.id, to_group_id: target.group.id, from_label: '', to_label: '750 ml', source_deactivated: true,
        });
      });

      it('the size keeps its id, stock, batches and price, and keeps selling after the move', () => {
        const { a } = twoSeparate();
        const target = makeX();
        const batchId = stockSize(a.sizes[0]!.id, 8000);
        s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' });
        expect(w.stockOf(batchId)).toBe(8000);
        expect(w.rows('batches').find((b) => b.id === batchId)!.product_id).toBe(a.sizes[0]!.id); // batches point at the SIZE, never the group
        const sold = s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: a.sizes[0]!.id, qty: 500 }] });
        expect(sold.items[0]).toMatchObject({ product_id: a.sizes[0]!.id, unit_price: 25_000 });
      });

      it('an old invoice still shows the size that was sold, whichever product it lives in now', () => {
        const { a } = twoSeparate();
        const target = makeX();
        stockSize(a.sizes[0]!.id, 8000);
        const sold = s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: a.sizes[0]!.id, qty: 500 }] });
        s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' });
        expect(w.rows('invoice_items').find((i) => i.id === sold.items[0]!.id)).toMatchObject({ product_id: a.sizes[0]!.id, qty: 500, line_total: 25_000 });
      });

      it.each([
        ['a size that has no label when the target has several sizes', { pack_label: undefined }, 'PACK_LABEL_REQUIRED'],
        ['a label the target already has', { pack_label: '1 L' }, 'DUPLICATE_PACK_LABEL'],
      ])('refuses %s, and writes nothing', (_label, extra, code) => {
        const { a } = twoSeparate();
        const target = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, ...extra }))).toBe(code);
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses a different unit, the same product, an inactive target and a made-up existing_size_label', () => {
        const { a } = twoSeparate();
        const target = makeX();
        const grams = s.catalogue.createGroup({ actor_id: owner, name_en: 'Powder', sizes: [size('', 1000, { base_unit: 'g' })] });
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: grams.sizes[0]!.id, to_group_id: target.group.id, pack_label: '1 kg' }))).toBe('MIXED_UNITS');
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: a.group.id, pack_label: 'x' }))).toBe('INVALID_INPUT');
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml', existing_size_label: 'x' }))).toBe('INVALID_INPUT');
        s.catalogue.setGroupActive({ actor_id: owner, id: target.group.id, is_active: false });
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' }))).toBe('GROUP_INACTIVE');
      });

      it('is owner only', () => {
        const { a } = twoSeparate();
        const target = makeX();
        const before = w.snapshot();
        expect(codeOf(() => s.catalogue.moveSize({ actor_id: ID.staff, product_id: a.sizes[0]!.id, to_group_id: target.group.id, pack_label: '750 ml' }))).toBe('NOT_AUTHORIZED');
        expect(w.snapshot()).toEqual(before);
      });

      it('is all or nothing: if the audit row cannot be written the size stays, the labels stay, and the old product stays on', () => {
        const { a, b } = twoSeparate();
        const before = w.snapshot();
        w.failOnInsert('audit_log', 1);
        expect(() => s.catalogue.moveSize({ actor_id: owner, product_id: a.sizes[0]!.id, to_group_id: b.group.id, pack_label: '500 ml', existing_size_label: '1 L' })).toThrow('injected failure');
        w.clearFailure();
        expect(w.snapshot()).toEqual(before);
        expect(row('products', a.sizes[0]!.id)).toMatchObject({ group_id: a.group.id, pack_label: '' });
        expect(row('products', b.sizes[0]!.id).pack_label).toBe('');
        expect(row('product_groups', a.group.id).is_active).toBe(1);
      });
    });

    describe('search', () => {
      it('finds products with their sizes and each size own stock, in English and in Urdu', () => {
        const x = makeX();
        stockSize(x.sizes[0]!.id, 600);
        stockSize(x.sizes[2]!.id, 5000);
        stockSize(x.sizes[2]!.id, 300, 'OLD', -10); // expired: counted in the total, not sellable
        for (const query of ['insecticide x', 'INSECTICIDE', 'کیڑے مار', 'کيڑے مار دوا']) {
          const hits = s.catalogue.search({ query });
          const hit = hits.find((h) => h.group.id === x.group.id);
          expect(hit, query).toBeDefined();
          expect(hit!.sizes.map((p) => [p.pack_label, p.stock_total, p.stock_sellable]), query).toEqual([['250 ml', 600, 600], ['500 ml', 0, 0], ['1 L', 5300, 5000]]);
        }
      });

      it('finds one size by its label in Eastern Arabic digits, and by its exact barcode', () => {
        const x = makeX();
        expect(s.catalogue.search({ query: '٥٠٠ ml' })[0]).toMatchObject({ group: { id: x.group.id }, matched_size_ids: [x.sizes[1]!.id] });
        expect(s.catalogue.search({ query: '۲۵۰ ملی' })).toEqual([]);
        expect(s.catalogue.search({ query: '8961000250250' })[0]).toMatchObject({ rank: 0, matched_size_ids: [x.sizes[0]!.id] });
      });

      it('finds the seeded products too, whose ids differ from their group ids', () => {
        const hits = s.catalogue.search({ query: 'insecticide 1l' });
        expect(hits.map((h) => h.group.id)).toEqual([ID.gBottle]);
        expect(hits[0]!.sizes.map((p) => [p.id, p.stock_total, p.stock_sellable])).toEqual([[ID.bottle, 19_000, 18_000]]); // 8000 + 10000 + an expired 1000
      });

      it('the clock decides what is expired: a batch is sellable today and not once the clock has moved past it', () => {
        const x = makeX();
        stockSize(x.sizes[1]!.id, 1000, 'SHORT', 1);
        const stockNow = () => s.catalogue.search({ query: 'insecticide x' })[0]!.sizes[1]!.stock_sellable;
        expect(stockNow()).toBe(1000);
        w.setNow(w.at(2));
        expect(stockNow()).toBe(0);
        expect(s.catalogue.search({ query: 'insecticide x' })[0]!.sizes[1]!.stock_total).toBe(1000);
      });

      it('lists every active product with no query, and hides switched-off sizes unless asked', () => {
        const x = makeX();
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[1]!.id, is_active: false });
        const names = s.catalogue.search().map((h) => h.group.name_en);
        expect(names).toContain('Insecticide X');
        expect(names).not.toContain('Retired'); // the seeded inactive product
        expect(s.catalogue.search({ query: 'insecticide x' })[0]!.sizes.map((p) => p.pack_label)).toEqual(['250 ml', '1 L']);
        expect(s.catalogue.search({ query: 'insecticide x', include_inactive: true })[0]!.sizes.map((p) => p.pack_label)).toEqual(['250 ml', '500 ml', '1 L']);
      });

      it('a renamed product is found by its new name and no longer by the old one', () => {
        makeX();
        const [g] = s.catalogue.search({ query: 'insecticide x' });
        s.catalogue.updateGroup({ actor_id: owner, group_id: g!.group.id, name_en: 'Mosquito Guard', name_ur: 'مچھر مار' });
        expect(s.catalogue.search({ query: 'insecticide x' })).toEqual([]);
        expect(s.catalogue.search({ query: 'mosquito' })[0]!.sizes.map((p) => p.name_en)).toEqual(['Mosquito Guard 250 ml', 'Mosquito Guard 500 ml', 'Mosquito Guard 1 L']);
      });
    });

    describe('repositories', () => {
      it('refuse to work outside a unit of work, and refuse to set columns the database owns', () => {
        const repos = w.outsideTransaction();
        expect(() => repos.productGroups.getById(ID.gBottle)).toThrow(/outside a unit of work/);
        expect(() => repos.productGroups.listWithSizes(w.today)).toThrow(/outside a unit of work/);
        expect(() => repos.products.listByGroup(ID.gBottle)).toThrow(/outside a unit of work/);
        expect(() => repos.products.update(ID.bottle, { min_stock: 1 })).toThrow(/outside a unit of work/);
        for (const column of ['version', 'updated_at', 'created_at', 'deleted_at', 'id']) {
          expect(() => w.deps.uow.run((tx) => tx.products.update(ID.bottle, { [column]: 'x' } as never)), column).toThrow(`service set ${column}`);
          expect(() => w.deps.uow.run((tx) => tx.productGroups.update(ID.gBottle, { [column]: 'x' } as never)), column).toThrow(`service set ${column}`);
        }
      });

      it('update changes only the columns given, and an unknown row is an error', () => {
        w.deps.uow.run((tx) => tx.products.update(ID.bottle, { min_stock: 777 }));
        expect(row('products', ID.bottle)).toMatchObject({ min_stock: 777, retail_price: 50_000, name_en: 'Insecticide 1L' });
        expect(() => w.deps.uow.run((tx) => tx.products.update(uuid(999), { min_stock: 1 }))).toThrow(/no row/);
        expect(() => w.deps.uow.run((tx) => tx.productGroups.update(uuid(999), { notes: 'x' }))).toThrow(/no row/);
      });

      it('lists the live sizes of a group smallest first, finds codes (also on switched-off sizes), and lists groups in name order', () => {
        const x = makeX();
        w.deps.uow.run((tx) => {
          expect(tx.products.listByGroup(x.group.id).map((p) => p.pack_size)).toEqual([250, 500, 1000]);
          expect(tx.products.listByGroup(uuid(999))).toEqual([]);
          expect(tx.products.findByBarcode('8961000250500')?.id).toBe(x.sizes[1]!.id);
          expect(tx.products.findByBarcode('nope')).toBeUndefined();
          const names = tx.productGroups.listWithSizes(w.today).map((g) => g.group.name_en);
          expect(names).toEqual([...names].sort());
          expect(tx.productGroups.getById(x.group.id)).toMatchObject({ id: x.group.id, name_en: 'Insecticide X' });
          expect(tx.productGroups.getById('nope')).toBeUndefined();
          expect(tx.categories.getById(ID.catInsecticide)).toMatchObject({ name_en: 'Insecticide' });
          expect(tx.brands.getById(ID.brandX)).toMatchObject({ name_en: 'Brand X' });
          expect(tx.categories.getById('nope')).toBeUndefined();
        });
      });
    });
  });
}
