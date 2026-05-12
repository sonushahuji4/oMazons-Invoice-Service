import { renderToBuffer } from '@react-pdf/renderer';
import type { InvoiceDTO } from '@inv/shared';
import { InvoiceDocument } from './InvoiceDocument.js';

/**
 * Render an InvoiceDTO to a PDF byte buffer. Pure function — no Fastify, no
 * Prisma, no environment access. The renderer is the only consumer of React /
 * @react-pdf/renderer in the codebase.
 *
 * Avoids JSX in this .ts entry point by invoking InvoiceDocument as a plain
 * function call; the returned <Document> element is what @react-pdf/renderer's
 * renderToBuffer signature expects.
 */
export async function renderInvoicePdf(invoice: InvoiceDTO): Promise<Buffer> {
  return renderToBuffer(InvoiceDocument({ invoice }));
}
