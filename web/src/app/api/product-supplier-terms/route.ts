import { NextResponse } from "next/server";
import { z } from "zod";
import { productUnitEnum } from "@/lib/db/schema";
import { guardSupplier, supplierErrorResponse } from "@/lib/suppliers/api-auth";
import { listProductSupplierTerms, saveProductSupplierTerm } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

const termSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  preferred: z.boolean(),
  leadTimeDays: z.number().int().positive().nullable(),
  minimumOrderQty: z.number().positive().nullable(),
  unit: z.enum(productUnitEnum.enumValues).nullable(),
  validFrom: z.string().datetime(),
});
const versionSchema = termSchema.extend({ termId: z.string().uuid() });

export async function GET() {
  const guard = await guardSupplier("supplier.read");
  if (guard.error) return guard.error;
  try {
    return NextResponse.json({
      data: await listProductSupplierTerms(guard.user.tenantId, guard.user.role),
    });
  } catch (error) {
    return supplierErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardSupplier("supplier.configure_terms");
  if (guard.error) return guard.error;
  const parsed = termSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Condição inválida.", issues: parsed.error.flatten() },
      { status: 422 }
    );
  try {
    const term = await saveProductSupplierTerm({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      value: parsed.data,
    });
    return NextResponse.json({ data: term }, { status: 201 });
  } catch (error) {
    return supplierErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const guard = await guardSupplier("supplier.configure_terms");
  if (guard.error) return guard.error;
  const parsed = versionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Nova versão inválida.", issues: parsed.error.flatten() },
      { status: 422 }
    );
  try {
    const { termId, ...value } = parsed.data;
    const term = await saveProductSupplierTerm({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      termId,
      value,
    });
    return NextResponse.json({ data: term });
  } catch (error) {
    return supplierErrorResponse(error);
  }
}
