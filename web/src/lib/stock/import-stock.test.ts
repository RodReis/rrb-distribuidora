import { describe, it, expect, vi, beforeEach } from "vitest";
import { importInitialStockCsv } from "./import-stock";
import { db } from "@/lib/db";

// Mock database
vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(async (cb) => {
        return cb({
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "lot-1" }]),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => Promise.resolve()),
            })),
          })),
        });
      }),
    },
  };
});

vi.mock("./predictive-engine", () => ({
  recalculatePredictiveMetricsForTenant: vi.fn().mockResolvedValue([]),
}));

describe("Initial Stock CSV Importer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails atomically when SKU is missing or unmapped", async () => {
    // Setup db.select for products and warehouses
    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "p1", sku: "SKU-A36", unit: "kg", norm: "ASTM A36" }]),
      }),
    } as any));

    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "w1", name: "Galpão Central" }]),
      }),
    } as any));

    const csv = `SKU,Depósito,Lote,Quantidade,Custo Unitário
SKU-INEXISTENTE,Galpão Central,LT-100,500,5.50`;

    const result = await importInitialStockCsv(csv, "tenant-1", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain("não cadastrado");
  });

  it("fails when quantity is zero or negative", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "p1", sku: "SKU-A36", unit: "kg", norm: "ASTM A36" }]),
      }),
    } as any));

    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "w1", name: "Galpão Central" }]),
      }),
    } as any));

    const csv = `SKU,Depósito,Lote,Quantidade,Custo Unitário
SKU-A36,Galpão Central,LT-100,-10,5.50`;

    const result = await importInitialStockCsv(csv, "tenant-1", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.field === "quantidade")).toBe(true);
  });

  it("succeeds and reconciles total quantity and value when rows are valid", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([
          { id: "p1", sku: "SKU-A36", unit: "kg", norm: "ASTM A36" },
          { id: "p2", sku: "SKU-BQ", unit: "kg", norm: "SAE 1008" },
        ]),
      }),
    } as any));

    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "w1", name: "Galpão Central" }]),
      }),
    } as any));

    const csv = `SKU,Depósito,Lote,Corrida,Quantidade,Custo Unitário,Data Entrada,Endereço
SKU-A36,Galpão Central,LT-01,C-991,1000,5.00,2026-10-01,Box 01
SKU-BQ,Galpão Central,LT-02,C-992,2000,4.50,2026-10-02,Box 02`;

    const result = await importInitialStockCsv(csv, "tenant-1", "user-1");

    expect(result.success).toBe(true);
    expect(result.importedLots).toBe(2);
    expect(result.totalQuantity).toBe(3000);
    // (1000 * 5) + (2000 * 4.50) = 5000 + 9000 = 14000
    expect(result.totalReconciledValueBrl).toBe(14000);
    expect(result.errors.length).toBe(0);
  });
});
