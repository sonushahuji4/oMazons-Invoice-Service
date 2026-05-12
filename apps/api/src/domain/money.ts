import { InternalError } from './errors.js';

/**
 * Branded integer minor-unit money. Storage `Int`, in-memory `number`.
 */
export type Minor = number & { readonly __brand: 'Minor' };

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_SAFE) {
    throw new InternalError(`${label} is not a safe integer: ${value}`);
  }
}

/**
 * Half-to-even (banker's) rounding of an integer ratio numerator/denominator.
 * Integer math only: no Math.round, no toFixed, no parseFloat.
 *
 * Algorithm (LLD §3.5):
 *   q = trunc(numerator / denominator)
 *   r = numerator - q * denominator
 *   2*|r| <  denominator → q
 *   2*|r| >  denominator → q + sign(numerator)
 *   2*|r| === denominator (tie) → q if q even, else q + sign(numerator)
 */
export function roundHalfEven(numerator: number, denominator: number): number {
  if (!Number.isInteger(denominator) || denominator <= 0) {
    throw new InternalError(`roundHalfEven: denominator must be positive integer, got ${denominator}`);
  }
  if (!Number.isInteger(numerator)) {
    throw new InternalError(`roundHalfEven: numerator must be integer, got ${numerator}`);
  }

  const q = Math.trunc(numerator / denominator);
  const r = numerator - q * denominator;
  const twiceR = Math.abs(r) * 2;
  const sign = numerator < 0 ? -1 : 1;

  // Normalize -0 (Math.trunc(-5/10) is -0 in IEEE-754) to +0 so callers
  // never see negative zero in monetary results.
  const norm = (n: number): number => (n === 0 ? 0 : n);

  if (twiceR < denominator) return norm(q);
  if (twiceR > denominator) return norm(q + sign);
  // exact midpoint: bias to even
  if (q % 2 === 0) return norm(q);
  return norm(q + sign);
}

/**
 * Sum of (quantity × unitPriceMinor) across line items.
 * @returns @minor integer ≥ 0
 */
export function calcSubtotalMinor(
  items: ReadonlyArray<{ readonly quantity: number; readonly unitPriceMinor: number }>,
): number {
  let sum = 0;
  for (const item of items) {
    assertSafeInteger(item.quantity, 'quantity');
    assertSafeInteger(item.unitPriceMinor, 'unitPriceMinor');
    const product = item.quantity * item.unitPriceMinor;
    assertSafeInteger(product, 'lineItem product');
    sum += product;
    assertSafeInteger(sum, 'subtotal running sum');
  }
  return sum;
}

/**
 * Apply tax rate (bps) to a minor-unit subtotal using half-to-even rounding.
 * Canonical tie: calcTaxMinor(200, 1825) === 36.
 * @param subtotalMinor @minor integer ≥ 0
 * @param taxRateBps integer in [0, 100000]; 1800 = 18%
 * @returns @minor integer ≥ 0
 */
export function calcTaxMinor(subtotalMinor: number, taxRateBps: number): number {
  assertSafeInteger(subtotalMinor, 'subtotalMinor');
  assertSafeInteger(taxRateBps, 'taxRateBps');
  const numerator = subtotalMinor * taxRateBps;
  assertSafeInteger(numerator, 'tax numerator');
  return roundHalfEven(numerator, 10000);
}

/**
 * Sum subtotal and tax.
 * @returns @minor
 */
export function calcTotalMinor(subtotalMinor: number, taxMinor: number): number {
  assertSafeInteger(subtotalMinor, 'subtotalMinor');
  assertSafeInteger(taxMinor, 'taxMinor');
  const total = subtotalMinor + taxMinor;
  assertSafeInteger(total, 'total');
  return total;
}
