import { ref, type Ref } from 'vue';
import type { InvoiceDTO, InvoiceStatus } from '@inv/shared';
import { getInvoice, transitionStatus } from '../api/invoices.js';
import { ApiError } from '../api/client.js';

export interface UseInvoiceReturn {
  readonly invoice: Ref<InvoiceDTO | null>;
  readonly loading: Ref<boolean>;
  readonly error: Ref<string | null>;
  readonly refresh: () => Promise<void>;
  readonly transition: (to: Exclude<InvoiceStatus, 'draft'>) => Promise<void>;
}

export function useInvoice(id: string): UseInvoiceReturn {
  const invoice = ref<InvoiceDTO | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      invoice.value = await getInvoice(id);
    } catch (e: unknown) {
      error.value = describeError(e, 'Failed to load invoice');
      invoice.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function transition(to: Exclude<InvoiceStatus, 'draft'>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      invoice.value = await transitionStatus(id, to);
    } catch (e: unknown) {
      error.value = describeError(e, `Failed to transition to ${to}`);
    } finally {
      loading.value = false;
    }
  }

  void refresh();

  return { invoice, loading, error, refresh, transition };
}

function describeError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const body = e.body;
  if (body === null) return e.message;
  switch (body.error) {
    case 'INVALID_TRANSITION':
      return `Cannot move invoice from ${body.from} to ${body.to}.`;
    case 'INVOICE_NOT_FOUND':
      return `Invoice ${body.id} no longer exists.`;
    case 'PDF_NOT_AVAILABLE_FOR_DRAFT':
      return 'PDF is unavailable while the invoice is in draft.';
    case 'VALIDATION_FAILED':
      return body.message ?? 'Validation failed.';
    case 'NUMBER_COLLISION':
      return 'Invoice number collision — please retry.';
    case 'INTERNAL_ERROR':
      return 'Server error — please try again.';
  }
  return e.message || fallback;
}
