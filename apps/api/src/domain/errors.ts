import type { InvoiceStatus } from '@inv/shared';

export type ValidationFieldIssue = {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
};

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
  readonly fields?: ReadonlyArray<ValidationFieldIssue>;

  constructor(message: string, fields?: ReadonlyArray<ValidationFieldIssue>) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'INVOICE_NOT_FOUND';
  readonly httpStatus = 404;
  readonly id: string;

  constructor(id: string) {
    super(`Invoice ${id} not found`);
    this.name = 'NotFoundError';
    this.id = id;
  }
}

export class FsmError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  readonly httpStatus = 409;
  readonly from: InvoiceStatus;
  readonly to: InvoiceStatus;

  constructor(from: InvoiceStatus, to: InvoiceStatus) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = 'FsmError';
    this.from = from;
    this.to = to;
  }
}

export class PdfNotAvailableError extends DomainError {
  readonly code = 'PDF_NOT_AVAILABLE_FOR_DRAFT';
  readonly httpStatus = 409;
  readonly currentStatus: InvoiceStatus;

  constructor(currentStatus: InvoiceStatus) {
    super(`PDF unavailable for status ${currentStatus}`);
    this.name = 'PdfNotAvailableError';
    this.currentStatus = currentStatus;
  }
}

export class UniqueViolationError extends DomainError {
  readonly code = 'NUMBER_COLLISION';
  readonly httpStatus = 409;

  constructor(message = 'Unique constraint violation') {
    super(message);
    this.name = 'UniqueViolationError';
  }
}

export class InternalError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly httpStatus = 500;

  constructor(message = 'Internal server error') {
    super(message);
    this.name = 'InternalError';
  }
}
