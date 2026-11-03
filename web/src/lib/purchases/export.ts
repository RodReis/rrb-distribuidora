/**
 * Exportação CSV da lista de pedidos de compra — LAC-01 US-07.
 *
 * Duas partes separadas de propósito:
 * - consulta com os MESMOS filtros da lista (`status`, `supplierId`, `q`, `from`,
 *   `to`), sempre por tenant e com limite de segurança;
 * - montagem do CSV puro (`buildPurchasesCsv`) — sem banco, testável.
 *
 * O CSV segue o padrão pt-BR usado no restante do produto: BOM UTF-8 para o
 * Excel reconhecer acentuação, separador `;`, números `1.234,56` e datas
 * `dd/mm/aaaa`. Campos com `;`, aspas ou quebra de linha são citados (RFC 4180).
 */

import { and, desc, eq, gte, isNull, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchaseOrderItems, purchaseOrders, suppliers, users } from "@/lib/db/schema";
import { purchaseValidation } from "./errors";
import { purchaseNumberLabel } from "./service";
import { PURCHASE_STATUS_LABEL, PURCHASE_STATUSES } from "./state-machine";
import type { PurchaseStatus } from "./types";

/**
 * Limite de segurança da exportação (LAC-01 US-07). Acima disso o CSV é truncado
 * e a rota sinaliza `X-Export-Truncated: true` — melhor avisar do que estourar
 * memória do servidor em um tenant com histórico longo.
 */
export const PURCHASE_EXPORT_ROW_LIMIT = 5000;

export const PURCHASE_EXPORT_HEADERS = [
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
] as const;

const CSV_BOM = "\uFEFF";
const CSV_SEPARATOR = ";";
const CSV_EOL = "\r\n";

/** Filtros aceitos na exportação — espelham os parâmetros da lista (`q` → busca). */
export interface PurchasesExportFilters {
  status?: string;
  supplierId?: string;
  search?: string;
  from?: string;
  to?: string;
}

