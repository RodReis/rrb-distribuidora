"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, marketAssets } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { evaluateAlerts } from "@/lib/market/alerts";
import { importSeriesCsv } from "@/lib/market/import-csv";
import { fetchProviderPrice, ingestMetals } from "@/lib/market/ingest-metals";
import { ingestPtaxDay } from "@/lib/market/ingest-ptax";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const assetSchema = z
  .object({
    id: z.string().uuid().optional(),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,29}$/, "Use 2 a 30 caracteres: letras, números e hífen."),
    name: z.string().trim().min(2, "Informe o nome do mercado.").max(100),
    market: z.string().trim().min(2, "Informe a bolsa/fonte.").max(50),
    baseCurrency: z.enum(["USD", "BRL"]),
    unit: z.enum(["ton", "kg"]),
    provider: z.enum(["METALS_API", "COMMODITY_PRICE_API", "MANUAL"]),
    providerSymbol: z.string().trim().max(50).nullable().optional(),
  })
  .refine((v) => v.provider === "MANUAL" || !!v.providerSymbol, {
    path: ["providerSymbol"],
    message: "Informe o símbolo na fonte de preços.",
  });

export type AssetInput = z.input<typeof assetSchema>;

async function guard() {
  const user = await getCurrentUser();
  await requirePermission("usuarios_sistema", "write");
  return user;
}

function failure(err: unknown, fallback: string): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("FORBIDDEN")) {
    return {
      ok: false,
      error: "Apenas administradores podem alterar as configurações de mercado.",
    };
  }
  return { ok: false, error: fallback };
}

export async function saveMarketAsset(
  input: AssetInput
): Promise<ActionResult<{ id: string; symbol: string }>> {
  try {
    const user = await guard();
    const parsed = assetSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const v = parsed.data;
    const values = {
      name: v.name,
      market: v.market,
      baseCurrency: v.baseCurrency,
      unit: v.unit,
      provider: v.provider,
      providerSymbol: v.provider === "MANUAL" ? null : v.providerSymbol!,
    };

    if (v.id) {
      const [before] = await db.select().from(marketAssets).where(eq(marketAssets.id, v.id));
      if (!before) return { ok: false, error: "Mercado não encontrado." };
      const system = before.provider === "BCB_PTAX";
      const [after] = await db
        .update(marketAssets)
        .set(system ? { name: values.name } : values)
        .where(eq(marketAssets.id, v.id))
        .returning();
      await db.insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        entity: "market_assets",
        entityId: after.id,
        action: "update",
        before,
        after,
      });
      revalidatePath("/configuracoes");
      return { ok: true, data: { id: after.id, symbol: after.symbol } };
    }

    const [exists] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, v.symbol));
    if (exists) return { ok: false, error: `O código ${v.symbol} já está cadastrado.` };

    const [created] = await db
      .insert(marketAssets)
      .values({ ...values, symbol: v.symbol })
      .returning();
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "market_assets",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });
    revalidatePath("/configuracoes");
    revalidatePath("/mercado");
    return { ok: true, data: { id: created.id, symbol: created.symbol } };
  } catch (err) {
    return failure(err, "Não foi possível salvar o mercado.");
  }
}

export async function setMarketAssetActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const user = await guard();
    const [before] = await db.select().from(marketAssets).where(eq(marketAssets.id, id));
    if (!before) return { ok: false, error: "Mercado não encontrado." };
    if (before.provider === "BCB_PTAX" && !active) {
      return { ok: false, error: "A PTAX é usada no simulador e não pode ser desativada." };
    }
    const [after] = await db
      .update(marketAssets)
      .set({ active })
      .where(eq(marketAssets.id, id))
      .returning();
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "market_assets",
      entityId: id,
      action: "update",
      before,
      after,
    });
    revalidatePath("/configuracoes");
    revalidatePath("/mercado");
    return { ok: true };
  } catch (err) {
    return failure(err, "Não foi possível alterar o status do mercado.");
  }
}

export async function testMarketSource(
  provider: "METALS_API" | "COMMODITY_PRICE_API",
  providerSymbol: string
): Promise<ActionResult<{ price: number }>> {
  try {
    await guard();
    const symbol = providerSymbol.trim();
    if (!symbol) return { ok: false, error: "Informe o símbolo na fonte de preços." };
    return { ok: true, data: { price: await fetchProviderPrice(provider, symbol) } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("FORBIDDEN")) return failure(err, "");
    return { ok: false, error: message || "Falha ao consultar a fonte." };
  }
}

export async function runIngestionNow(): Promise<
  ActionResult<{ ptax: number; metals: number; errors: string[]; alerts: number }>
> {
  try {
    await guard();
    const errors: string[] = [];
    let ptax = 0;
    try {
      ptax = (await ingestPtaxDay()).upserted;
    } catch (err) {
      errors.push(`PTAX: ${err instanceof Error ? err.message : "falha"}`);
    }
    const metals = await ingestMetals();
    errors.push(...metals.errors);
    const alerts = await evaluateAlerts();
    revalidatePath("/configuracoes");
    revalidatePath("/mercado");
    return {
      ok: true,
      data: { ptax, metals: metals.upserted, errors, alerts: alerts.triggered },
    };
  } catch (err) {
    return failure(err, "Não foi possível executar a ingestão.");
  }
}

export async function importAssetCsv(
  assetId: string,
  csv: string
): Promise<ActionResult<{ imported: number; skipped: number }>> {
  try {
    const user = await guard();
    if (csv.length > 5_000_000) return { ok: false, error: "Arquivo acima de 5 MB." };
    const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.id, assetId));
    if (!asset) return { ok: false, error: "Mercado não encontrado." };

    const res = await importSeriesCsv(csv, asset.symbol);
    if (res.imported === 0) {
      return {
        ok: false,
        error:
          "Nenhuma linha válida. Use as colunas date (AAAA-MM-DD), open, high, low, close, volume.",
      };
    }
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "market_price_series",
      entityId: asset.symbol,
      action: "insert",
      before: null,
      after: { source: "MANUAL_IMPORT", ...res },
    });
    revalidatePath("/configuracoes");
    revalidatePath("/mercado");
    return { ok: true, data: res };
  } catch (err) {
    return failure(err, "Não foi possível importar o CSV.");
  }
}
