/**
 * Modelos de IA disponíveis para o tenant logado (usado pela combo do Copiloto).
 * Lista, por provedor com chave configurada, os modelos do provedor (cache de 10 min).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { AiNotConfiguredError, getTenantAiConfig } from "@/lib/ai/tenant-config";
import { AI_PROVIDERS, listProviderModelsCached, type AiProviderId } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const config = await getTenantAiConfig(user.tenantId);
    const providers = [];
    for (const [provider, credential] of Object.entries(config.credentials)) {
      const listed = await listProviderModelsCached(
        user.tenantId,
        provider as AiProviderId,
        credential.apiKey
      );
      providers.push({
        provider,
        label: AI_PROVIDERS[provider as AiProviderId].label,
        models: listed.models,
        fallback: listed.fallback,
      });
    }
    return NextResponse.json({ default: config.default, providers });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ default: null, providers: [], error: err.message });
    }
    const message = err instanceof Error ? err.message : "Erro ao listar modelos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
