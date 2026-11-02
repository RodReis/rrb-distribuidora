/**
 * Configuração de IA por tenant: credenciais de provedor (chave cifrada) e modelo padrão.
 *
 * Substitui as variáveis de ambiente OPENAI_API_KEY/OPENAI_MODEL: cada empresa cadastra as
 * próprias chaves em Configuração › Inteligência Artificial. Sem credencial, Copiloto e
 * briefing avisam — nada de chave global escondida no servidor.
 */
import { and, eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { db } from "@/lib/db";
import { aiProviderCredentials, auditLog, tenants } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { isAiProviderId, resolveProviderModel, type AiProviderId } from "./providers";

export interface TenantCredential {
  provider: AiProviderId;
  apiKey: string;
  last4: string;
}

export interface TenantAiConfig {
  default: { provider: AiProviderId; model: string } | null;
  credentials: Partial<Record<AiProviderId, TenantCredential>>;
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Lê as credenciais (decifrando) e o modelo padrão do tenant. */
export async function getTenantAiConfig(tenantId: string): Promise<TenantAiConfig> {
  const [tenant] = await db
    .select({
      aiDefaultProvider: tenants.aiDefaultProvider,
      aiDefaultModel: tenants.aiDefaultModel,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error("Tenant não encontrado.");

  const rows = await db
    .select()
    .from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.tenantId, tenantId));

  if (rows.length && !isEncryptionConfigured()) {
    throw new AiNotConfiguredError(
      "APP_ENCRYPTION_KEY não configurada no servidor; não é possível ler as chaves de IA."
    );
  }

  const credentials: TenantAiConfig["credentials"] = {};
  for (const row of rows) {
    if (!isAiProviderId(row.provider)) continue;
    credentials[row.provider] = {
      provider: row.provider,
      apiKey: decryptSecret(row.apiKeyEncrypted),
      last4: row.apiKeyLast4,
    };
  }

  const defaultModel =
    tenant.aiDefaultProvider &&
    tenant.aiDefaultModel &&
    isAiProviderId(tenant.aiDefaultProvider) &&
    credentials[tenant.aiDefaultProvider]
      ? { provider: tenant.aiDefaultProvider, model: tenant.aiDefaultModel }
      : null;

  return { default: defaultModel, credentials };
}

/**
 * Resolve o modelo de IA do tenant: o escolhido na conversa (se o provedor tiver credencial)
 * ou o padrão. Sem nada configurado, erro claro — não existe fallback de chave global.
 */
export async function resolveTenantModel(
  tenantId: string,
  requested?: { provider?: string; model?: string } | null
): Promise<{ model: LanguageModel; provider: AiProviderId; modelId: string }> {
  const config = await getTenantAiConfig(tenantId);

  if (requested?.provider && requested.model && isAiProviderId(requested.provider)) {
    const credential = config.credentials[requested.provider];
    if (!credential) {
      throw new AiNotConfiguredError(
        `O provedor ${requested.provider} não tem chave configurada para esta empresa.`
      );
    }
    return {
      model: resolveProviderModel(requested.provider, requested.model, credential.apiKey),
      provider: requested.provider,
      modelId: requested.model,
    };
  }

  if (config.default) {
    const credential = config.credentials[config.default.provider]!;
    return {
      model: resolveProviderModel(config.default.provider, config.default.model, credential.apiKey),
      provider: config.default.provider,
      modelId: config.default.model,
    };
  }

  throw new AiNotConfiguredError(
    "Nenhum modelo de IA configurado para esta empresa. Cadastre uma chave em Configuração › Inteligência Artificial."
  );
}

/** Salva (ou troca) a chave de um provedor. A chave nunca vai para a auditoria. */
export async function saveAiCredential(
  tenantId: string,
  userId: string,
  provider: string,
  apiKey: string
) {
  if (!isAiProviderId(provider)) throw new Error("Provedor desconhecido.");
  const key = apiKey.trim();
  if (key.length < 8) throw new Error("A chave informada parece curta demais.");

  const last4 = key.slice(-4);
  await db
    .insert(aiProviderCredentials)
    .values({
      tenantId,
      provider,
      apiKeyEncrypted: encryptSecret(key),
      apiKeyLast4: last4,
    })
    .onConflictDoUpdate({
      target: [aiProviderCredentials.tenantId, aiProviderCredentials.provider],
      set: { apiKeyEncrypted: encryptSecret(key), apiKeyLast4: last4, updatedAt: new Date() },
    });

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "ai_provider_credentials",
    entityId: `${tenantId}:${provider}`,
    action: "update",
    before: null,
    after: { provider, apiKeyLast4: last4 }, // sem a chave, nunca
  });
}

/** Remove a chave de um provedor; o padrão que dependia dela é limpo junto. */
export async function clearAiCredential(tenantId: string, userId: string, provider: string) {
  if (!isAiProviderId(provider)) throw new Error("Provedor desconhecido.");
  await db
    .delete(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.tenantId, tenantId),
        eq(aiProviderCredentials.provider, provider)
      )
    );

  const [tenant] = await db
    .select({ p: tenants.aiDefaultProvider })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenant?.p === provider) {
    await db
      .update(tenants)
      .set({ aiDefaultProvider: null, aiDefaultModel: null })
      .where(eq(tenants.id, tenantId));
  }

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "ai_provider_credentials",
    entityId: `${tenantId}:${provider}`,
    action: "delete",
    before: { provider },
    after: { removed: true },
  });
}

/** Define o modelo padrão do tenant (Copiloto e briefing usam este). Exige credencial do provedor. */
export async function setTenantDefaultModel(
  tenantId: string,
  userId: string,
  provider: string,
  model: string
) {
  if (!isAiProviderId(provider)) throw new Error("Provedor desconhecido.");
  const modelId = model.trim();
  if (!modelId) throw new Error("Escolha um modelo.");

  const [credential] = await db
    .select({ id: aiProviderCredentials.id })
    .from(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.tenantId, tenantId),
        eq(aiProviderCredentials.provider, provider)
      )
    );
  if (!credential) throw new Error("Cadastre primeiro a chave deste provedor.");

  await db
    .update(tenants)
    .set({ aiDefaultProvider: provider, aiDefaultModel: modelId })
    .where(eq(tenants.id, tenantId));

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "tenants",
    entityId: tenantId,
    action: "update",
    before: null,
    after: { aiDefaultProvider: provider, aiDefaultModel: modelId },
  });
}
