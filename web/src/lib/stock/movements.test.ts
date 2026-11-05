import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  lot: null as any,
  reservationTotal: "0",
  updates: [] as any[],
  inserts: [] as any[],
}));

vi.mock("@/lib/db", () => {
  const tx = {
    select: (selection?: any) => {
      const query: any = {
        from: () => query,
        where: () => query,
        limit: () => query,
        for: async () =>
          selection ? [{ quantity: state.reservationTotal }] : state.lot ? [state.lot] : [],
        then: (resolve: (value: any) => void) =>
          resolve(
            selection ? [{ quantity: state.reservationTotal }] : state.lot ? [state.lot] : []
          ),
      };
      return query;
    },
    update: () => ({
      set: (values: any) => {
        state.updates.push(values);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: (values: any) => {
        state.inserts.push(values);
        return { returning: async () => [{ id: "mov-1", ...values }] };
      },
    }),
  };
  return { db: { transaction: async (cb: any) => cb(tx) } };
});

vi.mock("./predictive-engine", () => ({
  recalculatePredictiveMetricsForTenant: vi.fn().mockResolvedValue([]),
}));

import { recordStockAdjustment, recordStockOut } from "./movements";

const baseLot = {
  id: "lot-1",
  productId: "p-1",
  warehouseId: "w-1",
  lotNumber: "LT-01",
  quantityCurrent: "100.0000",
  unitCost: "5.0000",
  status: "ativo",
};

const outInput = {
  tenantId: "t-1",
  productId: "p-1",
  lotId: "lot-1",
  userId: "u-1",
};

describe("recordStockOut - bloqueio de saldo negativo", () => {
  beforeEach(() => {
    state.lot = { ...baseLot };
    state.reservationTotal = "0";
    state.updates = [];
    state.inserts = [];
  });

  it("recusa saída maior que o saldo do lote e não grava nada", async () => {
    await expect(recordStockOut({ ...outInput, quantity: 100.0001 })).rejects.toThrow(
      /Saldo (disponível )?insuficiente/
    );
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("recusa quantidade zero ou negativa", async () => {
    await expect(recordStockOut({ ...outInput, quantity: 0 })).rejects.toThrow(/maior que zero/);
    await expect(recordStockOut({ ...outInput, quantity: -5 })).rejects.toThrow(/maior que zero/);
  });

  it("recusa saída de lote bloqueado ou esgotado", async () => {
    state.lot = { ...baseLot, status: "bloqueado" };
    await expect(recordStockOut({ ...outInput, quantity: 1 })).rejects.toThrow(/bloqueado/);
  });

  it("recusa lote inexistente", async () => {
    state.lot = null;
    await expect(recordStockOut({ ...outInput, quantity: 1 })).rejects.toThrow(/não encontrado/);
  });

  it("baixa o saldo, registra movimento negativo e mantém o lote ativo", async () => {
    const res = await recordStockOut({ ...outInput, quantity: 40 });
    expect(res.remainingQty).toBe(60);
    expect(res.newStatus).toBe("ativo");
    const movement = state.inserts.find((i) => i.movementType);
    expect(movement.quantity).toBe("-40");
    expect(movement.totalCost).toBe("200");
  });

  it("marca o lote como esgotado ao zerar o saldo exato", async () => {
    const res = await recordStockOut({ ...outInput, quantity: 100 });
    expect(res.remainingQty).toBe(0);
    expect(res.newStatus).toBe("esgotado");
  });
});

describe("recordStockAdjustment", () => {
  beforeEach(() => {
    state.lot = { ...baseLot };
    state.reservationTotal = "0";
    state.updates = [];
    state.inserts = [];
  });

  it("exige justificativa com ao menos 5 caracteres", async () => {
    await expect(
      recordStockAdjustment({
        tenantId: "t-1",
        lotId: "lot-1",
        newQuantity: 90,
        justification: "abc",
        userId: "u-1",
      })
    ).rejects.toThrow(/Justificativa obrigatória/);
  });

  it("recusa quantidade negativa", async () => {
    await expect(
      recordStockAdjustment({
        tenantId: "t-1",
        lotId: "lot-1",
        newQuantity: -1,
        justification: "contagem física",
        userId: "u-1",
      })
    ).rejects.toThrow(/negativa/);
  });

  it("registra a diferença como movimento de ajuste", async () => {
    const res: any = await recordStockAdjustment({
      tenantId: "t-1",
      lotId: "lot-1",
      newQuantity: 92,
      justification: "perda de corte não apontada",
      userId: "u-1",
    });
    expect(res.diff).toBe(-8);
    const movement = state.inserts.find((i) => i.movementType === "AJUSTE_INVENTARIO");
    expect(movement.quantity).toBe("-8");
  });

  it("não grava movimento quando a contagem bate com o saldo", async () => {
    const res: any = await recordStockAdjustment({
      tenantId: "t-1",
      lotId: "lot-1",
      newQuantity: 100,
      justification: "conferência sem divergência",
      userId: "u-1",
    });
    expect(res.diff).toBe(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("recusa ajuste que deixa o saldo abaixo do reservado", async () => {
    state.reservationTotal = "20";
    await expect(
      recordStockAdjustment({
        tenantId: "t-1",
        lotId: "lot-1",
        newQuantity: 19,
        justification: "contagem física",
        userId: "u-1",
      })
    ).rejects.toThrow(/abaixo da quantidade reservada/);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });
});
