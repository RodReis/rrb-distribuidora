/**
 * Geração e armazenamento do PDF da proposta — MVP-03.
 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotes } from "@/lib/db/schema";
import { uploadFile, type StoredFile } from "@/lib/storage/r2";
import { QUOTE_CHANNEL_LABELS, type QuoteChannel } from "../pricing";
import { getQuote } from "../service";
import { QuoteDocument, type QuotePdfData, type QuotePdfItem } from "./quote-document";

const dateTimeBR = (value: Date | string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const dateBR = (value: Date | string) =>
  new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const PROCESS_LABELS: Record<string, string> = {
  laser: "Corte laser",
  plasma: "Corte plasma",
  oxicorte: "Oxicorte CNC",
  serra: "Serra de fita",
  guilhotina: "Guilhotina",
  dobra: "Dobra",
};

function geometryLabel(item: {
  geometryType: string;
  thicknessMm: string | number | null;
  widthMm: string | number | null;
  lengthMm: string | number | null;
  diameterMm: string | number | null;
  innerDiameterMm: string | number | null;
  wallMm: string | number | null;
}): string {
  const num = (v: string | number | null) => (v == null ? null : Number(v));
  const n = (v: string | number | null) => {
    const value = num(v);
    return value && value > 0 ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : null;
  };

  switch (item.geometryType) {
    case "CHAPA_RETANGULAR":
      return [`${n(item.lengthMm) ?? "?"} × ${n(item.widthMm) ?? "?"} mm`, n(item.thicknessMm)]
        .filter(Boolean)
        .join(" × ");
    case "DISCO":
      return [
        `Ø ${n(item.diameterMm) ?? "?"} mm`,
        n(item.innerDiameterMm) ? `furo Ø ${n(item.innerDiameterMm)} mm` : null,
        n(item.thicknessMm),
      ]
        .filter(Boolean)
        .join(" · ");
    case "BARRA_CORTE":
      return `Ø ${n(item.diameterMm) ?? "?"} mm · corte ${n(item.lengthMm) ?? "?"} mm`;
    case "TUBO_CORTE":
      return `Ø ${n(item.diameterMm) ?? "?"} mm · parede ${n(item.wallMm) ?? "?"} mm · corte ${
        n(item.lengthMm) ?? "?"
      } mm`;
    default:
      return "Produto de catálogo";
  }
}

export async function generateQuotePdf(tenantId: string, quoteId: string): Promise<StoredFile> {
  const detail = await getQuote(tenantId, quoteId);
  if (!detail) throw new Error("Orçamento não encontrado.");
  if (!detail.items.length) throw new Error("Orçamento sem itens para gerar PDF.");

  const items: QuotePdfItem[] = detail.items.map((item) => ({
    sku: item.sku,
    description: item.description,
    norm: item.norm,
    geometryLabel: geometryLabel(item),
    processLabel: PROCESS_LABELS[item.processType ?? "laser"] ?? "Corte",
    quantity: item.quantity,
    netWeightKg: Number(item.netWeightKg),
    grossWeightKg: Number(item.grossWeightKg),
    unitPrice: Number(item.unitPrice),
    totalItemAmount: Number(item.totalItemAmount),
    remnantCode: item.remnantCode,
  }));

  const data: QuotePdfData = {
    tenantName: detail.tenantName ?? "MetalAgents",
    quoteNumberLabel: `#${1000 + detail.quote.quoteNumber}`,
    createdAt: dateTimeBR(detail.quote.createdAt),
    customerName: detail.customer.legalName,
    customerDocument: detail.customer.document,
    customerCity: [detail.customer.city, detail.customer.uf].filter(Boolean).join(" / "),
    customerContact: [detail.customer.contacts?.contactName, detail.customer.contacts?.phone]
      .filter(Boolean)
      .join(" · "),
    sellerName: detail.sellerName ?? "Equipe comercial",
    channelLabel:
      QUOTE_CHANNEL_LABELS[detail.quote.channel as QuoteChannel] ?? detail.quote.channel,
    validUntilLabel: dateBR(detail.quote.validUntil),
    volatilityPct: Number(detail.quote.marketVolatilityPct),
    items,
    totalMaterialCost: Number(detail.quote.totalMaterialCost),
    totalProcessCost: Number(detail.quote.totalProcessCost),
    totalFreightCost: Number(detail.quote.totalFreightCost),
    totalServicesCost: Number(detail.quote.totalServicesCost),
    totalAmount: Number(detail.quote.totalAmount),
    paymentTerms: detail.quote.paymentTerms ?? "",
    deliveryMethod: detail.quote.deliveryMethod ?? "",
    deliveryDeadline: detail.quote.deliveryDeadline ? dateBR(detail.quote.deliveryDeadline) : "",
    bankingInfo: detail.quote.bankingInfo ?? "",
    notes: detail.quote.notes ?? "",
  };

  const buffer = await renderToBuffer(<QuoteDocument data={data} />);
  const key = `quotes/${tenantId}/${detail.quote.quoteNumber}-proposta.pdf`;
  const stored = await uploadFile(key, buffer, "application/pdf");

  await db
    .update(quotes)
    .set({ pdfFileKey: stored.key, updatedAt: new Date() })
    .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));

  return stored;
}
