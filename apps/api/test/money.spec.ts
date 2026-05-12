import { describe, expect, it } from 'vitest';
import {
  calcSubtotalMinor,
  calcTaxMinor,
  calcTotalMinor,
  roundHalfEven,
} from '../src/domain/money.js';
import { InternalError } from '../src/domain/errors.js';

describe('calcSubtotalMinor', () => {
  it('returns 0 for an empty list (function-level ergonomics; Zod blocks at boundary)', () => {
    expect(calcSubtotalMinor([])).toBe(0);
  });

  it('multiplies one line item', () => {
    expect(calcSubtotalMinor([{ quantity: 3, unitPriceMinor: 100 }])).toBe(300);
  });

  it('handles quantity 0 (defensive; Zod forbids upstream)', () => {
    expect(calcSubtotalMinor([{ quantity: 0, unitPriceMinor: 9999 }])).toBe(0);
  });

  it('handles unitPriceMinor 0', () => {
    expect(calcSubtotalMinor([{ quantity: 7, unitPriceMinor: 0 }])).toBe(0);
  });

  it('sums multiple mixed line items', () => {
    expect(
      calcSubtotalMinor([
        { quantity: 2, unitPriceMinor: 1500 },
        { quantity: 1, unitPriceMinor: 250 },
        { quantity: 4, unitPriceMinor: 99 },
      ]),
    ).toBe(3000 + 250 + 396);
  });

  it('handles a large multiplier within MAX_SAFE_INTEGER', () => {
    expect(
      calcSubtotalMinor([{ quantity: 10_000_000, unitPriceMinor: 900_000_000 }]),
    ).toBe(9_000_000_000_000_000);
  });

  it('rejects non-integer quantity', () => {
    expect(() =>
      calcSubtotalMinor([{ quantity: 1.5, unitPriceMinor: 100 }]),
    ).toThrow(InternalError);
  });

  it('rejects non-integer unitPriceMinor', () => {
    expect(() =>
      calcSubtotalMinor([{ quantity: 2, unitPriceMinor: 99.9 }]),
    ).toThrow(InternalError);
  });

  it('asserts on overflow past MAX_SAFE_INTEGER', () => {
    expect(() =>
      calcSubtotalMinor([
        { quantity: 10_000_000, unitPriceMinor: 900_000_000 },
        { quantity: 10_000_000, unitPriceMinor: 900_000_000 },
      ]),
    ).toThrow(InternalError);
  });
});

describe('calcTaxMinor', () => {
  it('returns 0 when taxRateBps is 0', () => {
    expect(calcTaxMinor(123_456, 0)).toBe(0);
  });

  it('returns 0 when subtotalMinor is 0', () => {
    expect(calcTaxMinor(0, 1825)).toBe(0);
  });

  it('rounds non-tie down', () => {
    expect(calcTaxMinor(123, 1234)).toBe(15);
  });

  it('rounds non-tie up', () => {
    expect(calcTaxMinor(127, 1234)).toBe(16);
  });

  it('exact integer multiple needs no rounding (18% of 100 = 18)', () => {
    expect(calcTaxMinor(100, 1800)).toBe(18);
  });

  it('handles taxRateBps = 100000 (1000%) without rounding (exact multiple)', () => {
    expect(calcTaxMinor(7, 100_000)).toBe(70);
  });

  it('CANONICAL half-to-even tie: calcTaxMinor(200, 1825) === 36 (not 37)', () => {
    // 200 * 1825 = 365000; /10000 = 36.5; q=36 even -> bias to even -> 36.
    expect(calcTaxMinor(200, 1825)).toBe(36);
  });

  it('half-to-even tie biases to even neighbour at 600/1825 -> 110', () => {
    // 600 * 1825 = 1_095_000; /10000 = 109.5; q=109 odd -> 110 (even).
    expect(calcTaxMinor(600, 1825)).toBe(110);
  });

  it('half-to-even tie at 1000/1825 -> 182', () => {
    // 1000 * 1825 = 1_825_000; /10000 = 182.5; q=182 even -> 182.
    expect(calcTaxMinor(1000, 1825)).toBe(182);
  });

  it('large multiplier within MAX_SAFE_INTEGER', () => {
    // 1_000_000_000 * 1800 = 1.8e12 (well under MAX_SAFE_INTEGER ~9.007e15).
    expect(calcTaxMinor(1_000_000_000, 1800)).toBe(180_000_000);
  });

  it('rejects non-integer subtotal', () => {
    expect(() => calcTaxMinor(100.5, 1800)).toThrow(InternalError);
  });

  it('rejects non-integer taxRateBps', () => {
    expect(() => calcTaxMinor(100, 18.5)).toThrow(InternalError);
  });
});

describe('calcTotalMinor', () => {
  it('sums positive subtotal and tax', () => {
    expect(calcTotalMinor(1000, 180)).toBe(1180);
  });

  it('returns subtotal when tax is 0', () => {
    expect(calcTotalMinor(2500, 0)).toBe(2500);
  });

  it('returns 0 when both are 0', () => {
    expect(calcTotalMinor(0, 0)).toBe(0);
  });

  it('rejects non-integer subtotal', () => {
    expect(() => calcTotalMinor(100.5, 18)).toThrow(InternalError);
  });

  it('rejects non-integer tax', () => {
    expect(() => calcTotalMinor(100, 18.5)).toThrow(InternalError);
  });
});

describe('roundHalfEven (negative-numerator midpoint coverage)', () => {
  it('LLD M17: roundHalfEven(-15, 10) -> -2 (tie, even neighbour)', () => {
    expect(roundHalfEven(-15, 10)).toBe(-2);
  });

  it('LLD M18: roundHalfEven(-5, 10) -> 0 (tie, even neighbour)', () => {
    expect(roundHalfEven(-5, 10)).toBe(0);
  });

  it('positive tie biases to even (15/10 -> 2)', () => {
    expect(roundHalfEven(15, 10)).toBe(2);
  });

  it('positive tie at 25/10 -> 2 (q=2 even)', () => {
    expect(roundHalfEven(25, 10)).toBe(2);
  });

  it('rejects denominator <= 0', () => {
    expect(() => roundHalfEven(10, 0)).toThrow(InternalError);
    expect(() => roundHalfEven(10, -5)).toThrow(InternalError);
  });
});
