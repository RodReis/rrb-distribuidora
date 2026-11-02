import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_PROVIDERS,
  isAiProviderId,
  listProviderModels,
  listProviderModelsCached,
  resolveProviderModel,
  testProviderKey,
} from "./providers";

const stubFetch = (impl: (url: string, init?: any) => Promise<any>) =>
  vi.stubGlobal("fetch", vi.fn(impl));

afterEach(() => vi.unstubAllGlobals());

describe("catálogo", () => {
  it("tem exatamente openai, anthropic e nvidia", () => {
    expect(Object.keys(AI_PROVIDERS).sort()).toEqual(["anthropic", "nvidia", "openai"]);
    expect(isAiProviderId("openai")).toBe(true);
    expect(isAiProviderId("nvidia")).toBe(true);
    expect(isAiProviderId("azure")).toBe(false);
  });

  it("todo provedor tem fallback com os principais modelos", () => {
    for (const info of Object.values(AI_PROVIDERS)) {
      expect(info.fallbackModels.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("listProviderModels", () => {
  it("openai: lista, ordena e filtra modelos que não servem para conversa", async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "gpt-4o" },
          { id: "gpt-4o-mini" },
          { id: "text-embedding-3-small" },
          { id: "whisper-1" },
          { id: "dall-e-3" },
        ],
      }),
    }));
    const r = await listProviderModels("openai", "sk-x");
    expect(r).toEqual({ models: ["gpt-4o", "gpt-4o-mini"], fallback: false });
  });

  it("anthropic: manda a chave no cabeçalho próprio e lê data[].id", async () => {
    let seenInit: any;
    stubFetch(async (_url: string, init?: any) => {
      seenInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "claude-sonnet-4-5" }, { id: "claude-haiku-4-5" }] }),
      };
    });
    const r = await listProviderModels("anthropic", "sk-ant-x");
    expect(r.models).toEqual(["claude-haiku-4-5", "claude-sonnet-4-5"]);
    expect(r.fallback).toBe(false);
    expect(seenInit.headers["x-api-key"]).toBe("sk-ant-x");
    expect(seenInit.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("nvidia: chama o endpoint do NIM com Bearer", async () => {
    let seenUrl = "";
    let seenInit: any;
    stubFetch(async (url: string, init?: any) => {
      seenUrl = String(url);
      seenInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "meta/llama-3.3-70b-instruct" }] }),
      };
    });
    const r = await listProviderModels("nvidia", "nvapi-x");
    expect(r.models).toEqual(["meta/llama-3.3-70b-instruct"]);
    expect(r.fallback).toBe(false);
    expect(seenUrl).toContain("integrate.api.nvidia.com/v1/models");
    expect(seenInit.headers.Authorization).toBe("Bearer nvapi-x");
  });

  it("erro de rede ou chave cai no fallback estático, sem lançar", async () => {
    stubFetch(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const r = await listProviderModels("openai", "sk-ruim");
    expect(r.fallback).toBe(true);
    expect(r.models).toBe(AI_PROVIDERS.openai.fallbackModels);
    expect(r.error).toMatch(/401/);
  });
});

describe("testProviderKey", () => {
  it("chave válida ok; chave rejeitada não", async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    }));
    expect((await testProviderKey("openai", "sk-bom")).ok).toBe(true);

    stubFetch(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const bad = await testProviderKey("openai", "sk-ruim");
    expect(bad.ok).toBe(false);
  });
});

describe("listProviderModelsCached", () => {
  it("segunda chamada no mesmo escopo não bate no provedor de novo", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "gpt-4o-mini" }] }) };
    });
    await listProviderModelsCached("tenant-a", "openai", "sk-aaaa1111");
    await listProviderModelsCached("tenant-a", "openai", "sk-aaaa1111");
    expect(calls).toBe(1);
    // outro final de chave = outra entrada
    await listProviderModelsCached("tenant-a", "openai", "sk-bbbb2222");
    expect(calls).toBe(2);
  });
});

describe("resolveProviderModel", () => {
  it("resolve um LanguageModel para cada provedor", () => {
    for (const [provider, model] of [
      ["openai", "gpt-4o-mini"],
      ["anthropic", "claude-sonnet-4-5"],
      ["nvidia", "meta/llama-3.3-70b-instruct"],
    ] as const) {
      const m = resolveProviderModel(provider, model, "sk-x");
      expect(m).toBeTruthy();
      expect(typeof (m as any).doGenerate).toBe("function");
    }
  });
});
