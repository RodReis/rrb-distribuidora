import { notFound } from "next/navigation";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { loadBuilderCatalog } from "@/lib/quotes/builder-data";
import { getQuote } from "@/lib/quotes/service";
import type { CutProcess, GeometryType } from "@/lib/metallurgy/weight-formulas";
import { QuoteBuilder } from "../../quote-builder";
import type { BuilderItem } from "../../quote-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const toNumberOrEmpty = (value: string | null) => (value == null ? ("" as const) : Number(value));

export default async function EditarOrcamentoPage({ params }: PageProps) {
  if (!(await checkPermission("vendas_orcamentos", "write"))) {
    return <Forbidden module="Vendas & Orçamentos" />;
  }

  const user = await getCurrentUser();
  const { id } = await params;
  const detail = await getQuote(user.tenantId, id);
  if (!detail) notFound();

  if (detail.salesOrder) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded border border-carbon-700/80 bg-carbon-900 p-space-md text-center">
        <h1 className="font-headline-sm text-headline-sm text-ice-white">
          Orçamento já convertido em pedido
        </h1>
        <p className="mt-2 text-body-md text-titanium-muted">
          Este orçamento não pode mais ser editado. Consulte o pedido de venda gerado.
        </p>
      </div>
    );
  }

  if (detail.quote.status !== "rascunho" && detail.quote.status !== "bloqueado_margem") {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded border border-carbon-700/80 bg-carbon-900 p-space-md text-center">
        <h1 className="font-headline-sm text-headline-sm text-ice-white">
          Orçamento fora da etapa de edição
        </h1>
        <p className="mt-2 text-body-md text-titanium-muted">
          Somente orçamentos em rascunho ou bloqueados por margem podem ser editados. Este orçamento
          está em “{detail.statusLabel}”.
        </p>
      </div>
    );
  }

  const catalog = await loadBuilderCatalog(user.tenantId);

  const items: BuilderItem[] = detail.items.map((item) => ({
    key: item.id,
    productId: item.productId,
    remnantId: item.remnantId,
    remnantCode: item.remnantCode,
    geometryType: item.geometryType as GeometryType,
    thicknessMm: toNumberOrEmpty(item.thicknessMm),
    widthMm: toNumberOrEmpty(item.widthMm),
    lengthMm: toNumberOrEmpty(item.lengthMm),
    diameterMm: toNumberOrEmpty(item.diameterMm),
    innerDiameterMm: toNumberOrEmpty(item.innerDiameterMm),
    wallMm: toNumberOrEmpty(item.wallMm),
    quantity: item.quantity,
    processType: (item.processType ?? "laser") as CutProcess,
    machineId: item.machineId ?? "",
    setupMinutes: item.setupMinutes == null ? "" : Number(item.setupMinutes),
    manualUnitPrice: "",
  }));

  return (
    <QuoteBuilder
      catalog={catalog}
      quoteId={detail.quote.id}
      quoteNumberLabel={`#${1000 + detail.quote.quoteNumber}`}
      statusLabel={detail.statusLabel}
      initialForm={{
        customerId: detail.quote.customerId,
        channel: detail.quote.channel,
        targetMarginPct: Number(detail.quote.targetMarginPct),
        discountPct: Number(detail.quote.discountPct),
        freightCost: Number(detail.quote.totalFreightCost),
        servicesCost: Number(detail.quote.totalServicesCost),
        paymentTerms: detail.quote.paymentTerms ?? "",
        deliveryMethod: detail.quote.deliveryMethod ?? "",
        deliveryDeadline: detail.quote.deliveryDeadline
          ? detail.quote.deliveryDeadline.toISOString().slice(0, 10)
          : "",
        bankingInfo: detail.quote.bankingInfo ?? "",
        notes: detail.quote.notes ?? "",
      }}
      initialItems={items}
    />
  );
}
