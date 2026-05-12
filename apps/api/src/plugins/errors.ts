import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodIssue } from 'zod';
import {
  DomainError,
  FsmError,
  InternalError,
  NotFoundError,
  PdfNotAvailableError,
  UniqueViolationError,
  ValidationError,
} from '../domain/errors.js';

interface ZodValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
}

function mapZodIssues(issues: ReadonlyArray<ZodIssue>): ReadonlyArray<ZodValidationIssue> {
  return issues.map((i) => ({ path: i.path, message: i.message, code: i.code }));
}

function isFastifyValidationError(err: unknown): err is FastifyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'validation' in err &&
    Array.isArray((err as { validation: unknown }).validation)
  );
}

function isFastifyBodyParseError(err: unknown): err is FastifyError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; statusCode?: unknown };
  if (e.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') return true;
  if (err instanceof SyntaxError && e.statusCode === 400) return true;
  return false;
}

function isFastifyContentTypeError(err: unknown): err is FastifyError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown };
  return (
    e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || e.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
  );
}

function extractZodError(err: unknown): ZodError | null {
  if (err instanceof ZodError) return err;
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as { cause: unknown }).cause;
    if (cause instanceof ZodError) return cause;
  }
  return null;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const zodErr = extractZodError(error);
    if (zodErr !== null) {
      request.log.warn({ issues: zodErr.issues }, 'request validation failed');
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        issues: mapZodIssues(zodErr.issues),
      });
    }

    if (error instanceof ValidationError) {
      const issues = (error.fields ?? []).map((f) => ({
        path: f.path,
        message: f.message,
        code: 'custom',
      }));
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
        ...(issues.length > 0 ? { issues } : {}),
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
        id: error.id,
      });
    }

    if (error instanceof FsmError) {
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
        from: error.from,
        to: error.to,
      });
    }

    if (error instanceof PdfNotAvailableError) {
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
        currentStatus: error.currentStatus,
      });
    }

    if (error instanceof UniqueViolationError) {
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
      });
    }

    if (error instanceof InternalError) {
      request.log.error({ err: error }, 'internal domain error');
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: 'Internal server error',
      });
    }

    if (error instanceof DomainError) {
      return reply.code(error.httpStatus).send({
        error: error.code,
        message: error.message,
      });
    }

    if (isFastifyValidationError(error)) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        message: error.message,
      });
    }

    if (isFastifyBodyParseError(error)) {
      request.log.warn({ err: error }, 'request body parse failed');
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        message: 'Request body could not be parsed as JSON',
      });
    }

    if (isFastifyContentTypeError(error)) {
      const statusCode = error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? 413 : 415;
      const message =
        statusCode === 413 ? 'Request body too large' : 'Unsupported media type';
      request.log.warn({ err: error, statusCode }, 'request content-type or size rejected');
      return reply.code(statusCode).send({
        error: 'VALIDATION_FAILED',
        message,
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
}
