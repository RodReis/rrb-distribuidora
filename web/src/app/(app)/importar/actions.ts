"use server";

import { db } from "@/lib/db";
import {
  products,
  suppliers,
  customers,
  importJobs,
  auditLog,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import {
  calculateTheoreticalWeight,
  getDefaultDensity,
} from "@/lib/metallurgy/weight";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type Row = Record<string, string>;
export interface ImportError {
  row: number;
  field?: string;
  message: string;
}

// ---------- helpers ----------
function clean(v: string | undefined | null): string {
  return (v || "").trim();
}

function digits(v: string | undefined | null): string {
  return (v || "").replace(/\D/g, "");
}

function parseNum(v: string | undefined | null): number | null {
  const s = clean(v);
  if (!s) return null;
  let n: string;
  if (s.includes(",") && s.includes(".")) {
    n = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    n = s.replace(",", ".");
  } else {
    n = s;
  }
  const parsed = parseFloat(n);
  return isNaN(parsed) ? null : parsed;
}

function deaccent(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeFamily(v: string | undefined | null): string | null {
  const s = deaccent(clean(v));
  if (!s) return null;
  if (s.includes("chapa") || s.includes("placa")) return "chapa_grossa";
  if (s.includes("bobina") || s.includes("rolo") || s.includes("coil")) return "bobina";
  if (s.includes("tubo") || s.includes("pipe")) return "tubo";
  if (s.includes("perfil") || s.includes("viga") || s.includes("w ")) return "perfil";
  if (s.includes("barra")) return "barra";
  return null;
}

function normalizeUnit(v: string | undefined | null): string | null {
  const s = deaccent(clean(v));
  if (!s) return null;
  if (s.startsWith("kg") || s.includes("quilo")) return "kg";
  if (s === "m" || s.startsWith("metro") || s === "ml") return "m";
  if (s.startsWith("t") && !s.startsWith("tr")) return "t";
  if (s.startsWith("un") || s.includes("peca") || s === "pc" || s.includes("barra")) return "un";
  return null;
}

function normalizeStatus(v: string | undefined | null): string {
  const s = deaccent(clean(v));
  if (s.includes("inat")) return "inativo";
  if (s.includes("homolog")) return "homologacao";
  return "ativo";
}

function normalizeType(v: string | undefined | null): string {
  const s = deaccent(clean(v));
  if (s.includes("usina") || s.includes("mill")) return "usina";
  if (s.includes("trader") || s.includes("import")) return "trader";
  return "distribuidor";
}

async function requireAdminForImport() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN: Apenas administradores executam importações.");
  }
  return user;
}

async function generateNextSkuTx(
  tx: any,
  family: string,
  tenantId: string
): Promise<string> {
  const prefixMap: Record<string, string> = {
    chapa_grossa: "CG",
    bobina: "BOB",
    tubo: "TUB",
    perfil: "PRF",
    barra: "BAR",
  };
  const prefix = prefixMap[family] || "PRD";
  const [result] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.family, family as any)));
  const nextSeq = (Number(result?.count) || 0) + 1;
  return `SKU-${prefix}-${String(nextSeq).padStart(4, "0")}`;
}

// ---------- product validation ----------
function validateProductRow(row: Row, rowIndex: number): {
  ok?: any;
  error?: ImportError;
} {
  const family = normalizeFamily(row.family);
  if (!family)
    return { error: { row: rowIndex, field: "family", message: "Família inválida (use: chapa grossa, bobina, tubo, perfil ou barra)" } };

  const commercialDescription = clean(row.commercial_description);
  if (commercialDescription.length < 3)
    return { error: { row: rowIndex, field: "commercial_description", message: "Descrição comercial obrigatória" } };

  const fiscalDescription = clean(row.fiscal_description) || commercialDescription;

  const norm = clean(row.norm);
  if (norm.length < 2)
    return { error: { row: rowIndex, field: "norm", message: "Norma técnica obrigatória" } };

  const ncm = digits(row.ncm);
  if (ncm.length !== 8)
    return { error: { row: rowIndex, field: "ncm", message: "NCM deve conter exatamente 8 dígitos" } };

  const unit = normalizeUnit(row.unit);
  if (!unit)
    return { error: { row: rowIndex, field: "unit", message: "Unidade inválida (use: kg, m, un ou t)" } };

  const replacementCostBase = parseNum(row.replacement_cost_base);
  if (replacementCostBase === null || replacementCostBase < 0)
    return { error: { row: rowIndex, field: "replacement_cost_base", message: "Custo de reposição base inválido" } };

  const densityInput = parseNum(row.density_g_cm3);
  const density = densityInput && densityInput > 0 ? densityInput : getDefaultDensity(family, norm);

  const thicknessMm = parseNum(row.thickness_mm);
  const widthMm = parseNum(row.width_mm);
  const lengthMm = parseNum(row.length_mm);
  const diameterMm = parseNum(row.diameter_mm);
  const wallMm = parseNum(row.wall_mm);

  const { weightPerUnit } = calculateTheoreticalWeight({
    family: family as any,
    thicknessMm,
    widthMm,
    lengthMm,
    diameterMm,
    wallMm,
    densityGCm3: density,
    unit: unit as any,
  });

  if (!weightPerUnit || weightPerUnit <= 0)
    return { error: { row: rowIndex, field: "dimensions", message: "Dimensões insuficientes para calcular o peso teórico" } };

  return {
    ok: {
      sku: clean(row.sku) || null,
      erpCode: clean(row.erp_code) || null,
      family,
      commercialDescription,
      fiscalDescription,
      norm,
      ncm,
      thicknessMm,
      widthMm,
      lengthMm,
      diameterMm,
      wallMm,
      density,
      unit,
      weightPerUnit,
      replacementCostBase,
      status: normalizeStatus(row.status),
    },
  };
}

