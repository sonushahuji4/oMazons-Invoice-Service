import { Prisma, type Invoice as PrismaInvoice, type LineItem as PrismaLineItem } from '@prisma/client';
import type { InvoiceStatus } from '@inv/shared';
import { InternalError, NotFoundError, UniqueViolationError } from '../domain/errors.js';
import type { Db, Tx } from './types.js';

export interface PersistedInvoiceInput {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly currency: string;
  readonly taxRateBps: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly dueAt: Date | null;
  readonly lineItems: ReadonlyArray<{
    readonly description: string;
    readonly quantity: number;
    readonly unitPriceMinor: number;
    readonly position: number;
  }>;
}

// Money columns are BigInt in Postgres (see migration 20260512180000_bigint_money).
// Prisma returns them as JS `bigint`; the rest of the codebase keeps `number`
// because Zod input bounds (see lineItem.schema.ts) cap each value to a safe
// integer range. This boundary type narrows the Prisma row to `number` so the
// service / DTO layer never touches `bigint`.
export interface InvoiceWithLineItems
  extends Omit<PrismaInvoice, 'subtotalMinor' | 'taxMinor' | 'totalMinor'> {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly lineItems: ReadonlyArray<Omit<PrismaLineItem, 'unitPriceMinor'> & { readonly unitPriceMinor: number }>;
}

function bigintToSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new InternalError(`${label} exceeds safe integer range: ${value.toString()}`);
  }
  return Number(value);
}

function toRow(
  row: PrismaInvoice & { readonly lineItems: ReadonlyArray<PrismaLineItem> },
): InvoiceWithLineItems {
  return {
    ...row,
    subtotalMinor: bigintToSafeNumber(row.subtotalMinor, 'subtotalMinor'),
    taxMinor: bigintToSafeNumber(row.taxMinor, 'taxMinor'),
    totalMinor: bigintToSafeNumber(row.totalMinor, 'totalMinor'),
    lineItems: row.lineItems.map((li) => ({
      ...li,
      unitPriceMinor: bigintToSafeNumber(li.unitPriceMinor, 'unitPriceMinor'),
    })),
  };
}

export interface ListParams {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: InvoiceStatus;
}

export interface ListResult {
  readonly items: ReadonlyArray<InvoiceWithLineItems>;
  readonly total: number;
}

export interface StatusUpdate {
  readonly status: InvoiceStatus;
  readonly number?: string;
  readonly issuedAt?: Date;
  readonly paidAt?: Date;
  readonly voidedAt?: Date;
}

export interface InvoiceRepository {
  create(tx: Tx, data: PersistedInvoiceInput): Promise<InvoiceWithLineItems>;
  findById(db: Db, id: string): Promise<InvoiceWithLineItems | null>;
  list(db: Db, params: ListParams): Promise<ListResult>;
  updateStatus(tx: Tx, id: string, patch: StatusUpdate): Promise<InvoiceWithLineItems>;
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  async create(tx: Tx, data: PersistedInvoiceInput): Promise<InvoiceWithLineItems> {
    const row = await tx.invoice.create({
      data: {
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        currency: data.currency,
        taxRateBps: data.taxRateBps,
        subtotalMinor: BigInt(data.subtotalMinor),
        taxMinor: BigInt(data.taxMinor),
        totalMinor: BigInt(data.totalMinor),
        dueAt: data.dueAt,
        lineItems: {
          create: data.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPriceMinor: BigInt(li.unitPriceMinor),
            position: li.position,
          })),
        },
      },
      include: { lineItems: { orderBy: { position: 'asc' } } },
    });
    return toRow(row);
  }

  async findById(db: Db, id: string): Promise<InvoiceWithLineItems | null> {
    const row = await db.invoice.findUnique({
      where: { id },
      include: { lineItems: { orderBy: { position: 'asc' } } },
    });
    return row === null ? null : toRow(row);
  }

  async list(db: Db, params: ListParams): Promise<ListResult> {
    const where: Prisma.InvoiceWhereInput = params.status ? { status: params.status } : {};
    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: [{ issuedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take: params.pageSize,
        include: { lineItems: { orderBy: { position: 'asc' } } },
      }),
      db.invoice.count({ where }),
    ]);
    return { items: items.map(toRow), total };
  }

  async updateStatus(tx: Tx, id: string, patch: StatusUpdate): Promise<InvoiceWithLineItems> {
    try {
      const row = await tx.invoice.update({
        where: { id },
        data: {
          status: patch.status,
          ...(patch.number !== undefined ? { number: patch.number } : {}),
          ...(patch.issuedAt !== undefined ? { issuedAt: patch.issuedAt } : {}),
          ...(patch.paidAt !== undefined ? { paidAt: patch.paidAt } : {}),
          ...(patch.voidedAt !== undefined ? { voidedAt: patch.voidedAt } : {}),
        },
        include: { lineItems: { orderBy: { position: 'asc' } } },
      });
      return toRow(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundError(id);
        if (e.code === 'P2002') throw new UniqueViolationError(`number collision on update of invoice ${id}`);
      }
      throw e;
    }
  }
}
