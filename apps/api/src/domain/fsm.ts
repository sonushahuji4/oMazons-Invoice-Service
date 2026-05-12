import type { InvoiceStatus } from '@inv/shared';
import { FsmError } from './errors.js';
import { err, ok, type Result } from './result.js';

function exhaustive(_: never): never {
  throw new Error('Unreachable FSM state');
}

/**
 * Total function over InvoiceStatus × InvoiceStatus.
 * Allowed:
 *   draft  → issued
 *   issued → paid
 *   issued → void
 * Any other pair (incl. self-loops, terminal escape, backward) → FsmError.
 */
export function transitionStatus(
  from: InvoiceStatus,
  to: InvoiceStatus,
): Result<Exclude<InvoiceStatus, 'draft'>, FsmError> {
  switch (from) {
    case 'draft':
      switch (to) {
        case 'issued':
          return ok(to);
        case 'draft':
        case 'paid':
        case 'void':
          return err(new FsmError(from, to));
        default:
          return exhaustive(to);
      }
    case 'issued':
      switch (to) {
        case 'paid':
        case 'void':
          return ok(to);
        case 'draft':
        case 'issued':
          return err(new FsmError(from, to));
        default:
          return exhaustive(to);
      }
    case 'paid':
      switch (to) {
        case 'draft':
        case 'issued':
        case 'paid':
        case 'void':
          return err(new FsmError(from, to));
        default:
          return exhaustive(to);
      }
    case 'void':
      switch (to) {
        case 'draft':
        case 'issued':
        case 'paid':
        case 'void':
          return err(new FsmError(from, to));
        default:
          return exhaustive(to);
      }
    default:
      return exhaustive(from);
  }
}

/** Boolean view of `transitionStatus` (no error allocation). */
export function isAllowedTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return transitionStatus(from, to).ok;
}
