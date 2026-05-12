import { z } from 'zod';

// Per-line caps keep quantity * unitPriceMinor <= 1e15 (under MAX_SAFE_INTEGER
// ~= 9.007e15). The aggregate (subtotal * taxRateBps) is then checked at the
// invoice level via superRefine, since per-field caps alone cannot bound
// N-line aggregates without being unrealistically tight.
export const LineItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(10_000),
    unitPriceMinor: z.number().int().min(0).max(100_000_000_000),
  })
  .strict();

export type LineItemInput = z.infer<typeof LineItemInputSchema>;

export const LineItemDtoSchema = z
  .object({
    id: z.string().uuid(),
    description: z.string(),
    quantity: z.number().int(),
    unitPriceMinor: z.number().int(),
    position: z.number().int(),
  })
  .strict();

export type LineItemDTO = z.infer<typeof LineItemDtoSchema>;
