/**
 * Catálogo de provedores de IA do sistema (sem dependências de SDK).
 * Importado por código de servidor (lib/ai/providers.ts) e por telas client.
 */
export const AI_PROVIDER_IDS = ["openai", "anthropic", "nvidia"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  hint: string;
  /** Fallback estático: os principais modelos, usado quando a API de listagem não responde. */
  fallbackModels: string[];
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    hint: "Plataforma da OpenAI (api.openai.com).",
    fallbackModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    hint: "Plataforma da Anthropic (api.anthropic.com).",
    fallbackModels: [
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM (grátis)",
    hint: "API gratuita da NVIDIA (build.nvidia.com), compatível com o padrão OpenAI.",
    fallbackModels: [
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.1-405b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "mistralai/mixtral-8x22b-instruct-v0.1",
      "qwen/qwen2.5-coder-32b-instruct",
    ],
  },
};

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}
