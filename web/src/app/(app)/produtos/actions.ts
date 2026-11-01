"use server";

import { db } from "@/lib/db";
import { products, auditLog } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { calculateTheoreticalWeight, getDefaultDensity } from "@/lib/metallurgy/weight";
import { eq, desc, ilike, and, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  erpCode: z.string().optional().nullable(),
  family: z.enum(["chapa_grossa", "bobina", "tubo", "perfil", "barra"]),
  commercialDescription: z.string().min(3, "Descrição comercial obrigatória"),
  fiscalDescription: z.string().min(3, "Descrição fiscal obrigatória"),
  norm: z.string().min(2, "Norma técnica obrigatória"),
  ncm: z.string().length(8, "NCM deve ter exatamente 8 dígitos"),
  thicknessMm: z.number().optional().nullable(),
  widthMm: z.number().optional().nullable(),
  lengthMm: z.number().optional().nullable(),
  diameterMm: z.number().optional().nullable(),
  wallMm: z.number().optional().nullable(),
  densityGCm3: z.number().optional().nullable(),
  unit: z.enum(["kg", "m", "un", "t"]),
  replacementCostBase: z.number().min(0, "Custo de reposição deve ser maior ou igual a zero"),
  status: z.enum(["ativo", "inativo", "homologacao"]).default("ativo"),
});

export type ProductInput = z.infer<typeof productInputSchema>;

// Automatic sequential SKU generation: FAM-NNNN
async function generateNextSku(family: string, tenantId: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    chapa_grossa: "CG",
    bobina: "BOB",
    tubo: "TUB",
    perfil: "PRF",
    barra: "BAR",
  };
  const prefix = prefixMap[family] || "PRD";

  // Count existing products of this family
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.family, family as any)));

  const nextSeq = (Number(result?.count) || 0) + 1;
  const padded = String(nextSeq).padStart(4, "0");
  return `SKU-${prefix}-${padded}`;
}

export async function saveProduct(input: ProductInput) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_produtos", "write");

  const density = input.densityGCm3 || getDefaultDensity(input.family, input.norm);
  const { weightPerUnit } = calculateTheoreticalWeight({
    family: input.family,
    thicknessMm: input.thicknessMm,
    widthMm: input.widthMm,
    lengthMm: input.lengthMm,
    diameterMm: input.diameterMm,
    wallMm: input.wallMm,
    densityGCm3: density,
    unit: input.unit,
  });

  if (input.id) {
    // UPDATE
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, input.id), eq(products.tenantId, user.tenantId)))
      .limit(1);

    if (!existing) {
      throw new Error("Produto não encontrado.");
    }

    const [updated] = await db
      .update(products)
      .set({
        erpCode: input.erpCode || null,
        family: input.family,
        commercialDescription: input.commercialDescription,
        fiscalDescription: input.fiscalDescription,
        norm: input.norm,
        ncm: input.ncm,
        thicknessMm: input.thicknessMm ? String(input.thicknessMm) : null,
        widthMm: input.widthMm ? String(input.widthMm) : null,
        lengthMm: input.lengthMm ? String(input.lengthMm) : null,
        diameterMm: input.diameterMm ? String(input.diameterMm) : null,
        wallMm: input.wallMm ? String(input.wallMm) : null,
        densityGCm3: String(density),
        unit: input.unit,
        weightPerUnit: String(weightPerUnit),
        replacementCostBase: String(input.replacementCostBase),
        status: input.status,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.id))
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "products",
      entityId: updated.id,
      action: "update",
      before: existing,
      after: updated,
    });

    revalidatePath("/produtos");
    return { success: true, product: updated };
  } else {
    // CREATE
    const sku = await generateNextSku(input.family, user.tenantId);

    const [created] = await db
      .insert(products)
      .values({
        tenantId: user.tenantId,
        sku,
        erpCode: input.erpCode || null,
        family: input.family,
        commercialDescription: input.commercialDescription,
        fiscalDescription: input.fiscalDescription,
        norm: input.norm,
        ncm: input.ncm,
        thicknessMm: input.thicknessMm ? String(input.thicknessMm) : null,
        widthMm: input.widthMm ? String(input.widthMm) : null,
        lengthMm: input.lengthMm ? String(input.lengthMm) : null,
        diameterMm: input.diameterMm ? String(input.diameterMm) : null,
        wallMm: input.wallMm ? String(input.wallMm) : null,
        densityGCm3: String(density),
        unit: input.unit,
        weightPerUnit: String(weightPerUnit),
        replacementCostBase: String(input.replacementCostBase),
        status: input.status,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "products",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });

    revalidatePath("/produtos");
    return { success: true, product: created };
  }
}

export async function deleteProduct(productId: string) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_produtos", "write");

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, user.tenantId)))
    .limit(1);

  if (!existing) {
    throw new Error("Produto não encontrado.");
  }

  // Soft delete (inativar)
  const [updated] = await db
    .update(products)
    .set({
      status: "inativo",
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId))
    .returning();

  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "products",
    entityId: productId,
    action: "update",
    before: existing,
    after: updated,
  });

  revalidatePath("/produtos");
  return { success: true };
}
