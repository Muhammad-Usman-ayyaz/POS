// The shop's day from the schema checks, run through the services:
//   buy 20 bottles, sell 10 on credit with Rs 2000 paid, take 2 back (resellable).
// Expected: stock 12000 ml, the customer owes Rs 2000. (The SQLite end-to-end test also checks profit.)
import { afterEach, describe, expect, it } from 'vitest';
import { codeOf, ID, services, type ServiceWorld, type WorldFactory } from '../world.js';

export interface ScenarioResult {
  batchId: string;
  invoiceId: string;
  itemId: string;
  returnId: string;
}

export function runPurchaseSaleReturnScenario(w: ServiceWorld): ScenarioResult {
  const s = services(w);

  // purchase: 20 bottles (20000 ml) at Rs 400 a bottle, paid in full
  const bought = s.purchase.record({
    supplier_id: ID.supplier, created_by: ID.owner, paid_amount: 800_000,
    items: [{ product_id: ID.bottle, batch_no: 'S1', expiry_date: w.day(365), qty: 20_000, cost_price: 40_000 }],
  });
  const batchId = bought.items[0]!.batch_id;

  // sale: 10 bottles at Rs 500 on credit, Rs 2000 paid now
  const sold = s.sale.create({ customer_id: ID.customer, created_by: ID.staff, paid_amount: 200_000, lines: [{ product_id: ID.bottle, qty: 10_000 }] });

  // return: 2 bottles, resellable, credited to the customer's Khata
  const back = s.salesReturn.create({
    invoice_id: sold.invoice.id, approved_by: ID.owner, refund_method: 'khata_credit',
    items: [{ invoice_item_id: sold.items[0]!.id, qty: 2000, condition: 'resellable' }],
  });

  return { batchId, invoiceId: sold.invoice.id, itemId: sold.items[0]!.id, returnId: back.sales_return.id };
}

export function defineScenarioTests(make: WorldFactory): void {
  describe('end-to-end: purchase 20, sell 10 on credit, return 2', () => {
    let w: ServiceWorld | undefined;
    afterEach(() => w?.close());

    it('leaves 12000 ml in stock and the customer owing Rs 2000', async () => {
      w = await make({ stock: false });
      const r = runPurchaseSaleReturnScenario(w);
      const s = services(w);

      expect(s.stock.stockOfBatch(r.batchId)).toBe(12_000);
      expect(s.khata.balance(ID.customer)).toBe(200_000);
      expect(s.khata.statement(ID.customer).map((l) => [l.entry.entry_type, l.running_balance])).toEqual([
        ['invoice', 500_000],
        ['payment', 300_000],
        ['return', 200_000],
      ]);
    });

    it('refuses to return more than was sold, and to sell more than is in stock', async () => {
      w = await make({ stock: false });
      const r = runPurchaseSaleReturnScenario(w);
      const s = services(w);
      const before = w.snapshot();

      // 10 sold, 2 already back: 9 more is too many
      expect(
        codeOf(() => s.salesReturn.create({ invoice_id: r.invoiceId, approved_by: ID.owner, refund_method: 'khata_credit', items: [{ invoice_item_id: r.itemId, qty: 9000, condition: 'resellable' }] })),
      ).toBe('RETURN_EXCEEDS_SOLD');
      // 12 bottles are in stock: 13 is too many
      expect(codeOf(() => s.sale.create({ created_by: ID.staff, paid_amount: 650_000, lines: [{ product_id: ID.bottle, qty: 13_000 }] }))).toBe('INSUFFICIENT_STOCK');

      expect(w.snapshot()).toEqual(before);
      expect(s.stock.stockOfBatch(r.batchId)).toBe(12_000);
      expect(s.khata.balance(ID.customer)).toBe(200_000);
    });
  });
}