function validateSupplierRow(row: Row, rowIndex: number): {
  ok?: any;
  error?: ImportError;
} {
  const legalName = clean(row.legal_name);
  if (legalName.length < 3)
    return { error: { row: rowIndex, field: "legal_name", message: "Razão social obrigatória" } };

  const cnpj = digits(row.cnpj);
  if (cnpj.length !== 14)
    return { error: { row: rowIndex, field: "cnpj", message: "CNPJ deve conter 14 dígitos" } };

  const leadTimeDays = parseNum(row.lead_time_days);

  return {
    ok: {
      legalName,
      tradeName: clean(row.trade_name) || null,
      cnpj,
      type: normalizeType(row.type),
      city: clean(row.city) || null,
      uf: clean(row.uf) ? clean(row.uf).toUpperCase().slice(0, 2) : null,
      leadTimeDays: leadTimeDays && leadTimeDays > 0 ? Math.round(leadTimeDays) : 7,
      paymentTerms: clean(row.payment_terms) || null,
      contacts: {
        contactName: clean(row.contact_name) || undefined,
        email: clean(row.email) || undefined,
        phone: clean(row.phone) || undefined,
      },
      notes: clean(row.notes) || null,
    },
  };
}

function validateCustomerRow(row: Row, rowIndex: number): {
  ok?: any;
  error?: ImportError;
} {
  const legalName = clean(row.legal_name);
  if (legalName.length < 3)
    return { error: { row: rowIndex, field: "legal_name", message: "Razão social obrigatória" } };

  const document = digits(row.document);
  if (document.length !== 11 && document.length !== 14)
    return { error: { row: rowIndex, field: "document", message: "CPF (11) ou CNPJ (14 dígitos) inválido" } };

  return {
    ok: {
      legalName,
      tradeName: clean(row.trade_name) || null,
      document,
      city: clean(row.city) || null,
      uf: clean(row.uf) ? clean(row.uf).toUpperCase().slice(0, 2) : null,
      stateRegistration: clean(row.state_registration) || null,
      segment: clean(row.segment) || null,
      contacts: {
        contactName: clean(row.contact_name) || undefined,
        email: clean(row.email) || undefined,
        phone: clean(row.phone) || undefined,
      },
      notes: clean(row.notes) || null,
    },
  };
}

function validateRows(entity: string, rows: Row[]): {
  valid: any[];
  errors: ImportError[];
} {
  const valid: any[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, i) => {
    const rowIndex = i + 2; // header = linha 1
    let result;
    if (entity === "produtos") result = validateProductRow(row, rowIndex);
    else if (entity === "fornecedores") result = validateSupplierRow(row, rowIndex);
    else result = validateCustomerRow(row, rowIndex);

    if (result.error) errors.push(result.error);
    else valid.push(result.ok);
  });

  return { valid, errors };
}

// ---------- server actions ----------

/** Dry-run: valida linha a linha sem gravar nada. */
export async function validateImport(
  entity: string,
  rows: Row[]
): Promise<{ ok: boolean; errors: ImportError[]; validCount: number }> {
  await requireAdminForImport();

  if (!["produtos", "fornecedores", "clientes"].includes(entity)) {
    throw new Error("Entidade de importação inválida.");
  }
  if (rows.length > 5000) {
    throw new Error("Limite de 5.000 linhas por importação.");
  }

  const { valid, errors } = validateRows(entity, rows);
  return { ok: errors.length === 0, errors, validCount: valid.length };
}

