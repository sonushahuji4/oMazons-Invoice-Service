import { ErrorDTOSchema, type ErrorDTO } from '@inv/shared';

/**
 * Base URL for the API. Defaults to `/api` so the SPA stays same-origin in dev (Vite
 * proxies `/api/*` to the Fastify server — see `vite.config.ts`). Override with
 * `VITE_API_URL` to point at a different absolute origin in deployed environments.
 */
export const apiBaseUrl: string = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: ErrorDTO | null;
  constructor(status: number, body: ErrorDTO | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error ?? 'UNKNOWN_ERROR';
    this.body = body;
  }
}

export interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

/**
 * Typed JSON request wrapper. Caller binds T to the shared Zod-inferred response
 * type (e.g. InvoiceDTO); we trust the server contract and the funnel in
 * apps/api/src/plugins/errors.ts to surface non-2xx as ErrorDTO bodies.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  });
  if (!res.ok) throw await buildApiError(res);
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return text as T;
  }
  const json = (await res.json()) as T;
  return json;
}

async function buildApiError(res: Response): Promise<ApiError> {
  const errorBody = await tryParseErrorBody(res);
  const fallback = `Request failed with ${res.status} ${res.statusText}`;
  const message = errorBody?.message ?? errorBody?.error ?? fallback;
  return new ApiError(res.status, errorBody, message);
}

async function tryParseErrorBody(res: Response): Promise<ErrorDTO | null> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const parsed = ErrorDTOSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
