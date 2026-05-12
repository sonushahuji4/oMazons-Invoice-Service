import type { Tx } from './types.js';

export interface MonthlyCounterRepository {
  /**
   * Atomically allocate the next sequence for a YYYYMM period.
   * Single-row UPSERT with `value = value + 1`; the row-level lock acquired by the UPDATE
   * branch serialises concurrent issuers in the same UTC month (LLD §5.2).
   * Caller MUST pass a transaction client so the increment rolls back atomically with the
   * Invoice update.
   */
  nextSeq(tx: Tx, yyyymm: string): Promise<number>;
}

export class PrismaMonthlyCounterRepository implements MonthlyCounterRepository {
  async nextSeq(tx: Tx, yyyymm: string): Promise<number> {
    const row = await tx.monthlyCounter.upsert({
      where: { period: yyyymm },
      create: { period: yyyymm, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return row.value;
  }
}
