# oMazons Take-Home — Invoice Service

A small full-stack assignment for our Full-Stack Developer hiring process.

## Title

**"Invoice Service" — Build a small full-stack feature**

## Time budget

3–4 hours. Hard cap at 5. Don't go over.

## Context

At oMazons we ship internal tools that involve money, documents, and edge cases. This assignment mirrors a slice of that — small enough to finish in 4 hours, real enough to show how you think.

You'll build a tiny invoicing service: an API + a minimal UI to create, list, and view invoices, plus a downloadable PDF.

## What to build

### Backend

A Node.js service using **TypeScript + Fastify** (Hono is fine if you prefer; Express is acceptable but discouraged) with **PostgreSQL + Prisma**.

Endpoints:

- `POST /invoices` — create an invoice
- `GET /invoices` — list (with pagination)
- `GET /invoices/:id` — single invoice
- `GET /invoices/:id/pdf` — download invoice as PDF (server-rendered)

**Invoice schema (minimum fields):**

- `id`, `number` (unique, monotonic, format `INV-YYYYMM-####`)
- `customerName`, `customerEmail`
- `lineItems` — at least: description, quantity, unitPriceMinor (integer cents/paise)
- `currency` (string ISO 4217, e.g., `INR`)
- `subtotalMinor`, `taxMinor`, `totalMinor`
- `taxRateBps` (basis points — e.g., `1800` = 18% GST)
- `issuedAt`, `dueAt`
- `status` — `draft` | `issued` | `paid` | `void`

**Business rules to enforce:**

- All money stored in **integer minor units** (no floats).
- `subtotalMinor` = sum of `quantity × unitPriceMinor` per line item.
- `taxMinor` = round half-to-even of `subtotalMinor × taxRateBps / 10000`.
- `totalMinor` = `subtotalMinor + taxMinor`.
- Numbers (`number` field) must be **monotonic per month** — no gaps under normal operation, no duplicates ever.
- Voided invoices must keep their number — gaps in the numbering sequence are tolerated for `void`, never for `paid`/`issued`.
- An invoice can transition `draft → issued → paid` or `issued → void`. No other transitions.

### Frontend

A minimal UI using **Vue 3 (Composition API) + TypeScript**. Tailwind is fine. Vuetify optional — don't burn time setting it up if you haven't used it.

Pages:

- `/invoices` — list view (number, customer, total, status, action: view)
- `/invoices/new` — create form
- `/invoices/:id` — detail view + "Download PDF" button

### PDF

Server-side PDF generation. Use **`@react-pdf/renderer`** (yes, React — only for the PDF; this is exactly what we do in production). If you genuinely cannot get react-pdf working, falling back to Puppeteer is OK; document the reason.

### Repo structure

- Use a **pnpm workspace** with at least: `apps/api`, `apps/web`, `packages/shared` (shared types/schemas).
- Turborepo is a plus, not required.
- A single `pnpm install && pnpm dev` (or scripts equivalent) should bring everything up after `docker compose up -d` (or whatever local Postgres method you choose).

### What to include in your README

1. **How to run it** (commands).
2. **What you'd do differently with another 3 hours.**
3. **Tradeoffs you made and why.**
4. **One thing in the spec you would push back on if this were a real task.**

## Explicit non-goals

- Don't build auth.
- Don't build customer/user CRUD beyond what an invoice needs.
- Don't deploy it.
- Don't gold-plate the UI — function over polish.
- Don't add tests for everything; add tests where they matter (see below).

## Where we'd love to see tests

- `subtotalMinor` / `taxMinor` calculation — including rounding edge cases (e.g., `taxRateBps = 1825`, odd subtotals).
- Status transition rules — invalid transitions must reject.
- The invoice number monotonicity / uniqueness.

## What we're explicitly evaluating

1. **Money math correctness.** Integer minor units, rounding done right, zero floating point creep.
2. **TypeScript quality.** Real types, narrowed unions, no `any` hand-waving.
3. **Schema thinking.** Prisma model + indexes + the right uniqueness constraints.
4. **Edge cases.** Did you think about what breaks?
5. **Communication.** README clarity, tradeoffs articulated, decisions defended.
6. **Pragmatism.** Did you finish in 4 hours, or did you go to 12 and over-engineer?

## Submission

- GitHub repo (preferred) or zip
- README per above
- A 1–3 minute Loom (optional but appreciated): "Here's what I built, here's where I cut, here's what I'd do next."

## Ground rules

- AI tools (Copilot, Cursor, ChatGPT) are fine. We use them too. **But you must understand every line you submit** — we'll ask in the live round.
- If you copy a non-trivial chunk from a tutorial, link the source in the README.
- If you don't finish, **submit anyway** and explain what's missing. We'd rather see honest progress than a polished half-truth.

## Questions?

Email **hiring@omazons.com**. Clarifying questions are encouraged.