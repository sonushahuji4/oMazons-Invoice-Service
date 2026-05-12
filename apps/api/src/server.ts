import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerErrorHandler } from './plugins/errors.js';
import { registerInvoiceRoutes } from './routes/invoices.js';
import { PrismaInvoiceRepository } from './repositories/invoice.repository.js';
import { PrismaMonthlyCounterRepository } from './repositories/counter.repository.js';
import { InvoiceService, type Clock } from './services/invoice.service.js';
import { renderInvoicePdf } from './pdf/renderInvoicePdf.js';

const PORT = Number(process.env.PORT ?? 3099);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

const prisma = new PrismaClient();
const invoiceRepo = new PrismaInvoiceRepository();
const counterRepo = new PrismaMonthlyCounterRepository();
const systemClock: Clock = { now: () => new Date() };
const invoiceService = new InvoiceService({
  prisma,
  invoices: invoiceRepo,
  counters: counterRepo,
  clock: systemClock,
  pdfRenderer: renderInvoicePdf,
});

registerErrorHandler(app);

app.get('/health', async () => ({ status: 'ok' as const }));
registerInvoiceRoutes(app, invoiceService);

async function shutdown(): Promise<void> {
  try {
    await app.close();
  } finally {
    await prisma.$disconnect();
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0));
  });
}

app
  .listen({ port: PORT, host: HOST })
  .then(() => {
    app.log.info(`API listening on http://${HOST}:${PORT}`);
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
