import { NextResponse } from "next/server";
import { guardPurchase, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import {
  buildPurchasesCsv,
  listPurchasesForExport,
  parsePurchasesExportFilters,
  purchasesCsvFileName,
} from "@/lib/purchases/export";

export const dynamic = "force-dynamic";

/**
 * GET /api/purchases/export?format=csv — CSV da lista filtrada.
 *
 * Aceita os mesmos filtros da lista (`status`, `supplierId`, `q`, `from`, `to`),
 * sempre restrito ao tenant da sessão. A permissão é `purchase.read`, igual à
 * consulta que a exportação espelha.
 */
export async function GET(req: Request) {
  const guard = await guardPurchase("purchase.read");
  if (guard.error) return guard.error;

  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    if (format !== "csv") {
      return NextResponse.json(
        { error: "Formato de exportação não suportado. Use format=csv." },
        { status: 400 }
      );
    }

    const { rows, truncated } = await listPurchasesForExport({
      tenantId: guard.user.tenantId,
      filters: parsePurchasesExportFilters(url.searchParams),
    });
    const csv = buildPurchasesCsv(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${purchasesCsvFileName()}"`,
        "Cache-Control": "no-store",
        // Sinaliza truncamento pelo limite de segurança sem quebrar o CSV.
        ...(truncated ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
