/**
 * Testes da exportação CSV (LAC-01 US-07) e da modelagem do PDF do PC.
 *
 * Nada aqui toca o banco: só as funções puras de formatação/escape e o builder
 * do modelo de apresentação do PDF. As datas são criadas em horário local
 * (`...T14:29:00`, sem `Z`) para o resultado não depender do fuso do runner.
 */

import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  PURCHASE_EXPORT_HEADERS,
  buildPurchasesCsv,
  csvEscape,
  formatExportCnpj,
  formatExportDateBR,
  formatExportDateTimeBR,
  formatExportMoneyBR,
  parsePurchasesExportFilters,
  purchasesCsvFileName,
  type PurchaseExportRow,
} from "./export";
import {
  HOMOLOGATION_DETAIL,
  HOMOLOGATION_NOTICE,
  buildPurchasePdfData,
  purchasePdfNumberLabel,
  shortApprovalHash,
  type PurchasePdfSource,
} from "./pdf/purchase-document-data";

/** Espaço não separável que o Intl pt-BR usa entre "R$" e o número. */
const NBSP = "\u00A0";

function makeRow(overrides: Partial<PurchaseExportRow> = {}): PurchaseExportRow {
  return {
    numberLabel: "#PC-0001",
    statusLabel: "Emitido",
    supplierName: "Aço Forte Distribuidora Ltda",
    supplierCnpjLabel: "12.345.678/0001-90",
    itemCount: 3,
    grandTotal: 1234567.891,
    expectedDeliveryAt: "2026-11-20T12:00:00",
    createdAt: "2026-11-03T14:29:00",
    updatedAt: "2026-11-03T15:00:00",
    createdByName: "Maria Souza",
    ...overrides,
  };
}

function parseCsv(csv: string): string[][] {
  // Remove o BOM antes de entregar ao parser; o separador é `;`.
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    delimiter: ";",
    header: false,
    skipEmptyLines: true,
  });
  return parsed.data;
}

describe("escape de CSV", () => {
  it("deixa campo simples intacto", () => {
    expect(csvEscape("Chapa A36")).toBe("Chapa A36");
    expect(csvEscape(42)).toBe("42");
  });

  it("escapa aspas dobrando-as e citando o campo", () => {
    expect(csvEscape('Fornecedor "Aço" Ltda')).toBe('"Fornecedor ""Aço"" Ltda"');
  });

  it("cita campos com ponto e vírgula", () => {
    expect(csvEscape("Metal; Aço")).toBe('"Metal; Aço"');
  });

  it("cita campos com quebra de linha (LF e CRLF)", () => {
    expect(csvEscape("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvEscape("linha 1\r\nlinha 2")).toBe('"linha 1\r\nlinha 2"');
  });

  it("trata nulos e vazios como célula vazia", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape("")).toBe("");
  });

  it("preserva espaços nas pontas citando o campo", () => {
    expect(csvEscape(" Observação ")).toBe('" Observação "');
  });
});

