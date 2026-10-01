import { describe, expect, it } from 'vitest';
import { allocateBatches, DomainError, fixedClock, todayUtc, validateManualAllocation, type AllocatableBatch, type AllocateRequest } from '../src/index.js';

const today = todayUtc(fixedClock('2026-10-01T12:00:00Z'));
const A: AllocatableBatch = { batch_id: 'A', expiry_date: '2027-01-01', stock: 5000 };
const B: AllocatableBatch = { batch_id: 'B', expiry_date: '2026-12-01', stock: 3000 };
const EXPIRED: AllocatableBatch = { batch_id: 'X', expiry_date: '2020-01-01', stock: 9999 };
const EMPTY: AllocatableBatch = { batch_id: 'E', expiry_date: '2026-11-01', stock: 0 };

const loose = (qty: number, batches: AllocatableBatch[]): AllocateRequest => ({ qty, pack_size: 1000, allow_loose: true, today, batches });
const packs = (qty: number, batches: AllocatableBatch[]): AllocateRequest => ({ qty, pack_size: 1000, allow_loose: false, today, batches });

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : `not a DomainError: ${String(e)}`;
  }
  return undefined;
};

describe('allocateBatches', () => {
  it('takes from the earliest expiry first, whatever the input order', () => {
    expect(allocateBatches(loose(2000, [A, B]))).toEqual([{ batch_id: 'B', qty: 2000 }]);
    expect(allocateBatches(loose(2000, [B, A]))).toEqual([{ batch_id: 'B', qty: 2000 }]);
  });

  it('splits across batches when the first is not enough', () => {
    expect(allocateBatches(loose(4000, [A, B]))).toEqual([
      { batch_id: 'B', qty: 3000 },
      { batch_id: 'A', qty: 1000 },
    ]);
  });

  it('can take everything that is there', () => {
    expect(allocateBatches(loose(8000, [A, B]))).toEqual([
      { batch_id: 'B', qty: 3000 },
      { batch_id: 'A', qty: 5000 },
    ]);
  });

  it('skips expired and empty batches', () => {
    expect(allocateBatches(loose(1000, [EXPIRED, EMPTY, A]))).toEqual([{ batch_id: 'A', qty: 1000 }]);
  });

  it('never sells from an expired batch even when it is the only stock', () => {
    expect(code(() => allocateBatches(loose(1000, [EXPIRED])))).toBe('INSUFFICIENT_STOCK');
  });

  it('a batch that expires today can still be sold; one that expired yesterday cannot', () => {
    const todayBatch = { batch_id: 'T', expiry_date: today, stock: 1000 };
    const yesterday = { batch_id: 'Y', expiry_date: '2026-09-30', stock: 1000 };
    expect(allocateBatches(loose(1000, [todayBatch]))).toEqual([{ batch_id: 'T', qty: 1000 }]);
    expect(code(() => allocateBatches(loose(1000, [yesterday])))).toBe('INSUFFICIENT_STOCK');
  });

  it('follows the clock: a batch is sellable all of its last day and expired from the next UTC midnight', () => {
    const lastDay = { batch_id: 'L', expiry_date: '2026-10-01', stock: 1000 };
    const at = (iso: string) => ({ ...loose(1000, [lastDay]), today: todayUtc(fixedClock(iso)) });
    expect(allocateBatches(at('2026-10-01T00:00:00.000Z'))).toEqual([{ batch_id: 'L', qty: 1000 }]);
    expect(allocateBatches(at('2026-10-01T23:59:59.999Z'))).toEqual([{ batch_id: 'L', qty: 1000 }]);
    expect(code(() => allocateBatches(at('2026-10-02T00:00:00.000Z')))).toBe('INSUFFICIENT_STOCK');
  });

  it('blocks a sale bigger than the sellable stock and says how much there is', () => {
    expect(code(() => allocateBatches(loose(9000, [A, B, EXPIRED])))).toBe('INSUFFICIENT_STOCK');
    expect(() => allocateBatches(loose(9000, [A, B, EXPIRED]))).toThrow(/only 8000 available/);
  });

  it('breaks an expiry tie by batch id so the answer is always the same', () => {
    const x = { batch_id: 'x', expiry_date: '2027-01-01', stock: 1000 };
    const y = { batch_id: 'y', expiry_date: '2027-01-01', stock: 1000 };
    expect(allocateBatches(loose(1000, [y, x]))).toEqual([{ batch_id: 'x', qty: 1000 }]);
  });

  it('does not change the batches it was given', () => {
    const batches = [A, B];
    allocateBatches(loose(4000, batches));
    expect(batches).toEqual([A, B]);
  });

  it('rejects a zero, negative or fractional quantity', () => {
    for (const qty of [0, -1, 1.5]) expect(code(() => allocateBatches(loose(qty, [A])))).toBe('INVALID_QUANTITY');
  });

  describe('pack-only products', () => {
    it('refuse a loose quantity', () => {
      expect(code(() => allocateBatches(packs(500, [A])))).toBe('WHOLE_PACKS_ONLY');
    });

    it('split in whole packs only', () => {
      const result = allocateBatches(packs(4000, [A, B]));
      expect(result).toEqual([
        { batch_id: 'B', qty: 3000 },
        { batch_id: 'A', qty: 1000 },
      ]);
      expect(result.every((r) => r.qty % 1000 === 0)).toBe(true);
    });

    it('ignore the part-pack left over in a batch', () => {
      const odd = { batch_id: 'O', expiry_date: '2026-11-01', stock: 2500 }; // 2 whole packs + 500 loose
      expect(allocateBatches(packs(3000, [odd, A]))).toEqual([
        { batch_id: 'O', qty: 2000 },
        { batch_id: 'A', qty: 1000 },
      ]);
      expect(code(() => allocateBatches(packs(3000, [odd])))).toBe('INSUFFICIENT_STOCK');
    });
  });
});

