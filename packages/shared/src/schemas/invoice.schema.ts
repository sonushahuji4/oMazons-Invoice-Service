import { z } from 'zod';
import { CurrencyCodeSchema } from './currency.schema.js';
import { LineItemDtoSchema, LineItemInputSchema } from './lineItem.schema.js';

export const InvoiceStatusSchema = z.enum(['draft', 'issued', 'paid', 'void']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// MAX_SAFE_INTEGER is 2^53 - 1 = 9_007_199_254_740_991 (~9.007e15). The
// aggregate tax numerator (subtotal * taxRateBps) must stay inside it so
// domain/money.ts never throws InternalError. We refine here at the schema
// boundary so the failure surfaces as a 400 VALIDATION_FAILED, not a 500.
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export const CreateInvoiceInputSchema = z
  .object({
    customerName: z.string().trim().min(1).max(200),
    customerEmail: z.string().trim().email().max(320),
    currency: CurrencyCodeSchema,
    taxRateBps: z.number().int().min(0).max(100000),
    dueAt: z.string().datetime({ offset: true }).optional(),
    lineItems: z.array(LineItemInputSchema).min(1).max(200),
  })
  .strict()
  .superRefine((val, ctx) => {
    let subtotal = 0;
    for (let i = 0; i < val.lineItems.length; i += 1) {
      const li = val.lineItems[i];
      if (li === undefined) continue;
      const product = li.quantity * li.unitPriceMinor;
      if (product > MAX_SAFE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems', i],
          message: 'quantity * unitPriceMinor exceeds safe integer range',
        });
        return;
      }
      subtotal += product;
      if (subtotal > MAX_SAFE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems'],
          message: 'aggregate subtotal exceeds safe integer range',
        });
        return;
      }
    }
    if (subtotal * val.taxRateBps > MAX_SAFE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxRateBps'],
        message: 'subtotal * taxRateBps exceeds safe integer range',
      });
    }
  });

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;

export const TransitionStatusInputSchema = z
  .object({
    to: InvoiceStatusSchema,
  })
  .strict();

export type TransitionStatusInput = z.infer<typeof TransitionStatusInputSchema>;

export const InvoiceDTOSchema = z
  .object({
    id: z.string().uuid(),
    number: z.string().nullable(),
    customerName: z.string(),
    customerEmail: z.string(),
    currency: CurrencyCodeSchema,
    taxRateBps: z.number().int(),
    subtotalMinor: z.number().int(),
    taxMinor: z.number().int(),
    totalMinor: z.number().int(),
    status: InvoiceStatusSchema,
    issuedAt: z.string().datetime().nullable(),
    dueAt: z.string().datetime().nullable(),
    paidAt: z.string().datetime().nullable(),
    voidedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lineItems: z.array(LineItemDtoSchema),
  })
  .strict();

export type InvoiceDTO = z.infer<typeof InvoiceDTOSchema>;

export const ListInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: InvoiceStatusSchema.optional(),
  })
  .strict();

export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;

export const PaginatedInvoicesDTOSchema = z
  .object({
    data: z.array(InvoiceDTOSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
  })
  .strict();

export type PaginatedInvoicesDTO = z.infer<typeof PaginatedInvoicesDTOSchema>;
