// Suppliers, categories and brands: the lists a form picks from, with owner-only "quick add". Runs on every backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeOf, errorOf, ID, services, uuid, type ServiceWorld, type WorldFactory } from '../world.js';
import { createReferenceService } from '../../../src/index.js';

export function defineDirectoryTests(make: WorldFactory): void {
  describe('suppliers, categories and brands (quick add)', () => {
    let w: ServiceWorld;
    let ref: ReturnType<typeof createReferenceService>;
    beforeEach(async () => {
      w = await make();
      ref = createReferenceService(w.deps);
    });
    afterEach(() => w.close());

    const owner = ID.owner;
    // The three kinds behave the same way, so one set of tests runs for each.
    const kinds = [
      ['category', () => ref.listCategories(), (i: object) => ref.addCategory({ actor_id: owner, ...i }), 'categories'],
      ['brand', () => ref.listBrands(), (i: object) => ref.addBrand({ actor_id: owner, ...i }), 'brands'],
      ['supplier', () => ref.listSuppliers(), (i: object) => ref.addSupplier({ actor_id: owner, ...i }), 'suppliers'],
    ] as const;

    describe.each(kinds)('%s', (_kind, list, add, table) => {
      it('is added with its English and Urdu name, appears in the list, and gets its own id and the shop scope', () => {
        const row = add({ name_en: 'Green Valley', name_ur: 'گرین ویلی' });
        expect(row).toMatchObject({ name_en: 'Green Valley', name_ur: 'گرین ویلی', ...w.deps.scope });
        expect(list().map((r) => r.id)).toContain(row.id);
        expect(w.rows(table).filter((r) => r.id === row.id)).toHaveLength(1);
        expect(w.rows(table).find((r) => r.id === row.id)).toMatchObject({ name_en: 'Green Valley', name_ur: 'گرین ویلی' });
      });

      it('may have only an English name or only an Urdu name, and needs at least one', () => {
        expect(add({ name_en: 'English only' })).toMatchObject({ name_en: 'English only', name_ur: null });
        expect(add({ name_ur: 'صرف اردو' })).toMatchObject({ name_en: null, name_ur: 'صرف اردو' });
        expect(codeOf(() => add({}))).toBe('INVALID_INPUT');
        expect(codeOf(() => add({ name_en: '   ' }))).toBe('INVALID_INPUT');
      });

      it('has its name tidied: no outer spaces, no doubled spaces', () => {
        expect(add({ name_en: '  Green   Valley ' }).name_en).toBe('Green Valley');
      });

      it('is listed in name order, and only live ones', () => {
        add({ name_en: 'Zed' });
        add({ name_en: 'Alpha' });
        const gone = add({ name_en: 'Middle' });
        w.update(table, gone.id, { deleted_at: '2026-01-01T00:00:00.000Z' });
        const names = list().map((r) => r.name_en).filter((n): n is string => n !== null && ['Zed', 'Alpha', 'Middle'].includes(n));
        expect(names).toEqual(['Alpha', 'Zed']);
        const all = list().map((r) => r.name_en ?? r.name_ur ?? '');
        expect(all).toEqual([...all].sort());
      });

      it('refuses a name that is already there: any case, any spacing, and Arabic letter variants of an Urdu name', () => {
        add({ name_en: 'Green Valley', name_ur: 'کھاد گھر' });
        const before = w.snapshot();
        for (const name of ['green valley', 'GREEN  VALLEY', ' Green Valley ']) {
          const e = errorOf(() => add({ name_en: name }));
          expect(e.code).toBe('DUPLICATE_NAME');
          expect(e.params).toEqual({ name: name.trim().replace(/\s+/g, ' ') });
        }
        expect(codeOf(() => add({ name_ur: 'كھاد گھر' }))).toBe('DUPLICATE_NAME'); // Arabic kaf instead of Urdu keheh
        expect(w.snapshot()).toEqual(before);
      });

      it('compares English with English and Urdu with Urdu only: the same text in the other language is a different name', () => {
        add({ name_en: 'Samad' });
        expect(() => add({ name_ur: 'Samad' })).not.toThrow();
      });

      it('is owner only: staff, an inactive user and a stranger are refused, with nothing written', () => {
        const before = w.snapshot();
        const asStaff = (actor_id: string) => () => {
          const r = createReferenceService(w.deps);
          return table === 'categories' ? r.addCategory({ actor_id, name_en: 'X' }) : table === 'brands' ? r.addBrand({ actor_id, name_en: 'X' }) : r.addSupplier({ actor_id, name_en: 'X' });
        };
        expect(codeOf(asStaff(ID.staff))).toBe('NOT_AUTHORIZED');
        expect(codeOf(asStaff(ID.inactive))).toBe('NOT_AUTHORIZED');
        expect(codeOf(asStaff(uuid(999)))).toBe('NOT_FOUND');
        expect(w.snapshot()).toEqual(before);
      });

      it('refuses a field that does not exist', () => {
        expect(codeOf(() => add({ name_en: 'X', colour: 'red' }))).toBe('INVALID_INPUT');
      });

      it('the lists can be read with no user (the shell checks the session): reading writes nothing', () => {
        const before = w.snapshot();
        list();
        expect(w.snapshot()).toEqual(before);
      });
    });

    it('a supplier keeps its phone and address, tidied, and empty ones become null', () => {
      expect(ref.addSupplier({ actor_id: owner, name_en: 'Green Valley', phone: ' 0300 1234567 ', address: ' Chak  12 ' })).toMatchObject({ phone: '0300 1234567', address: 'Chak 12' });
      expect(ref.addSupplier({ actor_id: owner, name_en: 'No Details', phone: '', address: null })).toMatchObject({ phone: null, address: null });
    });

    it('a new category or brand can be used straight away by a product', () => {
      const cat = ref.addCategory({ actor_id: owner, name_en: 'Growth boosters' });
      const brand = ref.addBrand({ actor_id: owner, name_en: 'Sample brand' });
      const made = services(w).catalogue.createGroup({ actor_id: owner, name_en: 'Booster', category_id: cat.id, brand_id: brand.id, sizes: [{ pack_label: '', base_unit: 'ml', pack_size: 500, retail_price: 100, wholesale_price: 90 }] });
      expect(made.sizes[0]).toMatchObject({ category_id: cat.id, brand_id: brand.id });
    });

    it('a new supplier can be used straight away by a purchase', () => {
      const sup = ref.addSupplier({ actor_id: owner, name_en: 'Fresh Supplier' });
      const r = services(w).purchase.record({ supplier_id: sup.id, created_by: owner, items: [{ product_id: ID.bottle, batch_no: 'FS1', expiry_date: w.day(300), qty: 1000, cost_price: 40_000 }] });
      expect(r.purchase.supplier_id).toBe(sup.id);
    });
  });
}