describe('validateManualAllocation (manual batch override)', () => {
  it('accepts a valid choice, even if it is not the earliest expiry', () => {
    const manual = [{ batch_id: 'A', qty: 2000 }];
    expect(validateManualAllocation(loose(2000, [A, B]), manual)).toEqual(manual);
  });

  it('accepts a choice split over several batches', () => {
    const manual = [
      { batch_id: 'A', qty: 1000 },
      { batch_id: 'B', qty: 1000 },
    ];
    expect(validateManualAllocation(loose(2000, [A, B]), manual)).toEqual(manual);
  });

  it('accepts a batch that expires today, rejects one that expired yesterday', () => {
    const todayBatch = { batch_id: 'T', expiry_date: today, stock: 1000 };
    const yesterday = { batch_id: 'Y', expiry_date: '2026-09-30', stock: 1000 };
    const manual = (id: string) => [{ batch_id: id, qty: 1000 }];
    expect(validateManualAllocation(loose(1000, [todayBatch, yesterday]), manual('T'))).toEqual(manual('T'));
    expect(code(() => validateManualAllocation(loose(1000, [todayBatch, yesterday]), manual('Y')))).toBe('BATCH_EXPIRED');
  });

  it.each([
    ['an expired batch', loose(1000, [EXPIRED, A]), [{ batch_id: 'X', qty: 1000 }], 'BATCH_EXPIRED'],
    ['more than the batch holds', loose(4000, [A, B]), [{ batch_id: 'B', qty: 4000 }], 'INSUFFICIENT_STOCK'],
    ['quantities that do not add up to the request', loose(2000, [A, B]), [{ batch_id: 'A', qty: 1000 }], 'ALLOCATION_MISMATCH'],
    ['the same batch twice', loose(2000, [A, B]), [{ batch_id: 'A', qty: 1000 }, { batch_id: 'A', qty: 1000 }], 'DUPLICATE_LINE'],
    ['a batch of another product', loose(1000, [A]), [{ batch_id: 'ZZZ', qty: 1000 }], 'BATCH_NOT_AVAILABLE'],
    ['a loose quantity of a pack-only product', packs(2000, [A, B]), [{ batch_id: 'A', qty: 500 }, { batch_id: 'B', qty: 1500 }], 'WHOLE_PACKS_ONLY'],
    ['a zero quantity', loose(1000, [A]), [{ batch_id: 'A', qty: 0 }], 'INVALID_QUANTITY'],
  ])('rejects %s', (_label, req, manual, expected) => {
    expect(code(() => validateManualAllocation(req, manual))).toBe(expected);
  });
});
