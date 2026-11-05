import { describe, expect, it } from "vitest";
import {
  buildLeadTimeResolver,
  normalizeLeadTimeDays,
  resolveSupplierLeadTimeFromSnapshots,
  type LeadTimeSnapshotSources,
  type LeadTimeTermSnapshot,
} from "./lead-time";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const PRODUCT = "prod-1";
const SUPPLIER_A = "sup-a";
const SUPPLIER_B = "sup-b";

function term(overrides: Partial<LeadTimeTermSnapshot> = {}): LeadTimeTermSnapshot {
  return {
    id: "term-1",
    productId: PRODUCT,
    supplierId: SUPPLIER_A,
    preferred: true,
    leadTimeDays: 21,
    validFrom: new Date("2026-10-01T00:00:00.000Z"),
    validUntil: null,
    ...overrides,
  };
}

function sources(overrides: Partial<LeadTimeSnapshotSources> = {}): LeadTimeSnapshotSources {
  return {
    terms: [],
    suppliers: [
      { id: SUPPLIER_A, leadTimeDays: 14 },
      { id: SUPPLIER_B, leadTimeDays: 30 },
    ],
    legacySupplierByProduct: new Map(),
    ...overrides,
  };
}

describe("lead time — precedência da SPEC LAC-02", () => {
  it("condição produto × fornecedor prevalece sobre o cadastro do fornecedor", () => {
    const resolve = buildLeadTimeResolver(sources({ terms: [term({ leadTimeDays: 21 })] }), {
      now: NOW,
    });

    expect(resolve(PRODUCT)).toMatchObject({
      days: 21,
      source: "product_supplier_term",
      preferredSupplierId: SUPPLIER_A,
      termId: "term-1",
    });
  });

  it("ignora condição com vigência futura e ativa intervalo vigente fechado no futuro", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    const resolver = buildLeadTimeResolver(
      {
        terms: [
          {
            id: "future",
            productId: "p1",
            supplierId: "s1",
            preferred: true,
            leadTimeDays: 3,
            validFrom: new Date("2026-11-04T00:00:00Z"),
            validUntil: null,
          },
          {
            id: "current",
            productId: "p1",
            supplierId: "s2",
            preferred: true,
            leadTimeDays: 8,
            validFrom: new Date("2026-11-01T00:00:00Z"),
            validUntil: new Date("2026-11-05T00:00:00Z"),
          },
        ],
        suppliers: [],
        legacySupplierByProduct: new Map(),
      },
      { now }
    );

    expect(resolver("p1")).toMatchObject({ days: 8, preferredSupplierId: "s2", termId: "current" });
  });

  it("sem lead time específico, usa o cadastro M0 do fornecedor preferido como origem explícita", () => {
    const resolve = buildLeadTimeResolver(sources({ terms: [term({ leadTimeDays: null })] }), {
      now: NOW,
    });

    expect(resolve(PRODUCT)).toMatchObject({
      days: 14,
      source: "supplier_record",
      preferredSupplierId: SUPPLIER_A,
    });
  });

  it("ausência total retorna unknown (nunca o default numérico do código)", () => {
    const resolve = buildLeadTimeResolver(
      sources({
        terms: [term({ leadTimeDays: null })],
        suppliers: [{ id: SUPPLIER_A, leadTimeDays: null }],
      }),
      { now: NOW }
    );

    expect(resolve(PRODUCT)).toEqual({
      days: null,
      source: "unavailable",
      preferredSupplierId: SUPPLIER_A,
      termId: "term-1",
    });
  });

  it("sem preferência, mantém fonte legada explícita sem chamá-la de homologada", () => {
    const resolve = buildLeadTimeResolver(
      sources({ legacySupplierByProduct: new Map([[PRODUCT, SUPPLIER_B]]) }),
      { now: NOW }
    );

    expect(resolve(PRODUCT)).toEqual({
      days: 30,
      source: "legacy_first_lot",
      preferredSupplierId: null,
      termId: null,
    });
  });

  it("sem preferência e sem fornecedor legado retorna unknown", () => {
    const resolve = buildLeadTimeResolver(sources(), { now: NOW });

    expect(resolve(PRODUCT)).toMatchObject({ days: null, source: "unavailable" });
  });

  it("ignora condição encerrada e condição com vigência futura", () => {
    const closed = term({
      id: "term-closed",
      leadTimeDays: 5,
      validUntil: new Date("2026-10-20T00:00:00.000Z"),
    });
    const future = term({
      id: "term-future",
      leadTimeDays: 9,
      validFrom: new Date("2026-12-01T00:00:00.000Z"),
    });

    const resolve = buildLeadTimeResolver(
      sources({
        terms: [closed, future],
        legacySupplierByProduct: new Map([[PRODUCT, SUPPLIER_B]]),
      }),
      { now: NOW }
    );

    expect(resolve(PRODUCT)).toMatchObject({
      days: 30,
      source: "legacy_first_lot",
      preferredSupplierId: null,
    });
  });
});

describe("lead time — par produto × fornecedor", () => {
  it("resolve pela condição vigente do par", () => {
    const resolved = resolveSupplierLeadTimeFromSnapshots({
      productId: PRODUCT,
      supplierId: SUPPLIER_A,
      terms: [term({ leadTimeDays: 18 })],
      suppliers: [{ id: SUPPLIER_A, leadTimeDays: 14 }],
      now: NOW,
    });

    expect(resolved).toMatchObject({ days: 18, source: "product_supplier_term" });
  });

  it("cai para o cadastro quando a condição do par não define lead time", () => {
    const resolved = resolveSupplierLeadTimeFromSnapshots({
      productId: PRODUCT,
      supplierId: SUPPLIER_A,
      terms: [term({ leadTimeDays: null })],
      suppliers: [{ id: SUPPLIER_A, leadTimeDays: 14 }],
      now: NOW,
    });

    expect(resolved).toMatchObject({ days: 14, source: "supplier_record" });
  });

  it("retorna unknown para fornecedor sem cadastro de lead time", () => {
    const resolved = resolveSupplierLeadTimeFromSnapshots({
      productId: PRODUCT,
      supplierId: SUPPLIER_A,
      terms: [],
      suppliers: [{ id: SUPPLIER_A, leadTimeDays: null }],
      now: NOW,
    });

    expect(resolved).toMatchObject({ days: null, source: "unavailable" });
  });
});

describe("normalizeLeadTimeDays", () => {
  it("aceita apenas inteiros positivos", () => {
    expect(normalizeLeadTimeDays(12)).toBe(12);
    expect(normalizeLeadTimeDays("12")).toBe(12);
    expect(normalizeLeadTimeDays(12.6)).toBe(13);
    expect(normalizeLeadTimeDays(0)).toBeNull();
    expect(normalizeLeadTimeDays(-3)).toBeNull();
    expect(normalizeLeadTimeDays(null)).toBeNull();
    expect(normalizeLeadTimeDays("abc")).toBeNull();
  });
});
