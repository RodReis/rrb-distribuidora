/**
 * Repara `products.replacement_cost_base` gravado por unidade (t, un) em vez de R$/kg.
 *
 *   pnpm db:fix-replacement-cost              dry-run: lista o que mudaria, não altera nada
 *   pnpm db:fix-replacement-cost --apply      aplica as conversões e registra na trilha de auditoria
 *
 * Itens "revisar" nunca são alterados: exigem decisão humana.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, products } from "@/lib/db/schema";
import { proposeRepair, SUSPICIOUS_COST_PER_KG_BRL } from "@/lib/stock/replacement-cost-repair";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({
      id: products.id,
      tenantId: products.tenantId,
      sku: products.sku,
      unit: products.unit,
      family: products.family,
      weightPerUnit: products.weightPerUnit,
      replacementCostBase: products.replacementCostBase,
    })
    .from(products);

  const proposals = rows
    .map((r) => ({ row: r, proposal: proposeRepair(r) }))
    .filter(
      (
        x
      ): x is {
        row: (typeof rows)[number];
        proposal: NonNullable<ReturnType<typeof proposeRepair>>;
      } => !!x.proposal
    );

  const fixes = proposals.filter((x) => x.proposal.kind === "fix");
  const reviews = proposals.filter((x) => x.proposal.kind === "review");

  console.log(
    `${rows.length} produtos analisados (sinal: custo > R$ ${SUSPICIOUS_COST_PER_KG_BRL}/kg). ` +
      `${fixes.length} a converter, ${reviews.length} para revisar.`
  );
  for (const { proposal: p } of fixes) {
    if (p.kind === "fix")
      console.log(`  CONVERTER ${p.sku}: R$ ${p.from} → R$ ${p.to}/kg (${p.reason})`);
  }
  for (const { proposal: p } of reviews) console.log(`  REVISAR   ${p.sku}: ${p.reason}`);

  if (!apply) {
    console.log(
      fixes.length
        ? "\nDry-run: nada foi alterado. Rode com --apply para converter."
        : "\nNada a converter."
    );
    return;
  }

  for (const { row, proposal: p } of fixes) {
    if (p.kind !== "fix") continue;
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ replacementCostBase: String(p.to), updatedAt: new Date() })
        .where(eq(products.id, row.id));
      await tx.insert(auditLog).values({
        tenantId: row.tenantId,
        entity: "products",
        entityId: row.id,
        action: "update",
        before: { replacementCostBase: String(p.from) },
        after: {
          replacementCostBase: String(p.to),
          motivo: "reparo: custo por unidade convertido para R$/kg",
        },
      });
    });
  }
  console.log(
    `\n${fixes.length} produto(s) convertido(s). Rode o recálculo de estoque para atualizar os indicadores.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
