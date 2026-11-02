/**
 * Template da proposta comercial em PDF — MVP-03.
 *
 * Executado exclusivamente no servidor por @react-pdf/renderer.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface QuotePdfItem {
  sku: string;
  description: string;
  norm: string;
  geometryLabel: string;
  processLabel: string;
  quantity: number;
  netWeightKg: number;
  grossWeightKg: number;
  unitPrice: number;
  totalItemAmount: number;
  remnantCode?: string | null;
}

export interface QuotePdfData {
  tenantName: string;
  quoteNumberLabel: string;
  createdAt: string;
  customerName: string;
  customerDocument: string;
  customerCity: string;
  customerContact: string;
  sellerName: string;
  channelLabel: string;
  validUntilLabel: string;
  volatilityPct: number;
  items: QuotePdfItem[];
  totalMaterialCost: number;
  totalProcessCost: number;
  totalFreightCost: number;
  totalServicesCost: number;
  totalAmount: number;
  paymentTerms: string;
  deliveryMethod: string;
  deliveryDeadline: string;
  bankingInfo: string;
  notes: string;
}

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const kg = (value: number) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

const mm = (value: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 42,
    paddingHorizontal: 32,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: "#1c1c1e",
    lineHeight: 1.35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#b71c1c",
    paddingBottom: 10,
    marginBottom: 12,
  },
  brand: { fontSize: 16, lineHeight: 1.35, fontFamily: "Helvetica-Bold", color: "#111111" },
  brandSub: { fontSize: 7, color: "#6b6b70", letterSpacing: 1.4, marginTop: 1 },
  quoteBox: { alignItems: "flex-end" },
  quoteNumber: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#b71c1c" },
  quoteMeta: { fontSize: 7.5, color: "#6b6b70", marginTop: 2 },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: "#6b6b70",
    marginBottom: 4,
    marginTop: 10,
  },
  grid: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: "#d8d8dc",
    borderRadius: 3,
    padding: 8,
  },
  cardLabel: { fontSize: 7, color: "#8a8a90", marginBottom: 2 },
  cardValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1c1c1e" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1f2228",
    borderRadius: 2,
    paddingVertical: 5,
    paddingHorizontal: 5,
    marginTop: 4,
  },
  tableHeaderCell: {
    fontSize: 6.6,
    fontFamily: "Helvetica-Bold",
    color: "#f3f3f5",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e6e6ea",
  },
  rowAlt: { backgroundColor: "#fafafa" },
  cell: { fontSize: 7.6, color: "#2a2a2e" },
  cellMuted: { fontSize: 6.8, color: "#7a7a80", marginTop: 1 },
  colSku: { width: "16%" },
  colDesc: { width: "34%" },
  colQty: { width: "8%", textAlign: "right" },
  colWeight: { width: "13%", textAlign: "right" },
  colUnit: { width: "14%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: "46%" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  totalLabel: { fontSize: 8, color: "#5a5a60" },
  totalValue: { fontSize: 8, color: "#1c1c1e" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#b71c1c",
  },
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111111" },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#b71c1c" },
  clause: {
    marginTop: 14,
    borderWidth: 0.8,
    borderColor: "#e0c4c4",
    backgroundColor: "#fdf6f6",
    borderRadius: 3,
    padding: 8,
  },
  clauseTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#b71c1c",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  clauseText: { fontSize: 7.8, color: "#3a3a3e" },
  conditions: { marginTop: 10, flexDirection: "row", gap: 10 },
  conditionCol: { flex: 1 },
  conditionLine: { fontSize: 7.6, color: "#3a3a3e", marginBottom: 2 },
  conditionKey: { color: "#7a7a80" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: "#d8d8dc",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6.4, color: "#9a9aa0" },
});

export function QuoteDocument({ data }: { data: QuotePdfData }) {
  const totalWeight = data.items.reduce((sum, item) => sum + item.netWeightKg, 0);

  return (
    <Document
      title={`Proposta ${data.quoteNumberLabel} — ${data.tenantName}`}
      author={data.tenantName}
      subject="Proposta comercial"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.tenantName}</Text>
            <Text style={styles.brandSub}>DISTRIBUIÇÃO E CORTE DE METAIS</Text>
          </View>
          <View style={styles.quoteBox}>
            <Text style={styles.quoteNumber}>{data.quoteNumberLabel}</Text>
            <Text style={styles.quoteMeta}>Proposta comercial · {data.createdAt}</Text>
            <Text style={styles.quoteMeta}>Validade: {data.validUntilLabel}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>CLIENTE</Text>
            <Text style={styles.cardValue}>{data.customerName}</Text>
            <Text style={styles.cellMuted}>{data.customerDocument}</Text>
            {!!data.customerCity && <Text style={styles.cellMuted}>{data.customerCity}</Text>}
            {!!data.customerContact && <Text style={styles.cellMuted}>{data.customerContact}</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ATENDIMENTO</Text>
            <Text style={styles.cardValue}>{data.sellerName}</Text>
            <Text style={styles.cellMuted}>Canal: {data.channelLabel}</Text>
            <Text style={styles.cellMuted}>
              Volatilidade semanal: {data.volatilityPct.toFixed(2)}%
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>RESUMO</Text>
            <Text style={styles.cardValue}>{data.items.length} item(ns)</Text>
            <Text style={styles.cellMuted}>Peso líquido: {kg(totalWeight)}</Text>
            <Text style={styles.cellMuted}>Proposta válida até {data.validUntilLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ITENS DA PROPOSTA</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colSku]}>SKU</Text>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>ESPECIFICAÇÃO</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>QTD</Text>
          <Text style={[styles.tableHeaderCell, styles.colWeight]}>PESO LÍQ.</Text>
          <Text style={[styles.tableHeaderCell, styles.colUnit]}>UNITÁRIO</Text>
          <Text style={[styles.tableHeaderCell, styles.colTotal]}>TOTAL</Text>
        </View>

        {data.items.map((item, index) => (
          <View
            key={`${item.sku}-${index}`}
            style={[styles.row, index % 2 === 1 ? styles.rowAlt : undefined]}
          >
            <View style={styles.colSku}>
              <Text style={styles.cell}>{item.sku}</Text>
            </View>
            <View style={styles.colDesc}>
              <Text style={styles.cell}>{item.description}</Text>
              <Text style={styles.cellMuted}>
                {item.norm} · {item.geometryLabel}
              </Text>
              <Text style={styles.cellMuted}>
                {item.processLabel}
                {item.remnantCode ? ` · Retalho ${item.remnantCode}` : ""}
              </Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.cell}>{item.quantity}</Text>
            </View>
            <View style={styles.colWeight}>
              <Text style={styles.cell}>{mm(item.netWeightKg)}</Text>
              <Text style={styles.cellMuted}>bruto {mm(item.grossWeightKg)}</Text>
            </View>
            <View style={styles.colUnit}>
              <Text style={styles.cell}>{money(item.unitPrice)}</Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.cell}>{money(item.totalItemAmount)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Material</Text>
            <Text style={styles.totalValue}>{money(data.totalMaterialCost)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Processo / máquina</Text>
            <Text style={styles.totalValue}>{money(data.totalProcessCost)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Frete</Text>
            <Text style={styles.totalValue}>{money(data.totalFreightCost)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Serviços de terceiros</Text>
            <Text style={styles.totalValue}>{money(data.totalServicesCost)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{money(data.totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.clause}>
          <Text style={styles.clauseTitle}>CLÁUSULA DE VALIDADE PREVENTIVA</Text>
          <Text style={styles.clauseText}>
            Proposta válida até {data.validUntilLabel}. O prazo é definido dinamicamente pela
            volatilidade do metal — nesta emissão, {data.volatilityPct.toFixed(2)}% na semana.
            Reajustes após essa data dependem de nova confirmação de preço.
          </Text>
        </View>

        <View style={styles.conditions}>
          <View style={styles.conditionCol}>
            <Text style={styles.conditionLine}>
              <Text style={styles.conditionKey}>Pagamento: </Text>
              {data.paymentTerms || "A combinar"}
            </Text>
            <Text style={styles.conditionLine}>
              <Text style={styles.conditionKey}>Entrega: </Text>
              {data.deliveryDeadline || "A combinar"}
            </Text>
          </View>
          <View style={styles.conditionCol}>
            <Text style={styles.conditionLine}>
              <Text style={styles.conditionKey}>Modalidade: </Text>
              {data.deliveryMethod || "Retirada no balcão"}
            </Text>
            <Text style={styles.conditionLine}>
              <Text style={styles.conditionKey}>Dados bancários/PIX: </Text>
              {data.bankingInfo || "Informados no faturamento"}
            </Text>
          </View>
        </View>

        {!!data.notes && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionTitle}>OBSERVAÇÕES</Text>
            <Text style={styles.clauseText}>{data.notes}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.tenantName} · Proposta {data.quoteNumberLabel}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
