import type { CurrencyCode } from '@inv/shared';

/**
 * Curated 2-decimal currencies — matches CurrencyCodeSchema in @inv/shared.
 * Every supported currency has scale 2; we therefore split at -2 always.
 */
const SCALE = 2;

const CURRENCY_SYMBOL: Readonly<Record<CurrencyCode, string>> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  SGD: 'S$',
};

/**
 * Format an integer minor-unit amount as a localised currency string.
 * Integer-math only — no parseFloat, no Number / 100, no toFixed.
 *
 * @param minor integer minor units (may be negative)
 * @param currency ISO 4217 code; one of the curated 2-decimal set
 */
export function formatMinor(minor: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const negative = minor < 0;
  const abs = negative ? -minor : minor;
  const raw = String(abs).padStart(SCALE + 1, '0');
  const cut = raw.length - SCALE;
  const wholeDigits = raw.slice(0, cut);
  const fractionDigits = raw.slice(cut);
  const wholeWithSeparators = insertThousandsSeparators(wholeDigits);
  const sign = negative ? '-' : '';
  return `${sign}${symbol}${wholeWithSeparators}.${fractionDigits}`;
}

function insertThousandsSeparators(digits: string): string {
  if (digits.length <= 3) return digits;
  const groups: string[] = [];
  let i = digits.length;
  while (i > 3) {
    groups.unshift(digits.slice(i - 3, i));
    i -= 3;
  }
  groups.unshift(digits.slice(0, i));
  return groups.join(',');
}

/**
 * Convert a user-entered major-unit decimal string (e.g. "50.00", "5", "5.5")
 * to an integer minor-unit amount. Integer-math only — string split, pad,
 * concatenate, parseInt. No parseFloat, no Number * 100.
 *
 * Returns null if the input is malformed (non-digit chars beyond a single '.',
 * empty, or fractional scale exceeded).
 */
export function parseMajorToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (body.length === 0) return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(body)) return null;
  const parts = body.split('.');
  const wholePart = parts[0] ?? '';
  const fractionPart = parts[1] ?? '';
  if (fractionPart.length > SCALE) return null;
  const paddedFraction = fractionPart.padEnd(SCALE, '0');
  const combined = `${wholePart}${paddedFraction}`;
  if (combined.length === 0) return null;
  const minor = Number.parseInt(combined, 10);
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}