/** Linha já pronta para o CSV (valores de apresentação em pt-BR). */
export interface PurchaseExportRow {
  numberLabel: string;
  statusLabel: string;
  supplierName: string;
  supplierCnpjLabel: string;
  itemCount: number;
  grandTotal: number;
  expectedDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

// ---------------------------------------------------------------------------
// Formatação pt-BR (pura)
// ---------------------------------------------------------------------------

export function formatExportMoneyBR(value: number | string | null | undefined): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatExportDateBR(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatExportDateTimeBR(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  // Sem vírgula do locale: o CSV fica mais legível em `;` e no Excel pt-BR.
  const day = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/** Máscara de CNPJ para leitura humana no CSV (`12.345.678/0001-90`). */
export function formatExportCnpj(cnpj: string | null | undefined): string {
  const raw = (cnpj ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(
    8,
    12
  )}-${digits.slice(12)}`;
}

/**
 * Escapa um campo do CSV.
 *
 * `null`/`undefined` viram vazio; aspas dobram; `;`, CR/LF e espaços nas pontas
 * forçam aspas (Excel não corta o valor silenciosamente). Célula só de espaços
 * também é citada para não sumir.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  const needsQuotes = /[";\r\n]/.test(text) || text !== text.trim();
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** Monta o CSV completo (BOM + cabeçalho + linhas), com `;` e CRLF. */
export function buildPurchasesCsv(rows: PurchaseExportRow[]): string {
  const lines: string[] = [PURCHASE_EXPORT_HEADERS.join(CSV_SEPARATOR)];

  for (const row of rows) {
    const cells = [
      row.numberLabel,
      row.statusLabel,
      row.supplierName,
      row.supplierCnpjLabel,
      String(row.itemCount),
      formatExportMoneyBR(row.grandTotal),
      formatExportDateBR(row.expectedDeliveryAt),
      formatExportDateTimeBR(row.createdAt),
      formatExportDateTimeBR(row.updatedAt),
      row.createdByName ?? "",
    ];
    lines.push(cells.map(csvEscape).join(CSV_SEPARATOR));
  }

  return `${CSV_BOM}${lines.join(CSV_EOL)}${CSV_EOL}`;
}

/** Nome do arquivo com data (estável dentro do dia): `compras-2026-11-03.csv`. */
export function purchasesCsvFileName(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `compras-${year}-${month}-${day}.csv`;
}

// ---------------------------------------------------------------------------
// Adaptador dos parâmetros de URL
// ---------------------------------------------------------------------------

/** Lê `status/supplierId/q/from/to` da query string, sem interpretar regra. */
export function parsePurchasesExportFilters(params: URLSearchParams): PurchasesExportFilters {
  const pick = (name: string): string | undefined => {
    const raw = params.get(name);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  };

  return {
    status: pick("status"),
    supplierId: pick("supplierId"),
    search: pick("q"),
    from: pick("from"),
    to: pick("to"),
  };
}

// ---------------------------------------------------------------------------
// Consulta de exportação
// ---------------------------------------------------------------------------

function parseFilterDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw purchaseValidation(`Data inválida em "${field}".`);
  }
  return date;
}

/**
 * Lista os pedidos para exportação, espelhando os filtros de `listPurchaseOrders`
 * (e as mesmas validações), mas sem paginação de 100 e com teto de segurança.
 */
export async function listPurchasesForExport(input: {
  tenantId: string;
  filters?: PurchasesExportFilters;
}): Promise<{ rows: PurchaseExportRow[]; truncated: boolean }> {
  const filters = input.filters ?? {};
  const conditions = [
    eq(purchaseOrders.tenantId, input.tenantId),
    isNull(purchaseOrders.deletedAt),
  ];

  if (filters.status && filters.status !== "todos") {
    if (!PURCHASE_STATUSES.includes(filters.status as PurchaseStatus)) {
      throw purchaseValidation("Estado de pedido inválido no filtro.");
    }
    conditions.push(eq(purchaseOrders.status, filters.status as PurchaseStatus));
  }
  if (filters.supplierId && filters.supplierId !== "todos") {
    conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    const numeric = Number(filters.search.replace(/\D/g, ""));
    const searchConditions = [like(suppliers.legalName, term), like(suppliers.tradeName, term)];
    if (Number.isFinite(numeric) && numeric > 0) {
      searchConditions.push(sql`${purchaseOrders.number} = ${numeric}`);
    }
    const condition = or(...searchConditions);
    if (condition) conditions.push(condition);
  }
  if (filters.from) {
    conditions.push(gte(purchaseOrders.createdAt, parseFilterDate(filters.from, "from")));
  }
  if (filters.to) {
    conditions.push(lte(purchaseOrders.createdAt, parseFilterDate(filters.to, "to")));
  }

  const rows = await db
    .select({
      number: purchaseOrders.number,
      status: purchaseOrders.status,
      supplierName: suppliers.legalName,
      supplierCnpj: suppliers.cnpj,
      itemCount: sql<number>`(select count(*)::int from ${purchaseOrderItems} where ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id})`,
      grandTotal: purchaseOrders.grandTotal,
      expectedDeliveryAt: purchaseOrders.expectedDeliveryAt,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      createdByName: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
    .limit(PURCHASE_EXPORT_ROW_LIMIT + 1);

  const truncated = rows.length > PURCHASE_EXPORT_ROW_LIMIT;
  const limited = truncated ? rows.slice(0, PURCHASE_EXPORT_ROW_LIMIT) : rows;

  return {
    truncated,
    rows: limited.map((row) => ({
      numberLabel: purchaseNumberLabel(row.number),
      statusLabel: PURCHASE_STATUS_LABEL[row.status],
      supplierName: row.supplierName,
      supplierCnpjLabel: formatExportCnpj(row.supplierCnpj),
      itemCount: Number(row.itemCount ?? 0),
      grandTotal: Number(row.grandTotal),
      expectedDeliveryAt: row.expectedDeliveryAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByName: row.createdByName,
    })),
  };
}
