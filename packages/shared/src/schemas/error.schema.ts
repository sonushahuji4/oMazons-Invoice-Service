import { z } from 'zod';
import { InvoiceStatusSchema } from './invoice.schema.js';

const BaseError = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export const ErrorDTOSchema = z.discriminatedUnion('error', [
  BaseError.extend({
    error: z.literal('VALIDATION_FAILED'),
    issues: z
      .array(
        z.object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
          code: z.string(),
        }),
      )
      .optional(),
  }),
  BaseError.extend({
    error: z.literal('INVOICE_NOT_FOUND'),
    id: z.string(),
  }),
  BaseError.extend({
    error: z.literal('INVALID_TRANSITION'),
    from: InvoiceStatusSchema,
    to: InvoiceStatusSchema,
  }),
  BaseError.extend({
    error: z.literal('PDF_NOT_AVAILABLE_FOR_DRAFT'),
    currentStatus: InvoiceStatusSchema,
  }),
  BaseError.extend({
    error: z.literal('NUMBER_COLLISION'),
  }),
  BaseError.extend({
    error: z.literal('INTERNAL_ERROR'),
  }),
]);

export type ErrorDTO = z.infer<typeof ErrorDTOSchema>;
