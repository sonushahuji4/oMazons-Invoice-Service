/**
 * Dev seed — inserts 25 realistic invoices spanning all four statuses across
 * several recent months. Customers, currencies, tax rates, and line items are
 * chosen to be jurisdiction-consistent (US/USD no tax, UK/GBP 20% VAT, IN/INR
 * 18% GST, DE-FR/EUR 19-20% VAT, AE/AED 5% VAT, SG/SGD 9% GST) so the data
 * reads like a real billing dataset, not placeholder lorem ipsum.
 *
 * Goes through InvoiceService so money math, monthly numbering, and FSM
 * transitions are exercised exactly as they would be for organic rows.
 * Uses a controllable clock so paid invoices look weeks-old, void invoices
 * a few weeks old, issued ones recent, and drafts brand new. Invoice numbers
 * therefore land in the correct INV-YYYYMM-#### prefixes.
 *
 * Appends; does NOT truncate. Not wired into CI.
 *
 * Usage: `pnpm --filter api seed`
 */
import { PrismaClient } from '@prisma/client';
import type { CreateInvoiceInput, CurrencyCode, InvoiceStatus } from '@inv/shared';
import { InvoiceService, type Clock } from './services/invoice.service.js';
import { PrismaInvoiceRepository } from './repositories/invoice.repository.js';
import { PrismaMonthlyCounterRepository } from './repositories/counter.repository.js';
import { renderInvoicePdf } from './pdf/renderInvoicePdf.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface LineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
}

interface BaseScenario {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly currency: CurrencyCode;
  readonly taxRateBps: number;
  readonly lineItems: ReadonlyArray<LineItem>;
}

type DraftScenario = BaseScenario & {
  readonly status: 'draft';
  readonly draftDueDaysFromNow?: number;
};

type IssuedScenario = BaseScenario & {
  readonly status: 'issued';
  readonly issuedDaysAgo: number;
  readonly netTermDays: number;
};

type PaidScenario = BaseScenario & {
  readonly status: 'paid';
  readonly issuedDaysAgo: number;
  readonly netTermDays: number;
  readonly paidDaysAgo: number;
};

type VoidScenario = BaseScenario & {
  readonly status: 'void';
  readonly issuedDaysAgo: number;
  readonly netTermDays: number;
  readonly voidedDaysAgo: number;
};

type Scenario = DraftScenario | IssuedScenario | PaidScenario | VoidScenario;

