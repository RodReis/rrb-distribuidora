"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/provider-catalog";
import {
  clearAiProviderKey,
  listAiProviderModels,
  saveAiProviderKey,
  setAiDefaultModel,
} from "@/app/(app)/configuracoes/actions";

export interface AiSettingsProps {
  canWrite: boolean;
  encryptionOk: boolean;
  defaultModel: { provider: string; model: string } | null;
  credentials: { provider: string; last4: string }[];
}

type CredentialState = Partial<Record<AiProviderId, string /* last4 */>>;

export function AiSettings({ canWrite, encryptionOk, defaultModel, credentials }: AiSettingsProps) {
  const initialCredentials = React.useMemo(() => {
    const map: CredentialState = {};
    for (const c of credentials) map[c.provider as AiProviderId] = c.last4;
    return map;
  }, [credentials]);

  const [creds, setCreds] = React.useState<CredentialState>(initialCredentials);
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<Partial<Record<AiProviderId, string[]>>>({});
  const [fallback, setFallback] = React.useState<Partial<Record<AiProviderId, boolean>>>({});
  const [defaultSel, setDefaultSel] = React.useState(defaultModel);
  const [removing, setRemoving] = React.useState<AiProviderId | null>(null);

  const hasDefault = Boolean(defaultSel);

  async function refreshModels(provider: AiProviderId) {
    const res = await listAiProviderModels(provider);
    if (res.ok && res.data) {
      setModels((m) => ({ ...m, [provider]: res.data!.models }));
      setFallback((f) => ({ ...f, [provider]: res.data!.fallback }));
    } else if (!res.ok) {
      setModels((m) => ({ ...m, [provider]: [] }));
      toast.error(res.error);
    }
  }

  React.useEffect(() => {
    for (const provider of Object.keys(creds) as AiProviderId[]) {
      if (creds[provider]) void refreshModels(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(provider: AiProviderId) {
    const key = (keys[provider] ?? "").trim();
    if (!key) {
      toast.error("Informe a chave do provedor.");
      return;
    }
    setBusy(provider);
    try {
      const res = await saveAiProviderKey(provider, key);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreds((c) => ({ ...c, [provider]: key.slice(-4) }));
      setKeys((k) => ({ ...k, [provider]: "" }));
      await refreshModels(provider);
      toast.success(`Chave do ${AI_PROVIDERS[provider].label} salva e testada.`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(provider: AiProviderId) {
    setBusy(provider);
    try {
      const res = await clearAiProviderKey(provider);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreds((c) => ({ ...c, [provider]: undefined }));
      setModels((m) => ({ ...m, [provider]: undefined }));
      if (defaultSel?.provider === provider) setDefaultSel(null);
      toast.success(`Chave do ${AI_PROVIDERS[provider].label} removida.`);
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  }

  async function handleDefault(provider: AiProviderId, model: string) {
    setDefaultSel({ provider, model });
    const res = await setAiDefaultModel(provider, model);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Padrão: ${AI_PROVIDERS[provider].label} / ${model}`);
  }

  return (
    <div className="space-y-4">
      {!encryptionOk && (
        <div className="rounded border border-signal-hold/40 bg-signal-hold/10 p-4 text-body-sm text-titanium-light">
          A variável <code className="font-mono text-label-code">APP_ENCRYPTION_KEY</code> não está
          configurada no servidor. Ela é necessária para gravar e ler chaves de IA. Gere uma com{" "}
          <code className="font-mono text-label-code">openssl rand -hex 32</code> e defina nas
          variáveis do ambiente.
        </div>
      )}
      {!hasDefault && Object.values(creds).some(Boolean) && (
        <div className="rounded border border-carmine-core/40 bg-carmine-core/10 p-4 text-body-sm text-titanium-light">
          Copiloto e briefing usam o modelo padrão. Escolha um modelo em algum provedor abaixo.
        </div>
      )}

      {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((provider) => {
        const info = AI_PROVIDERS[provider];
        const last4 = creds[provider];
        const providerModels = models[provider];
        return (
          <div key={provider} className="rounded border border-carbon-800 bg-carbon-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-body-lg font-bold text-ice-white">{info.label}</h3>
                <p className="text-body-sm text-titanium-light">{info.hint}</p>
              </div>
              {last4 ? (
                <span className="rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-tertiary">
                  •••••{last4}
                </span>
              ) : (
                <span className="rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-muted">
                  sem chave
                </span>
              )}
            </div>

            {canWrite && encryptionOk && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={keys[provider] ?? ""}
                  onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))}
                  placeholder={last4 ? "Trocar chave" : "Colar chave de API"}
                  className="w-72 rounded border border-carbon-700 bg-carbon-950 px-2.5 py-1.5 font-mono text-label-code text-ice-white placeholder-titanium-dark focus:border-carmine-core focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy === provider || !(keys[provider] ?? "").trim()}
                  onClick={() => handleSave(provider)}
                >
                  {last4 ? "Trocar e testar" : "Salvar e testar"}
                </Button>
                {last4 && (
                  <Button variant="secondary" size="sm" onClick={() => setRemoving(provider)}>
                    Remover
                  </Button>
                )}
              </div>
            )}

            {last4 && (
              <div className="mt-3 rounded border border-carbon-800 bg-carbon-950 p-3">
                <p className="mb-1.5 font-mono text-label-caps text-titanium-muted">
                  MODELOS DO PROVEDOR
                  {fallback[provider] && (
                    <span className="ml-2 text-signal-hold">
                      (lista básica: provedor não respondeu à listagem)
                    </span>
                  )}
                </p>
                {providerModels == null ? (
                  <p className="text-body-sm text-titanium-light">Carregando modelos...</p>
                ) : providerModels.length === 0 ? (
                  <p className="text-body-sm text-titanium-light">
                    Nenhum modelo listado. Confira a chave.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
                    {providerModels.map((model) => {
                      const isDefault =
                        defaultSel?.provider === provider && defaultSel?.model === model;
                      return (
                        <label
                          key={model}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 font-mono text-label-code text-titanium-light hover:bg-carbon-900"
                        >
                          <input
                            type="radio"
                            name="ai-default-model"
                            checked={isDefault}
                            disabled={!canWrite || !encryptionOk}
                            onChange={() => handleDefault(provider, model)}
                            className="size-3.5 accent-carmine-core"
                          />
                          <span className={cn(isDefault && "text-ice-white font-bold")}>
                            {model}
                          </span>
                          {isDefault && (
                            <span className="ml-auto text-tertiary uppercase">Padrão</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <ConfirmDialog
              isOpen={removing === provider}
              title={`Remover chave do ${info.label}`}
              description="O Copiloto e o briefing deixam de funcionar até outra chave ser cadastrada. A troca fica registrada na auditoria."
              confirmLabel="Remover"
              loading={busy === provider}
              onConfirm={() => handleRemove(provider)}
              onCancel={() => setRemoving(null)}
            />
          </div>
        );
      })}
    </div>
  );
}
