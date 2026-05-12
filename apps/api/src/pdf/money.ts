import type { CurrencyCode } from '@inv/shared';

const SCALE = 2;

const CURRENCY_SYMBOL: Readonly<Record<CurrencyCode, string>> = {
  INR: 'Rs ',
  USD: '$',
  EUR: 'EUR ',
  GBP: 'GBP ',
  AED: 'AED ',
  SGD: 'S$',
};

/**
 * Format an integer minor-unit amount as a currency string for PDF rendering.
 * Integer-math only; mirrors apps/web/src/utils/money.ts. The currency glyphs
 * are rendered as ASCII-safe prefixes to avoid font-embedding requirements in
 * @react-pdf/renderer's default Helvetica.
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