const SCENARIOS: ReadonlyArray<Scenario> = [
  // ---------- DRAFTS (8) — in-progress, not yet sent ----------
  {
    status: 'draft',
    customerName: 'Aurora Health Systems, Inc.',
    customerEmail: 'ap@aurorahealthsystems.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'Senior product engineer (hours)', quantity: 80, unitPriceMinor: 18500 },
      { description: 'UX research interview session', quantity: 12, unitPriceMinor: 47500 },
    ],
  },
  {
    status: 'draft',
    customerName: 'Meridian Logistics Pvt Ltd',
    customerEmail: 'billing@meridianlogistics.in',
    currency: 'INR',
    taxRateBps: 1800,
    lineItems: [
      { description: 'Backend engineer (hours)', quantity: 120, unitPriceMinor: 250000 },
      { description: 'PostgreSQL performance tuning engagement', quantity: 1, unitPriceMinor: 18000000 },
    ],
    draftDueDaysFromNow: 30,
  },
  {
    status: 'draft',
    customerName: 'Helix Bioscience GmbH',
    customerEmail: 'rechnungen@helixbioscience.de',
    currency: 'EUR',
    taxRateBps: 1900,
    lineItems: [
      { description: 'HL7 integration engineer (hours)', quantity: 64, unitPriceMinor: 16500 },
      { description: 'Interface mapping documentation', quantity: 1, unitPriceMinor: 240000 },
    ],
    draftDueDaysFromNow: 30,
  },
  {
    status: 'draft',
    customerName: 'Brightline Capital LLP',
    customerEmail: 'finance@brightlinecapital.co.uk',
    currency: 'GBP',
    taxRateBps: 2000,
    lineItems: [
      { description: 'Senior compliance consultant (days)', quantity: 8, unitPriceMinor: 125000 },
      { description: 'SOC 2 readiness assessment', quantity: 1, unitPriceMinor: 580000 },
    ],
    draftDueDaysFromNow: 45,
  },
  {
    status: 'draft',
    customerName: 'Pacific Northwest Outfitters Co.',
    customerEmail: 'accountspayable@pnwoutfitters.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'E-commerce platform audit', quantity: 1, unitPriceMinor: 980000 },
    ],
  },
  {
    status: 'draft',
    customerName: 'Sandstone Hospitality LLC',
    customerEmail: 'invoices@sandstone-hospitality.ae',
    currency: 'AED',
    taxRateBps: 500,
    lineItems: [
      { description: 'Property management system upgrade', quantity: 1, unitPriceMinor: 4200000 },
      { description: 'Front-desk staff training (per attendee)', quantity: 25, unitPriceMinor: 65000 },
    ],
    draftDueDaysFromNow: 30,
  },
  {
    status: 'draft',
    customerName: 'Lighthouse Analytics Pte Ltd',
    customerEmail: 'ap@lighthouseanalytics.sg',
    currency: 'SGD',
    taxRateBps: 900,
    lineItems: [
      { description: 'Snowflake migration engineer (hours)', quantity: 96, unitPriceMinor: 21000 },
      { description: 'dbt model authoring', quantity: 18, unitPriceMinor: 68000 },
    ],
    draftDueDaysFromNow: 30,
  },
  {
    status: 'draft',
    customerName: 'Riverstone Manufacturing Group',
    customerEmail: 'ap@riverstonemfg.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'Custom ERP module development', quantity: 1, unitPriceMinor: 1450000 },
      { description: 'QA regression test cycle', quantity: 1, unitPriceMinor: 320000 },
    ],
    draftDueDaysFromNow: 30,
  },

  // ---------- ISSUED (8) — sent, awaiting payment ----------
  {
    status: 'issued',
    customerName: 'Quantum Robotics, Inc.',
    customerEmail: 'accounts@quantumrobotics.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'Computer vision engineering (hours)', quantity: 160, unitPriceMinor: 21500 },
      { description: 'GPU compute pass-through — March cycle', quantity: 1, unitPriceMinor: 427500 },
    ],
    issuedDaysAgo: 6,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Saffron Threads Pvt Ltd',
    customerEmail: 'accounts@saffronthreads.in',
    currency: 'INR',
    taxRateBps: 1800,
    lineItems: [
      { description: 'Inventory analytics dashboard', quantity: 1, unitPriceMinor: 47500000 },
      { description: 'Onboarding workshop (per attendee)', quantity: 14, unitPriceMinor: 420000 },
    ],
    issuedDaysAgo: 11,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Orion Maritime Services FZ-LLC',
    customerEmail: 'finance@orionmaritime.ae',
    currency: 'AED',
    taxRateBps: 500,
    lineItems: [
      { description: 'Vessel tracking integration', quantity: 1, unitPriceMinor: 2850000 },
      { description: 'Annual support — tier 2', quantity: 1, unitPriceMinor: 3600000 },
    ],
    issuedDaysAgo: 4,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Northwind Traders Ltd',
    customerEmail: 'ap@northwindtraders.co.uk',
    currency: 'GBP',
    taxRateBps: 2000,
    lineItems: [
      { description: 'Logistics API integration (days)', quantity: 14, unitPriceMinor: 95000 },
      { description: 'Developer documentation portal', quantity: 1, unitPriceMinor: 340000 },
    ],
    issuedDaysAgo: 8,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Veridian Pharmaceuticals LLC',
    customerEmail: 'ap@veridianpharma.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'GxP validation engineering (hours)', quantity: 72, unitPriceMinor: 24500 },
    ],
    issuedDaysAgo: 14,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Atlas Forge SARL',
    customerEmail: 'comptabilite@atlasforge.fr',
    currency: 'EUR',
    taxRateBps: 2000,
    lineItems: [
      { description: 'Embedded firmware engineering (hours)', quantity: 88, unitPriceMinor: 17500 },
      { description: 'Hardware bring-up — board rev C', quantity: 1, unitPriceMinor: 650000 },
    ],
    issuedDaysAgo: 9,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Skyharbor Aviation Pte Ltd',
    customerEmail: 'billing@skyharbor.sg',
    currency: 'SGD',
    taxRateBps: 900,
    lineItems: [
      { description: 'Crew scheduling SaaS license (annual, per seat)', quantity: 35, unitPriceMinor: 120000 },
      { description: 'Implementation services', quantity: 1, unitPriceMinor: 1800000 },
    ],
    issuedDaysAgo: 2,
    netTermDays: 30,
  },
  {
    status: 'issued',
    customerName: 'Greystone Realty Group',
    customerEmail: 'accounting@greystonerealty.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'Property listing platform redesign', quantity: 1, unitPriceMinor: 2240000 },
    ],
    issuedDaysAgo: 7,
    netTermDays: 30,
  },

  // ---------- PAID (5) — issued weeks ago, paid more recently ----------
  {
    status: 'paid',
    customerName: 'Coastline Foods Co.',
    customerEmail: 'ap@coastlinefoods.co.uk',
    currency: 'GBP',
    taxRateBps: 2000,
    lineItems: [
      { description: 'Cold-chain monitoring system', quantity: 1, unitPriceMinor: 875000 },
      { description: 'Field installation', quantity: 1, unitPriceMinor: 195000 },
    ],
    issuedDaysAgo: 45,
    netTermDays: 30,
    paidDaysAgo: 18,
  },
  {
    status: 'paid',
    customerName: 'Vertex Cybersecurity, Inc.',
    customerEmail: 'accountspayable@vertexcyber.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'External penetration test engagement', quantity: 1, unitPriceMinor: 2450000 },
      { description: 'Remediation advisory (hours)', quantity: 40, unitPriceMinor: 17000 },
    ],
    issuedDaysAgo: 60,
    netTermDays: 30,
    paidDaysAgo: 32,
  },
  {
    status: 'paid',
    customerName: 'Crimson Peak Vineyards LLC',
    customerEmail: 'ap@crimsonpeakvineyards.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'Direct-to-consumer ecommerce build', quantity: 1, unitPriceMinor: 1840000 },
    ],
    issuedDaysAgo: 75,
    netTermDays: 30,
    paidDaysAgo: 41,
  },
  {
    status: 'paid',
    customerName: 'Indus Steel Engineering Services',
    customerEmail: 'accounts@indussteel.in',
    currency: 'INR',
    taxRateBps: 1800,
    lineItems: [
      { description: 'SCADA dashboard customization', quantity: 1, unitPriceMinor: 68000000 },
      { description: 'On-site engineering (days)', quantity: 6, unitPriceMinor: 3800000 },
    ],
    issuedDaysAgo: 55,
    netTermDays: 30,
    paidDaysAgo: 22,
  },
  {
    status: 'paid',
    customerName: 'Apex Construction Holdings',
    customerEmail: 'ap@apexconstruction.ae',
    currency: 'AED',
    taxRateBps: 500,
    lineItems: [
      { description: 'Project portfolio management software (annual)', quantity: 1, unitPriceMinor: 9600000 },
    ],
    issuedDaysAgo: 90,
    netTermDays: 30,
    paidDaysAgo: 58,
  },

  // ---------- VOID (4) — cancelled after issuance ----------
  {
    status: 'void',
    customerName: 'Echoview Media Group Ltd',
    customerEmail: 'finance@echoviewmedia.co.uk',
    currency: 'GBP',
    taxRateBps: 2000,
    lineItems: [
      { description: 'Video pipeline migration — scope cancelled', quantity: 1, unitPriceMinor: 1420000 },
    ],
    issuedDaysAgo: 35,
    netTermDays: 30,
    voidedDaysAgo: 28,
  },
  {
    status: 'void',
    customerName: 'Skyline Architects PLLC',
    customerEmail: 'accounting@skylinearchitects.com',
    currency: 'USD',
    taxRateBps: 0,
    lineItems: [
      { description: 'CAD plugin development — superseded by revised quote', quantity: 1, unitPriceMinor: 1120000 },
    ],
    issuedDaysAgo: 50,
    netTermDays: 30,
    voidedDaysAgo: 14,
  },
  {
    status: 'void',
    customerName: 'Northstar Insurance Brokers Pte Ltd',
    customerEmail: 'ap@northstarinsurance.sg',
    currency: 'SGD',
    taxRateBps: 900,
    lineItems: [
      { description: 'Claims workflow audit', quantity: 1, unitPriceMinor: 980000 },
      { description: 'Compliance review', quantity: 1, unitPriceMinor: 420000 },
    ],
    issuedDaysAgo: 20,
    netTermDays: 30,
    voidedDaysAgo: 12,
  },
  {
    status: 'void',
    customerName: 'Veridia Renewables GmbH',
    customerEmail: 'rechnungen@veridia-renewables.de',
    currency: 'EUR',
    taxRateBps: 1900,
    lineItems: [
      { description: 'Solar inverter telemetry adapter', quantity: 1, unitPriceMinor: 760000 },
    ],
    issuedDaysAgo: 40,
    netTermDays: 30,
    voidedDaysAgo: 33,
  },
];

