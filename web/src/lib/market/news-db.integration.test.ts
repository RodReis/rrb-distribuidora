import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { listNews, listRegulatory } from "./news-service";

const enabled = !!process.env.RUN_DB_TESTS && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("LAC-08 (PostgreSQL real)", () => {
  it("consulta feeds do tenant sem misturar versões", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const [tenant] = await client.unsafe("SELECT id FROM tenants LIMIT 1");
      expect(Array.isArray(await listNews(tenant.id))).toBe(true);
      expect((await listRegulatory(tenant.id)).every((item) => item.tenantId === tenant.id)).toBe(
        true
      );
    } finally {
      await client.end();
    }
  });

  it("isola tenants, deduplica e preserva histórico", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const rollback = new Error("ROLLBACK_TEST");
    const tag = randomUUID();
    try {
      await expect(
        client.begin(async (tx) => {
          const [tenantA] = await tx.unsafe(
            "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
            ["LAC08 A", `lac08-a-${tag}`]
          );
          const [tenantB] = await tx.unsafe(
            "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
            ["LAC08 B", `lac08-b-${tag}`]
          );
          const [userA] = await tx.unsafe(
            "INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES ($1, $2, 'Teste A', 'x', 'admin') RETURNING id",
            [tenantA.id, `lac08-a-${tag}@example.invalid`]
          );
          const [userB] = await tx.unsafe(
            "INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES ($1, $2, 'Teste B', 'x', 'admin') RETURNING id",
            [tenantB.id, `lac08-b-${tag}@example.invalid`]
          );
          const [source] = await tx.unsafe(
            "INSERT INTO news_sources (tenant_id, name, source_url, license_reference, retention_policy, display_rights, approved_by) VALUES ($1, 'Fonte', $2, 'autorização', 'retenção documentada', 'metadata', $3) RETURNING id",
            [tenantA.id, `https://example.invalid/${tag}`, userA.id]
          );
          const [item] = await tx.unsafe(
            "INSERT INTO news_items (tenant_id, source_id, external_id, title, version, canonical_url, content_hash, captured_by) VALUES ($1, $2, 'ato-1', 'Título', 1, 'https://example.invalid/ato', $3, $4) RETURNING id",
            [tenantA.id, source.id, "a".repeat(64), userA.id]
          );

          async function rejects(sql: string, params: string[], code?: string) {
            await tx.unsafe("SAVEPOINT lac08_check");
            try {
              await tx.unsafe(sql, params);
              throw new Error("EXPECTED_REJECTION");
            } catch (error) {
              expect((error as { code?: string }).code ?? (error as Error).message).toBe(code);
            } finally {
              await tx.unsafe("ROLLBACK TO SAVEPOINT lac08_check");
              await tx.unsafe("RELEASE SAVEPOINT lac08_check");
            }
          }

          await rejects(
            "INSERT INTO news_items (tenant_id, source_id, external_id, title, version, canonical_url, content_hash, captured_by) VALUES ($1, $2, 'ato-2', 'Título', 1, 'https://example.invalid/ato', $3, $4)",
            [tenantB.id, source.id, "b".repeat(64), userB.id],
            "23503"
          );
          await rejects(
            "INSERT INTO news_classifications (tenant_id, item_id, model_version, prompt_version, labels) VALUES ($1, $2, 'human-v1', 'none', '[]')",
            [tenantB.id, item.id],
            "23503"
          );
          await rejects(
            "INSERT INTO news_items (tenant_id, source_id, external_id, title, version, canonical_url, content_hash, captured_by) VALUES ($1, $2, 'ato-1', 'Título', 2, 'https://example.invalid/ato', $3, $4)",
            [tenantA.id, source.id, "a".repeat(64), userA.id],
            "23505"
          );
          await rejects(
            "UPDATE news_items SET title = 'Alterado' WHERE id = $1",
            [item.id],
            "P0001"
          );
          await rejects(
            "INSERT INTO regulatory_items (tenant_id, authority, act_id, version, jurisdiction, subject, status, primary_source_url, reviewed_by) VALUES ($1, 'Autoridade', 'A-1', 1, 'BR', 'Assunto', 'indeterminado', 'https://example.invalid/ato', $2)",
            [tenantB.id, userA.id],
            "23503"
          );
          const [regulatory] = await tx.unsafe(
            "INSERT INTO regulatory_items (tenant_id, authority, act_id, version, jurisdiction, subject, status, primary_source_url, reviewed_by) VALUES ($1, 'Autoridade', 'A-1', 1, 'BR', 'Assunto', 'indeterminado', 'https://example.invalid/ato', $2) RETURNING id",
            [tenantA.id, userA.id]
          );
          await rejects("DELETE FROM regulatory_items WHERE id = $1", [regulatory.id], "P0001");
          throw rollback;
        })
      ).rejects.toBe(rollback);
    } finally {
      await client.end();
    }
  });
});