describe("montagem do CSV", () => {
  it("começa com BOM UTF-8 e usa cabeçalho PT-BR com separador `;`", () => {
    const csv = buildPurchasesCsv([makeRow()]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(PURCHASE_EXPORT_HEADERS).toEqual([
      "Número",
      "Estado",
      "Fornecedor",
      "CNPJ",
      "Itens",
      "Total (R$)",
      "Entrega prevista",
      "Criado em",
      "Atualizado em",
      "Criado por",
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(`\uFEFF${PURCHASE_EXPORT_HEADERS.join(";")}`);
    expect(lines[1]).toContain(";");
    expect(lines.at(-1)).toBe("");
  });

  it("formata números e datas em pt-BR na linha", () => {
    const csv = buildPurchasesCsv([makeRow()]);
    expect(csv).toContain("1.234.567,89");
    expect(csv).toContain("20/11/2026");
    expect(csv).toContain("03/11/2026 14:29");
    expect(csv).toContain("03/11/2026 15:00");
  });

  it("faz round-trip de campos com `;`, aspas e quebra de linha", () => {
    const row = makeRow({
      supplierName: 'Aço "Forte"; Matriz\nUnidade SP',
      createdByName: 'João; "JJ"',
    });
    const cells = parseCsv(buildPurchasesCsv([row]))[1];

    expect(cells).toHaveLength(PURCHASE_EXPORT_HEADERS.length);
    expect(cells[2]).toBe('Aço "Forte"; Matriz\nUnidade SP');
    expect(cells[9]).toBe('João; "JJ"');
  });

  it("deixa células vazias para datas/usuário nulos", () => {
    const row = makeRow({
      numberLabel: "Rascunho",
      statusLabel: "Rascunho",
      expectedDeliveryAt: null,
      createdByName: null,
    });
    const cells = parseCsv(buildPurchasesCsv([row]))[1];

    expect(cells).toHaveLength(PURCHASE_EXPORT_HEADERS.length);
    expect(cells[6]).toBe("");
    expect(cells[9]).toBe("");
    expect(cells[5]).toBe("1.234.567,89");
  });
});

describe("formatação pt-BR", () => {
  it("formata dinheiro com milhar e duas casas", () => {
    expect(formatExportMoneyBR(1234567.891)).toBe("1.234.567,89");
    expect(formatExportMoneyBR(0.5)).toBe("0,50");
    expect(formatExportMoneyBR(null)).toBe("0,00");
  });

  it("formata datas e data/hora sem vírgula do locale", () => {
    expect(formatExportDateBR("2026-11-03T14:29:00")).toBe("03/11/2026");
    expect(formatExportDateTimeBR("2026-11-03T14:29:00")).toBe("03/11/2026 14:29");
    expect(formatExportDateBR(null)).toBe("");
    expect(formatExportDateTimeBR("data-invalida")).toBe("");
  });

  it("mascara CNPJ e mantém valor cru fora do formato", () => {
    expect(formatExportCnpj("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatExportCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
    expect(formatExportCnpj("")).toBe("");
  });

  it("nome do arquivo é estável por dia", () => {
    expect(purchasesCsvFileName(new Date(2026, 10, 3, 10, 0))).toBe("compras-2026-11-03.csv");
  });
});

describe("adaptador de filtros", () => {
  it("mapeia a query string da lista para o filtro de exportação", () => {
    const params = new URLSearchParams(
      "status=emitido&supplierId=abc&q=%20a%C3%A7o%20&from=2026-11-01&to=2026-11-30&page=2"
    );
    expect(parsePurchasesExportFilters(params)).toEqual({
      status: "emitido",
      supplierId: "abc",
      search: "aço",
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("ignora parâmetros vazios", () => {
    expect(parsePurchasesExportFilters(new URLSearchParams("status=&q=%20%20"))).toEqual({
      status: undefined,
      supplierId: undefined,
      search: undefined,
      from: undefined,
      to: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// Modelo de apresentação do PDF (sem renderização)
// ---------------------------------------------------------------------------

function makePdfSource(overrides: Partial<PurchasePdfSource["order"]> = {}): PurchasePdfSource {
  return {
    tenantName: "RRB Distribuidora",
    order: {
      number: 1,
      status: "emitido",
      currency: "BRL",
      expectedDeliveryAt: new Date(2026, 10, 20),
      subtotal: "1000.00",
      discountTotal: "50.00",
      additionalCostsTotal: "120.00",
      grandTotal: "1070.00",
      currentVersion: 3,
      approvedVersionHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      approvedAt: new Date(2026, 10, 3, 14, 20),
      issuedAt: new Date(2026, 10, 3, 14, 30),
      createdAt: new Date(2026, 10, 1, 9, 0),
      ...overrides,
    },
    supplier: {
      legalName: "Aço Forte Distribuidora Ltda",
      tradeName: "Aço Forte",
      cnpj: "12345678000190",
      city: "São Paulo",
      uf: "SP",
      paymentTerms: "30 dias",
    },
    items: [
      {
        sku: "CH-001",
        productDescriptionSnapshot: "Chapa A36 3,00 mm",
        unit: "kg",
        quantityOrdered: 1250.5,
        unitPrice: 12.3456,
        discountAmount: 0,
        additionalCosts: [{ description: "Frete", amount: 120 }],
        lineTotal: 15534.46,
        notes: null,
      },
    ],
  };
}

describe("modelo do PDF do pedido de compra", () => {
  it("monta identificação, fornecedor, itens e totais pt-BR", () => {
    const data = buildPurchasePdfData(makePdfSource());

    expect(data.numberLabel).toBe("#PC-0001");
    expect(data.isDraft).toBe(false);
    expect(data.statusLabel).toBe("Emitido");
    expect(data.issuedAtLabel).toBe("03/11/2026 14:30");
    expect(data.expectedDeliveryLabel).toBe("20/11/2026");

    expect(data.supplier).toEqual({
      legalName: "Aço Forte Distribuidora Ltda",
      tradeName: "Aço Forte",
      cnpjLabel: "12.345.678/0001-90",
      cityUfLabel: "São Paulo / SP",
      paymentTermsLabel: "30 dias",
    });

    expect(data.items[0]).toMatchObject({
      sku: "CH-001",
      description: "Chapa A36 3,00 mm",
      quantityLabel: "1.250,5 kg",
      unitPriceLabel: `R$${NBSP}12,35`,
      discountLabel: "—",
      additionalCostsLabel: `R$${NBSP}120,00`,
      additionalCostsDetail: `Frete: R$${NBSP}120,00`,
      lineTotalLabel: `R$${NBSP}15.534,46`,
    });

    expect(data.totals).toEqual({
      subtotalLabel: `R$${NBSP}1.000,00`,
      discountLabel: `R$${NBSP}50,00`,
      additionalCostsLabel: `R$${NBSP}120,00`,
      grandTotalLabel: `R$${NBSP}1.070,00`,
    });

    expect(data.approval).toEqual({
      versionLabel: "v3",
      hashLabel: "a1b2c3d4e5f6",
      approvedAtLabel: "03/11/2026 14:20",
    });
  });

  it("exibe rascunho como NÃO EMITIDO e sem aprovação", () => {
    const data = buildPurchasePdfData(
      makePdfSource({
        number: null,
        status: "rascunho",
        currentVersion: 0,
        approvedVersionHash: null,
        approvedAt: null,
        issuedAt: null,
      })
    );

    expect(data.numberLabel).toBe("RASCUNHO — NÃO EMITIDO");
    expect(data.isDraft).toBe(true);
    expect(data.approval).toEqual({
      versionLabel: "—",
      hashLabel: "—",
      approvedAtLabel: "—",
    });
  });

  it("carrega o aviso de homologação (LAC-12) — não é documento fiscal final", () => {
    const data = buildPurchasePdfData(makePdfSource());

    expect(data.homologationNotice).toBe(HOMOLOGATION_NOTICE);
    expect(data.homologationNotice).toContain("DOCUMENTO EM HOMOLOGAÇÃO");
    expect(data.homologationNotice).toContain("LAC-12");
    expect(data.homologationDetail).toBe(HOMOLOGATION_DETAIL);
    expect(data.homologationDetail).toContain("não é documento fiscal final");
  });

  it("formata rótulo do número e hash curto", () => {
    expect(purchasePdfNumberLabel(1)).toBe("#PC-0001");
    expect(purchasePdfNumberLabel(42)).toBe("#PC-0042");
    expect(purchasePdfNumberLabel(null)).toBe("RASCUNHO — NÃO EMITIDO");
    expect(shortApprovalHash("ABCDEF1234567890")).toBe("abcdef123456");
    expect(shortApprovalHash(null)).toBe("—");
  });
});
