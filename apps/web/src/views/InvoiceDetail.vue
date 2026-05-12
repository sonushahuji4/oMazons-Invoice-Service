<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { InvoiceStatus } from '@inv/shared';
import { useInvoice } from '../composables/useInvoice.js';
import { formatMinor } from '../utils/money.js';
import { pdfUrl } from '../api/invoices.js';
import { ErrorDTOSchema } from '@inv/shared';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { invoice, loading, error, transition } = useInvoice(props.id);

type Toast = { readonly kind: 'success' | 'error' | 'info'; readonly text: string };
const toast = ref<Toast | null>(null);
const downloading = ref(false);

const sortedLineItems = computed(() => {
  if (invoice.value === null) return [];
  return [...invoice.value.lineItems].sort((a, b) => a.position - b.position);
});

const ALLOWED: Readonly<Record<InvoiceStatus, ReadonlyArray<Exclude<InvoiceStatus, 'draft'>>>> = {
  draft: ['issued'],
  issued: ['paid', 'void'],
  paid: [],
  void: [],
};

function canTransition(to: Exclude<InvoiceStatus, 'draft'>): boolean {
  if (invoice.value === null) return false;
  if (!ALLOWED[invoice.value.status].includes(to)) return false;
  if (to === 'issued' && invoice.value.dueAt === null) return false;
  return true;
}

function issueDisabledReason(): string {
  if (invoice.value === null) return 'Invoice not loaded';
  if (invoice.value.status !== 'draft') return 'Issue is only available from draft';
  if (invoice.value.dueAt === null) return 'Set a due date on the draft before issuing';
  return 'Move to issued (assigns invoice number)';
}

async function onTransition(to: Exclude<InvoiceStatus, 'draft'>): Promise<void> {
  toast.value = null;
  await transition(to);
  if (error.value !== null) {
    toast.value = { kind: 'error', text: error.value };
    return;
  }
  const labels: Record<Exclude<InvoiceStatus, 'draft'>, string> = {
    issued: 'Invoice issued.',
    paid: 'Invoice marked as paid.',
    void: 'Invoice voided.',
  };
  toast.value = { kind: 'success', text: labels[to] };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleString();
}

async function onDownloadPdf(): Promise<void> {
  if (invoice.value === null || downloading.value) return;
  toast.value = null;
  downloading.value = true;
  try {
    const res = await fetch(pdfUrl(invoice.value.id), { method: 'GET' });
    if (!res.ok) {
      const message = await readErrorMessage(res);
      toast.value = { kind: 'error', text: message };
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoice.value.number ?? invoice.value.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.value = { kind: 'success', text: 'PDF downloaded.' };
  } catch (e: unknown) {
    toast.value = {
      kind: 'error',
      text: e instanceof Error ? e.message : 'Failed to download PDF.',
    };
  } finally {
    downloading.value = false;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as unknown;
    const parsed = ErrorDTOSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data.message ?? parsed.data.error;
    }
  } catch {
    /* fall through */
  }
  return `PDF request failed (${res.status})`;
}
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between; margin-bottom: 1rem;">
      <h1>Invoice detail</h1>
      <button class="secondary" @click="router.push({ name: 'invoices.list' })">‹ Back to list</button>
    </div>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-if="invoice !== null && !loading">
      <div class="card" style="margin-bottom: 1rem;">
        <div class="row" style="gap: 2rem;">
          <div>
            <div class="label">Number</div>
            <div class="value strong mono">{{ invoice.number ?? '— (draft)' }}</div>
          </div>
          <div>
            <div class="label">Status</div>
            <span class="badge" :class="invoice.status">{{ invoice.status }}</span>
          </div>
          <div>
            <div class="label">Customer</div>
            <div class="value strong">{{ invoice.customerName }}</div>
            <div class="value" style="color: var(--color-text-muted);">{{ invoice.customerEmail }}</div>
          </div>
          <div>
            <div class="label">Currency</div>
            <div class="value">{{ invoice.currency }} · {{ invoice.taxRateBps }} bps</div>
          </div>
        </div>

        <div class="row" style="gap: 2rem; margin-top: 1rem;">
          <div><div class="label">Issued</div><div class="value">{{ formatDate(invoice.issuedAt) }}</div></div>
          <div><div class="label">Due</div><div class="value">{{ formatDate(invoice.dueAt) }}</div></div>
          <div><div class="label">Paid</div><div class="value">{{ formatDate(invoice.paidAt) }}</div></div>
          <div><div class="label">Voided</div><div class="value">{{ formatDate(invoice.voidedAt) }}</div></div>
        </div>
      </div>

      <h2>Line items</h2>
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 3rem;">#</th>
            <th>Description</th>
            <th style="width: 4rem; text-align: right;">Qty</th>
            <th style="width: 10rem; text-align: right;">Unit price</th>
            <th style="width: 10rem; text-align: right;">Line total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="li in sortedLineItems" :key="li.id">
            <td>{{ li.position + 1 }}</td>
            <td>{{ li.description }}</td>
            <td style="text-align: right;">{{ li.quantity }}</td>
            <td style="text-align: right;" class="mono">{{ formatMinor(li.unitPriceMinor, invoice.currency) }}</td>
            <td style="text-align: right;" class="mono">{{ formatMinor(li.quantity * li.unitPriceMinor, invoice.currency) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="text-align: right; font-weight: 600;">Subtotal</td>
            <td style="text-align: right;" class="mono">{{ formatMinor(invoice.subtotalMinor, invoice.currency) }}</td>
          </tr>
          <tr>
            <td colspan="4" style="text-align: right; font-weight: 600;">Tax</td>
            <td style="text-align: right;" class="mono">{{ formatMinor(invoice.taxMinor, invoice.currency) }}</td>
          </tr>
          <tr>
            <td colspan="4" style="text-align: right; font-weight: 700;">Total</td>
            <td style="text-align: right; font-weight: 700;" class="mono">
              {{ formatMinor(invoice.totalMinor, invoice.currency) }}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>

      <div class="row" style="margin-top: 1.5rem; gap: 0.5rem;">
        <button
          :disabled="!canTransition('issued') || loading"
          :title="issueDisabledReason()"
          @click="onTransition('issued')"
        >
          Issue
        </button>
        <button
          :disabled="!canTransition('paid') || loading"
          :title="canTransition('paid') ? 'Mark as paid' : 'Mark paid is only available from issued'"
          @click="onTransition('paid')"
        >
          Mark paid
        </button>
        <button
          class="danger"
          :disabled="!canTransition('void') || loading"
          :title="canTransition('void') ? 'Void this invoice' : 'Void is only available from issued'"
          @click="onTransition('void')"
        >
          Void
        </button>
        <button
          class="secondary"
          :disabled="invoice.status === 'draft' || downloading"
          :title="invoice.status === 'draft' ? 'PDF unavailable for drafts' : 'Download PDF'"
          @click="onDownloadPdf"
        >
          {{ downloading ? 'Downloading…' : 'Download PDF' }}
        </button>
      </div>

      <p
        v-if="toast"
        :class="['toast', `toast-${toast.kind}`]"
        role="status"
        style="margin-top: 1rem;"
      >
        {{ toast.text }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.toast-success {
  background: #dcfce7;
  border-color: #bbf7d0;
  color: #166534;
}
.toast-error {
  background: #fee2e2;
  border-color: #fecaca;
  color: #991b1b;
}
.toast-info {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
}
</style>