/** Commit: valida novamente e grava transacionalmente (all-or-nothing). */
export async function commitImport(
  entity: string,
  rows: Row[]
): Promise<{ ok: boolean; imported: number; message: string }> {
  const user = await requireAdminForImport();

  if (!["produtos", "fornecedores", "clientes"].includes(entity)) {
    throw new Error("Entidade de importação inválida.");
  }
  if (rows.length > 5000) {
    throw new Error("Limite de 5.000 linhas por importação.");
  }

  const { valid, errors } = validateRows(entity, rows);
  if (errors.length > 0) {
    return {
      ok: false,
      imported: 0,
      message: `Importação cancelada: ${errors.length} linha(s) inválida(s). Corrija e refaça o dry-run.`,
    };
  }

  let imported = 0;

  await db.transaction(async (tx) => {
    for (const data of valid) {
      if (entity === "produtos") {
        let existing = null;
        if (data.sku) {
          [existing] = await tx
            .select()
            .from(products)
            .where(and(eq(products.tenantId, user.tenantId), eq(products.sku, data.sku)))
            .limit(1);
        }
        if (!existing && data.erpCode) {
          [existing] = await tx
            .select()
            .from(products)
            .where(
              and(eq(products.tenantId, user.tenantId), eq(products.erpCode, data.erpCode))
            )
            .limit(1);
        }

        const payload = {
          family: data.family,
          commercialDescription: data.commercialDescription,
          fiscalDescription: data.fiscalDescription,
          norm: data.norm,
          ncm: data.ncm,
          thicknessMm: data.thicknessMm != null ? String(data.thicknessMm) : null,
          widthMm: data.widthMm != null ? String(data.widthMm) : null,
          lengthMm: data.lengthMm != null ? String(data.lengthMm) : null,
          diameterMm: data.diameterMm != null ? String(data.diameterMm) : null,
          wallMm: data.wallMm != null ? String(data.wallMm) : null,
          densityGCm3: String(data.density),
          unit: data.unit,
          weightPerUnit: String(data.weightPerUnit),
          replacementCostBase: String(data.replacementCostBase),
          status: data.status,
          updatedBy: user.id,
          updatedAt: new Date(),
        };

        if (existing) {
          await tx.update(products).set(payload).where(eq(products.id, existing.id));
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "products",
            entityId: existing.id,
            action: "update",
            before: existing,
            after: { ...existing, ...payload },
          });
        } else {
          const sku = data.sku || (await generateNextSkuTx(tx, data.family, user.tenantId));
          const [created] = await tx
            .insert(products)
            .values({
              tenantId: user.tenantId,
              sku,
              erpCode: data.erpCode,
              createdBy: user.id,
              ...payload,
            })
            .returning();
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "products",
            entityId: created.id,
            action: "insert",
            before: null,
            after: created,
          });
        }
      } else if (entity === "fornecedores") {
        const [existing] = await tx
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.tenantId, user.tenantId), eq(suppliers.cnpj, data.cnpj)))
          .limit(1);

        const payload = {
          legalName: data.legalName,
          tradeName: data.tradeName,
          type: data.type,
          city: data.city,
          uf: data.uf,
          leadTimeDays: data.leadTimeDays,
          paymentTerms: data.paymentTerms,
          contacts: data.contacts,
          notes: data.notes,
          updatedBy: user.id,
          updatedAt: new Date(),
        };

        if (existing) {
          await tx.update(suppliers).set(payload).where(eq(suppliers.id, existing.id));
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "suppliers",
            entityId: existing.id,
            action: "update",
            before: existing,
            after: { ...existing, ...payload },
          });
        } else {
          const [created] = await tx
            .insert(suppliers)
            .values({ tenantId: user.tenantId, cnpj: data.cnpj, createdBy: user.id, ...payload })
            .returning();
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "suppliers",
            entityId: created.id,
            action: "insert",
            before: null,
            after: created,
          });
        }
      } else {
        const [existing] = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.tenantId, user.tenantId), eq(customers.document, data.document)))
          .limit(1);

        const payload = {
          legalName: data.legalName,
          tradeName: data.tradeName,
          city: data.city,
          uf: data.uf,
          stateRegistration: data.stateRegistration,
          segment: data.segment,
          contacts: data.contacts,
          notes: data.notes,
          updatedBy: user.id,
          updatedAt: new Date(),
        };

        if (existing) {
          await tx.update(customers).set(payload).where(eq(customers.id, existing.id));
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "customers",
            entityId: existing.id,
            action: "update",
            before: existing,
            after: { ...existing, ...payload },
          });
        } else {
          const [created] = await tx
            .insert(customers)
            .values({
              tenantId: user.tenantId,
              document: data.document,
              createdBy: user.id,
              ...payload,
            })
            .returning();
          await tx.insert(auditLog).values({
            tenantId: user.tenantId,
            userId: user.id,
            entity: "customers",
            entityId: created.id,
            action: "insert",
            before: null,
            after: created,
          });
        }
      }
      imported++;
    }

    // Registro do job de importação (rastreabilidade US-09)
    await tx.insert(importJobs).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity,
      status: "completed",
      report: { totalRows: rows.length, imported, rejected: 0 },
      finishedAt: new Date(),
    });
  });

  revalidatePath("/produtos");
  revalidatePath("/fornecedores");
  revalidatePath("/clientes");
  revalidatePath("/admin/auditoria");

  return {
    ok: true,
    imported,
    message: `${imported} registro(s) importado(s) com sucesso em "${entity}".`,
  };
}
