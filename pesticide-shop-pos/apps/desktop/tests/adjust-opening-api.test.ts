// Phase 6 wrap-up: khata:adjustOpening through the REAL main-process handlers and a real SQLite database.
import { randomUUID } from 'node:crypto';
import { contract } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeShop, type Shop } from './support.js';

const failureOf = async (p: Promise<unknown>): Promise<DomainError> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a failure');
};

describe('khata:adjustOpening', () => {
  let shop: Shop;
  const h = () => shop.runtime.handlers;
  const sajid = () => shop.demo.customers['sajid']!;
  const sql = (q: string, ...p: unknown[]) => shop.runtime.db.prepare(q);
  const ledger = () => sql('SELECT entry_type, amount_delta, created_by, seq FROM ledger_entries WHERE party_id = ? ORDER BY rowid').all(sajid()) as { entry_type: string; amount_delta: number; created_by: string; seq: number }[];

  beforeEach(async () => {
    shop = await makeShop();
    await shop.signInAs('owner');
    await h()['khata:setOpeningBalance']({ customer_id: sajid(), amount: 250_000 });
  });
  afterEach(() => shop.runtime.close());

  it('the owner corrects the opening balance: one adjustment row, one audit row by the SESSION user, the new balance in the reply', async () => {
    const reply = await h()['khata:adjustOpening']({ customer_id: sajid(), delta: -50_000, reason: 'Entered Rs 500 too much' });
    expect(reply).toMatchObject({ balance_before: 250_000, balance: 200_000 });
    const rows = ledger();
    expect(rows.map((r) => [r.entry_type, r.amount_delta])).toEqual([['opening', 250_000], ['adjustment', -50_000]]);
    expect(rows[1]!.created_by).toBe(shop.ownerId);
    expect(rows[1]!.seq).toBeGreaterThan(rows[0]!.seq);
    const audit = sql("SELECT user_id, details FROM audit_log WHERE action = 'opening_balance_adjusted'").all() as { user_id: string; details: string }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]!.user_id).toBe(shop.ownerId);
    expect(JSON.parse(audit[0]!.details)).toMatchObject({ reason: 'Entered Rs 500 too much', before: 250_000, after: 200_000, delta: -50_000 });
    const st = await h()['khata:statement']({ customer_id: sajid() });
    expect(st.lines.map((l) => l.label)).toEqual(['opening', 'adjustment']);
    expect(st.closing_balance).toBe(200_000);
  });

  it('staff are refused with the capability named, and nothing is written', async () => {
    await shop.signOut();
    await shop.signInAs('staff');
    const error = await failureOf(h()['khata:adjustOpening']({ customer_id: sajid(), delta: -1, reason: 'x' }));
    expect(error.code).toBe('NOT_AUTHORIZED');
    expect(error.params).toEqual({ capability: 'khata.openingBalance' });
    expect(ledger()).toHaveLength(1);
  });

  it('nobody signed in: NOT_SIGNED_IN, nothing written', async () => {
    await shop.signOut();
    expect((await failureOf(h()['khata:adjustOpening']({ customer_id: sajid(), delta: -1, reason: 'x' }))).code).toBe('NOT_SIGNED_IN');
    expect(ledger()).toHaveLength(1);
  });

  it('the schema is strict: no identity, no date, no extra key', () => {
    const good = { customer_id: randomUUID(), delta: -5, reason: 'typo' };
    expect(contract['khata:adjustOpening'].input.safeParse(good).success).toBe(true);
    for (const key of ['created_by', 'actor_id', 'actor', 'user_id', 'approved_by', 'privileged', 'role', 'entry_date', 'amount', 'surprise']) {
      expect(contract['khata:adjustOpening'].input.safeParse({ ...good, [key]: randomUUID() }).success, key).toBe(false);
    }
    for (const bad of [{ delta: 0 }, { delta: 1.5 }, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(201) }, { delta: 1_000_000_000_001 }]) {
      expect(contract['khata:adjustOpening'].input.safeParse({ ...good, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('a customer with no opening balance gets NO_OPENING_BALANCE', async () => {
    const other = shop.demo.customers['rashid']!;
    const before = (sql("SELECT COUNT(*) AS c FROM ledger_entries WHERE party_id = ? AND entry_type = 'opening'").get(other) as { c: number }).c;
    if (before === 0) {
      expect((await failureOf(h()['khata:adjustOpening']({ customer_id: other, delta: 5, reason: 'x' }))).code).toBe('NO_OPENING_BALANCE');
    }
    const noOpening = (await h()['customers:create']({ fields: { name_en: 'Fresh Farmer' } })).customer.id;
    expect((await failureOf(h()['khata:adjustOpening']({ customer_id: noOpening, delta: 5, reason: 'x' }))).code).toBe('NO_OPENING_BALANCE');
  });

  it('the reply holds no cost, margin or profit', async () => {
    const reply = await h()['khata:adjustOpening']({ customer_id: sajid(), delta: 100, reason: 'x' });
    expect(Object.keys(reply).sort()).toEqual(['balance', 'balance_before', 'entry_id']);
  });
});
