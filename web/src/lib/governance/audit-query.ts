import { and, desc, eq, ilike, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentActions, users } from "@/lib/db/schema";
import { escapeLike, totalPages, type AuditFilters } from "./filters";

function buildWhere(tenantId: string, f: AuditFilters): SQL {
  const conditions: SQL[] = [eq(agentActions.tenantId, tenantId)];
  if (f.agent) conditions.push(eq(agentActions.agentName, f.agent));
  if (f.feedback === "positivo") conditions.push(eq(agentActions.feedbackScore, 1));
  if (f.feedback === "negativo") conditions.push(eq(agentActions.feedbackScore, -1));
  if (f.feedback === "sem") conditions.push(isNull(agentActions.feedbackScore));
  if (f.q) conditions.push(ilike(agentActions.userPrompt, `%${escapeLike(f.q)}%`));
  return and(...conditions) as SQL;
}

export async function getAuditSummary(tenantId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      avgLatencyMs: sql<string | null>`avg(${agentActions.latencyMs})`,
      tokens: sql<string>`coalesce(sum(coalesce(${agentActions.promptTokens},0) + coalesce(${agentActions.completionTokens},0)),0)`,
      positive: sql<number>`count(*) filter (where ${agentActions.feedbackScore} = 1)`,
      negative: sql<number>`count(*) filter (where ${agentActions.feedbackScore} = -1)`,
      lastAt: sql<string | null>`max(${agentActions.createdAt})`,
    })
    .from(agentActions)
    .where(eq(agentActions.tenantId, tenantId));

  return {
    total: Number(row?.total ?? 0),
    avgLatencyMs: row?.avgLatencyMs != null ? Math.round(Number(row.avgLatencyMs)) : null,
    tokens: Number(row?.tokens ?? 0),
    positive: Number(row?.positive ?? 0),
    negative: Number(row?.negative ?? 0),
    lastAt: row?.lastAt ? new Date(row.lastAt) : null,
  };
}

export async function getAuditPage(tenantId: string, f: AuditFilters) {
  const where = buildWhere(tenantId, f);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentActions)
    .where(where);
  const total = Number(count ?? 0);
  const pages = totalPages(total, f.size);
  const page = Math.min(f.page, pages);

  const rows = await db
    .select({
      id: agentActions.id,
      agentName: agentActions.agentName,
      userPrompt: agentActions.userPrompt,
      agentResponse: agentActions.agentResponse,
      toolsExecuted: agentActions.toolsExecuted,
      promptTokens: agentActions.promptTokens,
      completionTokens: agentActions.completionTokens,
      latencyMs: agentActions.latencyMs,
      feedbackScore: agentActions.feedbackScore,
      createdAt: agentActions.createdAt,
      userName: users.name,
    })
    .from(agentActions)
    .leftJoin(users, eq(users.id, agentActions.userId))
    .where(where)
    .orderBy(desc(agentActions.createdAt))
    .limit(f.size)
    .offset((page - 1) * f.size);

  const agents = await db
    .selectDistinct({ name: agentActions.agentName })
    .from(agentActions)
    .where(eq(agentActions.tenantId, tenantId))
    .orderBy(agentActions.agentName);

  return { rows, total, page, pages, agents: agents.map((a) => a.name) };
}
