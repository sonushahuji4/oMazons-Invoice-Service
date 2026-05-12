import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, parseYearMonth } from '../src/domain/numbering.js';
import { InternalError } from '../src/domain/errors.js';
import type { MonthlyCounterRepository } from '../src/repositories/counter.repository.js';
import type { Tx } from '../src/repositories/types.js';

/**
 * In-memory MonthlyCounter that mirrors the production UPSERT semantics:
 *   create on first call (returns 1), increment-and-return on subsequent calls.
 * The Tx argument is ignored: this exists solely to model `nextSeq`'s contract
 * for unit tests (LLD §15 permits an in-memory mock here).
 */
class InMemoryCounter implements MonthlyCounterRepository {
  private readonly periods = new Map<string, number>();

  async nextSeq(_tx: Tx, yyyymm: string): Promise<number> {
    const current = this.periods.get(yyyymm) ?? 0;
    const next = current + 1;
    this.periods.set(yyyymm, next);
    return next;
  }

  /** Test-only: peek without incrementing. */
  peek(yyyymm: string): number {
    return this.periods.get(yyyymm) ?? 0;
  }
}

const fakeTx = {} as Tx;

describe('formatInvoiceNumber — format correctness', () => {
  it('zero-pads to 4 digits', () => {
    expect(formatInvoiceNumber('202605', 1)).toBe('INV-202605-0001');
    expect(formatInvoiceNumber('202605', 7)).toBe('INV-202605-0007');
    expect(formatInvoiceNumber('202605', 42)).toBe('INV-202605-0042');
    expect(formatInvoiceNumber('202605', 9999)).toBe('INV-202605-9999');
  });

  it('matches /^INV-\\d{6}-\\d{4,}$/ for typical sequences', () => {
    const re = /^INV-\d{6}-\d{4,}$/;
    expect(re.test(formatInvoiceNumber('202605', 1))).toBe(true);
    expect(re.test(formatInvoiceNumber('202612', 999))).toBe(true);
  });

  it('widens past 4 digits when seq >= 10000', () => {
    expect(formatInvoiceNumber('202605', 10_000)).toBe('INV-202605-10000');
    expect(formatInvoiceNumber('202605', 123_456)).toBe('INV-202605-123456');
  });

  it('rejects malformed yyyymm', () => {
    expect(() => formatInvoiceNumber('20265', 1)).toThrow(InternalError);
    expect(() => formatInvoiceNumber('2026-05', 1)).toThrow(InternalError);
    expect(() => formatInvoiceNumber('abcdef', 1)).toThrow(InternalError);
  });

  it('rejects non-positive sequence', () => {
    expect(() => formatInvoiceNumber('202605', 0)).toThrow(InternalError);
    expect(() => formatInvoiceNumber('202605', -1)).toThrow(InternalError);
    expect(() => formatInvoiceNumber('202605', 1.5)).toThrow(InternalError);
  });
});

describe('parseYearMonth — UTC period derivation', () => {
  it('zero-pads single-digit months', () => {
    expect(parseYearMonth(new Date('2026-01-15T00:00:00Z'))).toBe('202601');
    expect(parseYearMonth(new Date('2026-09-01T12:34:56Z'))).toBe('202609');
  });

  it('handles December (getUTCMonth() = 11)', () => {
    expect(parseYearMonth(new Date('2026-12-31T23:59:59Z'))).toBe('202612');
  });

  it('uses UTC, not local time (cross-midnight UTC boundary)', () => {
    // 2026-05-31 23:55 UTC -> May
    expect(parseYearMonth(new Date('2026-05-31T23:55:00Z'))).toBe('202605');
    // 2026-06-01 00:05 UTC -> June (LLD §5.5 cross-month example)
    expect(parseYearMonth(new Date('2026-06-01T00:05:00Z'))).toBe('202606');
  });

  it('throws on Invalid Date', () => {
    expect(() => parseYearMonth(new Date('not-a-date'))).toThrow(InternalError);
  });
});

describe('Counter monotonicity within a single month', () => {
  it('first call returns 1, then strictly increments', async () => {
    const counter = new InMemoryCounter();
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(2);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(3);
  });

  it('produces a strictly-increasing sequence over many calls', async () => {
    const counter = new InMemoryCounter();
    const N = 100;
    const seqs: number[] = [];
    for (let i = 0; i < N; i++) {
      seqs.push(await counter.nextSeq(fakeTx, '202605'));
    }
    for (let i = 1; i < N; i++) {
      const prev = seqs[i - 1];
      const cur = seqs[i];
      if (prev === undefined || cur === undefined) throw new Error('unreachable');
      expect(cur).toBe(prev + 1);
    }
  });
});

describe('Numbering uniqueness within a month', () => {
  it('100 sequential allocations yield 100 distinct invoice numbers', async () => {
    const counter = new InMemoryCounter();
    const N = 100;
    const numbers = new Set<string>();
    for (let i = 0; i < N; i++) {
      const seq = await counter.nextSeq(fakeTx, '202605');
      numbers.add(formatInvoiceNumber('202605', seq));
    }
    expect(numbers.size).toBe(N);
  });

  it('serialised concurrent allocations remain unique', async () => {
    // The production lock is the row-level lock taken by the UPSERT (LLD §5.2).
    // The in-memory mock serialises naturally because JS is single-threaded;
    // this test models the OUTPUT contract: N concurrent callers each get a
    // distinct sequence in [1..N] and total uniqueness holds.
    const counter = new InMemoryCounter();
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () => counter.nextSeq(fakeTx, '202605')),
    );
    const uniq = new Set(results);
    expect(uniq.size).toBe(N);
    expect(Math.min(...results)).toBe(1);
    expect(Math.max(...results)).toBe(N);
  });
});

describe('Cross-month reset (LLD §5.5)', () => {
  it('switching months resets the per-month counter to 1', async () => {
    const counter = new InMemoryCounter();
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(2);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(3);

    // Switch to a fresh month -> counter starts at 1 again.
    expect(await counter.nextSeq(fakeTx, '202606')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202606')).toBe(2);

    // The previous month's counter is untouched.
    expect(counter.peek('202605')).toBe(3);
  });

  it('formatted numbers reflect cross-month reset to 0001', async () => {
    const counter = new InMemoryCounter();
    for (let i = 0; i < 5; i++) await counter.nextSeq(fakeTx, '202605');
    const juneSeq = await counter.nextSeq(fakeTx, '202606');
    expect(formatInvoiceNumber('202606', juneSeq)).toBe('INV-202606-0001');
  });

  it('three different months keep three independent sequences', async () => {
    const counter = new InMemoryCounter();
    expect(await counter.nextSeq(fakeTx, '202604')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202606')).toBe(1);
    expect(await counter.nextSeq(fakeTx, '202604')).toBe(2);
    expect(await counter.nextSeq(fakeTx, '202606')).toBe(2);
    expect(await counter.nextSeq(fakeTx, '202605')).toBe(2);
    expect(counter.peek('202604')).toBe(2);
    expect(counter.peek('202605')).toBe(2);
    expect(counter.peek('202606')).toBe(2);
  });
});
