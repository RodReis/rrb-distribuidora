/**
 * Provedores de IA por tenant: listagem de modelos e resolução do modelo.
 *
 * A chave de API vem do cadastro do tenant (`ai_provider_credentials`), não do .env.
 * A listagem de modelos usa a API de cada provedor; se a chamada falhar, cai no fallback
 * estático (os principais modelos) para a combo nunca ficar vazia por causa de rede.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  isAiProviderId,
  type AiProviderId,
} from "./provider-catalog";

export {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  isAiProviderId,
  type AiProviderId,
} from "./provider-catalog";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Modelos que não servem para conversa (embeddings, transcrição, imagem, uso interno). */
const NON_CHAT_PREFIXES = [
  "text-embedding",
  "whisper",
  "tts-",
  "dall-e",
  "gpt-4o-audio",
  "omni-mod",
  "babbage",
  "davinci",
  "search-",
  "computer-use",
  "content-filter",
];

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_PREFIXES.some((p) => lower.startsWith(p));
}

async function fetchModels(
  url: string,
  headers: Record<string, string>,
  pick: (json: any) => string[]
): Promise<string[]> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Provedor respondeu HTTP ${res.status}.`);
  }
  const ids = pick(await res.json()).filter(isChatModel);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/**
 * Lista os modelos de um provedor usando a chave informada. Falhou a chamada (rede, chave),
 * devolve o fallback estático marcado com `fallback: true` — a combo segue utilizável.
 */
export async function listProviderModels(
  provider: AiProviderId,
  apiKey: string
): Promise<{ models: string[]; fallback: boolean; error?: string }> {
  try {
    if (provider === "openai") {
      const models = await fetchModels(
        "https://api.openai.com/v1/models",
        {
          Authorization: `Bearer ${apiKey}`,
        },
        (j) => (j.data ?? []).map((m: { id: string }) => m.id)
      );
      return { models, fallback: false };
    }
    if (provider === "anthropic") {
      const models = await fetchModels(
        "https://api.anthropic.com/v1/models?limit=100",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        (j) => (j.data ?? []).map((m: { id: string }) => m.id)
      );
      return { models, fallback: false };
    }
    const models = await fetchModels(
      `${NVIDIA_BASE_URL}/models`,
      {
        Authorization: `Bearer ${apiKey}`,
      },
      (j) => (j.data ?? []).map((m: { id: string }) => m.id)
    );
    return { models, fallback: false };
  } catch (err) {
    return {
      models: AI_PROVIDERS[provider].fallbackModels,
      fallback: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Instância de modelo para o Vercel AI SDK, com a chave do tenant. A NVIDIA usa o padrão
 * OpenAI com baseURL próprio.
 */
export function resolveProviderModel(
  provider: AiProviderId,
  modelId: string,
  apiKey: string
): LanguageModel {
  if (provider === "openai") return createOpenAI({ apiKey })(modelId);
  if (provider === "anthropic") return createAnthropic({ apiKey })(modelId);
  return createOpenAI({ apiKey, baseURL: NVIDIA_BASE_URL })(modelId);
}

/** Testa uma chave sem gravar: pede a lista de modelos ao provedor. */
export async function testProviderKey(provider: AiProviderId, apiKey: string) {
  const result = await listProviderModels(provider, apiKey);
  if (result.fallback && result.error) {
    return {
      ok: false as const,
      error: `Chave rejeitada ou provedor inacessível: ${result.error}`,
    };
  }
  return { ok: true as const, modelsCount: result.models.length };
}

// ---- cache da listagem (a combo do Copiloto e a aba de configuração batem aqui) ----

const LIST_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; models: string[] }>();

/** Listagem com cache por tenant+provedor+final-da-chave (trocar a chave zera o cache). */
export async function listProviderModelsCached(
  scope: string,
  provider: AiProviderId,
  apiKey: string
): Promise<{ models: string[]; fallback: boolean; error?: string }> {
  const key = `${scope}:${provider}:${apiKey.slice(-4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return { models: hit.models, fallback: false };

  const result = await listProviderModels(provider, apiKey);
  if (!result.fallback) cache.set(key, { at: Date.now(), models: result.models });
  return result;
}
