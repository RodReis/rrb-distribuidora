/**
 * Template do Pedido de Compra (PC) em PDF — LAC-01 US-04.
 *
 * Executado exclusivamente no servidor por @react-pdf/renderer, no mesmo padrão
 * tipográfico dos PDFs de orçamento (`quotes/pdf/quote-document.tsx`): A4,
 * Helvetica, acento vinho e hierarquia por seções.
 *
 * A modelagem de dados e os avisos de homologação (LAC-12) ficam em
 * `purchase-document-data.ts` — módulo puro, sem React, para ser testado sem
 * renderização. Este arquivo cuida apenas da composição visual.
 *
 * IMPORTANTE — HOMOLOGAÇÃO (LAC-12):
 * o cadastro fiscal da distribuidora ainda NÃO existe no tenant. O documento
 * exibe a faixa e a marca d'água "DOCUMENTO EM HOMOLOGAÇÃO" em todas as páginas
 * e NÃO se apresenta como documento fiscal final. Não remover esse aviso antes
 * de a LAC-12 entregar o cadastro fiscal validado.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PurchasePdfData } from "./purchase-document-data";

export {
  HOMOLOGATION_DETAIL,
  HOMOLOGATION_NOTICE,
  SHORT_APPROVAL_HASH_LENGTH,
  buildPurchasePdfData,
  formatCnpjBR,
  formatDateBR,
  formatDateTimeBR,
  formatMoneyBR,
  formatQuantityBR,
  purchasePdfNumberLabel,
  shortApprovalHash,
} from "./purchase-document-data";
export type {
  PurchasePdfApproval,
  PurchasePdfData,
  PurchasePdfItem,
  PurchasePdfSource,
  PurchasePdfSourceItem,
  PurchasePdfSourceOrder,
} from "./purchase-document-data";

// ---------------------------------------------------------------------------
// Estilos (tokens equivalentes aos do PDF de proposta)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 58,
    paddingHorizontal: 32,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: "#1c1c1e",
    lineHeight: 1.35,
  },
  watermark: {
    position: "absolute",
    top: 300,
    left: 0,
    right: 0,
    alignItems: "center",
    transform: "rotate(-30deg)",
    opacity: 0.12,
  },
  watermarkText: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 4,
    color: "#b71c1c",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#b71c1c",
    paddingBottom: 10,
    marginBottom: 10,
  },
  brand: { fontSize: 16, lineHeight: 1.35, fontFamily: "Helvetica-Bold", color: "#111111" },
  brandSub: { fontSize: 7, color: "#6b6b70", letterSpacing: 1.4, marginTop: 1 },
  documentBox: { alignItems: "flex-end" },
  documentNumber: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#b71c1c" },
  documentNumberDraft: { fontSize: 11, color: "#8a8a90" },
  documentMeta: { fontSize: 7.5, color: "#6b6b70", marginTop: 2 },
  homologation: {
    borderWidth: 1,
    borderColor: "#d9a3a3",
    backgroundColor: "#fdf6f6",
    borderRadius: 3,
    padding: 6,
    marginBottom: 10,
  },
  homologationTitle: {
    fontSize: 7.6,
    fontFamily: "Helvetica-Bold",
    color: "#b71c1c",
    letterSpacing: 0.4,
  },
  homologationText: { fontSize: 6.9, color: "#7a4a4a", marginTop: 2 },
  grid: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: "#d8d8dc",
    borderRadius: 3,
    padding: 8,
  },
  cardLabel: { fontSize: 7, color: "#8a8a90", marginBottom: 2, letterSpacing: 0.6 },
  cardValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1c1c1e" },
  cardMuted: { fontSize: 6.8, color: "#7a7a80", marginTop: 1 },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: "#6b6b70",
    marginBottom: 4,
    marginTop: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1f2228",
    borderRadius: 2,
    paddingVertical: 5,
    paddingHorizontal: 5,
    marginTop: 2,
  },
  tableHeaderCell: {
    fontSize: 6.4,
    fontFamily: "Helvetica-Bold",
    color: "#f3f3f5",
    letterSpacing: 0.4,
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
  cellRight: { fontSize: 7.6, color: "#2a2a2e", textAlign: "right" },
  cellMuted: { fontSize: 6.6, color: "#7a7a80", marginTop: 1 },
  cellMutedRight: { fontSize: 6.6, color: "#7a7a80", marginTop: 1, textAlign: "right" },
  colSku: { width: "11%" },
  colDesc: { width: "33%" },
  colQty: { width: "11%", textAlign: "right" },
  colUnit: { width: "12%", textAlign: "right" },
  colDiscount: { width: "10%", textAlign: "right" },
  colAdditional: { width: "11%", textAlign: "right" },
  colTotal: { width: "12%", textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: "48%" },
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
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: "#d8d8dc",
    paddingTop: 5,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  footerText: { fontSize: 6.4, color: "#9a9aa0" },
});

export function PurchaseDocument({ data }: { data: PurchasePdfData }) {
  return (
    <Document
      title={`Pedido de Compra ${data.numberLabel} — ${data.tenantName}`}
      author={data.tenantName}
      subject="Pedido de compra — documento em homologação (LAC-12)"
      creator="MetalAgents"
    >
      <Page size="A4" style={styles.page}>
        {/* Marca d'água fixa: repete em todas as páginas enquanto a LAC-12 não existir. */}
        <View style={styles.watermark} fixed>
          <Text style={styles.watermarkText}>HOMOLOGAÇÃO</Text>
        </View>

        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.tenantName}</Text>
            <Text style={styles.brandSub}>PEDIDO DE COMPRA · SUPRIMENTOS</Text>
          </View>
          <View style={styles.documentBox}>
            <Text
              style={[styles.documentNumber, data.isDraft ? styles.documentNumberDraft : undefined]}
            >
              {data.numberLabel}
            </Text>
            <Text style={styles.documentMeta}>Emissão: {data.issuedAtLabel}</Text>
            <Text style={styles.documentMeta}>Estado: {data.statusLabel}</Text>
          </View>
        </View>

        <View style={styles.homologation}>
          <Text style={styles.homologationTitle}>{data.homologationNotice}</Text>
          <Text style={styles.homologationText}>{data.homologationDetail}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>FORNECEDOR</Text>
            <Text style={styles.cardValue}>{data.supplier.legalName}</Text>
            {!!data.supplier.tradeName && (
              <Text style={styles.cardMuted}>{data.supplier.tradeName}</Text>
            )}
            <Text style={styles.cardMuted}>CNPJ: {data.supplier.cnpjLabel}</Text>
            <Text style={styles.cardMuted}>{data.supplier.cityUfLabel}</Text>
            <Text style={styles.cardMuted}>Pagamento: {data.supplier.paymentTermsLabel}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>CONDIÇÕES</Text>
            <Text style={styles.cardValue}>Entrega prevista: {data.expectedDeliveryLabel}</Text>
            <Text style={styles.cardMuted}>Moeda: {data.currencyLabel}</Text>
            <Text style={styles.cardMuted}>
              {data.items.length} {data.items.length === 1 ? "item" : "itens"} no pedido
            </Text>
            <Text style={styles.cardMuted}>
              Aprovação: {data.approval.versionLabel} · {data.approval.hashLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ITENS DO PEDIDO</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colSku]}>SKU</Text>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>DESCRIÇÃO</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>QTD</Text>
          <Text style={[styles.tableHeaderCell, styles.colUnit]}>UNITÁRIO</Text>
          <Text style={[styles.tableHeaderCell, styles.colDiscount]}>DESCONTO</Text>
          <Text style={[styles.tableHeaderCell, styles.colAdditional]}>CUSTOS ADIC.</Text>
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
              {!!item.notes && <Text style={styles.cellMuted}>{item.notes}</Text>}
            </View>
            <View style={styles.colQty}>
              <Text style={styles.cellRight}>{item.quantityLabel}</Text>
            </View>
            <View style={styles.colUnit}>
              <Text style={styles.cellRight}>{item.unitPriceLabel}</Text>
            </View>
            <View style={styles.colDiscount}>
              <Text style={styles.cellRight}>{item.discountLabel}</Text>
            </View>
            <View style={styles.colAdditional}>
              <Text style={styles.cellRight}>{item.additionalCostsLabel}</Text>
              {!!item.additionalCostsDetail && (
                <Text style={styles.cellMutedRight}>{item.additionalCostsDetail}</Text>
              )}
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.cellRight}>{item.lineTotalLabel}</Text>
            </View>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{data.totals.subtotalLabel}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Descontos</Text>
            <Text style={styles.totalValue}>{data.totals.discountLabel}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Custos adicionais</Text>
            <Text style={styles.totalValue}>{data.totals.additionalCostsLabel}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL GERAL</Text>
            <Text style={styles.grandTotalValue}>{data.totals.grandTotalLabel}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              {data.tenantName} · {data.numberLabel}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
            />
          </View>
          <Text style={styles.footerText}>
            Versão {data.approval.versionLabel} · hash aprovado {data.approval.hashLabel} · aprovado
            em {data.approval.approvedAtLabel} · documento em homologação (LAC-12)
          </Text>
        </View>
      </Page>
    </Document>
  );
}
