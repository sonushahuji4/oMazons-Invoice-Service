import type { PrismaClient } from '@prisma/client';
import {
  CurrencyCodeSchema,
  type CreateInvoiceInput,
  type InvoiceDTO,
  type InvoiceStatus,
  type LineItemDTO,
  type ListInvoicesQuery,
  type PaginatedInvoicesDTO,
} from '@inv/shared';
import { InternalError, NotFoundError, PdfNotAvailableError, ValidationError } from '../domain/errors.js';
import { transitionStatus } from '../domain/fsm.js';
import { calcSubtotalMinor, calcTaxMinor, calcTotalMinor } from '../domain/money.js';
import { formatInvoiceNumber, parseYearMonth } from '../domain/numbering.js';
import type {
  InvoiceRepository,
  InvoiceWithLineItems,
  StatusUpdate,
} from '../repositories/invoice.repository.js';
import type { MonthlyCounterRepository } from '../repositories/counter.repository.js';
import type { Tx } from '../repositories/types.js';

export interface Clock {
  now(): Date;
}

export type PdfRenderer = (invoice: InvoiceDTO) => Promise<Buffer>;

export interface InvoiceServiceDeps {
  readonly prisma: PrismaClient;
  readonly invoices: InvoiceRepository;
  readonly counters: MonthlyCounterRepository;
  readonly clock: Clock;
  readonly pdfRenderer: PdfRenderer;
}

type IssuableStatus = Exclude<InvoiceStatus, 'draft'>;

export class InvoiceService {
  constructor(private readonly deps: InvoiceServiceDeps) {}

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceDTO> {
    const subtotalMinor = calcSubtotalMinor(input.lineItems);
    const taxMinor = calcTaxMinor(subtotalMinor, input.taxRateBps);
    const totalMinor = calcTotalMinor(subtotalMinor, taxMinor);

    const persisted = await this.deps.prisma.$transaction((tx) =>
      this.deps.invoices.create(tx, {
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        currency: input.currency,
        taxRateBps: input.taxRateBps,
        subtotalMinor,
        taxMinor,
        totalMinor,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        lineItems: input.lineItems.map((li, idx) => ({
          description: li.description,
          quantity: li.quantity,
          unitPriceMinor: li.unitPriceMinor,
          position: idx,
        })),
      }),
    );
    return toInvoiceDTO(persisted);
  }

  async getInvoice(id: string): Promise<InvoiceDTO> {
    const row = await this.deps.invoices.findById(this.deps.prisma, id);
    if (row === null) throw new NotFoundError(id);
    return toInvoiceDTO(row);
  }

  async listInvoices(query: ListInvoicesQuery): Promise<PaginatedInvoicesDTO> {
    const { items, total } = await this.deps.invoices.list(this.deps.prisma, {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      data: items.map(toInvoiceDTO),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async renderPdf(id: string): Promise<{ buffer: Buffer; dto: InvoiceDTO }> {
    const row = await this.deps.invoices.findById(this.deps.prisma, id);
    if (row === null) throw new NotFoundError(id);
    if (row.status === 'draft') throw new PdfNotAvailableError(row.status);
    const dto = toInvoiceDTO(row);
    const buffer = await this.deps.pdfRenderer(dto);
    return { buffer, dto };
  }

  async transition(id: string, to: InvoiceStatus): Promise<InvoiceDTO> {
    const updated = await this.deps.prisma.$transaction(async (tx) => {
      const current = await this.deps.invoices.findById(tx, id);
      if (current === null) throw new NotFoundError(id);

      const result = transitionStatus(current.status, to);
      if (!result.ok) throw result.error;

      const now = this.deps.clock.now();
      const patch = await this.buildPatch(tx, current, result.value, now);
      return this.deps.invoices.updateStatus(tx, id, patch);
    });
    return toInvoiceDTO(updated);
  }

  private async buildPatch(
    tx: Tx,
    current: InvoiceWithLineItems,
    to: IssuableStatus,
    now: Date,
  ): Promise<StatusUpdate> {
    switch (to) {
      case 'issued': {
        if (current.dueAt === null) {
          throw new ValidationError('dueAt is required when issuing an invoice', [
            { path: ['dueAt'], message: 'dueAt must be set before issuing' },
          ]);
        }
        if (current.dueAt.getTime() < now.getTime()) {
          throw new ValidationError('dueAt must be on or after issuedAt', [
            { path: ['dueAt'], message: 'dueAt cannot be earlier than the moment of issue' },
          ]);
        }
        const yyyymm = parseYearMonth(now);
        const seq = await this.deps.counters.nextSeq(tx, yyyymm);
        const number = formatInvoiceNumber(yyyymm, seq);
        return { status: 'issued', number, issuedAt: now };
      }
      case 'paid':
        return { status: 'paid', paidAt: now };
      case 'void':
        return { status: 'void', voidedAt: now };
      default:
        return exhaustive(to);
    }
  }
}

function exhaustive(_: never): never {
  throw new Error('Unreachable transition target');
}

function toInvoiceDTO(row: InvoiceWithLineItems): InvoiceDTO {
  const lineItems: LineItemDTO[] = [...row.lineItems]
    .sort((a, b) => a.position - b.position)
    .map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPriceMinor: li.unitPriceMinor,
      position: li.position,
    }));
  const currencyParse = CurrencyCodeSchema.safeParse(row.currency);
  if (!currencyParse.success) {
    throw new InternalError(`Stored currency "${row.currency}" not in curated ISO 4217 set`);
  }
  return {
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    currency: currencyParse.data,
    taxRateBps: row.taxRateBps,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    status: row.status,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lineItems,
  };
}
