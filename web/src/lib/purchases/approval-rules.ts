import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, purchaseApprovalRules, users } from "@/lib/db/schema";
import { purchaseConflict, purchaseValidation } from "./errors";
import { hasPurchaseCapability, requirePurchaseCapability } from "./capabilities";
import { roundMoney } from "./pricing";
import type { PurchaseApprovalRuleDto } from "./types";

/**
 * Matriz de alçadas versionada (LAC-01 §3, §6).
 *
 * Não existe faixa default: enquanto o PI não configurar uma matriz, nenhuma
 * compra é emitida (o pedido fica `aguardando_alcada_configurada`). Salvar cria
 * uma NOVA versão inteira; a anterior é encerrada (active_until), nunca apagada.
 */

export interface ActiveApprovalRule {
  id: string;
  matrixVersion: number;
  minTotal: number;
  maxTotal: number | null;
  currency: string;
  approverPermission: string;
  requiredApprovals: number;
  activeFrom: Date;
  activeUntil: Date | null;
}

export interface ApprovalRuleRowInput {
  minTotal: number;
  maxTotal?: number | null;
  approverPermission: string;
  requiredApprovals?: number;
}

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Valida a matriz: faixas contíguas a partir de R$ 0, sem lacunas nem
 * sobreposições, com a última faixa aberta (`maxTotal` nulo).
 */
export function validateApprovalMatrixRows(rows: ApprovalRuleRowInput[]): ApprovalRuleRowInput[] {
  if (!rows.length) {
    throw purchaseValidation("A matriz de alçadas precisa de ao menos uma faixa.");
  }

  const normalized = rows
    .map((row) => ({
      minTotal: roundMoney(row.minTotal),
      maxTotal: row.maxTotal == null ? null : roundMoney(row.maxTotal),
      approverPermission: row.approverPermission,
      requiredApprovals: row.requiredApprovals ?? 1,
    }))
    .sort((a, b) => a.minTotal - b.minTotal);

  if (normalized[0].minTotal !== 0) {
    throw purchaseValidation("A primeira faixa da alçada deve começar em R$ 0,00.");
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const row = normalized[i];
    if (row.requiredApprovals < 1 || row.requiredApprovals > 5) {
      throw purchaseValidation("A quantidade de aprovadores deve ficar entre 1 e 5.");
    }
    if (row.maxTotal !== null && row.maxTotal <= row.minTotal) {
      throw purchaseValidation(
        `Faixa inválida: o teto (${row.maxTotal}) deve ser maior que o piso (${row.minTotal}).`
      );
    }

    const next = normalized[i + 1];
    if (!next) {
      if (row.maxTotal !== null) {
        throw purchaseValidation(
          "A última faixa deve ser aberta (sem teto) para cobrir qualquer valor."
        );
      }
      continue;
    }

    if (row.maxTotal === null) {
      throw purchaseValidation("Somente a última faixa pode ser aberta (sem teto).");
    }
    if (next.minTotal !== row.maxTotal) {
      const kind = next.minTotal < row.maxTotal ? "sobreposição" : "lacuna";
      throw purchaseValidation(
        `A matriz tem ${kind} entre R$ ${row.minTotal} e R$ ${next.minTotal}. As faixas precisam ser contíguas.`
      );
    }
  }

  return normalized;
}

/** Faixas da versão ativa em `at` (a de maior número ativa naquele instante). */
export async function listActiveApprovalRules(
  tenantId: string,
  at: Date = new Date()
): Promise<ActiveApprovalRule[]> {
  const rows = await db
    .select()
    .from(purchaseApprovalRules)
    .where(
      and(
        eq(purchaseApprovalRules.tenantId, tenantId),
        lte(purchaseApprovalRules.activeFrom, at),
        or(isNull(purchaseApprovalRules.activeUntil), gt(purchaseApprovalRules.activeUntil, at))
      )
    )
    .orderBy(desc(purchaseApprovalRules.version), asc(purchaseApprovalRules.minTotal));

  if (!rows.length) return [];

  const activeVersion = rows[0].version;
  return rows
    .filter((row) => row.version === activeVersion)
    .map((row) => ({
      id: row.id,
      matrixVersion: row.version,
      minTotal: toNum(row.minTotal),
      maxTotal: row.maxTotal == null ? null : toNum(row.maxTotal),
      currency: row.currency,
      approverPermission: row.approverPermission,
      requiredApprovals: row.requiredApprovals,
      activeFrom: row.activeFrom,
      activeUntil: row.activeUntil,
    }));
}

/** Faixa aplicável ao total. `null` = alçada não configurada para esse valor. */
export async function resolveApprovalRule(
  tenantId: string,
  total: number,
  at: Date = new Date()
): Promise<ActiveApprovalRule | null> {
  const rules = await listActiveApprovalRules(tenantId, at);
  if (!rules.length) return null;
  const amount = roundMoney(total);
  return (
    rules.find(
      (rule) => amount >= rule.minTotal && (rule.maxTotal === null || amount < rule.maxTotal)
    ) ?? null
  );
}

/** Versão da matriz ativa (null = nunca configurada). */
export async function getActiveMatrixVersion(tenantId: string): Promise<number | null> {
  const rules = await listActiveApprovalRules(tenantId);
  return rules[0]?.matrixVersion ?? null;
}

