import { describe, it, expect } from "vitest";
import {
  calculateConsumptionMetrics,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateCoverageDays,
  determinePredictiveStatus,
  calculateSuggestedPurchase,
  calculatePredictiveDecision,
  classifyCurveXyz,
  Z_FACTOR_95,
} from "./predictive-engine";

describe("Predictive Engine - Mathematical and Statistical Model", () => {
  it("calculates weighted daily consumption and std dev accurately", () => {
    // 90 days of consumption: 10 units/day for first 30 days, 8 for next 30, 6 for last 30
    const consumptions = [
      ...new Array(30).fill(10),
      ...new Array(30).fill(8),
      ...new Array(30).fill(6),
    ];

    const stats = calculateConsumptionMetrics(consumptions);

    expect(stats.avgDaily30d).toBe(10);
    expect(stats.avgDaily60d).toBe(8);
    expect(stats.avgDaily90d).toBe(6);
    // Weighted: 0.5*10 + 0.3*8 + 0.2*6 = 5 + 2.4 + 1.2 = 8.6
    expect(stats.weightedAvgDaily).toBe(8.6);
    expect(stats.stdDevDaily).toBeGreaterThan(0);
    expect(stats.coefficientOfVariation).toBeGreaterThan(0);
  });

  it("calculates safety stock with formula SS = Z * sigma * sqrt(LT)", () => {
    const stdDev = 2.5;
    const leadTime = 16;
    const avgDaily = 10;

    // sqrt(16) = 4; Z = 1.645; SS = 1.645 * 2.5 * 4 = 16.45
    const ss = calculateSafetyStock(stdDev, leadTime, avgDaily);
    expect(ss).toBeCloseTo(16.45, 1);
  });

  it("provides minimum safety stock buffer when stdDev is 0 but daily consumption exists", () => {
    const stdDev = 0;
    const leadTime = 10;
    const avgDaily = 5;

    // Fallback: 20% of lead time consumption = 0.2 * 5 * 10 = 10
    const ss = calculateSafetyStock(stdDev, leadTime, avgDaily);
    expect(ss).toBe(10);
  });

  it("calculates Reorder Point ROP = d * LT + SS", () => {
    const d = 5;
    const lt = 14;
    const ss = 12;

    // ROP = 5 * 14 + 12 = 70 + 12 = 82
    const rop = calculateReorderPoint(d, lt, ss);
    expect(rop).toBe(82);
  });

  it("calculates stock coverage in days", () => {
    expect(calculateCoverageDays(100, 5)).toBe(20);
    expect(calculateCoverageDays(0, 5)).toBe(0);
    expect(calculateCoverageDays(50, 0)).toBe(999.0);
    expect(calculateCoverageDays(0, 0)).toBe(0);
  });

  describe("Predictive Status Transitions", () => {
    it("flags CRITICAL_RUPTURE when coverage < lead time", () => {
      const currentStock = 18.5;
      const coverageDays = 8;
      const leadTimeDays = 14;
      const rop = 40;

      const status = determinePredictiveStatus(currentStock, coverageDays, leadTimeDays, rop);
      expect(status).toBe("CRITICAL_RUPTURE");
    });

    it("flags CRITICAL_RUPTURE when stock is 0", () => {
      const status = determinePredictiveStatus(0, 0, 15, 30);
      expect(status).toBe("CRITICAL_RUPTURE");
    });

    it("flags WARNING when coverage is between 1.0x and 1.3x lead time", () => {
      const currentStock = 42;
      const coverageDays = 13;
      const leadTimeDays = 12; // 13 <= 12 * 1.3 = 15.6
      const rop = 50;

      const status = determinePredictiveStatus(currentStock, coverageDays, leadTimeDays, rop);
      expect(status).toBe("WARNING");
    });

    it("flags EXCESS when coverage exceeds 180 days", () => {
      const currentStock = 500;
      const coverageDays = 210;
      const leadTimeDays = 15;
      const rop = 40;

      const status = determinePredictiveStatus(currentStock, coverageDays, leadTimeDays, rop);
      expect(status).toBe("EXCESS");
    });

    it("flags HEALTHY when coverage is safely balanced", () => {
      const currentStock = 200;
      const coverageDays = 35;
      const leadTimeDays = 15;
      const rop = 100;

      const status = determinePredictiveStatus(currentStock, coverageDays, leadTimeDays, rop);
      expect(status).toBe("HEALTHY");
    });
  });

  describe("Purchase Suggestion Calculation", () => {
    it("suggests immediate purchase order when in CRITICAL_RUPTURE", () => {
      const baseDate = new Date("2026-11-01T10:00:00Z");
      const currentStock = 18.5;
      const rop = 35;
      const avgDaily = 2.2;
      const coverageDays = 8;
      const leadTimeDays = 14;

      const { quantity, date } = calculateSuggestedPurchase(
        "CRITICAL_RUPTURE",
        currentStock,
        rop,
        avgDaily,
        coverageDays,
        leadTimeDays,
        baseDate
      );

      // rawQty = ROP (35) - current (18.5) + targetBuffer (2.2 * 30 = 66) = 82.5
      expect(quantity).toBeCloseTo(82.5, 1);
      expect(date?.toISOString()).toBe(baseDate.toISOString());
    });

    it("returns zero purchase quantity when stock status is HEALTHY or EXCESS", () => {
      const { quantity, date } = calculateSuggestedPurchase("HEALTHY", 100, 50, 2, 50, 15);
      expect(quantity).toBe(0);
      expect(date).toBeNull();
    });
  });

  describe("Lead time ausente (LAC-02)", () => {
    // Sem lead time resolvido o produto não pode virar default nem alerta de ruptura:
    // as fórmulas de SS/ROP/sugestão dependem de L e por isso ficam zeradas.
    it("marca SEM_LEAD_TIME sem inventar ruptura, SS/ROP, sugestão ou data", () => {
      const decision = calculatePredictiveDecision({
        resolvedLeadTime: { days: null, source: "unavailable" },
        currentStock: 0,
        avgDailyConsumption: 2.2,
        stdDevDaily: 1.1,
        coverageDays: 0,
        referenceDate: new Date("2026-11-03T12:00:00Z"),
      });

      expect(decision.predictiveStatus).toBe("SEM_LEAD_TIME");
      expect(decision.leadTimeDays).toBeNull();
      expect(decision.leadTimeSource).toBeNull();
      expect(decision.safetyStockQty).toBe(0);
      expect(decision.reorderPointQty).toBe(0);
      expect(decision.suggestedPurchaseQty).toBe(0);
      expect(decision.suggestedPurchaseDate).toBeNull();
    });

    it("não trata estoque positivo como cobertura segura quando o lead time é desconhecido", () => {
      const decision = calculatePredictiveDecision({
        resolvedLeadTime: { days: null, source: "unavailable" },
        currentStock: 500,
        avgDailyConsumption: 1,
        stdDevDaily: 0.5,
        coverageDays: 500,
      });

      expect(decision.predictiveStatus).toBe("SEM_LEAD_TIME");
      expect(decision.predictiveStatus).not.toBe("HEALTHY");
      expect(decision.predictiveStatus).not.toBe("CRITICAL_RUPTURE");
    });

    it("persiste a origem quando o lead time é resolvido", () => {
      const decision = calculatePredictiveDecision({
        resolvedLeadTime: { days: 14, source: "product_supplier_term" },
        currentStock: 18.5,
        avgDailyConsumption: 2.2,
        stdDevDaily: 1.3,
        coverageDays: 8,
        referenceDate: new Date("2026-11-03T12:00:00Z"),
      });

      expect(decision.leadTimeDays).toBe(14);
      expect(decision.leadTimeSource).toBe("product_supplier_term");
      expect(decision.predictiveStatus).toBe("CRITICAL_RUPTURE");
      expect(decision.safetyStockQty).toBe(calculateSafetyStock(1.3, 14, 2.2));
      expect(decision.reorderPointQty).toBe(
        calculateReorderPoint(2.2, 14, decision.safetyStockQty)
      );
      expect(decision.suggestedPurchaseQty).toBeGreaterThan(0);
      expect(decision.suggestedPurchaseDate).not.toBeNull();
    });

    it("rotula a estimativa legada como origem quando ela resolve o lead time", () => {
      const decision = calculatePredictiveDecision({
        resolvedLeadTime: { days: 30, source: "legacy_first_lot" },
        currentStock: 40,
        avgDailyConsumption: 2,
        stdDevDaily: 1,
        coverageDays: 20,
      });

      expect(decision.leadTimeSource).toBe("legacy_first_lot");
      expect(decision.predictiveStatus).toBe("CRITICAL_RUPTURE");
    });
  });

  describe("XYZ Curve Classification", () => {
    it("classifies CV <= 0.25 as X (steady demand)", () => {
      expect(classifyCurveXyz(0.15)).toBe("X");
      expect(classifyCurveXyz(0.25)).toBe("X");
    });

    it("classifies 0.25 < CV <= 0.50 as Y (moderate variance)", () => {
      expect(classifyCurveXyz(0.35)).toBe("Y");
      expect(classifyCurveXyz(0.5)).toBe("Y");
    });

    it("classifies CV > 0.50 as Z (erratic demand)", () => {
      expect(classifyCurveXyz(0.65)).toBe("Z");
      expect(classifyCurveXyz(1.2)).toBe("Z");
    });
  });
});
