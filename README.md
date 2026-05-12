# oMazons Invoice Service

A small full-stack invoicing system: a Fastify + Prisma JSON API, a Vue 3 SPA, and server-rendered PDFs via `@react-pdf/renderer`. Invoices carry line items, an integer-minor-unit money model, a strict `draft → issued → paid | void` state machine, and unique per-month numbers in the format `INV-YYYYMM-####`. Money is stored exclusively in integer minor units — there is no floating-point math anywhere in the calculation, storage, transport, or display path.

Core features:

- Create, list (paginated, status-filterable), and view invoices.
- Atomic status transitions; invoice numbers are allocated only when a draft is issued.
- Server-rendered PDF download for any non-draft invoice.
- Money math with half-to-even (banker's) rounding; the canonical tie `calcTaxMinor(200, 1825) === 36` is asserted in tests.
- A single shared Zod schema package (`@inv/shared`) used by both the API and the SPA, so the wire contract has one source of truth.

Who is this for? A take-home reviewer or new contributor who wants to clone the repo, bring it up locally end-to-end (DB → API → SPA → PDF), and exercise every endpoint in Postman.

---

## 1. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Language | TypeScript | 5.4.5 (range) / 5.9.3 (locked) | Strict types across all workspaces (`strict: true`, `noUncheckedIndexedAccess`). |
| Runtime | Node.js | ≥ 20 (`engines`) / `20` (`.nvmrc`) | API + tooling runtime. |
| Package manager | pnpm | 11.1.0 (`packageManager`) | Workspaces, hoisted installs. |
| Monorepo | pnpm workspaces | — | `apps/*`, `packages/*` (see `pnpm-workspace.yaml`). |
| API framework | Fastify | 4.27.0 (range) / 4.29.1 (locked) | HTTP server, logging, routing. |
| Validation | Zod | 3.25.76 (api) / 3.23.8 (shared) / 3.25.76 (locked) | Wire-contract schemas in `@inv/shared`. |
| Zod ↔ Fastify glue | `fastify-type-provider-zod` | 2.1.0 | Available for future schema-typed routes. |
| ORM | Prisma | 5.15.0 (range) / 5.22.0 (locked) | Postgres client, migrations, schema. |
| Database | PostgreSQL | 16 (Docker image `postgres:16`) | Persistent storage. |
| PDF | `@react-pdf/renderer` | 3.4.4 (range) / 3.4.5 (locked) | Server-side PDF generation (React used solely for the PDF). |
| React (PDF only) | `react` | 18.3.1 | Required by `@react-pdf/renderer`. |
| API dev runner | `tsx` | 4.11.0 (range) / 4.21.0 (locked) | TypeScript watch mode (`tsx watch`). |
| Tests | Vitest | 1.6.0 (range) / 1.6.1 (locked) | `pnpm --filter api test` (86 tests across money / FSM / numbering). |
| Frontend framework | Vue 3 (Composition API) | 3.4.27 (range) / 3.5.34 (locked) | SPA. |
| Frontend router | Vue Router | 4.3.3 (range) / 4.6.4 (locked) | `/invoices`, `/invoices/new`, `/invoices/:id`. |
| Build tool | Vite | 5.2.11 (range) / 5.4.21 (locked) | Dev server + production bundling. |
| Vite Vue plugin | `@vitejs/plugin-vue` | 5.0.4 (range) / 5.2.4 (locked) | `.vue` SFC support. |
| Vue type-checker | `vue-tsc` | 2.0.19 (range) / 2.2.12 (locked) | Build-time SFC type checking. |
| Process runner | `concurrently` | 8.2.2 | Runs API + SPA together in `pnpm dev`. |
| Container | Docker Compose | engine v2 (Compose plugin) | `docker compose up -d` (single `postgres` service). |

CSS: plain CSS in `apps/web` — no Tailwind, no Vuetify, no UI framework.

---

## 2. Architecture

### 2.1 High-Level Design (HLD)

```mermaid
graph LR
  U[Browser User] --> SPA[Vue 3 SPA<br/>Vite :5173]
  SPA -- /api/* via Vite proxy --> API[Fastify API<br/>:3099]
  API --> SVC[Services]
  SVC --> DOM[Domain<br/>money / fsm / numbering]
  SVC --> REPO[Repositories]
  REPO --> ORM[Prisma Client 5]
  ORM --> DB[(Postgres 16<br/>docker compose)]
  SVC --> PDF["@react-pdf/renderer"]
  PDF -- application/pdf --> API
```

### 2.2 Low-Level Design (LLD) — Backend internals

```mermaid
graph TD
  R[Route handler<br/>apps/api/src/routes/invoices.ts] -- parsed input --> S[InvoiceService<br/>apps/api/src/services/invoice.service.ts]
  S -- pure calc --> M[money.ts<br/>calcSubtotal/Tax/Total]
  S -- decide allowed --> F[fsm.ts<br/>transitionStatus]
  S -- format INV-YYYYMM-#### --> N[numbering.ts]
  S -- $transaction(tx) --> IR[InvoiceRepository<br/>Prisma]
  S -- $transaction(tx) --> CR[MonthlyCounterRepository<br/>UPSERT increment]
  IR --> ORM[Prisma Client]
  CR --> ORM
  ORM --> DB[(Postgres 16)]
  S -- InvoiceDTO --> PDF[renderInvoicePdf<br/>apps/api/src/pdf/]
```

### 2.3 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
  Invoice ||--o{ LineItem : has
  Invoice {
    UUID    id PK
    TEXT    number UK "nullable; allocated at draft -> issued"
    TEXT    customerName
    TEXT    customerEmail
    TEXT    currency  "ISO 4217 (curated 6-currency enum)"
    INT     taxRateBps "0..100000"
    BIGINT  subtotalMinor
    BIGINT  taxMinor
    BIGINT  totalMinor
    ENUM    status "draft|issued|paid|void"
    TIMESTAMP issuedAt "nullable"
    TIMESTAMP dueAt    "nullable"
    TIMESTAMP paidAt   "nullable"
    TIMESTAMP voidedAt "nullable"
    TIMESTAMP createdAt
    TIMESTAMP updatedAt
  }
  LineItem {
    UUID    id PK
    UUID    invoiceId FK
    TEXT    description
    INT     quantity
    BIGINT  unitPriceMinor
    INT     position
  }
  MonthlyCounter {
    TEXT    period PK "YYYYMM"
    INT     value
    TIMESTAMP updatedAt
  }
```

Indexes (see `apps/api/prisma/schema.prisma`):

- `Invoice (status, issuedAt DESC)` — status-filtered listing.
- `Invoice (createdAt DESC)` — newest-first secondary.
- `Invoice (issuedAt DESC, createdAt DESC)` — default list order when no status filter.
- `Invoice (customerEmail)` — future customer lookups.
- `LineItem (invoiceId, position)` — ordered hydration.
- Unique: `Invoice.number` (sparse — null until issued).

### 2.4 End-to-end Request Flow — Create Invoice

```mermaid
sequenceDiagram
  participant B as Browser (Vue SPA)
  participant V as Vite Dev Proxy
  participant A as Fastify /invoices
  participant S as InvoiceService
  participant M as domain/money
  participant R as InvoiceRepository
  participant DB as Postgres

  B->>V: POST /api/invoices  (JSON body)
  V->>A: POST /invoices (origin rewritten to :3099)
  A->>A: CreateInvoiceInputSchema.parse(body)
  A->>S: createInvoice(input)
  S->>M: calcSubtotalMinor + calcTaxMinor + calcTotalMinor
  S->>R: prisma.$transaction(tx -> invoices.create)
  R->>DB: INSERT Invoice (status=draft, number=null) + INSERT LineItems
  DB-->>R: row
  R-->>S: InvoiceWithLineItems
  S-->>A: InvoiceDTO
  A-->>V: 201 Created + InvoiceDTO
  V-->>B: 201 Created + InvoiceDTO
```

### 2.5 Per-scenario flows

**2.5.1 Transition `draft → issued` (allocates invoice number atomically)**

```mermaid
sequenceDiagram
  participant A as Fastify /invoices/:id/transition
  participant S as InvoiceService
  participant F as domain/fsm
  participant N as domain/numbering
  participant CR as MonthlyCounterRepository
  participant IR as InvoiceRepository
  participant DB as Postgres

  A->>S: transition(id, { to: 'issued' })
  S->>DB: BEGIN
  S->>IR: findById(tx, id)
  alt not found
    S-->>A: throw NotFoundError -> 404 INVOICE_NOT_FOUND
  end
  S->>F: transitionStatus(current.status, 'issued')
  alt invalid pair
    S-->>A: throw FsmError -> 409 INVALID_TRANSITION
  end
  S->>S: validate dueAt is set AND >= now
  alt validation fails
    S-->>A: throw ValidationError -> 400 VALIDATION_FAILED
  end
  S->>N: parseYearMonth(now) -> 'YYYYMM'
  S->>CR: nextSeq(tx, 'YYYYMM')   %% UPSERT increment, row-lock
  CR-->>S: seq
  S->>N: formatInvoiceNumber('YYYYMM', seq)
  S->>IR: updateStatus(tx, id, { status:'issued', number, issuedAt:now })
  IR->>DB: UPDATE Invoice ... WHERE id=:id
  alt P2002 unique violation
    S-->>A: throw UniqueViolationError -> 409 NUMBER_COLLISION
  end
  S->>DB: COMMIT
  S-->>A: InvoiceDTO
```

**2.5.2 Transition `issued → paid` / `issued → void`**

```mermaid
flowchart TD
  T["POST /invoices/:id/transition"] --> P["Zod parse body.to in draft, issued, paid, void"]
  P --> L["prisma.transaction"]
  L --> Q["findById"]
  Q -- "not found" --> N404["404 INVOICE_NOT_FOUND"]
  Q -- "found" --> F["fsm.transitionStatus"]
  F -- "invalid" --> N409a["409 INVALID_TRANSITION"]
  F -- "paid" --> UP["updateStatus: status=paid, paidAt=now"]
  F -- "void" --> UV["updateStatus: status=void, voidedAt=now"]
  UP --> OK["200 InvoiceDTO"]
  UV --> OK
```

**2.5.3 PDF download**

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Fastify /invoices/:id/pdf
  participant S as InvoiceService
  participant R as InvoiceRepository
  participant P as renderInvoicePdf

  B->>A: GET /invoices/:id/pdf
  A->>S: renderPdf(id)
  S->>R: findById(prisma, id)
  alt not found
    S-->>A: 404 INVOICE_NOT_FOUND
  end
  alt status === 'draft'
    S-->>A: 409 PDF_NOT_AVAILABLE_FOR_DRAFT
  end
  S->>P: renderInvoicePdf(dto)
  P-->>S: Buffer
  S-->>A: buffer + dto
  A-->>B: 200 application/pdf — Content-Disposition attachment, filename invoice-NUMBER.pdf
```

**2.5.4 Money rounding (`calcTaxMinor`)**

```mermaid
flowchart LR
  In["subtotalMinor, taxRateBps"] --> Mul["numerator = subtotalMinor * taxRateBps"]
  Mul --> RHE["roundHalfEven<br/>numerator / 10000"]
  RHE --> Q["q = trunc(numerator / 10000)<br/>r = numerator - q * 10000"]
  Q --> Cmp{"compare 2*abs(r) vs 10000"}
  Cmp -- "below half" --> KeepQ["return q"]
  Cmp -- "above half" --> Up["return q + sign(numerator)"]
  Cmp -- "exact tie" --> Even{"q even?"}
  Even -- "yes" --> KeepQ
  Even -- "no" --> Up
```

**2.5.5 Sequencing / numbering (monthly counter)**

```mermaid
flowchart TD
  A["draft to issued — inside prisma.transaction"] --> Y["parseYearMonth(now) returns YYYYMM"]
  Y --> U["MonthlyCounter UPSERT<br/>create value=1<br/>OR update value=value+1"]
  U --> Row["Row-level lock serialises<br/>concurrent issuers in the same UTC month"]
  Row --> F["formatInvoiceNumber<br/>INV-YYYYMM-#### (pad-left 4)"]
  F --> Update["Invoice.update<br/>status=issued, number=INV-..., issuedAt=now"]
  Update -- "COMMIT" --> Done["Atomic: counter + invoice<br/>commit or rollback together"]
  Update -- "P2002 unique" --> Coll["409 NUMBER_COLLISION"]
```

---

## 3. Prerequisites

Install these **before** cloning. Each line has a verification command.

| Tool | Required version | Install | Verify |
|---|---|---|---|
| Git | ≥ 2.30 | https://git-scm.com/downloads | `git --version` |
| Node.js | 20.x (matches `.nvmrc`; `engines.node >= 20`) | https://nodejs.org/ — or `nvm install 20 && nvm use 20` | `node -v` (should print `v20.x.x`) |
| pnpm | 11.1.0 (declared in root `packageManager`) | `npm install -g pnpm@11.1.0` — or enable via Corepack: `corepack enable && corepack prepare pnpm@11.1.0 --activate` | `pnpm -v` |
| Docker | Engine ≥ 24, Compose plugin v2 (Docker Desktop on macOS/Windows ships both) | https://docs.docker.com/get-docker/ | `docker --version` and `docker compose version` |

Optional:

- **Postman** (or `curl`) — for exercising the API in Section 12.
- **VS Code** with the `Prisma`, `Vue (Volar)`, and `ESLint` extensions if you'd like editor schema awareness.

---

## 4. Clone the Repository

```bash
git clone <your-fork-url>
cd oMazons-Invoice-Service
```

> Substitute `<your-fork-url>` with the actual repo URL from GitHub. The folder name (`oMazons-Invoice-Service`) reflects the working directory used during development; rename freely.

If you're using `nvm`:

```bash
nvm use   # respects .nvmrc -> 20
```

---

## 5. Environment Configuration

Two `.env` files are required. They share the same content; one is read by the running API (root `.env`), the other by the Prisma CLI which loads from `apps/api/.env`.

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

`.env.example` (committed):

| Variable | Required | Default in `.env.example` | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://invoice:invoice@localhost:5432/invoice?schema=public` | Postgres connection string used by both Prisma CLI and the API. Username, password, and database name match `docker-compose.yml`. |
| `PORT` | No | `3099` | TCP port the Fastify API binds to (`apps/api/src/server.ts`). |
| `HOST` | No | `0.0.0.0` (hard-coded default) | Bind address for Fastify (`apps/api/src/server.ts`). Set to `127.0.0.1` to make the API loopback-only. |
| `VITE_API_URL` | No | — (defaults to `/api`) | Frontend override (`apps/web/src/api/client.ts`). When unset, the SPA hits `/api/*` and Vite's proxy rewrites to `http://localhost:3099/`. Set this for deployed environments where the SPA and API are on different origins. |

No secrets are required to run locally — the seeded Postgres credentials are fake and live only in your container.

---

## 6. Install Dependencies

### 6.1 Install everything (recommended)

```bash
pnpm install
```

This installs all root + workspace dependencies (api, web, shared).

### 6.2 Install backend only

```bash
pnpm --filter api install
```

### 6.3 Install frontend only

```bash
pnpm --filter web install
```

### 6.4 Install shared package only

```bash
pnpm --filter @inv/shared install
```

### 6.5 Optional / additional tooling

The repo does not require any globally-installed CLI. The Prisma CLI ships with the `prisma` devDependency and is invoked via `pnpm --filter api exec prisma ...`. If you'd like the binary on your PATH for convenience, install it globally:

```bash
pnpm add -g prisma@5.22.0
```

---

## 7. Database with Docker

The repo defines a single `postgres` service in `docker-compose.yml`. Data persists in `./.pgdata` (gitignored).

### 7.1 Start the database

```bash
docker compose up -d
```

(Equivalent: `docker compose up -d postgres`. There is only one service.)

### 7.2 Verify it is running

```bash
docker compose ps
docker compose logs -f postgres   # Ctrl-C to exit
```

A healthy container shows `STATUS = Up (healthy)` (the Compose file runs `pg_isready -U invoice -d invoice` every 5s for up to 10 attempts). You can also confirm directly:

```bash
docker compose exec postgres pg_isready -U invoice -d invoice
# /var/run/postgresql:5432 - accepting connections
```

### 7.3 Connection string

`DATABASE_URL` decomposes as:

```
postgresql:// invoice : invoice  @ localhost : 5432 / invoice ?schema=public
              user     password   host         port   dbname  search_path
```

All four credential segments (`invoice`, `invoice`, `invoice` DB, port `5432`) are set by `docker-compose.yml`. `schema=public` is the default Postgres schema.

### 7.4 Stop / reset the database

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop + delete the named volume (NOTE: data in ./.pgdata persists separately because it is a bind mount)
rm -rf .pgdata               # destroy the local bind-mounted data
```

> **Heads-up:** `./.pgdata` is a bind mount, not a Docker named volume. `docker compose down -v` will not empty it; remove it explicitly if you want a clean slate.

---

## 8. Database Migrations

This project uses **Prisma 5** for schema management. Prisma reads the model definitions in `apps/api/prisma/schema.prisma`, generates a typed client in `node_modules/@prisma/client`, and tracks applied migrations in a `_prisma_migrations` table inside your Postgres DB. Each migration is a hand-checkable SQL file under `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`.

The existing migrations (in apply order):

1. `20260512162520_init` — creates `Invoice`, `LineItem`, `MonthlyCounter`, the `InvoiceStatus` enum, and the listing indexes.
2. `20260512180000_bigint_money` — widens money columns from `INTEGER` (Int32) to `BIGINT` (Int64).
3. `20260512180500_index_invoice_listing` — adds the composite `(issuedAt DESC, createdAt DESC)` index for default list ordering.

### 8.1 Generate the Prisma client

```bash
pnpm --filter api exec prisma generate
```

Required after a fresh install (the client lives in `node_modules/@prisma/client` and is not committed). Re-run after any `schema.prisma` edit.

### 8.2 Apply pending migrations (every machine, CI, and after pulling)

```bash
pnpm --filter api exec prisma migrate deploy
```

This applies any migration not yet recorded in `_prisma_migrations`. **Always use `migrate deploy`** for committed migrations; never run `migrate dev` against them.

### 8.3 Create a new migration (after editing `schema.prisma`)

```bash
pnpm --filter api exec prisma migrate dev --name <descriptive_name>
```

Prisma will: (a) diff the schema against the DB, (b) generate SQL in `apps/api/prisma/migrations/<timestamp>_<descriptive_name>/migration.sql`, (c) apply it, and (d) regenerate the client.

### 8.4 Inspect the database visually

```bash
pnpm --filter api exec prisma studio
```

Opens a browser UI at http://localhost:5555 for browsing/editing rows.

### 8.5 Common migration scenarios

| Scenario | Schema change | Command |
|---|---|---|
| Add a new table | Add a `model X { ... }` block | `pnpm --filter api exec prisma migrate dev --name add_x_table` |
| Add a column | Add a field to an existing model | `pnpm --filter api exec prisma migrate dev --name add_<field>_to_<model>` |
| Rename a column safely | Use `@map("old_name")` so the DB column is untouched, then deploy. To rename the DB column too, do it in two migrations (add new column + backfill + drop old) to avoid data loss. | Multiple `migrate dev` runs |
| Drop a column / table | Remove from `schema.prisma` | `pnpm --filter api exec prisma migrate dev --name drop_<thing>` — **destroys data** |
| Backfill data | Pair a migration SQL file with a one-shot script (e.g. `tsx scripts/backfill-x.ts`) | manual |

### 8.6 Reset the database (destructive)

```bash
pnpm --filter api exec prisma migrate reset
```

> **Warning:** drops the database, recreates it, re-runs every migration, and runs the seed if one is configured. Local-only use; never run against a shared DB.

### 8.7 If a migration ends up half-applied (P3018)

Inspect the `_prisma_migrations` table. Only if the live schema already matches the failed migration, mark it applied:

```bash
pnpm --filter api exec prisma migrate resolve --applied <migration_folder_name>
```

(Per `CLAUDE.md`. Do not run this lightly — it papers over partially-applied SQL.)

### 8.8 (Optional) Seed dev data

```bash
pnpm --filter api seed
```

Inserts 25 realistic invoices across all four statuses, going through `InvoiceService` with a controllable `SeedClock` so money math, FSM transitions, and monthly counters are exercised the same way as organic rows. **Appends** — does not truncate.

---

## 9. How the Database Connects to the Application

```mermaid
flowchart LR
  EnvRoot[".env (repo root)<br/>DATABASE_URL=postgresql://..."] -- read at boot --> Server[apps/api/src/server.ts<br/>new PrismaClient]
  EnvApi[".env (apps/api/.env)<br/>same DATABASE_URL"] -- read by CLI --> CLI[Prisma CLI<br/>migrate / generate / studio]
  Server -- single client instance --> Service[InvoiceService<br/>apps/api/src/services/invoice.service.ts]
  Service -- prisma.$transaction(tx) --> Repos[Repositories<br/>apps/api/src/repositories/*.ts]
  Repos -- typed queries --> DB[(Postgres 16)]
  CLI --> DB
```

Step by step:

1. **`./.env`** holds `DATABASE_URL`. The API reads it via `process.env.DATABASE_URL` when `new PrismaClient()` is constructed in `apps/api/src/server.ts` (line 15).
2. **`apps/api/.env`** holds the *same* `DATABASE_URL`. The Prisma CLI loads its env from the package directory, not the repo root — without this file the CLI cannot find the DB. (`CLAUDE.md` calls this out explicitly.)
3. **One Prisma client instance** is created in `apps/api/src/server.ts` and reused for the life of the process; it is passed to the `InvoiceService` constructor.
4. **Repositories** (`apps/api/src/repositories/invoice.repository.ts`, `apps/api/src/repositories/counter.repository.ts`) accept a `Db | Tx` parameter, so the service can run multi-step writes inside `prisma.$transaction((tx) => …)`. This is how status transitions atomically increment the monthly counter and update the invoice in a single commit.
5. **Service → Routes** — `apps/api/src/routes/invoices.ts` is thin: parse Zod input from `@inv/shared`, call the service, return the DTO.

---

## 10. Run the Application

### 10.1 Run everything (one command)

```bash
pnpm dev
```

Starts the API and SPA together using `concurrently`. You will see two color-coded log streams labeled `api` (blue) and `web` (magenta).

| Process | URL | Notes |
|---|---|---|
| Fastify API | http://localhost:3099 | Health: `GET /health` returns `{"status":"ok"}`. |
| Vue SPA | http://localhost:5173 | Vite dev server with HMR; proxies `/api/*` → `http://localhost:3099/`. |

### 10.2 Run backend only

```bash
pnpm --filter api dev
```

- Port: **3099** (overridable with `PORT` in `.env`).
- Verify: `curl http://localhost:3099/health` → `{"status":"ok"}`.

### 10.3 Run frontend only

```bash
pnpm --filter web dev
```

- Port: **5173** (Vite default).
- Open http://localhost:5173 — the app redirects `/` to `/invoices`.

### 10.4 Build for production

```bash
pnpm build           # shared -> api -> web
pnpm --filter api start    # runs node dist/apps/api/src/server.js
pnpm --filter web preview  # serves the built SPA on http://localhost:4173
```

> The build sequence is important: `@inv/shared` is built first because both apps consume its compiled output in production.

---

## 11. Run the Tests

86 tests live in `apps/api/test/`, scoped (per spec) to the three areas where correctness matters:

| File | What it covers |
|---|---|
| `apps/api/test/money.spec.ts` | `calcSubtotalMinor`, `calcTaxMinor` (incl. the canonical half-to-even tie `200 × 1825 → 36`), `calcTotalMinor`, `roundHalfEven` negative-numerator midpoints, overflow guards. |
| `apps/api/test/fsm.spec.ts` | All 16 from→to pairs (3 allowed, 13 rejected), self-loops, terminal-state escape, no-skip, no-backward. |
| `apps/api/test/numbering.spec.ts` | `formatInvoiceNumber` zero-padding and >9999 widening, UTC month derivation, in-memory counter monotonicity + uniqueness, cross-month reset. |

Commands:

```bash
pnpm test                                # root alias → pnpm --filter api test
pnpm --filter api test                   # full suite (vitest run)
pnpm --filter api test -- money.spec     # single file
pnpm --filter api test -- -t "tie"       # single test by name pattern
pnpm --filter api test -- --watch        # watch mode
pnpm --filter api test -- --coverage     # coverage report (requires @vitest/coverage-*)
```

Pass → exit code 0 + green "Test Files passed". Fail → red diff with the failing expectation; address it before continuing.

Type checks across all workspaces:

```bash
pnpm -r --if-present typecheck
```

### Verify your setup (30-second smoke test)

```bash
# 1) DB up
docker compose up -d

# 2) Apply migrations
pnpm --filter api exec prisma migrate deploy

# 3) Run one fast test file
pnpm --filter api test -- numbering.spec

# 4) Boot the API and curl health
pnpm --filter api dev &        # or in another terminal
sleep 2
curl -s http://localhost:3099/health
# {"status":"ok"}
```

---

## 12. API Reference (Postman-ready)

Base URL during local dev: `http://localhost:3099` (direct) or `http://localhost:5173/api` (proxied via Vite). All examples below use the direct port.

Response envelope (success): the requested resource.
Response envelope (error): `{ "error": "<CODE>", "message": "<human>", ...context }` — see `apps/api/src/plugins/errors.ts`.

---

### `GET /health`

Liveness probe.

**Headers**
```
Accept: application/json
```

**Success Response — 200**
```json
{ "status": "ok" }
```

**cURL**
```bash
curl -X GET http://localhost:3099/health
```

---

### `POST /invoices`

Create a draft invoice. Money is computed server-side from the line items and `taxRateBps`; the client supplies neither subtotal, tax, nor total.

**Headers**
```
Content-Type: application/json
```

**Request Body (example)**
```json
{
  "customerName": "Aurora Health Systems, Inc.",
  "customerEmail": "ap@aurorahealthsystems.com",
  "currency": "USD",
  "taxRateBps": 0,
  "dueAt": "2026-06-11T00:00:00.000Z",
  "lineItems": [
    { "description": "Senior product engineer (hours)", "quantity": 80, "unitPriceMinor": 18500 },
    { "description": "UX research interview session",   "quantity": 12, "unitPriceMinor": 47500 }
  ]
}
```

Field rules (from `packages/shared/src/schemas/invoice.schema.ts`):

- `customerName` — trimmed, 1..200 chars.
- `customerEmail` — trimmed, valid email, ≤ 320 chars.
- `currency` — one of `INR`, `USD`, `EUR`, `GBP`, `AED`, `SGD` (curated 6-currency enum).
- `taxRateBps` — integer in `[0, 100000]`; `1800` = 18%, `1825` = 18.25%.
- `dueAt` — optional ISO-8601 with offset; may be null at create, but must be set and on/after now before issuing.
- `lineItems` — 1..200 items; each: `description` (1..500), `quantity` (1..1_000_000), `unitPriceMinor` (0..1_000_000_000_000).

**Success Response — 201**
```json
{
  "id": "8b8b6cdc-79b8-4f63-9e5b-c1f5a9b09c2a",
  "number": null,
  "customerName": "Aurora Health Systems, Inc.",
  "customerEmail": "ap@aurorahealthsystems.com",
  "currency": "USD",
  "taxRateBps": 0,
  "subtotalMinor": 2050000,
  "taxMinor": 0,
  "totalMinor": 2050000,
  "status": "draft",
  "issuedAt": null,
  "dueAt": "2026-06-11T00:00:00.000Z",
  "paidAt": null,
  "voidedAt": null,
  "createdAt": "2026-05-12T17:55:01.123Z",
  "updatedAt": "2026-05-12T17:55:01.123Z",
  "lineItems": [
    { "id": "…", "description": "Senior product engineer (hours)", "quantity": 80, "unitPriceMinor": 18500, "position": 0 },
    { "id": "…", "description": "UX research interview session",   "quantity": 12, "unitPriceMinor": 47500, "position": 1 }
  ]
}
```

`number` is `null` until the invoice transitions to `issued`.

**Error Responses**
- `400 VALIDATION_FAILED` — Zod schema rejection (missing field, wrong type, out-of-range).
- `500 INTERNAL_ERROR` — unexpected (e.g. money safe-integer overflow).

**cURL**
```bash
curl -X POST http://localhost:3099/invoices \
  -H 'Content-Type: application/json' \
  -d '{
    "customerName":"Aurora Health Systems, Inc.",
    "customerEmail":"ap@aurorahealthsystems.com",
    "currency":"USD","taxRateBps":0,
    "dueAt":"2026-06-11T00:00:00.000Z",
    "lineItems":[
      {"description":"Senior product engineer (hours)","quantity":80,"unitPriceMinor":18500},
      {"description":"UX research interview session","quantity":12,"unitPriceMinor":47500}
    ]
  }'
```

---

### `GET /invoices`

List invoices, newest first (by `issuedAt DESC NULLS LAST, createdAt DESC`).

**Query parameters**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer ≥ 1 | no | `1` | 1-based page index. |
| `pageSize` | integer 1..100 | no | `20` | Items per page. |
| `status` | `draft` \| `issued` \| `paid` \| `void` | no | (no filter) | Restrict to one status. |

**Success Response — 200**
```json
{
  "data": [ /* InvoiceDTO, … */ ],
  "page": 1,
  "pageSize": 20,
  "total": 25
}
```

**Error Responses**
- `400 VALIDATION_FAILED` — bad query param (e.g. `pageSize=0`, `status=foo`).

**cURL**
```bash
curl -X GET 'http://localhost:3099/invoices?page=1&pageSize=20&status=issued'
```

---

### `GET /invoices/:id`

Fetch a single invoice (with its line items, sorted by `position`).

**Path params**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | yes | Invoice id. |

**Success Response — 200** — full `InvoiceDTO` (same shape as the create response).

**Error Responses**
- `400 VALIDATION_FAILED` — `id` is not a UUID.
- `404 INVOICE_NOT_FOUND` — `{ "error":"INVOICE_NOT_FOUND","message":"Invoice <id> not found","id":"<id>" }`.

**cURL**
```bash
curl -X GET http://localhost:3099/invoices/8b8b6cdc-79b8-4f63-9e5b-c1f5a9b09c2a
```

---

### `POST /invoices/:id/transition`

Move an invoice through the state machine. Allowed pairs: `draft → issued`, `issued → paid`, `issued → void`. Any other pair returns `409 INVALID_TRANSITION`.

**Headers**
```
Content-Type: application/json
```

**Path params**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | yes | Invoice id. |

**Request Body (example)**
```json
{ "to": "issued" }
```

`to` accepts all four statuses (`draft`, `issued`, `paid`, `void`); the FSM rejects illegal pairs through `409`, **not** through 400 — this is deliberate per `CLAUDE.md` (critical invariant #3).

**Success Response — 200** — full `InvoiceDTO`. On `draft → issued`, `number` is now set, `issuedAt` is the moment of issue.

**Error Responses**
- `400 VALIDATION_FAILED` — `dueAt` missing/in the past for a `draft → issued` transition.
- `404 INVOICE_NOT_FOUND` — bad id.
- `409 INVALID_TRANSITION` — `{ "error":"INVALID_TRANSITION", "message":"Invalid transition: paid -> void", "from":"paid", "to":"void" }`.
- `409 NUMBER_COLLISION` — `Invoice.number` unique constraint violation under unexpected concurrent racing (rare; the monthly-counter row lock normally prevents it).

**cURL**
```bash
curl -X POST http://localhost:3099/invoices/8b8b6cdc-79b8-4f63-9e5b-c1f5a9b09c2a/transition \
  -H 'Content-Type: application/json' \
  -d '{ "to": "issued" }'
```

---

### `GET /invoices/:id/pdf`

Download a server-rendered PDF. Available for `issued`, `paid`, `void`. Returns `409 PDF_NOT_AVAILABLE_FOR_DRAFT` for drafts (critical invariant #4 — not 404, not 400).

**Path params**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | yes | Invoice id. |

**Success Response — 200**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="invoice-INV-202605-0001.pdf"
<binary PDF payload>
```

**Error Responses**
- `404 INVOICE_NOT_FOUND` — bad id.
- `409 PDF_NOT_AVAILABLE_FOR_DRAFT` — invoice is still a draft.

**cURL**
```bash
curl -X GET http://localhost:3099/invoices/8b8b6cdc-79b8-4f63-9e5b-c1f5a9b09c2a/pdf \
  --output invoice.pdf
```

### Importing into Postman

There is no committed `postman_collection.json` in the repo. Two ways to bring these endpoints into Postman:

1. **Manual** — File → New → HTTP Request, paste each cURL above into Postman's "Import → Raw Text" box; Postman converts cURL to a request automatically. Save each to a new collection named "oMazons Invoice Service".
2. **OpenAPI shortcut** — none ships today. (See "What I'd do differently with another 3 hours" in the existing `solution.md`.)

A handy `collection_environment.json` can hold `baseUrl = http://localhost:3099` so every request uses `{{baseUrl}}/invoices/...`.

---

## 13. Business Rules & Calculations

### 13.1 Money is integer minor units, end-to-end

- DB: `subtotalMinor`, `taxMinor`, `totalMinor`, `unitPriceMinor` are `BIGINT` (Postgres `BIGINT`, JS `bigint` at the Prisma boundary, narrowed to `number` everywhere inside the safe-integer range).
- Wire: every `*Minor` field is `z.number().int()`.
- Computation: there is **no** `parseFloat`, `toFixed`, `/ 100`, or `* 100` anywhere in the calculation path (critical invariant #1).
- Display: `apps/web/src/utils/money.ts` formats by string-padding minor units (e.g. `205000` → `2,050.00`) — no float math even for the UI.

### 13.2 Subtotal, tax, total

For each line item: `lineTotalMinor = quantity × unitPriceMinor`.

```
subtotalMinor = Σ lineTotalMinor
taxMinor      = roundHalfEven(subtotalMinor × taxRateBps, 10000)
totalMinor    = subtotalMinor + taxMinor
```

**Half-to-even (banker's) rounding** — `apps/api/src/domain/money.ts`:

```
q = trunc(numerator / denominator)
r = numerator - q * denominator
2|r| <  denominator             → q
2|r| >  denominator             → q + sign(numerator)
2|r| == denominator (exact tie) → q if q is even, else q + sign(numerator)
```

**Worked example (canonical tie)** — `apps/api/test/money.spec.ts:92`:

```
subtotalMinor = 200, taxRateBps = 1825
numerator     = 200 × 1825 = 365_000
365_000 / 10_000 → q = 36, r = 5_000
2|r| = 10_000 = denominator → exact tie
q = 36 is even → keep q
taxMinor = 36   (NOT 37 — half-to-even biases to the even neighbour)
totalMinor = 200 + 36 = 236
```

`apps/api/src/domain/money.ts` also normalises `-0` (which IEEE-754 returns for `Math.trunc(-5/10)`) to `+0` so callers never see negative zero in monetary results.

### 13.3 State machine (FSM)

```mermaid
stateDiagram-v2
    [*] --> draft
    draft  --> issued : transition(issued)
    issued --> paid   : transition(paid)
    issued --> void   : transition(void)
    paid   --> [*]
    void   --> [*]
```

`draft → issued` requires `dueAt` set and on/after now. It allocates the next per-month sequence as `INV-YYYYMM-####` inside the same `prisma.$transaction` as the status update.

The 13 disallowed pairs (every other from→to in a 4×4 matrix) return `409 INVALID_TRANSITION`. This is enforced uniformly through the FSM, including `*→draft` (no resurrection) and `*→self` (no idempotent re-tagging). See `apps/api/src/domain/fsm.ts` and the 16-pair coverage in `apps/api/test/fsm.spec.ts`.

### 13.4 Numbering — `INV-YYYYMM-####`

- Format: `INV-` + 6-digit UTC YYYYMM + `-` + 4-digit (zero-padded) per-month sequence. Widens past 4 digits when `seq ≥ 10000`.
- Allocation site: **only** at `draft → issued`, never at create (critical invariant #2). `Invoice.number` is nullable; before issue it is `null`.
- Atomicity: `MonthlyCounter.nextSeq` is a Prisma UPSERT (`create: { value: 1 }` / `update: { value: { increment: 1 } }`). The update branch takes a row-level lock, so concurrent issuers in the same UTC month serialise on that row. The counter increment runs inside the same `prisma.$transaction` as the invoice update, so a rollback unwinds both.
- Gap policy: **gaps for `void` are tolerated; duplicates are never tolerated**. A rolled-back issue transaction will consume a sequence value — see "One thing I'd push back on" in `solution.md` for the rationale.

### 13.5 Validation (client vs server)

| Rule | Client (`apps/web`) | Server (`apps/api`) |
|---|---|---|
| Required fields, types, ranges | Inline form validation in `InvoiceCreate.vue` for UX | Authoritative via `CreateInvoiceInputSchema.parse` in routes |
| Currency in curated 6-list | Dropdown enumerates `CurrencyCodeSchema.options` | `CurrencyCodeSchema` (Zod enum) |
| `dueAt` must be set & ≥ now before issuing | Issue button disabled when `dueAt` missing | `InvoiceService.buildPatch` throws `ValidationError` → 400 |
| FSM legality (4×4 = 16 pairs) | Issue/Mark Paid/Void buttons only render for legal transitions | `transitionStatus` returns `FsmError` → 409 |
| Money math | Display-only (`utils/money.ts` formats) | All calculation done server-side from line items |

---

## 14. Project Structure

```
oMazons-Invoice-Service/
├── apps/
│   ├── api/                                   Fastify + Prisma API
│   │   ├── prisma/
│   │   │   ├── schema.prisma                  DB models (source of truth)
│   │   │   └── migrations/                    Committed migration SQL files
│   │   ├── src/
│   │   │   ├── server.ts                      Fastify bootstrap, DI wiring
│   │   │   ├── seed.ts                        Dev seed (25 invoices, all 4 statuses)
│   │   │   ├── routes/invoices.ts             Thin route layer (Zod -> service)
│   │   │   ├── services/invoice.service.ts    Orchestrates transactions, FSM, numbering
│   │   │   ├── domain/                        Pure functions (no IO)
│   │   │   │   ├── money.ts                   roundHalfEven, calcSubtotal/Tax/Total
│   │   │   │   ├── fsm.ts                     transitionStatus (Result<T,E>)
│   │   │   │   ├── numbering.ts               formatInvoiceNumber, parseYearMonth
│   │   │   │   ├── errors.ts                  DomainError hierarchy + code + httpStatus
│   │   │   │   └── result.ts                  Result<T, E> for FSM
│   │   │   ├── repositories/                  Prisma I/O (accept Db | Tx)
│   │   │   │   ├── invoice.repository.ts
│   │   │   │   └── counter.repository.ts      UPSERT-increment monotonic counter
│   │   │   ├── plugins/errors.ts              Single Fastify error handler
│   │   │   └── pdf/
│   │   │       ├── renderInvoicePdf.ts        Pure function: InvoiceDTO -> Buffer
│   │   │       └── InvoiceDocument.tsx        React/PDF component (only React use site)
│   │   └── test/                              Vitest suites (money / fsm / numbering)
│   └── web/                                   Vue 3 SPA
│       ├── vite.config.ts                     Dev server :5173, proxies /api -> :3099
│       └── src/
│           ├── api/                           Typed HTTP client (uses @inv/shared)
│           ├── composables/                   useInvoices, useInvoice (state + fetch)
│           ├── views/                         InvoicesList, InvoiceCreate, InvoiceDetail
│           ├── router/index.ts                vue-router routes
│           └── utils/money.ts                 String-padding formatters (no float math)
├── packages/
│   └── shared/                                @inv/shared — Zod schemas + DTO types
│       └── src/schemas/                       invoice, lineItem, currency, error
├── docker-compose.yml                         Postgres 16
├── .env.example                               DATABASE_URL + PORT defaults
├── tsconfig.base.json                         Shared TS config; @inv/shared path alias
├── pnpm-workspace.yaml                        Workspace layout
├── package.json                               Root scripts (dev, build, test, typecheck)
└── README.md                                  This file.
```

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED` to DB / `P1001: Can't reach database server` | Postgres container is not up | `docker compose up -d` and `docker compose ps` until `healthy`. |
| `Prisma client did not initialize yet` | Forgot to run `prisma generate` after install | `pnpm --filter api exec prisma generate`. |
| `Environment variable not found: DATABASE_URL` (CLI) | Missing `apps/api/.env` | `cp .env.example apps/api/.env`. |
| `Migration ... failed to apply cleanly` (P3018) | Schema drift or half-applied migration | `pnpm --filter api exec prisma migrate reset` (destroys data); or `prisma migrate resolve --applied <name>` if the live schema actually matches. |
| `EADDRINUSE: address already in use :::3099` | API port taken | `lsof -i :3099` then `kill <pid>` — or set `PORT=3098` in `.env`. |
| `EADDRINUSE: address already in use :::5173` | SPA port taken | `lsof -i :5173` then `kill <pid>` — or `pnpm --filter web dev -- --port 5174`. |
| SPA returns `Failed to fetch` for `/api/...` | API not running, or Vite proxy not picked up after restart | Start the API (`pnpm --filter api dev`), then refresh; if `VITE_API_URL` is set in your shell, unset it. |
| PDF endpoint returns `409 PDF_NOT_AVAILABLE_FOR_DRAFT` | Invoice is still a draft | Transition it to `issued` first: `POST /invoices/:id/transition` with `{"to":"issued"}` (requires `dueAt` set). |
| `409 INVALID_TRANSITION` on `paid → void` | Spec disallows it — paid is terminal | Decide before paying; no fix in code. |
| `409 NUMBER_COLLISION` under load | Two issuers raced the unique index | Retry the request; the row-level lock on `MonthlyCounter` should serialise them — investigate if it happens repeatedly. |
| `vue-tsc` "Hit Cannot find module '@inv/shared'" | Workspace symlinks missing | `pnpm install` at the repo root. |
| `BigInt is not JSON serializable` in custom scripts | A raw Prisma row escaped the repository | Always go through the repository layer; it narrows `bigint → number` (see `apps/api/src/repositories/invoice.repository.ts:36`). |

---

## 16. Scripts Reference

### Root (`./package.json`)

| Script | Command | Effect |
|---|---|---|
| `dev` | `concurrently … "pnpm --filter api dev" "pnpm --filter web dev"` | API + SPA together with color-coded logs. |
| `build` | `pnpm --filter shared build && pnpm --filter api build && pnpm --filter web build` | Production build in dependency order. |
| `test` | `pnpm --filter api test` | Run the 86 vitest specs. |
| `lint` | `pnpm -r --if-present lint` | No-op today (no `lint` script in any workspace). |
| `typecheck` | `pnpm -r --if-present typecheck` | Recursive `tsc --noEmit` (api, web, shared). |

### API (`apps/api/package.json`)

| Script | Command | Effect |
|---|---|---|
| `dev` | `tsx watch src/server.ts` | Hot-restarting Fastify on :3099. |
| `build` | `pnpm --filter @inv/shared build && tsc -p tsconfig.json` | Build shared, then compile the API to `dist/`. |
| `start` | `node dist/apps/api/src/server.js` | Run the built API. |
| `typecheck` | `tsc --noEmit && tsc -p tsconfig.test.json --noEmit && tsc -p src/pdf/tsconfig.pdf.json --noEmit` | Three-pass: app + tests + PDF (the only TSX surface). |
| `test` | `vitest run` | One-shot test run. |
| `seed` | `tsx src/seed.ts` | Insert 25 demo invoices. |

### Web (`apps/web/package.json`)

| Script | Command | Effect |
|---|---|---|
| `dev` | `vite` | Vite dev server on :5173 with `/api` proxy. |
| `build` | `vue-tsc --noEmit && vite build` | Type-check SFCs, then bundle to `dist/`. |
| `preview` | `vite preview` | Serve the built SPA on :4173. |
| `typecheck` | `vue-tsc --noEmit` | Vue + TS type check. |

### Shared (`packages/shared/package.json`)

| Script | Command | Effect |
|---|---|---|
| `build` | `tsc` | Compile to `dist/` for production consumption. |
| `typecheck` | `tsc --noEmit` | Schema + type check only. |

---

## 17. Submission Notes (per `REQUIREMENT.md`)

`REQUIREMENT.md` asks the README to include four things. Item 1 ("how to run it") is Sections 4–10 above. The remaining three are below.

### 17.1 What I'd do differently with another 3 hours

1. **Integration tests** for `POST /invoices → transition → pdf` against a real testcontainer-backed Postgres, asserting the monotonicity invariant under concurrent issuers (currently only the in-memory mock proves the contract — see `apps/api/test/numbering.spec.ts`).
2. **Optimistic concurrency** on `Invoice.updateStatus` (a `version` column + `updateMany` predicate) so a stale SPA cannot race a transition and silently win.
3. **Money type at the boundary** — a `MinorInt` branded type with arithmetic helpers, so accidental `+ 0.18` math becomes a compile error rather than a runtime invariant assertion. The branded `Minor` type in `apps/api/src/domain/money.ts` is the first step; the next is plumbing it everywhere.
4. **Better empty / loading / error states** in the SPA and a confirm dialog before `void` (one-way, terminal — easy to fat-finger).
5. **OpenAPI / Swagger UI** wired off the existing Zod schemas via `fastify-type-provider-zod` (already a dependency). This would replace the manual cURL block in Section 12 with a clickable schema-driven UI.

### 17.2 Tradeoffs

- **Plain CSS, no Tailwind/Vuetify.** The spec says "function over polish"; setting up a CSS framework would have eaten time I'd rather spend on money math and FSM correctness.
- **Vite proxy instead of CORS.** Same-origin SPA→API in dev avoids a CORS plugin + browser preflight surface area, and matches how this would deploy behind a reverse proxy (the canonical case in production).
- **Numbers allocated only at issue, not at create.** Drafts can be deleted/abandoned without leaving gaps in the issued/paid sequence. Gaps for `void` are explicitly tolerated by spec.
- **`@react-pdf/renderer` inside the Fastify process** (no worker pool). Single-process is fine at this size; revisit when PDF rendering shows up in the P99.
- **Curated 6-currency enum** (`INR/USD/EUR/GBP/AED/SGD`) instead of the full ISO 4217 list. All six are 2-decimal-scale, which keeps the integer-minor-units invariant uniform across the wire. Adding more is a one-line schema change.
- **Money columns widened to `BIGINT`** in migration `20260512180000_bigint_money`. The initial `INTEGER` (Int32) capped totals around 21.47M minor units; `BIGINT` lifts the ceiling to 9.22 × 10¹⁸ minor units. The bigint→number narrowing happens once at the repository boundary (`apps/api/src/repositories/invoice.repository.ts:36`) and is asserted to stay inside `Number.MAX_SAFE_INTEGER`.
- **No auth, no customer CRUD, no deployment** — explicit non-goals from `REQUIREMENT.md` § "Explicit non-goals".

### 17.3 One thing I'd push back on

> "Numbers (`number` field) must be **monotonic per month** — no gaps under normal operation, no duplicates ever."
> — `REQUIREMENT.md`, business rules

"No gaps under normal operation" is a soft guarantee that's expensive to deliver and rarely what auditors actually want. A monthly counter inside a transaction gives you uniqueness and ordering, but a rolled-back transaction (network blip, validation failure on a downstream side-effect, deploy mid-issue) still consumes a sequence value — you'll see legitimate gaps. The right ask is usually **"monotonic, unique, never re-used"** and let gaps happen; if a regulator truly needs zero gaps they need a serialised issuer with a reconcile/repair path, not "atomic counter + best effort." Worth a 5-minute clarifying conversation before building.

---

## 18. Contributing

Short conventions for this take-home; adapt for real teams.

- **Branch naming** — `feat/<thing>`, `fix/<thing>`, `chore/<thing>`.
- **Commits** — short imperative subject lines (e.g. `created the database table schema and migration file` matches existing history).
- **Pre-PR checklist:**
  - `pnpm -r --if-present typecheck` is green.
  - `pnpm --filter api test` is green.
  - `pnpm --filter api exec prisma validate` passes (after schema edits).
  - No `any` reintroduced; no float math in money paths; no migration `migrate dev`-ed against committed history (use `migrate deploy`).
- **Issues** — open one in the GitHub repo with reproduction steps, expected vs actual behaviour, and the failing endpoint / curl invocation.

---

## 19. License

Not applicable — this repository does not ship a `LICENSE` file. Treat the source as "all rights reserved" by the author unless a license is added separately.

---

_Last updated: 2026-05-12_