export async function listApprovalMatrixHistory(tenantId: string): Promise<{
  activeVersion: number | null;
  versions: {
    version: number;
    activeFrom: string;
    activeUntil: string | null;
    rows: PurchaseApprovalRuleDto[];
  }[];
}> {
  const rows = await db
    .select({
      rule: purchaseApprovalRules,
      createdByName: users.name,
    })
    .from(purchaseApprovalRules)
    .leftJoin(users, eq(users.id, purchaseApprovalRules.createdBy))
    .where(eq(purchaseApprovalRules.tenantId, tenantId))
    .orderBy(desc(purchaseApprovalRules.version), asc(purchaseApprovalRules.minTotal));

  const byVersion = new Map<number, (typeof rows)[number][]>();
  for (const row of rows) {
    const list = byVersion.get(row.rule.version) ?? [];
    list.push(row);
    byVersion.set(row.rule.version, list);
  }

  const versions = [...byVersion.entries()]
    .map(([version, list]) => ({
      version,
      activeFrom: list[0].rule.activeFrom.toISOString(),
      activeUntil: list[0].rule.activeUntil ? list[0].rule.activeUntil.toISOString() : null,
      rows: list.map(({ rule, createdByName }) => ({
        id: rule.id,
        matrixVersion: rule.version,
        minTotal: toNum(rule.minTotal),
        maxTotal: rule.maxTotal == null ? null : toNum(rule.maxTotal),
        currency: rule.currency,
        approverPermission: rule.approverPermission,
        requiredApprovals: rule.requiredApprovals,
        activeFrom: rule.activeFrom.toISOString(),
        activeUntil: rule.activeUntil ? rule.activeUntil.toISOString() : null,
        createdByName,
      })),
    }))
    .sort((a, b) => b.version - a.version);

  return {
    activeVersion: (await getActiveMatrixVersion(tenantId)) ?? null,
    versions,
  };
}

/**
 * Grava uma nova versão da matriz. Exige capability de configuração e motivo;
 * a versão anterior é encerrada no mesmo instante (nunca apagada).
 */
export async function saveApprovalMatrix(input: {
  tenantId: string;
  userId: string;
  role: string;
  rows: ApprovalRuleRowInput[];
  reason: string;
}): Promise<{ version: number; rules: PurchaseApprovalRuleDto[] }> {
  requirePurchaseCapability(input.role, "purchase.configure_approval");
  if (!input.reason.trim()) {
    throw purchaseValidation("Informe o motivo da alteração da matriz de alçadas.");
  }

  const rows = validateApprovalMatrixRows(input.rows);
  const now = new Date();

  const { version, created } = await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: purchaseApprovalRules.version })
      .from(purchaseApprovalRules)
      .where(eq(purchaseApprovalRules.tenantId, input.tenantId))
      .orderBy(desc(purchaseApprovalRules.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    await tx
      .update(purchaseApprovalRules)
      .set({ activeUntil: now })
      .where(
        and(
          eq(purchaseApprovalRules.tenantId, input.tenantId),
          isNull(purchaseApprovalRules.activeUntil)
        )
      );

    const inserted = await tx
      .insert(purchaseApprovalRules)
      .values(
        rows.map((row) => ({
          tenantId: input.tenantId,
          version: nextVersion,
          minTotal: row.minTotal.toFixed(2),
          maxTotal: row.maxTotal == null ? null : row.maxTotal.toFixed(2),
          currency: "BRL",
          approverPermission: row.approverPermission,
          requiredApprovals: row.requiredApprovals,
          activeFrom: now,
          createdBy: input.userId,
          approvedBy: input.userId,
        }))
      )
      .returning();

    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "purchase_approval_rules",
      entityId: `v${nextVersion}`,
      action: "insert",
      before: null,
      after: {
        version: nextVersion,
        reason: input.reason,
        rows: rows.map((row) => ({
          minTotal: row.minTotal,
          maxTotal: row.maxTotal,
          approverPermission: row.approverPermission,
          requiredApprovals: row.requiredApprovals,
        })),
      },
    });

    return { version: nextVersion, created: inserted };
  });

  return {
    version,
    rules: created.map((rule) => ({
      id: rule.id,
      matrixVersion: rule.version,
      minTotal: toNum(rule.minTotal),
      maxTotal: rule.maxTotal == null ? null : toNum(rule.maxTotal),
      currency: rule.currency,
      approverPermission: rule.approverPermission,
      requiredApprovals: rule.requiredApprovals,
      activeFrom: rule.activeFrom.toISOString(),
      activeUntil: rule.activeUntil ? rule.activeUntil.toISOString() : null,
      createdByName: null,
    })),
  };
}

/** Verifica se o usuário pode decidir um pedido por esta faixa. */
export function ruleAllowsApprover(rule: ActiveApprovalRule, actorRole: string): boolean {
  return hasPurchaseCapability(actorRole, rule.approverPermission as never);
}

export async function assertMatrixHasNoGap(
  tenantId: string,
  total: number,
  at: Date = new Date()
): Promise<ActiveApprovalRule> {
  const rule = await resolveApprovalRule(tenantId, total, at);
  if (!rule) {
    throw purchaseConflict(
      "Não há faixa de alçada configurada para o valor deste pedido. Configure a matriz em Configurações › Compras antes de emitir.",
      { code: "ALCADA_NAO_CONFIGURADA", total }
    );
  }
  return rule;
}
