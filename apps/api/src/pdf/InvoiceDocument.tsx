import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { InvoiceDTO, LineItemDTO } from '@inv/shared';
import { formatMinor } from './money.js';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111111',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  brand: { fontSize: 18, fontWeight: 700 },
  metaBlock: { textAlign: 'right' },
  metaLabel: { color: '#6b7280', fontSize: 8, marginTop: 2 },
  metaValue: { fontSize: 10 },
  statusBadge: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: '#eef2ff',
    color: '#1e3a8a',
    fontSize: 9,
    alignSelf: 'flex-end',
  },
  customerSection: { marginBottom: 14 },
  sectionLabel: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  customerLine: { fontSize: 11, fontWeight: 700 },
  customerSubLine: { fontSize: 10, color: '#374151' },
  datesRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 18,
  },
  dateBlock: { minWidth: 90 },
  table: { borderTopWidth: 1, borderTopColor: '#d1d5db' },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  cellNum: { width: 20, fontSize: 9 },
  cellDesc: { flexGrow: 1, fontSize: 10 },
  cellQty: { width: 40, fontSize: 10, textAlign: 'right' },
  cellPrice: { width: 80, fontSize: 10, textAlign: 'right' },
  cellTotal: { width: 90, fontSize: 10, textAlign: 'right' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 3,
  },
  totalsLabel: { width: 100, textAlign: 'right', paddingRight: 8, fontSize: 10 },
  totalsValue: { width: 90, textAlign: 'right', fontSize: 10 },
  totalsGrand: { fontWeight: 700, fontSize: 12 },
  totalsDivider: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 6,
    paddingTop: 6,
  },
  footer: { marginTop: 28, fontSize: 8, color: '#6b7280', textAlign: 'center' },
});

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function lineTotalMinor(li: LineItemDTO): number {
  return li.quantity * li.unitPriceMinor;
}

export interface InvoiceDocumentProps {
  readonly invoice: InvoiceDTO;
}

export function InvoiceDocument(props: InvoiceDocumentProps): JSX.Element {
  const { invoice } = props;
  const sortedItems = [...invoice.lineItems].sort((a, b) => a.position - b.position);
  const numberLabel = invoice.number ?? '— (draft)';
  return (
    <Document
      title={`Invoice ${numberLabel}`}
      author="Invoice Service"
      subject={`Invoice for ${invoice.customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>INVOICE</Text>
            <Text style={styles.metaLabel}>Number</Text>
            <Text style={styles.metaValue}>{numberLabel}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Issued</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.issuedAt)}</Text>
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.dueAt)}</Text>
            <Text style={styles.statusBadge}>{invoice.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.customerSection}>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={styles.customerLine}>{invoice.customerName}</Text>
          <Text style={styles.customerSubLine}>{invoice.customerEmail}</Text>
        </View>

        <View style={styles.datesRow}>
          <View style={styles.dateBlock}>
            <Text style={styles.sectionLabel}>Currency</Text>
            <Text style={styles.metaValue}>{invoice.currency}</Text>
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.sectionLabel}>Tax rate</Text>
            <Text style={styles.metaValue}>{invoice.taxRateBps} bps</Text>
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.sectionLabel}>Paid</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.paidAt)}</Text>
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.sectionLabel}>Voided</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.voidedAt)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={styles.cellNum}>#</Text>
            <Text style={styles.cellDesc}>Description</Text>
            <Text style={styles.cellQty}>Qty</Text>
            <Text style={styles.cellPrice}>Unit price</Text>
            <Text style={styles.cellTotal}>Line total</Text>
          </View>
          {sortedItems.map((li) => (
            <View key={li.id} style={styles.tableRow}>
              <Text style={styles.cellNum}>{li.position + 1}</Text>
              <Text style={styles.cellDesc}>{li.description}</Text>
              <Text style={styles.cellQty}>{li.quantity}</Text>
              <Text style={styles.cellPrice}>
                {formatMinor(li.unitPriceMinor, invoice.currency)}
              </Text>
              <Text style={styles.cellTotal}>
                {formatMinor(lineTotalMinor(li), invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatMinor(invoice.subtotalMinor, invoice.currency)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>
              {formatMinor(invoice.taxMinor, invoice.currency)}
            </Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsDivider]}>
            <Text style={[styles.totalsLabel, styles.totalsGrand]}>Total</Text>
            <Text style={[styles.totalsValue, styles.totalsGrand]}>
              {formatMinor(invoice.totalMinor, invoice.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by Invoice Service · Invoice {numberLabel} · Status {invoice.status}
        </Text>
      </Page>
    </Document>
  );
}
