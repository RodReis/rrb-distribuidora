import { NextResponse } from "next/server";
import { guardPurchase, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { generatePurchasePdf } from "@/lib/purchases/pdf/generate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/purchases/[id]/pdf — PDF do pedido de compra.
 *
 * Só PC emitido (com número) gera documento: rascunho responde 409 e pedido de
 * outro tenant/inexistente responde 404, ambos via `purchaseErrorResponse`.
 * O PDF é gerado em homologação enquanto o cadastro fiscal da distribuidora
 * (LAC-12) não existir — o aviso vai impresso no próprio documento.
 */
export async function GET(_req: Request, { params }: Params) {
  const guard = await guardPurchase("purchase.read");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const { fileName, buffer } = await generatePurchasePdf({
      tenantId: guard.user.tenantId,
      id,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
