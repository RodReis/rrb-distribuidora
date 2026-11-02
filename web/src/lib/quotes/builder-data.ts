/**
 * Dados de catálogo usados pelo construtor de orçamentos.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, machines, products } from "@/lib/db/schema";
import { getTenantQuotePolicy } from "./service";
import { replacementCostPerKg } from "@/lib/stock/units";

export interface BuilderCustomer {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  city: string | null;
  uf: string | null;
}

export interface BuilderProduct {
  id: string;
  sku: string;
  description: string;
  norm: string;
  family: string;
  thicknessMm: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  diameterMm: number | null;
  wallMm: number | null;
  weightPerUnit: number;
  densityGCm3: number | null;
  unit: string;
  /** Custo de reposição normalizado para R$/kg. */
  replacementCostPerKg: number;
}

export interface BuilderMachine {
  id: string;
  name: string;
  type: string;
  costPerHour: number;
  setupMin: number;
}

export interface BuilderCatalog {
  customers: BuilderCustomer[];
  products: BuilderProduct[];
  machines: BuilderMachine[];
  policy: { minMarginPct: number; defaultMarginPct: number };
}

export async function loadBuilderCatalog(tenantId: string): Promise<BuilderCatalog> {
  const [customerRows, productRows, machineRows, policy] = await Promise.all([
    db
      .select({
        id: customers.id,
        legalName: customers.legalName,
        tradeName: customers.tradeName,
        document: customers.document,
        city: customers.city,
        uf: customers.uf,
      })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.active, true)))
      .orderBy(asc(customers.legalName)),
    db
      .select({
        id: products.id,
        sku: products.sku,
        description: products.commercialDescription,
        norm: products.norm,
        family: products.family,
        thicknessMm: products.thicknessMm,
        widthMm: products.widthMm,
        lengthMm: products.lengthMm,
        diameterMm: products.diameterMm,
        wallMm: products.wallMm,
        weightPerUnit: products.weightPerUnit,
        densityGCm3: products.densityGCm3,
        unit: products.unit,
        replacementCostBase: products.replacementCostBase,
        status: products.status,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(asc(products.commercialDescription)),
    db
      .select({
        id: machines.id,
        name: machines.name,
        type: machines.type,
        costPerHour: machines.costPerHour,
        setupMin: machines.setupMin,
      })
      .from(machines)
      .where(and(eq(machines.tenantId, tenantId), eq(machines.active, true)))
      .orderBy(asc(machines.name)),
    getTenantQuotePolicy(tenantId),
  ]);

  return {
    customers: customerRows,
    products: productRows
      .filter((row) => row.status === "ativo")
      .map(({ status: _status, ...row }) => ({
        ...row,
        thicknessMm: row.thicknessMm == null ? null : Number(row.thicknessMm),
        widthMm: row.widthMm == null ? null : Number(row.widthMm),
        lengthMm: row.lengthMm == null ? null : Number(row.lengthMm),
        diameterMm: row.diameterMm == null ? null : Number(row.diameterMm),
        wallMm: row.wallMm == null ? null : Number(row.wallMm),
        weightPerUnit: Number(row.weightPerUnit) || 0,
        densityGCm3: row.densityGCm3 == null ? null : Number(row.densityGCm3),
      }))
      .map((row) => {
        const { replacementCostBase, ...rest } = row;
        return {
          ...rest,
          replacementCostPerKg: replacementCostPerKg(replacementCostBase),
        };
      }),
    machines: machineRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      costPerHour: Number(row.costPerHour) || 0,
      setupMin: Number(row.setupMin) || 0,
    })),
    policy,
  };
}
