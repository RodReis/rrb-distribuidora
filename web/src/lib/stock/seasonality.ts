import { db } from "@/lib/db";
import { products, seasonalityRuns, stockMovements } from "@/lib/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";

export const SEASONALITY_METHOD_VERSION = "monthly-average-v1";
export const MIN_SEASONAL_CYCLES = 2;
export const REQUIRED_MONTHS = MIN_SEASONAL_CYCLES * 12;

export async function calculateProductSeasonality(input: {
  tenantId: string;
  productId: string;
  now?: Date;
}) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.tenantId, input.tenantId),
        eq(products.status, "ativo")
      )
    );
  if (!product) throw new Error("Produto ativo não encontrado neste tenant.");

  const now = input.now ?? new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - REQUIRED_MONTHS, 1));
  const monthKeys = Array.from({ length: REQUIRED_MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const movements = await db
    .select({
      createdAt: stockMovements.createdAt,
      quantity: stockMovements.quantity,
      movementType: stockMovements.movementType,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, input.tenantId),
        eq(stockMovements.productId, input.productId),
        gte(stockMovements.createdAt, start),
        lt(stockMovements.createdAt, end)
      )
    );

  const observed = new Set<string>();
  const consumption = new Map<string, number>(monthKeys.map((key) => [key, 0]));
  for (const movement of movements) {
    const date = new Date(movement.createdAt);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    observed.add(key);
    const quantity = Number(movement.quantity);
    if (
      quantity < 0 ||
      movement.movementType === "SAIDA_VENDA" ||
      movement.movementType === "CORTE_CONSUMO"
    ) {
      consumption.set(key, (consumption.get(key) ?? 0) + Math.abs(quantity));
    }
  }
  const missingMonths = monthKeys.filter((key) => !observed.has(key));
  const observedMonths = REQUIRED_MONTHS - missingMonths.length;
  const monthlyTotals = monthKeys.map((key) => consumption.get(key) ?? 0);
  const totalConsumption = monthlyTotals.reduce((total, value) => total + value, 0);
  const ready = missingMonths.length === 0 && totalConsumption > 0;
  const result = ready
    ? (() => {
        const seasonalMeans = Array.from(
          { length: 12 },
          (_, month) => (monthlyTotals[month] + monthlyTotals[month + 12]) / MIN_SEASONAL_CYCLES
        );
        const overallMonthlyMean = totalConsumption / REQUIRED_MONTHS;
        return {
          status: "ready" as const,
          monthlyForecast: seasonalMeans.map((value) => Number(value.toFixed(4))),
          seasonalIndex: seasonalMeans.map((value) =>
            Number((value / overallMonthlyMean).toFixed(4))
          ),
        };
      })()
    : {
        status: "insufficient" as const,
        reason: missingMonths.length
          ? "Meses sem observação de estoque"
          : "Consumo histórico total igual a zero",
      };

  const [run] = await db
    .insert(seasonalityRuns)
    .values({
      tenantId: input.tenantId,
      productId: input.productId,
      methodVersion: SEASONALITY_METHOD_VERSION,
      window: { start: monthKeys[0], end: monthKeys.at(-1)!, months: REQUIRED_MONTHS },
      coverage: { observedMonths, requiredMonths: REQUIRED_MONTHS, missingMonths },
      result,
    })
    .returning();
  return run;
}
