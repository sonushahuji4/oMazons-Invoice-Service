import { InternalError } from './errors.js';

const YYYYMM_RE = /^\d{6}$/;

/**
 * Format an invoice number from a UTC period and 1-based monthly sequence.
 * @param yyyymm 6-digit "YYYYMM"
 * @param seq positive integer; widens past 4 digits when seq ≥ 10000
 */
export function formatInvoiceNumber(yyyymm: string, seq: number): string {
  if (!YYYYMM_RE.test(yyyymm)) {
    throw new InternalError(`formatInvoiceNumber: bad yyyymm "${yyyymm}"`);
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new InternalError(`formatInvoiceNumber: seq must be positive integer, got ${seq}`);
  }
  return `INV-${yyyymm}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Derive UTC "YYYYMM" from a Date. Pure (caller supplies the Date).
 */
export function parseYearMonth(date: Date): string {
  const t = date.getTime();
  if (Number.isNaN(t)) {
    throw new InternalError('parseYearMonth: Invalid Date');
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year.toString().padStart(4, '0')}${month.toString().padStart(2, '0')}`;
}
