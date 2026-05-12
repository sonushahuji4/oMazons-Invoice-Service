<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { InvoiceStatus } from '@inv/shared';
import { useInvoices } from '../composables/useInvoices.js';
import { formatMinor } from '../utils/money.js';

const router = useRouter();
const {
  data,
  total,
  page,
  pageSize,
  status,
  loading,
  error,
  nextPage,
  prevPage,
  setStatus,
} = useInvoices();

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const initialLoading = computed(() => loading.value && data.value.length === 0);
const filler = computed(() => {
  if (data.value.length === 0) return 0;
  return Math.max(0, pageSize.value - data.value.length);
});

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ readonly value: '' | InvoiceStatus; readonly label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

function onStatusChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  if (value === '') {
    setStatus(undefined);
    return;
  }
  if (value === 'draft' || value === 'issued' || value === 'paid' || value === 'void') {
    setStatus(value);
  }
}

function openDetail(id: string): void {
  void router.push({ name: 'invoices.detail', params: { id } });
}
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between; margin-bottom: 1rem;">
      <h1>Invoices</h1>
      <button @click="router.push({ name: 'invoices.new' })">New invoice</button>
    </div>

    <div class="row" style="margin-bottom: 1rem;">
      <div class="field">
        <label for="status-filter">Status filter</label>
        <select id="status-filter" :value="status ?? ''" @change="onStatusChange">
          <option v-for="opt in STATUS_FILTER_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="initialLoading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else class="list-wrap" :class="{ 'is-loading': loading }">
      <div class="table-wrap">
        <table>
        <thead>
          <tr>
            <th scope="col">Number</th>
            <th scope="col">Customer</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in data" :key="inv.id" class="clickable" @click="openDetail(inv.id)">
            <td class="mono">{{ inv.number ?? '—' }}</td>
            <td>{{ inv.customerName }}</td>
            <td>{{ formatMinor(inv.totalMinor, inv.currency) }}</td>
            <td><span class="badge" :class="inv.status">{{ inv.status }}</span></td>
            <td>{{ new Date(inv.createdAt).toLocaleString() }}</td>
            <td>
              <RouterLink
                :to="{ name: 'invoices.detail', params: { id: inv.id } }"
                class="action"
                @click.stop
              >
                View
              </RouterLink>
            </td>
          </tr>
          <tr v-for="n in filler" :key="`filler-${n}`" class="filler-row" aria-hidden="true">
            <td colspan="6">&nbsp;</td>
          </tr>
          <tr v-if="data.length === 0">
            <td colspan="6" style="text-align: center; color: var(--color-text-faint);">No invoices.</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <div class="pager" style="margin-top: 1rem;">
      <button class="secondary" :disabled="page <= 1 || loading" @click="prevPage">‹ Previous</button>
      <span class="status">Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
      <button class="secondary" :disabled="page >= totalPages || loading" @click="nextPage">Next ›</button>
    </div>
  </section>
</template>

<style scoped>
.list-wrap {
  transition: opacity 0.12s ease;
}
.list-wrap.is-loading {
  opacity: 0.6;
  pointer-events: none;
}
.filler-row {
  pointer-events: none;
}
.filler-row td {
  color: transparent;
  user-select: none;
}
</style>