class SeedClock implements Clock {
  private current: Date;
  constructor(initial: Date) {
    this.current = new Date(initial);
  }
  now(): Date {
    return new Date(this.current);
  }
  setTo(d: Date): void {
    this.current = new Date(d);
  }
}

function offsetDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function normalizeDueAt(d: Date): string {
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function buildPayload(s: Scenario, realNow: Date): CreateInvoiceInput {
  const base = {
    customerName: s.customerName,
    customerEmail: s.customerEmail,
    currency: s.currency,
    taxRateBps: s.taxRateBps,
    lineItems: s.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPriceMinor: li.unitPriceMinor,
    })),
  };
  if (s.status === 'draft') {
    if (s.draftDueDaysFromNow === undefined) return base;
    return { ...base, dueAt: normalizeDueAt(offsetDays(realNow, s.draftDueDaysFromNow)) };
  }
  const issueDate = offsetDays(realNow, -s.issuedDaysAgo);
  return { ...base, dueAt: normalizeDueAt(offsetDays(issueDate, s.netTermDays)) };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const realNow = new Date();
  const clock = new SeedClock(realNow);
  const svc = new InvoiceService({
    prisma,
    invoices: new PrismaInvoiceRepository(),
    counters: new PrismaMonthlyCounterRepository(),
    clock,
    pdfRenderer: renderInvoicePdf,
  });

  process.stdout.write(`Seeding ${SCENARIOS.length} invoices...\n`);
  const counts: Record<InvoiceStatus, number> = { draft: 0, issued: 0, paid: 0, void: 0 };

  // Issue oldest first so monthly counters increment in chronological order.
  const nonDrafts = SCENARIOS.filter((s): s is IssuedScenario | PaidScenario | VoidScenario => s.status !== 'draft')
    .slice()
    .sort((a, b) => b.issuedDaysAgo - a.issuedDaysAgo);

  for (const s of nonDrafts) {
    clock.setTo(realNow);
    const dto = await svc.createInvoice(buildPayload(s, realNow));

    clock.setTo(offsetDays(realNow, -s.issuedDaysAgo));
    await svc.transition(dto.id, 'issued');

    if (s.status === 'paid') {
      clock.setTo(offsetDays(realNow, -s.paidDaysAgo));
      await svc.transition(dto.id, 'paid');
      counts.paid += 1;
    } else if (s.status === 'void') {
      clock.setTo(offsetDays(realNow, -s.voidedDaysAgo));
      await svc.transition(dto.id, 'void');
      counts.void += 1;
    } else {
      counts.issued += 1;
    }
  }

  clock.setTo(realNow);
  for (const s of SCENARIOS) {
    if (s.status !== 'draft') continue;
    await svc.createInvoice(buildPayload(s, realNow));
    counts.draft += 1;
  }

  process.stdout.write(
    `Done. Inserted: draft=${counts.draft} issued=${counts.issued} paid=${counts.paid} void=${counts.void}\n`,
  );
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`seed failed: ${msg}\n`);
  process.exitCode = 1;
});
