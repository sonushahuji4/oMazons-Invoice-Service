import type {
  CreateInvoiceInput,
  InvoiceDTO,
  InvoiceStatus,
  ListInvoicesQuery,
  PaginatedInvoicesDTO,
  TransitionStatusInput,
} from '@inv/shared';
import { apiBaseUrl, request } from './client.js';

export function listInvoices(query: ListInvoicesQuery): Promise<PaginatedInvoicesDTO> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.status !== undefined) params.set('status', query.status);
  return request<PaginatedInvoicesDTO>(`/invoices?${params.toString()}`);
}

export function getInvoice(id: string): Promise<InvoiceDTO> {
  return request<InvoiceDTO>(`/invoices/${id}`);
}

export function createInvoice(body: CreateInvoiceInput): Promise<InvoiceDTO> {
  return request<InvoiceDTO>('/invoices', { method: 'POST', body });
}

export function transitionStatus(
  id: string,
  to: Exclude<InvoiceStatus, 'draft'>,
): Promise<InvoiceDTO> {
  const body: TransitionStatusInput = { to };
  return request<InvoiceDTO>(`/invoices/${id}/transition`, { method: 'POST', body });
}

export function pdfUrl(id: string): string {
  return `${apiBaseUrl}/invoices/${id}/pdf`;
}
