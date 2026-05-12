<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CreateInvoiceInputSchema,
  CurrencyCodeSchema,
  type CreateInvoiceInput,
  type CurrencyCode,
} from '@inv/shared';
import { createInvoice } from '../api/invoices.js';
import { ApiError } from '../api/client.js';
import { parseMajorToMinor } from '../utils/money.js';

interface DraftLineItem {
  description: string;
  quantity: string;
  unitPriceMajor: string;
}

interface FormState {
  customerName: string;
  customerEmail: string;
  currency: CurrencyCode;
  taxRateBps: string;
  dueAt: string;
  lineItems: DraftLineItem[];
}

const router = useRouter();
const CURRENCY_OPTIONS: ReadonlyArray<CurrencyCode> = CurrencyCodeSchema.options;

const form = reactive<FormState>({
  customerName: '',
  customerEmail: '',
  currency: 'INR',
  taxRateBps: '1800',
  dueAt: '',
  lineItems: [{ description: '', quantity: '1', unitPriceMajor: '0.00' }],
});

const submitting = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

function addLine(): void {
  form.lineItems.push({ description: '', quantity: '1', unitPriceMajor: '0.00' });
}

function removeLine(index: number): void {
  if (form.lineItems.length === 1) return;
  form.lineItems.splice(index, 1);
}

const lineItemsPreview = computed(() => {
  return form.lineItems.map((li, idx) => {
    const minor = parseMajorToMinor(li.unitPriceMajor);
    const quantity = Number.parseInt(li.quantity, 10);
    return { idx, minorValid: minor !== null, quantityValid: Number.isInteger(quantity) && quantity >= 1 };
  });
});

function buildPayload(): { ok: true; value: CreateInvoiceInput } | { ok: false; error: string } {
  const errors: Record<string, string> = {};
  const taxRateBps = Number.parseInt(form.taxRateBps, 10);
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 100000) {
    errors['taxRateBps'] = 'Tax rate must be an integer between 0 and 100000 (bps).';
  }

  const lineItems: Array<{ description: string; quantity: number; unitPriceMinor: number }> = [];
  form.lineItems.forEach((li, i) => {
    const minor = parseMajorToMinor(li.unitPriceMajor);
    const quantity = Number.parseInt(li.quantity, 10);
    if (li.description.trim().length === 0) errors[`lineItems.${i}.description`] = 'Description required.';
    if (!Number.isInteger(quantity) || quantity < 1) errors[`lineItems.${i}.quantity`] = 'Quantity must be ≥ 1.';
    if (minor === null || minor < 0) errors[`lineItems.${i}.unitPriceMajor`] = 'Unit price must be ≥ 0.';
    if (
      minor !== null &&
      minor >= 0 &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      li.description.trim().length > 0
    ) {
      lineItems.push({ description: li.description.trim(), quantity, unitPriceMinor: minor });
    }
  });

  const payload: CreateInvoiceInput = {
    customerName: form.customerName.trim(),
    customerEmail: form.customerEmail.trim(),
    currency: form.currency,
    taxRateBps: Number.isFinite(taxRateBps) ? taxRateBps : 0,
    lineItems,
    ...(form.dueAt.length > 0 ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
  };

  const parsed = CreateInvoiceInputSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (errors[key] === undefined) errors[key] = issue.message;
    }
  }

  fieldErrors.value = errors;
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: 'Please fix the highlighted fields.' };
  }
  return { ok: true, value: parsed.success ? parsed.data : payload };
}

async function onSubmit(): Promise<void> {
  formError.value = null;
  const built = buildPayload();
  if (!built.ok) {
    formError.value = built.error;
    return;
  }
  submitting.value = true;
  try {
    const created = await createInvoice(built.value);
    await router.push({ name: 'invoices.detail', params: { id: created.id } });
  } catch (e: unknown) {
    formError.value = e instanceof ApiError ? e.message : 'Failed to create invoice.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <h1>New invoice</h1>
    <form @submit.prevent="onSubmit">
      <div class="row">
        <div class="field" style="flex: 1; min-width: 240px;">
          <label for="customerName">Customer name</label>
          <input id="customerName" v-model="form.customerName" maxlength="200" required />
          <small v-if="fieldErrors.customerName" class="error">{{ fieldErrors.customerName }}</small>
        </div>
        <div class="field" style="flex: 1; min-width: 240px;">
          <label for="customerEmail">Customer email</label>
          <input id="customerEmail" v-model="form.customerEmail" type="email" maxlength="320" required />
          <small v-if="fieldErrors.customerEmail" class="error">{{ fieldErrors.customerEmail }}</small>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label for="currency">Currency</label>
          <select id="currency" v-model="form.currency">
            <option v-for="c in CURRENCY_OPTIONS" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label for="taxRateBps">Tax rate (bps)</label>
          <input id="taxRateBps" v-model="form.taxRateBps" inputmode="numeric" pattern="[0-9]*" />
          <small v-if="fieldErrors.taxRateBps" class="error">{{ fieldErrors.taxRateBps }}</small>
        </div>
        <div class="field">
          <label for="dueAt">Due date (optional)</label>
          <input id="dueAt" v-model="form.dueAt" type="datetime-local" />
        </div>
      </div>

      <h2>Line items</h2>
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="width: 7rem;">Qty</th>
            <th style="width: 10rem;">Unit price ({{ form.currency }})</th>
            <th style="width: 5rem;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(li, i) in form.lineItems" :key="i">
            <td>
              <input v-model="li.description" placeholder="e.g. Consulting hours" />
              <small v-if="fieldErrors[`lineItems.${i}.description`]" class="error">
                {{ fieldErrors[`lineItems.${i}.description`] }}
              </small>
            </td>
            <td>
              <input v-model="li.quantity" inputmode="numeric" pattern="[0-9]*" />
              <small v-if="fieldErrors[`lineItems.${i}.quantity`]" class="error">
                {{ fieldErrors[`lineItems.${i}.quantity`] }}
              </small>
            </td>
            <td>
              <input v-model="li.unitPriceMajor" inputmode="decimal" placeholder="0.00" />
              <small v-if="fieldErrors[`lineItems.${i}.unitPriceMajor`]" class="error">
                {{ fieldErrors[`lineItems.${i}.unitPriceMajor`] }}
              </small>
            </td>
            <td>
              <button
                type="button"
                class="secondary"
                :disabled="form.lineItems.length === 1"
                @click="removeLine(i)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <button type="button" class="secondary" style="margin-top: 0.5rem;" @click="addLine">
        Add line item
      </button>

      <p v-if="formError" class="error" style="margin-top: 1rem;">{{ formError }}</p>

      <div class="row" style="margin-top: 1.5rem;">
        <button type="submit" :disabled="submitting">{{ submitting ? 'Submitting…' : 'Create invoice' }}</button>
        <button type="button" class="secondary" @click="router.push({ name: 'invoices.list' })">Cancel</button>
      </div>

      <p v-if="lineItemsPreview.length > 0" style="color: #6b7280; font-size: 0.875rem;">
        Totals (subtotal/tax/total) are computed server-side and shown on the next page.
      </p>
    </form>
  </section>
</template>
