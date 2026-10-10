// The Products screen's data: stock picture per size (next expiry, batches, flags), counts for the filter chips, a summary per
// product, and the owner-only cost. Runs on every backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, ID, services, uuid, type Row, type ServiceWorld, type WorldFactory } from '../world.js';

export function defineCatalogueListTests(make: WorldFactory): void {
  describe('catalogue list (the Products screen)', () => {
    let w: ServiceWorld;
    let s: ReturnType<typeof services>;
    beforeEach(async () => {
      w = await make({ stock: false }); // a shop with products but no stock: each test buys its own
      s = services(w);
    });
    afterEach(() => w.close());

    const owner = ID.owner;
    const size = (label: string, packSize: number, o: Row = {}) => ({
      pack_label: label, base_unit: 'ml' as const, pack_size: packSize, retail_price: packSize * 50, wholesale_price: packSize * 46, ...o,
    });
    /** Insecticide X: 250 ml (min 1000), 500 ml (min 2500), 1 L (min 5000). Minimums are in base units (ml). */
    const makeX = (name = 'Insecticide X') =>
      s.catalogue.createGroup({ actor_id: owner, name_en: name, sizes: [size('250 ml', 250, { min_stock: 1000 }), size('500 ml', 500, { min_stock: 2500 }), size('1 L', 1000, { min_stock: 5000 })] });
    const batch = (productId: string, qty: number, days: number, batchNo: string, cost = 1000) =>
      s.stock.openingStock({ product_id: productId, batch_no: batchNo, expiry_date: w.day(days), cost_price: cost, qty, created_by: owner });
    const listed = (query = 'insecticide x', o: object = {}) => s.catalogue.list({ query, ...o }).hits[0]!;
    const sizeOf = (g: ReturnType<typeof listed>, label: string) => g.sizes.find((x) => x.pack_label === label)!;

    describe('group_id: one product, for the edit screen', () => {
      it('returns only that product, with all its sizes (switched-off ones too when asked), and nothing for an unknown id', () => {
        const x = makeX();
        makeX('Other product');
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[2]!.id, is_active: false });
        const one = s.catalogue.list({ group_id: x.group.id, include_inactive: true });
        expect(one.hits).toHaveLength(1);
        expect(one.hits[0]!.group.id).toBe(x.group.id);
        expect(one.hits[0]!.sizes.map((z) => z.pack_label)).toEqual(['250 ml', '500 ml', '1 L']);
        expect(s.catalogue.list({ group_id: x.group.id }).hits[0]!.sizes).toHaveLength(2); // without include_inactive the off size is left out
        expect(s.catalogue.list({ group_id: uuid(404), include_inactive: true }).hits).toHaveLength(0);
      });

      it('each size says whether it has batches (the lock) and how much stock there is', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 750, 100, 'B1');
        batch(x.sizes[0]!.id, 250, 200, 'B2');
        const sizes = s.catalogue.list({ group_id: x.group.id, include_inactive: true }).hits[0]!.sizes;
        expect(sizes[0]).toMatchObject({ batch_count: 2, stock_total: 1000 });
        expect(sizes[1]).toMatchObject({ batch_count: 0, stock_total: 0 });
      });
    });

    describe('each size has its stock picture', () => {
      it('totals, expired stock, next expiry, next sellable expiry and batch counts, from its batches', () => {
        const x = makeX();
        const id = x.sizes[1]!.id;
        batch(id, 3000, 200, 'LATE');
        batch(id, 1000, 40, 'SOON');
        batch(id, 700, -10, 'OLD'); // expired, with stock
        batch(id, 400, 100, 'GONE');
        s.stock.adjust({ batch_id: w.rows('batches').find((b) => b.batch_no === 'GONE')!.id as string, qty_delta: -400, created_by: owner }); // a batch that is now empty
        const five = sizeOf(listed(), '500 ml');
        expect(five).toMatchObject({
          stock_total: 4700, stock_sellable: 4000, expired_stock: 700,
          next_expiry: w.day(-10), next_sellable_expiry: w.day(40),
          batch_count: 4, stocked_batch_count: 3,
        });
      });

      it('a size with no batches is all zeros and has no dates; its neighbours are not affected', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 50, 'A');
        const g = listed();
        expect(sizeOf(g, '1 L')).toMatchObject({ stock_total: 0, stock_sellable: 0, expired_stock: 0, next_expiry: null, next_sellable_expiry: null, batch_count: 0, stocked_batch_count: 0 });
        expect(sizeOf(g, '250 ml')).toMatchObject({ stock_total: 100, batch_count: 1 });
      });

      it('an empty batch counts as a batch (it locks the pack size) but not as a stocked one, and has no expiry date', () => {
        const x = makeX();
        const b = batch(x.sizes[0]!.id, 100, 50, 'A');
        s.stock.adjust({ batch_id: b, qty_delta: -100, created_by: owner });
        expect(sizeOf(listed(), '250 ml')).toMatchObject({ stock_total: 0, batch_count: 1, stocked_batch_count: 0, next_expiry: null, next_sellable_expiry: null });
      });

      it('a sale changes the stock the next time the list is read', () => {
        const x = makeX();
        batch(x.sizes[1]!.id, 4000, 100, 'A');
        expect(sizeOf(listed(), '500 ml').stock_total).toBe(4000);
        s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: x.sizes[1]!.id, qty: 500 }] });
        expect(sizeOf(listed(), '500 ml').stock_total).toBe(3500);
      });

      it('moving the clock past an expiry turns sellable stock into expired stock', () => {
        const x = makeX();
        batch(x.sizes[1]!.id, 4000, 1, 'A');
        expect(sizeOf(listed(), '500 ml')).toMatchObject({ stock_sellable: 4000, expired_stock: 0 });
        w.setNow(w.at(2));
        expect(sizeOf(listed(), '500 ml')).toMatchObject({ stock_sellable: 0, expired_stock: 4000, next_sellable_expiry: null, next_expiry: w.day(1) });
      });
    });

    describe('the three flags', () => {
      it('LOW: sellable stock at or under the minimum (the boundary counts), and only for a size that is switched on', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 1000, 100, 'A'); // exactly the minimum 1000
        batch(x.sizes[1]!.id, 2501, 100, 'B'); // one over the minimum 2500
        batch(x.sizes[2]!.id, 100, 100, 'C'); // far under 5000
        const g = listed();
        expect(sizeOf(g, '250 ml').flags.low).toBe(true);
        expect(sizeOf(g, '500 ml').flags.low).toBe(false);
        expect(sizeOf(g, '1 L').flags.low).toBe(true);
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[2]!.id, is_active: false });
        expect(sizeOf(listed('insecticide x', { include_inactive: true }), '1 L').flags.low).toBe(false); // switched off: never low
      });

      it('LOW needs a minimum: a size with min_stock 0 is never low, with or without stock; a minimum of 1 is enough to alert', () => {
        const x = s.catalogue.createGroup({ actor_id: owner, name_en: 'No alert', sizes: [size('250 ml', 250, { min_stock: 0 }), size('500 ml', 500, { min_stock: 0 }), size('1 L', 1000, { min_stock: 1 }), size('2 L', 2000, { min_stock: 1 })] });
        batch(x.sizes[1]!.id, 5, 100, 'A'); // a little stock, minimum 0
        batch(x.sizes[2]!.id, 1, 100, 'B'); // exactly the minimum of 1
        batch(x.sizes[3]!.id, 2, 100, 'C'); // one over the minimum of 1
        const g = listed('no alert');
        expect(sizeOf(g, '250 ml').flags.low).toBe(false); // no stock at all, no minimum
        expect(sizeOf(g, '500 ml').flags.low).toBe(false);
        expect(sizeOf(g, '1 L').flags.low).toBe(true);
        expect(sizeOf(g, '2 L').flags.low).toBe(false);
        expect(g.summary.low_sizes).toBe(1);
        expect(s.catalogue.list({ query: 'no alert', filter: 'low' }).hits[0]!.matched_size_ids).toEqual([x.sizes[2]!.id]);
        // setting a minimum on the size with no stock raises the alert
        const before = s.catalogue.list({ query: 'no alert' }).counts.low;
        s.catalogue.updateSize({ actor_id: owner, product_id: x.sizes[0]!.id, changes: { min_stock: 100 } });
        expect(s.catalogue.list({ query: 'no alert' }).counts.low).toBe(before + 1);
        expect(sizeOf(listed('no alert'), '250 ml').flags.low).toBe(true);
      });

      it('LOW counts only sellable stock: a big expired batch does not hide a shortage', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 50_000, -5, 'OLD');
        batch(x.sizes[0]!.id, 500, 100, 'NEW');
        expect(sizeOf(listed(), '250 ml')).toMatchObject({ stock_total: 50_500, stock_sellable: 500 });
        expect(sizeOf(listed(), '250 ml').flags.low).toBe(true);
      });

      it('NEAR EXPIRY: the soonest batch with stock expires within 30 days (today and day 30 count, day 31 does not)', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 0, 'TODAY');
        batch(x.sizes[1]!.id, 100, 30, 'DAY30');
        batch(x.sizes[2]!.id, 100, 31, 'DAY31');
        const g = listed();
        expect(sizeOf(g, '250 ml').flags).toMatchObject({ near_expiry: true, expired: false }); // expires today: still sellable
        expect(sizeOf(g, '500 ml').flags.near_expiry).toBe(true);
        expect(sizeOf(g, '1 L').flags.near_expiry).toBe(false);
      });

      it('NEAR EXPIRY follows the near_expiry_days setting', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 20, 'A');
        expect(sizeOf(listed(), '250 ml').flags.near_expiry).toBe(true); // the default is 30 days
        w.setSetting('near_expiry_days', '10');
        expect(sizeOf(listed(), '250 ml').flags.near_expiry).toBe(false);
        w.setSetting('near_expiry_days', '25');
        expect(sizeOf(listed(), '250 ml').flags.near_expiry).toBe(true);
        w.setSetting('near_expiry_days', 'soon'); // not a number: the default applies
        expect(sizeOf(listed(), '250 ml').flags.near_expiry).toBe(true);
      });

      it('NEAR EXPIRY ignores a batch that is empty or already expired', () => {
        const x = makeX();
        const empty = batch(x.sizes[0]!.id, 100, 5, 'EMPTY');
        s.stock.adjust({ batch_id: empty, qty_delta: -100, created_by: owner });
        batch(x.sizes[0]!.id, 100, 200, 'FAR');
        batch(x.sizes[1]!.id, 100, -3, 'OLD');
        const g = listed();
        expect(sizeOf(g, '250 ml').flags.near_expiry).toBe(false); // the soon-to-expire batch has no stock
        expect(sizeOf(g, '500 ml').flags.near_expiry).toBe(false); // the only batch has already expired
      });

      it('EXPIRED: stock is still in a batch that has expired; an expired batch with no stock does not count', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, -1, 'OLD');
        const gone = batch(x.sizes[1]!.id, 100, -1, 'OLDGONE');
        s.stock.adjust({ batch_id: gone, qty_delta: -100, created_by: owner });
        const g = listed();
        expect(sizeOf(g, '250 ml').flags.expired).toBe(true);
        expect(sizeOf(g, '500 ml').flags.expired).toBe(false);
        expect(sizeOf(g, '1 L').flags.expired).toBe(false);
      });
    });

    describe('counts for the filter chips', () => {
      it('count products, and sizes that are low, near expiry or expired, over the WHOLE catalogue, whatever was typed', () => {
        const base = s.catalogue.list().counts; // the seeded shop: 3 products with no stock, each low (0 is at or under its minimum)
        const x = makeX();
        const y = makeX('Fungicide Y');
        batch(x.sizes[0]!.id, 100, 10, 'A'); // low and near expiry
        batch(x.sizes[1]!.id, 9000, 200, 'B'); // fine
        batch(x.sizes[2]!.id, 100, -2, 'C'); // low and expired
        batch(y.sizes[0]!.id, 9000, 200, 'D'); // fine
        const counts = s.catalogue.list({ query: 'fungicide' }).counts; // the search is narrower than the counts
        // X 250 ml: low + near. X 1 L: low + expired. Y 500 ml and Y 1 L have no stock, so they are low too.
        expect(counts.products).toBe(base.products + 2);
        expect(counts.low).toBe(base.low + 2 + 2);
        expect(counts.near_expiry).toBe(base.near_expiry + 1);
        expect(counts.expired).toBe(base.expired + 1);
        expect(s.catalogue.list({ query: 'insecticide' }).counts).toEqual(counts);
        expect(s.catalogue.list().counts).toEqual(counts);
      });

      it('count active products and active sizes only (a switched-off size or product is left out)', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 10, 'A');
        const before = s.catalogue.list().counts;
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[0]!.id, is_active: false });
        const after = s.catalogue.list().counts;
        expect(after.low).toBe(before.low - 1);
        expect(after.near_expiry).toBe(before.near_expiry - 1);
        s.catalogue.setGroupActive({ actor_id: owner, id: x.group.id, is_active: false });
        expect(s.catalogue.list().counts.products).toBe(before.products - 1);
      });

      it('a product with no active size is not counted, whether it has no sizes at all or every size is switched off (the product itself may still be on)', () => {
        const base = s.catalogue.list().counts.products;
        const x = makeX();
        expect(s.catalogue.list().counts.products).toBe(base + 1);
        for (const z of x.sizes) s.catalogue.setSizeActive({ actor_id: owner, id: z.id, is_active: false }); // all off, the product still on
        expect(s.catalogue.list().counts.products).toBe(base);
        s.catalogue.createGroup({ actor_id: owner, name_en: 'Not stocked yet' }); // on, but no sizes
        expect(s.catalogue.list().counts.products).toBe(base);
      });

      it('the seeded shop (products with no stock and no minimum) counts its sellable products, and none is low', () => {
        const c = s.catalogue.list().counts;
        expect(c.products).toBe(3); // bottle, fertilizer, taxed (the retired one is off)
        expect(c.low).toBe(0); // no minimum set: no alert, even with no stock
      });
    });

    describe('filters', () => {
      beforeEach(() => {
        const x = makeX();
        const y = makeX('Fungicide Y');
        batch(x.sizes[0]!.id, 100, 10, 'A'); // low + near
        batch(x.sizes[1]!.id, 9000, 200, 'B');
        batch(x.sizes[2]!.id, 9000, 200, 'C');
        batch(y.sizes[0]!.id, 9000, 200, 'D');
        batch(y.sizes[1]!.id, 9000, 200, 'E');
        batch(y.sizes[2]!.id, 100, -2, 'F'); // low + expired
      });
      const names = (o: object) => s.catalogue.list(o).hits.filter((h) => /X|Y/.test(h.group.name_en ?? '')).map((h) => h.group.name_en);

      it('"low" lists only products with a low size, and says which sizes', () => {
        const r = s.catalogue.list({ query: 'insecticide x', filter: 'low' });
        expect(r.hits.map((h) => h.group.name_en)).toEqual(['Insecticide X']);
        expect(r.hits[0]!.matched_size_ids).toEqual([r.hits[0]!.sizes.find((z) => z.pack_label === '250 ml')!.id]);
        expect(r.hits[0]!.sizes).toHaveLength(3); // all its sizes are still shown
      });

      it('"near_expiry" and "expired" pick the right products', () => {
        expect(names({ filter: 'near_expiry' })).toEqual(['Insecticide X']);
        expect(names({ filter: 'expired' })).toEqual(['Fungicide Y']);
      });

      it('"all" lists everything and total counts the products that matched the search AND the filter, before paging', () => {
        expect(s.catalogue.list({ query: 'insecticide x', filter: 'low' }).total).toBe(1);
        expect(s.catalogue.list({ filter: 'low', limit: 1 }).total).toBeGreaterThanOrEqual(2);
        expect(s.catalogue.list({ filter: 'low', limit: 1 }).hits).toHaveLength(1);
        expect(s.catalogue.list({ filter: 'expired', query: 'insecticide x' })).toMatchObject({ total: 0, hits: [] });
      });

      it('a filter and a search together narrow each other, and the chip counts do not change', () => {
        const all = s.catalogue.list().counts;
        const r = s.catalogue.list({ query: 'fungicide', filter: 'low' });
        expect(r.hits.map((h) => h.group.name_en)).toEqual(['Fungicide Y']);
        expect(r.counts).toEqual(all);
      });
    });

    describe('a summary per product', () => {
      it('size count, the unit they share, total stock in that unit, and the price ranges', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 1000, 100, 'A');
        batch(x.sizes[1]!.id, 2000, 100, 'B');
        batch(x.sizes[2]!.id, 5000, 100, 'C');
        batch(x.sizes[2]!.id, 700, -1, 'OLD');
        expect(listed().summary).toEqual({
          size_count: 3, base_unit: 'ml', stock_total: 8700, stock_sellable: 8000,
          retail_min: 12_500, retail_max: 50_000, wholesale_min: 11_500, wholesale_max: 46_000, // 250 ml .. 1 L, per pack
          low_sizes: 3, near_expiry_sizes: 0, expired_sizes: 1, // 250 ml at its minimum 1000, 500 ml under 2500, 1 L at its minimum 5000: all low
        });
      });

      it('a product whose sizes are all in grams says grams; a product with no sizes has no unit and no ranges', () => {
        s.catalogue.createGroup({ actor_id: owner, name_en: 'Powder', sizes: [size('1 kg', 1000, { base_unit: 'g' }), size('5 kg', 5000, { base_unit: 'g' })] });
        s.catalogue.createGroup({ actor_id: owner, name_en: 'Empty product' });
        expect(listed('powder').summary).toMatchObject({ base_unit: 'g', size_count: 2 });
        const empty = s.catalogue.list({ include_inactive: true }).hits.find((h) => h.group.name_en === 'Empty product')!; // a product with no sizes shows only in the full list
        expect(empty.summary).toMatchObject({ size_count: 0, base_unit: null, retail_min: null, retail_max: null, wholesale_min: null, wholesale_max: null });
      });

      it('the summary covers the sizes that are shown (switched-off sizes are left out unless asked for)', () => {
        const x = makeX();
        s.catalogue.setSizeActive({ actor_id: owner, id: x.sizes[2]!.id, is_active: false });
        expect(listed().summary).toMatchObject({ size_count: 2, retail_max: 25_000 });
        expect(listed('insecticide x', { include_inactive: true }).summary).toMatchObject({ size_count: 3, retail_max: 50_000 });
      });
    });

    describe('cost belongs to the owner: it is only there when asked for', () => {
      /** Every key name anywhere in a value. */
      const keysOf = (value: unknown): string[] =>
        value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]) : [];

      it('without include_cost no cost appears anywhere in the answer, not even as undefined or null', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 100, 'A', 12_345);
        const answer = s.catalogue.list({ query: 'insecticide x' });
        expect(keysOf(answer).filter((k) => /cost/i.test(k))).toEqual([]);
        expect(JSON.stringify(answer)).not.toContain('12345');
        expect(JSON.parse(JSON.stringify(answer))).toEqual(answer); // nothing hidden in a non-plain value
      });

      it('with include_cost every size gets cost_price: the cost of the batch that sells first', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, 200, 'LATE', 30_000);
        batch(x.sizes[0]!.id, 100, 50, 'FIRST', 11_000); // earliest expiry among those that can still be sold
        batch(x.sizes[0]!.id, 100, -5, 'OLD', 99_000); // expired: never the "next" one
        const e = batch(x.sizes[0]!.id, 100, 10, 'EMPTY', 77_000); // earlier still, but empty
        s.stock.adjust({ batch_id: e, qty_delta: -100, created_by: owner });
        const g = listed('insecticide x', { include_cost: true });
        expect(sizeOf(g, '250 ml').cost_price).toBe(11_000);
        expect(sizeOf(g, '500 ml').cost_price).toBeNull(); // nothing to sell
      });

      it('a size that only has expired stock has no next cost', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 100, -5, 'OLD', 99_000);
        expect(sizeOf(listed('insecticide x', { include_cost: true }), '250 ml').cost_price).toBeNull();
      });

      it('two batches with the same expiry: the one that sorts first by id is next', () => {
        const x = makeX();
        const first = batch(x.sizes[0]!.id, 100, 60, 'P1', 10_000);
        const second = batch(x.sizes[0]!.id, 100, 60, 'P2', 20_000);
        const next = first < second ? 10_000 : 20_000;
        expect(sizeOf(listed('insecticide x', { include_cost: true }), '250 ml').cost_price).toBe(next);
      });

      it('the cost follows a new receipt: when the first batch sells out, the next batch is the next cost', () => {
        const x = makeX();
        batch(x.sizes[0]!.id, 500, 50, 'A', 11_000);
        batch(x.sizes[0]!.id, 500, 90, 'B', 13_000);
        expect(sizeOf(listed('insecticide x', { include_cost: true }), '250 ml').cost_price).toBe(11_000);
        s.sale.create({ created_by: ID.staff, paid_amount: 25_000, lines: [{ product_id: x.sizes[0]!.id, qty: 500 }] }); // sells batch A out (earliest expiry first)
        expect(sizeOf(listed('insecticide x', { include_cost: true }), '250 ml').cost_price).toBe(13_000);
      });
    });

    describe('paging, order and input', () => {
      it('is in name order, pages do not overlap, and offset past the end is an empty page', () => {
        for (let i = 1; i <= 5; i++) s.catalogue.createGroup({ actor_id: owner, name_en: `Zeta ${i}`, sizes: [size('1 L', 1000)] });
        const all = s.catalogue.list({ query: 'zeta' }).hits.map((h) => h.group.name_en);
        expect(all).toEqual(['Zeta 1', 'Zeta 2', 'Zeta 3', 'Zeta 4', 'Zeta 5']);
        const p1 = s.catalogue.list({ query: 'zeta', limit: 2 });
        const p2 = s.catalogue.list({ query: 'zeta', limit: 2, offset: 2 });
        const p3 = s.catalogue.list({ query: 'zeta', limit: 2, offset: 4 });
        expect([...p1.hits, ...p2.hits, ...p3.hits].map((h) => h.group.name_en)).toEqual(all);
        expect([p1.total, p2.total, p3.total]).toEqual([5, 5, 5]);
        expect(s.catalogue.list({ query: 'zeta', limit: 2, offset: 99 })).toMatchObject({ total: 5, hits: [] });
      });

      it.each([
        ['a limit of 0', { limit: 0 }],
        ['a limit over 1000', { limit: 1001 }],
        ['a negative offset', { offset: -1 }],
        ['an unknown filter', { filter: 'dusty' }],
        ['a field that does not exist', { sort: 'price' }],
        ['include_cost that is not true or false', { include_cost: 'yes' }],
      ])('refuses %s', (_label, input) => {
        expect(codeOf(() => s.catalogue.list(input as never))).toBe('INVALID_INPUT');
      });

      it('the list and the plain search agree on which products and sizes exist', () => {
        makeX();
        const viaList = s.catalogue.list({ query: 'insecticide' }).hits.map((h) => [h.group.id, h.sizes.map((z) => z.id)]);
        const viaSearch = s.catalogue.search({ query: 'insecticide' }).map((h) => [h.group.id, h.sizes.map((z) => z.id)]);
        expect(viaList).toEqual(viaSearch);
      });

      it('reading the list never writes anything', () => {
        makeX();
        const before = w.snapshot();
        s.catalogue.list({ filter: 'low', include_cost: true });
        expect(w.snapshot()).toEqual(before);
        void uuid;
      });
    });
  });
}
