import { NextResponse } from "next/server";
import { guardSupplier, supplierErrorResponse } from "@/lib/suppliers/api-auth";
import { getSupplierPerformance } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardSupplier("supplier.read");
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const data = await getSupplierPerformance({
      tenantId: guard.user.tenantId,
      role: guard.user.role,
      supplierId: id,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return supplierErrorResponse(error);
  }
}
