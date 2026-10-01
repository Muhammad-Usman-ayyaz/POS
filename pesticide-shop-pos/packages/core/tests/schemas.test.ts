import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Batch, Customer, entitySchemas, Invoice, InvoiceItem, Product, PublicUser, StockMovement, User } from '../src/index.js';

const scope = () => ({ shop_id: randomUUID(), branch_id: randomUUID(), device_id: randomUUID() });
const meta = () => ({ created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z', deleted_at: null, version: 1 });
const lineMeta = () => ({ created_at: '2026-10-01T10:00:00.000Z', version: 1 });

const product = () => ({
  id: randomUUID(), category_id: null, brand_id: null, name_en: 'Insecticide 1L', name_ur: 'کیڑے مار', sku: 'INS1L', barcode: null,
  base_unit: 'ml' as const, pack_size: 1000, allow_loose: 0 as const, retail_price: 50_000, wholesale_price: 45_000,
  tax_rate_bp: 1800, min_stock: 5000, is_active: 1 as const, ...scope(), ...meta(),
});

const invoice = () => ({
  id: randomUUID(), invoice_no: 'INV-A-000001', customer_id: randomUUID(), created_by: randomUUID(),
  invoice_date: '2026-10-01T10:00:00.000Z', due_date: null, price_type: 'retail' as const,
  subtotal: 500_000, tax_total: 0, total: 500_000, paid_amount: 200_000, status: 'active' as const,
  void_reason: null, voided_by: null, ...scope(), ...meta(),
});

describe('Product', () => {
  it('accepts a valid product', () => {
    expect(Product.safeParse(product()).success).toBe(true);
  });

  it('accepts an Urdu-only name, rejects no name at all', () => {
    expect(Product.safeParse({ ...product(), name_en: null }).success).toBe(true);
    expect(Product.safeParse({ ...product(), name_en: null, name_ur: null }).success).toBe(false);
  });

  it.each([
    ['a negative price', { retail_price: -1 }],
    ['a fractional price (money is integer paisa)', { retail_price: 50_000.5 }],
    ['a zero pack size', { pack_size: 0 }],
    ['tax over 100 percent', { tax_rate_bp: 10_001 }],
    ['an unknown base unit', { base_unit: 'kg' }],
    ['a flag that is not 0 or 1', { allow_loose: 2 }],
    ['an id that is not a UUID', { id: 'abc' }],
  ])('rejects %s', (_label, patch) => {
    expect(Product.safeParse({ ...product(), ...patch }).success).toBe(false);
  });
});

describe('Batch and Customer', () => {
  it('Batch needs a YYYY-MM-DD expiry', () => {
    const batch = { id: randomUUID(), product_id: randomUUID(), supplier_id: null, batch_no: 'B-1', expiry_date: '2027-01-31', cost_price: 40_000, ...scope(), ...meta() };
    expect(Batch.safeParse(batch).success).toBe(true);
    expect(Batch.safeParse({ ...batch, expiry_date: '31/01/2027' }).success).toBe(false);
  });

  it('Customer credit limit cannot be negative', () => {
    const customer = { id: randomUUID(), name_en: 'Rashid', name_ur: null, phone: null, village: 'Kot', credit_limit: 1_000_000, default_price_type: 'retail' as const, notes: null, ...scope(), ...meta() };
    expect(Customer.safeParse(customer).success).toBe(true);
    expect(Customer.safeParse({ ...customer, credit_limit: -1 }).success).toBe(false);
  });
});

describe('Invoice (same rules as the table CHECKs)', () => {
  it('accepts a part-paid credit invoice', () => {
    expect(Invoice.safeParse(invoice()).success).toBe(true);
  });

  it.each([
    ['a total that is not subtotal + tax', { total: 500_001 }],
    ['overpayment', { paid_amount: 500_001 }],
    ['a walk-in sale that is not paid in full', { customer_id: null, paid_amount: 100 }],
    ['a voided invoice with no reason', { status: 'voided' }],
  ])('rejects %s', (_label, patch) => {
    expect(Invoice.safeParse({ ...invoice(), ...patch }).success).toBe(false);
  });

  it('accepts a walk-in sale paid in full, and a properly voided invoice', () => {
    expect(Invoice.safeParse({ ...invoice(), customer_id: null, paid_amount: 500_000 }).success).toBe(true);
    expect(Invoice.safeParse({ ...invoice(), status: 'voided', void_reason: 'entered by mistake', voided_by: randomUUID() }).success).toBe(true);
  });
});

describe('InvoiceItem', () => {
  it('needs a positive whole quantity', () => {
    const item = { id: randomUUID(), invoice_id: randomUUID(), product_id: randomUUID(), batch_id: randomUUID(), qty: 10_000, unit_price: 50_000, cost_price: 40_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 500_000, ...scope(), ...lineMeta() };
    expect(InvoiceItem.safeParse(item).success).toBe(true);
    expect(InvoiceItem.safeParse({ ...item, qty: 0 }).success).toBe(false);
    expect(InvoiceItem.safeParse({ ...item, qty: 1.5 }).success).toBe(false);
  });
});

describe('StockMovement sign rules', () => {
  const movement = (movement_type: string, qty_delta: number) => ({
    id: randomUUID(), batch_id: randomUUID(), qty_delta, movement_type, ref_type: null, ref_id: null, created_by: null, ...scope(), ...lineMeta(),
  });

  it.each([
    ['purchase', 100, true],
    ['purchase', -100, false],
    ['sale', -100, true],
    ['sale', 100, false],
    ['sale_return', 100, true],
    ['damage', -5, true],
    ['adjustment', 5, true],
    ['adjustment', -5, true],
    ['sale', 0, false],
  ])('%s with %i is valid: %s', (type, delta, valid) => {
    expect(StockMovement.safeParse(movement(type, delta)).success).toBe(valid);
  });
});

describe('PublicUser', () => {
  it('drops the password hash so it can go to the UI', () => {
    const user = { id: randomUUID(), name: 'Owner', username: 'owner', password_hash: 'secret', role: 'owner' as const, is_active: 1 as const, ...scope(), ...meta() };
    expect(User.parse(user).password_hash).toBe('secret');
    expect(PublicUser.parse(user)).not.toHaveProperty('password_hash');
  });
});

describe('entitySchemas', () => {
  it('has a schema for each of the 27 tables', () => {
    expect(Object.keys(entitySchemas)).toHaveLength(27);
  });
});
