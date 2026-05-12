<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">Invoice Service</RouterLink>
      <nav>
        <RouterLink to="/">Invoices</RouterLink>
        <RouterLink to="/invoices/new">New invoice</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style>
/* ---- Design tokens (slate neutral + indigo accent + status palette) ---- */
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --color-bg: #f8fafc;        /* slate-50  */
  --color-surface: #ffffff;
  --color-border: #e2e8f0;    /* slate-200 */
  --color-border-strong: #cbd5e1; /* slate-300 */
  --color-text: #0f172a;      /* slate-900 */
  --color-text-muted: #475569; /* slate-600 */
  --color-text-faint: #64748b; /* slate-500 */

  --color-accent: #4f46e5;        /* indigo-600 */
  --color-accent-hover: #4338ca;  /* indigo-700 */
  --color-accent-soft: #eef2ff;   /* indigo-50  */

  --color-danger: #b91c1c;        /* red-700 */
  --color-danger-hover: #991b1b;  /* red-800 */
  --color-danger-soft: #fee2e2;   /* red-100 */

  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);

  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-bg);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }
body { margin: 0; }

/* ---- Layout shell ---- */
.app-shell { min-height: 100vh; }
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.875rem 1.5rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.app-header .brand {
  font-weight: 700;
  text-decoration: none;
  color: var(--color-text);
  font-size: 1rem;
  letter-spacing: -0.01em;
  cursor: pointer !important;
}
.app-header .brand:hover { color: var(--color-accent); cursor: pointer; }
.app-header nav { display: flex; gap: 0.5rem; }
.app-header nav a {
  color: var(--color-text-muted);
  text-decoration: none;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.app-header nav a:hover { background: var(--color-accent-soft); color: var(--color-accent); cursor: pointer; }
.app-header nav a.router-link-active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 600;
  cursor: pointer !important;
}
.app-main { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }

/* ---- Typography ---- */
h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 0.25rem; color: var(--color-text); }
h2 { font-size: 1.125rem; font-weight: 600; letter-spacing: -0.005em; margin: 1.25rem 0 0.5rem; color: var(--color-text); }
h3 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.5rem; color: var(--color-text); }
p  { margin: 0.5rem 0; color: var(--color-text); }
small { color: var(--color-text-faint); }
.mono { font-family: var(--font-mono); }

/* ---- Tables ---- */
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
th, td {
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
  font-size: 0.875rem;
}
tbody tr:last-child td { border-bottom: 0; }
th { background: #f1f5f9; font-weight: 600; color: var(--color-text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
tbody tr.clickable { cursor: pointer !important; transition: background-color 0.12s ease; }
tbody tr.clickable:hover { background: var(--color-accent-soft); cursor: pointer; }

/* ---- Buttons ---- */
button {
  font: inherit;
  font-weight: 500;
  padding: 0.45rem 0.9rem;
  background: var(--color-accent);
  color: #ffffff;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}
button:hover:not(:disabled) {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
  box-shadow: var(--shadow-sm);
  cursor: pointer !important;
}
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
button:disabled {
  background: #e2e8f0;
  border-color: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed !important;
  box-shadow: none;
}

button.secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border-strong);
  cursor: pointer !important;
}
button.secondary:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: var(--color-text-faint);
  color: var(--color-text);
  cursor: pointer !important;
}
button.secondary:disabled {
  background: #f8fafc;
  color: #cbd5e1;
  border-color: var(--color-border);
  cursor: not-allowed !important;
}

button.danger {
  background: var(--color-surface);
  color: var(--color-danger);
  border: 1px solid var(--color-danger-soft);
  cursor: pointer !important;
}
button.danger:hover:not(:disabled) {
  background: var(--color-danger-soft);
  color: var(--color-danger-hover);
  border-color: var(--color-danger);
  cursor: pointer !important;
}
button.danger:disabled {
  cursor: not-allowed !important;
}

/* ---- Forms ---- */
input, select, textarea {
  font: inherit;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
input:hover, select:hover, textarea:hover { border-color: var(--color-text-faint); }
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}
select { cursor: pointer !important; }
select:disabled { cursor: not-allowed !important; opacity: 0.6; }
label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.04em; }

/* ---- Layout helpers ---- */
.field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
.row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; }
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  box-shadow: var(--shadow-sm);
}
.label { display: block; font-size: 0.7rem; font-weight: 600; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.15rem; }
.value { font-size: 0.95rem; color: var(--color-text); }
.value.strong { font-weight: 600; }

.error { color: var(--color-danger); font-size: 0.8125rem; }
.toast { padding: 0.625rem 0.875rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-sm); color: #78350f; }

/* ---- Links acting as actions ---- */
a.action {
  color: var(--color-accent);
  text-decoration: none;
  font-weight: 500;
  cursor: pointer !important;
}
a.action:hover { text-decoration: underline; cursor: pointer; }

/* ---- Badges (status pills) ---- */
.badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
}
.badge.draft  { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
.badge.issued { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
.badge.paid   { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
.badge.void   { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

/* ---- Pagination ---- */
.pager { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.pager .status { color: var(--color-text-muted); font-size: 0.875rem; }

/* ---- Catch-all cursor guarantees (override anything from libs/UA) ---- */
button:not(:disabled),
a[href],
[role="button"]:not([aria-disabled="true"]),
.clickable {
  cursor: pointer !important;
}
button:disabled,
[role="button"][aria-disabled="true"] {
  cursor: not-allowed !important;
}

/* ---- Table horizontal scroll wrapper (used on small screens) ---- */
.table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* ---- Screen-reader-only (accessibility) ---- */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ---- Responsive: tablet (≤ 1024px) ---- */
@media (max-width: 1024px) {
  .app-main { padding: 1.25rem; }
}

/* ---- Responsive: mobile (≤ 768px) ---- */
@media (max-width: 768px) {
  :root { font-size: 13px; }
  .app-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
  }
  .app-header nav { flex-wrap: wrap; }
  .app-main { padding: 1rem; }
  h1 { font-size: 1.25rem; }
  h2 { font-size: 1.0625rem; }

  /* Keep table cells from wrapping awkwardly inside scroll wrapper */
  .table-wrap table { min-width: 560px; }

  /* Stack form rows */
  .row { gap: 0.5rem; }
  .field { width: 100%; }

  /* Buttons easier to tap */
  button { padding: 0.55rem 1rem; min-height: 40px; }

  /* Pager: keep on one row with smaller status */
  .pager { gap: 0.5rem; }
  .pager .status { font-size: 0.8125rem; }

  /* Card padding tightens */
  .card { padding: 0.875rem 1rem; }
}

/* ---- Responsive: small mobile (≤ 480px) ---- */
@media (max-width: 480px) {
  .app-main { padding: 0.75rem; }
  .app-header { padding: 0.625rem 0.875rem; }
  .pager button { flex: 1; }
}
</style>
