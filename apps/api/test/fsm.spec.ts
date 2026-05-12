import { describe, expect, it } from 'vitest';
import type { InvoiceStatus } from '@inv/shared';
import { isAllowedTransition, transitionStatus } from '../src/domain/fsm.js';
import { FsmError } from '../src/domain/errors.js';

const STATUSES: ReadonlyArray<InvoiceStatus> = ['draft', 'issued', 'paid', 'void'];

const ALLOWED: ReadonlyArray<readonly [InvoiceStatus, InvoiceStatus]> = [
  ['draft', 'issued'],
  ['issued', 'paid'],
  ['issued', 'void'],
];

function isAllowedPair(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to);
}

describe('FSM coverage matrix (4x4 = 16 pairs)', () => {
  it('exercises exactly 16 from->to pairs', () => {
    const pairs = STATUSES.flatMap((f) => STATUSES.map((t) => [f, t] as const));
    expect(pairs).toHaveLength(16);
  });

  it('lists exactly 3 allowed pairs', () => {
    expect(ALLOWED).toHaveLength(3);
  });
});

describe('transitionStatus — allowed transitions (3 pairs)', () => {
  for (const [from, to] of ALLOWED) {
    it(`${from} -> ${to} is allowed`, () => {
      const result = transitionStatus(from, to);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(to);
      }
    });
  }
});

describe('transitionStatus — disallowed transitions (13 pairs)', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (isAllowedPair(from, to)) continue;
      it(`${from} -> ${to} rejects with FsmError`, () => {
        const result = transitionStatus(from, to);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(FsmError);
          expect(result.error.code).toBe('INVALID_TRANSITION');
          expect(result.error.httpStatus).toBe(409);
          expect(result.error.from).toBe(from);
          expect(result.error.to).toBe(to);
        }
      });
    }
  }
});

describe('transitionStatus — categorical edge cases (LLD §3.8)', () => {
  it('all four self-loops reject', () => {
    for (const s of STATUSES) {
      const result = transitionStatus(s, s);
      expect(result.ok).toBe(false);
    }
  });

  it('paid is terminal: paid -> void rejects', () => {
    const result = transitionStatus('paid', 'void');
    expect(result.ok).toBe(false);
  });

  it('void is terminal: void -> issued rejects', () => {
    const result = transitionStatus('void', 'issued');
    expect(result.ok).toBe(false);
  });

  it('no backward: issued -> draft rejects', () => {
    const result = transitionStatus('issued', 'draft');
    expect(result.ok).toBe(false);
  });

  it('no skip: draft -> paid rejects', () => {
    const result = transitionStatus('draft', 'paid');
    expect(result.ok).toBe(false);
  });
});

describe('isAllowedTransition (boolean view)', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const expected = isAllowedPair(from, to);
      it(`${from} -> ${to} -> ${expected}`, () => {
        expect(isAllowedTransition(from, to)).toBe(expected);
      });
    }
  }
});
