import { notFound } from "next/navigation";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { getQuote } from "@/lib/quotes/service";
import { QuoteDetailClient, type QuoteDetailData } from "./quote-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrcamentoDetalhePage({ params }: PageProps) {
  if (!(await checkPermission("vendas_orcamentos", "read"))) {
    return <Forbidden module="Vendas & Orçamentos" />;
  }

  const user = await getCurrentUser();
  const { id } = await params;
  const detail = await getQuote(user.tenantId, id);
  if (!detail) notFound();

  const canWrite = await checkPermission("vendas_orcamentos", "write");
  const canApproveMargin = user.role === "diretor" || user.role === "admin";

  const data: QuoteDetailData = {
    id: detail.quote.id,
    quoteNumberLabel: `#${1000 + detail.quote.quoteNumber}`,
    status: detail.quote.status,
    statusLabel: detail.statusLabel,
    channel: detail.quote.channel,
    createdAt: detail.quote.createdAt.toISOString(),
    validUntil: detail.quote.validUntil.toISOString(),
    expired: detail.expired,
    totalMaterialCost: Number(detail.quote.totalMaterialCost),
    totalProcessCost: Number(detail.quote.totalProcessCost),
    totalFreightCost: Number(detail.quote.totalFreightCost),
    totalServicesCost: Number(detail.quote.totalServicesCost),
    totalAmount: Number(detail.quote.totalAmount),
    grossMarginPct: Number(detail.quote.grossMarginPct),
    minMarginPct: Number(detail.quote.minMarginPct),
    marketSymbol: detail.quote.marketSymbol,
    marketVolatilityPct: Number(detail.quote.marketVolatilityPct),
    paymentTerms: detail.quote.paymentTerms,
    deliveryMethod: detail.quote.deliveryMethod,
    deliveryDeadline: detail.quote.deliveryDeadline
      ? detail.quote.deliveryDeadline.toISOString()
      : null,
    bankingInfo: detail.quote.bankingInfo,
    notes: detail.quote.notes,
    lossReason: detail.quote.lossReason,
    pdfFileKey: detail.quote.pdfFileKey,
    approvedAt: detail.quote.approvedAt ? detail.quote.approvedAt.toISOString() : null,
    approvedByDirectorId: detail.quote.approvedByDirectorId,
    targetMarginPct: Number(detail.quote.targetMarginPct),
    discountPct: Number(detail.quote.discountPct),
    customer: {
      id: detail.customer.id,
      legalName: detail.customer.legalName,
      tradeName: detail.customer.tradeName,
      document: detail.customer.document,
      city: detail.customer.city,
      uf: detail.customer.uf,
      contacts: detail.customer.contacts ?? null,
    },
    sellerName: detail.sellerName,
    tenantName: detail.tenantName,
    items: detail.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      remnantId: item.remnantId,
      geometryType: item.geometryType,
      thicknessMm: item.thicknessMm,
      widthMm: item.widthMm,
      lengthMm: item.lengthMm,
      diameterMm: item.diameterMm,
      innerDiameterMm: item.innerDiameterMm,
      wallMm: item.wallMm,
      processType: item.processType,
      quantity: item.quantity,
      netWeightKg: item.netWeightKg,
      grossWeightKg: item.grossWeightKg,
      scrapPct: item.scrapPct,
      unitMaterialCost: item.unitMaterialCost,
      unitProcessCost: item.unitProcessCost,
      unitPrice: item.unitPrice,
      totalItemAmount: item.totalItemAmount,
      itemMarginPct: item.itemMarginPct,
      replacementCostPerKg: item.replacementCostPerKg,
      setupMinutes: item.setupMinutes,
      estimatedCutTimeMinutes: item.estimatedCutTimeMinutes,
      sku: item.sku,
      description: item.description,
      norm: item.norm,
      family: item.family,
      machineName: item.machineName,
      remnantCode: item.remnantCode,
    })),
    salesOrder: detail.salesOrder
      ? {
          id: detail.salesOrder.id,
          orderNumber: detail.salesOrder.orderNumber,
          orderStatus: detail.salesOrder.orderStatus,
          totalAmount: detail.salesOrder.totalAmount,
          createdAt: detail.salesOrder.createdAt.toISOString(),
        }
      : null,
  };

  return (
    <QuoteDetailClient
      data={data}
      canWrite={canWrite}
      canApproveMargin={canApproveMargin}
      canEdit={canWrite}
    />
  );
}
