import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateInvoiceInputSchema,
  ListInvoicesQuerySchema,
  TransitionStatusInputSchema,
} from '@inv/shared';
import type { InvoiceService } from '../services/invoice.service.js';

const IdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export function registerInvoiceRoutes(app: FastifyInstance, svc: InvoiceService): void {
  app.post('/invoices', async (req, reply) => {
    const body = CreateInvoiceInputSchema.parse(req.body);
    const dto = await svc.createInvoice(body);
    return reply.code(201).send(dto);
  });

  app.get('/invoices', async (req) => {
    const query = ListInvoicesQuerySchema.parse(req.query);
    return svc.listInvoices(query);
  });

  app.get('/invoices/:id', async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return svc.getInvoice(id);
  });

  app.post('/invoices/:id/transition', async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const { to } = TransitionStatusInputSchema.parse(req.body);
    return svc.transition(id, to);
  });

  app.get('/invoices/:id/pdf', async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const { buffer, dto } = await svc.renderPdf(id);
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="invoice-${dto.number ?? dto.id}.pdf"`)
      .send(buffer);
  });
}
