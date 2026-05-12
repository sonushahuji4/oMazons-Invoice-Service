import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import InvoicesList from '../views/InvoicesList.vue';
import InvoiceCreate from '../views/InvoiceCreate.vue';
import InvoiceDetail from '../views/InvoiceDetail.vue';

const routes: ReadonlyArray<RouteRecordRaw> = [
  { path: '/', redirect: { name: 'invoices.list' } },
  { path: '/invoices', name: 'invoices.list', component: InvoicesList },
  { path: '/invoices/new', name: 'invoices.new', component: InvoiceCreate },
  { path: '/invoices/:id', name: 'invoices.detail', component: InvoiceDetail, props: true },
  { path: '/:pathMatch(.*)*', redirect: { name: 'invoices.list' } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
