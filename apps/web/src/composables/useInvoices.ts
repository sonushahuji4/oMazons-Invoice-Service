import { ref, watch, type Ref } from 'vue';
import type { InvoiceDTO, InvoiceStatus } from '@inv/shared';
import { listInvoices } from '../api/invoices.js';
import { ApiError } from '../api/client.js';

export interface UseInvoicesReturn {
  readonly data: Ref<ReadonlyArray<InvoiceDTO>>;
  readonly total: Ref<number>;
  readonly page: Ref<number>;
  readonly pageSize: Ref<number>;
  readonly status: Ref<InvoiceStatus | undefined>;
  readonly loading: Ref<boolean>;
  readonly error: Ref<string | null>;
  readonly refresh: () => Promise<void>;
  readonly nextPage: () => void;
  readonly prevPage: () => void;
  readonly setStatus: (next: InvoiceStatus | undefined) => void;
}

export function useInvoices(initialPageSize = 10): UseInvoicesReturn {
  const data: Ref<ReadonlyArray<InvoiceDTO>> = ref([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(initialPageSize);
  const status = ref<InvoiceStatus | undefined>(undefined);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await listInvoices({
        page: page.value,
        pageSize: pageSize.value,
        status: status.value,
      });
      data.value = res.data;
      total.value = res.total;
    } catch (e: unknown) {
      error.value = e instanceof ApiError ? e.message : 'Failed to load invoices';
      data.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  function nextPage(): void {
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
    if (page.value < maxPage) page.value += 1;
  }

  function prevPage(): void {
    if (page.value > 1) page.value -= 1;
  }

  function setStatus(next: InvoiceStatus | undefined): void {
    status.value = next;
    page.value = 1;
  }

  watch([page, pageSize, status], () => {
    void refresh();
  });

  void refresh();

  return { data, total, page, pageSize, status, loading, error, refresh, nextPage, prevPage, setStatus };
}
