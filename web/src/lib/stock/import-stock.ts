import { db } from "@/lib/db";
import { products, warehouses, stockLots, stockMovements, auditLog } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import { recalculatePredictiveMetricsForTenant } from "./predictive-engine";
import { unitCostToCostPerKg } from "./units";

export interface StockImportRow {
  sku: string;
  deposito: string;
  lote: string;
  corrida?: string;
  quantidade: number;
  unidade?: string;
  custo_unitario: number;
  data_entrada?: string;
  endereco?: string;
}

export interface StockImportError {
  line: number;
  field: string;
  value: any;
  message: string;
}

export interface StockImportSummary {
  success: boolean;
  totalLines: number;
  importedLots: number;
  totalQuantity: number;
  totalReconciledValueBrl: number;
  errors: StockImportError[];
}

/**
 * Normalizes header keys from CSV
 */
function normalizeRow(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "_");
    normalized[key] = typeof v === "string" ? v.trim() : v;
  }
  return normalized;
}

/**
 * Parses and atomically imports initial stock from a CSV string
 */
export async function importInitialStockCsv(
  csvContent: string,
  tenantId: string,
  userId: string
): Promise<StockImportSummary> {
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors && parsed.errors.length > 0) {
    return {
      success: false,
      totalLines: 0,
      importedLots: 0,
      totalQuantity: 0,
      totalReconciledValueBrl: 0,
      errors: parsed.errors.map((e) => ({
        line: e.row || 0,
        field: "csv",
        value: "",
        message: e.message,
      })),
    };
  }

  const rawRows = parsed.data as Record<string, any>[];
  if (rawRows.length === 0) {
    return {
      success: false,
      totalLines: 0,
      importedLots: 0,
      totalQuantity: 0,
      totalReconciledValueBrl: 0,
      errors: [
        {
          line: 0,
          field: "csv",
          value: "",
          message: "O arquivo CSV enviado não contém linhas de dados.",
        },
      ],
    };
  }

  // 1. Fetch available products and warehouses for this tenant
  const tenantProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      unit: products.unit,
      norm: products.norm,
      family: products.family,
      weightPerUnit: products.weightPerUnit,
      thicknessMm: products.thicknessMm,
      widthMm: products.widthMm,
      lengthMm: products.lengthMm,
      diameterMm: products.diameterMm,
      wallMm: products.wallMm,
      densityGCm3: products.densityGCm3,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId));

  const productSkuMap = new Map<string, (typeof tenantProducts)[0]>();
  tenantProducts.forEach((p) => productSkuMap.set(p.sku.toUpperCase(), p));

  const tenantWarehouses = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
    })
    .from(warehouses)
    .where(eq(warehouses.tenantId, tenantId));

  const warehouseNameMap = new Map<string, string>();
  tenantWarehouses.forEach((w) => {
    warehouseNameMap.set(w.name.trim().toLowerCase(), w.id);
    warehouseNameMap.set(w.id, w.id);
  });

  const errors: StockImportError[] = [];
  const validRows: {
    line: number;
    productId: string;
    warehouseId: string;
    lotNumber: string;
    heatNumber: string | null;
    quantity: number;
    unitCost: number;
    /** unitCost convertido para R$/kg; null quando a conversão da unidade é desconhecida. */
    costPerKg: number | null;
    entryDate: Date;
    locationAddress: string;
  }[] = [];

  let lineIndex = 1;
  let totalQty = 0;
  let totalValue = 0;

  for (const raw of rawRows) {
    lineIndex++;
    const row = normalizeRow(raw);

    const sku = (row["sku"] || row["codigo"] || row["produto"] || "")
      .toString()
      .trim()
      .toUpperCase();
    const depName = (row["deposito"] || row["armazem"] || row["warehouse"] || "").toString().trim();
    const lotNumber = (row["lote"] || row["lot_number"] || row["numero_lote"] || "")
      .toString()
      .trim();
    const heatNumber =
      (row["corrida"] || row["heat"] || row["heat_number"] || "").toString().trim() || null;
    const rawQty = (row["quantidade"] || row["saldo"] || row["qty"] || "")
      .toString()
      .replace(",", ".");
    const rawCost = (row["custo_unitario"] || row["custo"] || row["unit_cost"] || "")
      .toString()
      .replace(",", ".");
    const location =
      (row["endereco"] || row["localizacao"] || row["local"] || "").toString().trim() ||
      "Pátio Principal";
    const dateStr = (row["data_entrada"] || row["data"] || "").toString().trim();

    // Validations
    if (!sku) {
      errors.push({
        line: lineIndex,
        field: "sku",
        value: sku,
        message: "Coluna SKU é obrigatória.",
      });
      continue;
    }
    const product = productSkuMap.get(sku);
    if (!product) {
      errors.push({
        line: lineIndex,
        field: "sku",
        value: sku,
        message: `Produto com SKU '${sku}' não cadastrado no sistema. Cadastre-o em Produtos primeiro.`,
      });
      continue;
    }

    if (!depName) {
      errors.push({
        line: lineIndex,
        field: "deposito",
        value: depName,
        message: "Coluna Depósito é obrigatória.",
      });
      continue;
    }
    const warehouseId = warehouseNameMap.get(depName.toLowerCase());
    if (!warehouseId) {
      errors.push({
        line: lineIndex,
        field: "deposito",
        value: depName,
        message: `Depósito '${depName}' não encontrado no cadastro de depósitos.`,
      });
      continue;
    }

    if (!lotNumber) {
      errors.push({
        line: lineIndex,
        field: "lote",
        value: lotNumber,
        message: "Identificador de lote é obrigatório.",
      });
      continue;
    }

    const qty = parseFloat(rawQty);
    if (isNaN(qty) || qty <= 0) {
      errors.push({
        line: lineIndex,
        field: "quantidade",
        value: rawQty,
        message: "Quantidade deve ser um número maior que zero.",
      });
      continue;
    }

    const unitCost = parseFloat(rawCost);
    if (isNaN(unitCost) || unitCost < 0) {
      errors.push({
        line: lineIndex,
        field: "custo_unitario",
        value: rawCost,
        message: "Custo unitário deve ser um número maior ou igual a zero.",
      });
      continue;
    }

    let entryDate = new Date();
    if (dateStr) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        entryDate = parsedDate;
      }
    }

    totalQty += qty;
    totalValue += qty * unitCost;

    validRows.push({
      line: lineIndex,
      productId: product.id,
      warehouseId,
      lotNumber,
      heatNumber,
      quantity: qty,
      unitCost,
      costPerKg: unitCostToCostPerKg(unitCost, product),
      entryDate,
      locationAddress: location,
    });
  }

  // Atomic check: If any errors occurred, abort before executing database insertions
  if (errors.length > 0) {
    return {
      success: false,
      totalLines: rawRows.length,
      importedLots: 0,
      totalQuantity: 0,
      totalReconciledValueBrl: 0,
      errors,
    };
  }

  // 2. Transactional execution
  await db.transaction(async (tx) => {
    for (const row of validRows) {
      const totalLineCost = Number((row.quantity * row.unitCost).toFixed(2));

      // Insert lot
      const [lot] = await tx
        .insert(stockLots)
        .values({
          tenantId,
          productId: row.productId,
          warehouseId: row.warehouseId,
          lotNumber: row.lotNumber,
          heatNumber: row.heatNumber,
          quantityInitial: String(row.quantity),
          quantityCurrent: String(row.quantity),
          unitCost: String(row.unitCost),
          locationAddress: row.locationAddress,
          entryDate: row.entryDate,
          status: "ativo",
        })
        .returning();

      // Insert initial movement
      await tx.insert(stockMovements).values({
        tenantId,
        productId: row.productId,
        lotId: lot.id,
        warehouseId: row.warehouseId,
        movementType: "ENTRADA_COMPRA",
        quantity: String(row.quantity),
        unitCost: String(row.unitCost),
        totalCost: String(totalLineCost),
        referenceDocument: "Carga Inicial de Estoque (CSV)",
        notes: `Importação de saldo inicial Lote ${row.lotNumber}`,
        createdBy: userId,
      });

      // Atualiza o custo de reposição base (R$/kg). Sem conversão conhecida, não toca no campo.
      if (row.costPerKg !== null && row.costPerKg > 0) {
        await tx
          .update(products)
          .set({
            replacementCostBase: String(row.costPerKg),
            updatedAt: new Date(),
          })
          .where(eq(products.id, row.productId));
      }
    }

    // Audit log
    await tx.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_lots",
      entityId: "import_csv",
      action: "insert",
      after: {
        totalLots: validRows.length,
        totalQuantity: totalQty,
        totalReconciledValueBrl: totalValue,
      },
    });
  });

  // 3. Trigger recalculation of predictive metrics for tenant
  try {
    await recalculatePredictiveMetricsForTenant(tenantId);
  } catch (err) {
    console.error("Erro ao recalcular métricas pós importação CSV:", err);
  }

  return {
    success: true,
    totalLines: rawRows.length,
    importedLots: validRows.length,
    totalQuantity: Number(totalQty.toFixed(4)),
    totalReconciledValueBrl: Number(totalValue.toFixed(2)),
    errors: [],
  };
}
