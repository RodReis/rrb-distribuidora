import { and, asc, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  importParityConfigs,
  marketAlertNotifications,
  marketAlertRules,
  marketAssets,
  marketPriceSeries,
  users,
} from "@/lib/db/schema";
import { sendMarketAlertEmail } from "@/lib/email/market-alert";
import { ASSET_SYMBOLS } from "./assets";
import { smaCross } from "./indicators";
import type { ConditionType } from "./conditions";
import { calculateParity } from "./parity-calculator";
import { getLastClose, getQuotes } from "./queries";
import { eligibleSmaCloses } from "./sma-eligibility";

const SUPPRESS_HOURS = 24;

interface Trigger {
  title: string;
  message: string;
}

const pt = (n: number, d = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

async function closesFor(
  assetId: string,
  limit = 80
): Promise<{ closes: number[]; source: string; from: string; to: string }> {
  const rows = await db
    .select({
      close: marketPriceSeries.close,
      timestamp: marketPriceSeries.timestamp,
      source: marketPriceSeries.source,
    })
    .from(marketPriceSeries)
    .where(
      and(eq(marketPriceSeries.assetId, assetId), ne(marketPriceSeries.source, "MANUAL_IMPORT"))
    )
    .orderBy(desc(marketPriceSeries.timestamp))
    .limit(limit);
  const closes = eligibleSmaCloses(
    rows.map((r) => ({ timestamp: r.timestamp, close: Number(r.close), source: r.source }))
  );
  return {
    closes,
    source: rows[0]?.source ?? "desconhecida",
    from: rows[50]?.timestamp.toISOString() ?? "",
    to: rows[0]?.timestamp.toISOString() ?? "",
  };
}

export async function currentSpreadPct(tenantId: string): Promise<number | null> {
  const [fob, ptax] = await Promise.all([
    getLastClose(ASSET_SYMBOLS.HRC_CN),
    getLastClose(ASSET_SYMBOLS.PTAX),
  ]);
  if (fob == null || ptax == null) return null;
  const [cfg] = await db
    .select()
    .from(importParityConfigs)
    .where(eq(importParityConfigs.tenantId, tenantId))
    .orderBy(desc(importParityConfigs.updatedAt))
    .limit(1);
  const n = (v: string | undefined, fallback: number) => (v != null ? Number(v) : fallback);
  return calculateParity({
    fobUsdPerTon: fob,
    oceanFreightUsdPerTon: n(cfg?.oceanFreightUsdPerTon, 58),
    insuranceUsdPerTon: 0,
    ptax,
    iiPct: n(cfg?.iiTaxPct, 12),
    ipiPct: n(cfg?.ipiTaxPct, 3.25),
    pisPct: n(cfg?.pisTaxPct, 2.1),
    cofinsPct: n(cfg?.cofinsTaxPct, 9.65),
    icmsPct: n(cfg?.icmsTaxPct, 18),
    portExpensesBrlPerTon: n(cfg?.portExpensesPerTon, 150),
    roadFreightBrlPerTon: n(cfg?.roadFreightPerTon, 280),
    domesticPriceBrlPerTon: n(cfg?.domesticPriceBrlPerTon, 4710),
    volumeTons: 1,
    recoverTaxes: true,
  }).spreadPct;
}

export interface EvalResult {
  evaluated: number;
  triggered: number;
  emailsSent: number;
}

export async function evaluateAlerts(now: Date = new Date()): Promise<EvalResult> {
  const suppressBefore = new Date(now.getTime() - SUPPRESS_HOURS * 3_600_000);
  const rules = await db
    .select({ rule: marketAlertRules, asset: marketAssets, user: users })
    .from(marketAlertRules)
    .innerJoin(marketAssets, eq(marketAssets.id, marketAlertRules.assetId))
    .innerJoin(users, eq(users.id, marketAlertRules.userId))
    .where(
      and(
        eq(marketAlertRules.active, true),
        or(
          isNull(marketAlertRules.lastTriggeredAt),
          lt(marketAlertRules.lastTriggeredAt, suppressBefore)
        )
      )
    )
    .orderBy(asc(marketAlertRules.createdAt));

  const quotes = new Map((await getQuotes()).map((q) => [q.symbol, q]));
  let triggered = 0;
  let emailsSent = 0;

  for (const { rule, asset, user } of rules) {
    const threshold = Number(rule.thresholdValue);
    const quote = quotes.get(asset.symbol);
    let trigger: Trigger | null = null;

    switch (rule.conditionType as ConditionType) {
      case "PERCENT_CHANGE_24H":
      case "PERCENT_CHANGE_7D": {
        const change =
          rule.conditionType === "PERCENT_CHANGE_24H" ? quote?.change24h : quote?.change7d;
        if (change != null && Math.abs(change) >= threshold) {
          const period = rule.conditionType === "PERCENT_CHANGE_24H" ? "24h" : "7 dias";
          trigger = {
            title: `${asset.name}: variação de ${change >= 0 ? "+" : ""}${pt(change)}% em ${period}`,
            message: `${asset.name} variou ${change >= 0 ? "+" : ""}${pt(change)}% em ${period} (limite configurado: ±${pt(threshold)}%). Último valor: ${pt(quote!.last ?? 0, 4)}.`,
          };
        }
        break;
      }
      case "THRESHOLD_ABOVE":
      case "THRESHOLD_BELOW": {
        const last = quote?.last;
        const above = rule.conditionType === "THRESHOLD_ABOVE";
        if (last != null && (above ? last > threshold : last < threshold)) {
          trigger = {
            title: `${asset.name} ${above ? "acima" : "abaixo"} de ${pt(threshold)}`,
            message: `${asset.name} está em ${pt(last, 4)}, ${above ? "acima" : "abaixo"} do limite de ${pt(threshold)}.`,
          };
        }
        break;
      }
      case "SMA_CROSS": {
        const window = await closesFor(asset.id);
        const cross = smaCross(window.closes, 20, 50);
        if (cross) {
          trigger = {
            title: `${asset.name}: cruzamento ${cross === "golden" ? "de alta" : "de baixa"} de médias`,
            message: `A SMA 20 cruzou ${cross === "golden" ? "acima" : "abaixo"} da SMA 50 em ${asset.name}. Fonte: ${window.source}. Regra: market-sma-cross-v1; janela: ${window.from} a ${window.to}; fechamentos usados: ${window.closes.slice(-51).join(", ")}.`,
          };
        }
        break;
      }
      case "PARITY_SPREAD_ABOVE": {
        const spread = await currentSpreadPct(rule.tenantId);
        if (spread != null && spread > threshold) {
          trigger = {
            title: `Importação favorável: spread de ${pt(spread)}%`,
            message: `O spread de paridade de importação vs. usina nacional atingiu ${pt(spread)}% (limite: ${pt(threshold)}%).`,
          };
        }
        break;
      }
    }

    if (!trigger) continue;
    triggered++;

    // Reserva o disparo antes de notificar; se outra execução já marcou, não duplica.
    const claimed = await db
      .update(marketAlertRules)
      .set({ lastTriggeredAt: now })
      .where(
        and(
          eq(marketAlertRules.id, rule.id),
          or(
            isNull(marketAlertRules.lastTriggeredAt),
            lt(marketAlertRules.lastTriggeredAt, suppressBefore)
          )
        )
      )
      .returning({ id: marketAlertRules.id });
    if (claimed.length === 0) continue;

    if (rule.channels.includes("in_app")) {
      await db.insert(marketAlertNotifications).values({
        tenantId: rule.tenantId,
        userId: rule.userId,
        ruleId: rule.id,
        title: trigger.title.slice(0, 150),
        message: trigger.message,
      });
    }
    if (
      rule.channels.includes("email") &&
      (await sendMarketAlertEmail(user.email, trigger.title, trigger.message))
    ) {
      emailsSent++;
    }
  }

  return { evaluated: rules.length, triggered, emailsSent };
}
