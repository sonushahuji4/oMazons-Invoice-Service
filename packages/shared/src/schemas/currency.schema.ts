import { z } from 'zod';

export const CurrencyCodeSchema = z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']);

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
