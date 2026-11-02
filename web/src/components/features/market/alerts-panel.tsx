"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDrawer } from "@/components/shared/form-drawer";
import { CONDITION_LABELS, CONDITION_TYPES, type ConditionType } from "@/lib/market/conditions";
import { fmtNum } from "@/lib/market/format";

export interface AlertRuleRow {
  id: string;
  assetId: string;
  assetName: string;
  assetSymbol: string;
  conditionType: string;
  thresholdValue: string;
  channels: ("in_app" | "email")[];
  active: boolean;
  lastTriggeredAt: string | null;
}

export interface AssetOption {
  id: string;
  name: string;
}

const NO_THRESHOLD: ConditionType[] = ["SMA_CROSS"];

export function AlertsPanel({
  initialRules,
  assets,
  canWrite,
}: {
  initialRules: AlertRuleRow[];
  assets: AssetOption[];
  canWrite: boolean;
}) {
  const [rules, setRules] = React.useState(initialRules);
  const [open, setOpen] = React.useState(false);
  const [assetId, setAssetId] = React.useState("");
  const [condition, setCondition] = React.useState<ConditionType>("PERCENT_CHANGE_24H");
  const [threshold, setThreshold] = React.useState("2");
  const [inApp, setInApp] = React.useState(true);
  const [email, setEmail] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    asset?: string;
    threshold?: string;
    channels?: string;
  }>({});
  const [busy, setBusy] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<AlertRuleRow | null>(null);

  async function reload() {
    const res = await fetch("/api/market/alerts");
    if (res.ok) setRules(((await res.json()) as { rules: AlertRuleRow[] }).rules);
  }

  function openNew() {
    setAssetId(assets[0]?.id ?? "");
    setCondition("PERCENT_CHANGE_24H");
    setThreshold("2");
    setInApp(true);
    setEmail(false);
    setErrors({});
    setOpen(true);
  }

  async function submit() {
    const value = NO_THRESHOLD.includes(condition) ? 0 : Number(threshold.replace(",", "."));
    const next: typeof errors = {};
    if (!assetId) next.asset = "Selecione um ativo.";
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (!NO_THRESHOLD.includes(condition) && threshold.trim() === "")
    )
      next.threshold = "Informe um limite válido.";
    if (!inApp && !email) next.channels = "Selecione ao menos um canal.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(`Revise os ${Object.keys(next).length} campo(s) destacado(s).`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/market/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          conditionType: condition,
          thresholdValue: value,
          channels: [inApp && "in_app", email && "email"].filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await reload();
      setOpen(false);
      toast.success("Regra de alerta criada com sucesso.");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : "Não foi possível criar a regra."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: AlertRuleRow, active: boolean) {
    const previous = rules;
    setRules((list) => list.map((r) => (r.id === rule.id ? { ...r, active } : r)));
    const res = await fetch(`/api/market/alerts/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      toast.success(active ? "Regra ativada." : "Regra pausada.");
    } else {
      setRules(previous);
      toast.error("Não foi possível alterar a regra.");
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/market/alerts/${toDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRules((list) => list.filter((r) => r.id !== toDelete.id));
      toast.success("Regra excluída. Histórico mantido em auditoria.");
      setToDelete(null);
    } catch {
      toast.error("Não foi possível excluir a regra.");
    } finally {
      setBusy(false);
    }
  }

  const thresholdSuffix = (c: string) =>
    c.startsWith("PERCENT") || c === "PARITY_SPREAD_ABOVE" ? "%" : c === "SMA_CROSS" ? "" : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-headline-sm text-ice-white">Regras de Alerta</h2>
          <p className="text-body-sm text-titanium-muted">
            Avaliadas após cada ingestão · notificação in-app e e-mail · 1 disparo por regra a cada
            24h.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova Regra
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-8 w-8 text-titanium-steel" />}
          title="Nenhuma regra de alerta"
          description="Crie regras para ser avisado de variações bruscas, cruzamento de médias ou janela de importação."
          actionLabel={canWrite ? "Criar regra" : undefined}
          onAction={canWrite ? openNew : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-carbon-800 bg-carbon-900">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-carbon-950 text-left font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                <th className="px-3 py-2 font-semibold">Ativo</th>
                <th className="px-3 py-2 font-semibold">Condição</th>
                <th className="px-3 py-2 text-right font-semibold">Limite</th>
                <th className="px-3 py-2 font-semibold">Canais</th>
                <th className="px-3 py-2 font-semibold">Último disparo</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                {canWrite && <th className="px-3 py-2 text-right font-semibold">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr
                  key={r.id}
                  className={cn("h-10", i % 2 === 0 ? "bg-carbon-900" : "bg-carbon-800/40")}
                >
                  <td className="px-3 text-ice-white">{r.assetName}</td>
                  <td className="px-3 text-titanium-light">
                    {CONDITION_LABELS[r.conditionType as ConditionType] ?? r.conditionType}
                  </td>
                  <td className="px-3 text-right font-mono text-ice-white">
                    {r.conditionType === "SMA_CROSS"
                      ? "—"
                      : `${fmtNum(Number(r.thresholdValue))}${thresholdSuffix(r.conditionType)}`}
                  </td>
                  <td className="px-3 font-mono text-titanium-muted">
                    {r.channels.map((c) => (c === "in_app" ? "IN-APP" : "E-MAIL")).join(" · ")}
                  </td>
                  <td className="px-3 font-mono text-titanium-muted">
                    {r.lastTriggeredAt ? new Date(r.lastTriggeredAt).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-3">
                    <Checkbox
                      checked={r.active}
                      onChange={(v) => toggle(r, v)}
                      disabled={!canWrite}
                      label={r.active ? "Ativa" : "Pausada"}
                    />
                  </td>
                  {canWrite && (
                    <td className="px-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir regra de ${r.assetName}`}
                        title="Excluir regra"
                        onClick={() => setToDelete(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="+ Cadastrar Nova Regra de Alerta"
        subtitle="O disparo ocorre logo após cada ingestão de preços."
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Salvando..." : "Criar regra"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
              Ativo
            </span>
            <SelectMenu
              aria-label="Ativo"
              value={assetId}
              onChange={setAssetId}
              error={!!errors.asset}
              options={assets.map((a) => ({ value: a.id, label: a.name }))}
            />
            {errors.asset && <p className="text-body-sm text-signal-risk">{errors.asset}</p>}
          </div>
          <div className="space-y-1">
            <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
              Condição
            </span>
            <SelectMenu
              aria-label="Condição"
              value={condition}
              onChange={(v) => setCondition(v as ConditionType)}
              options={CONDITION_TYPES.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
            />
          </div>
          {!NO_THRESHOLD.includes(condition) && (
            <label className="block space-y-1">
              <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                Limite [{thresholdSuffix(condition) || "valor do ativo"}]
              </span>
              <Input
                inputMode="decimal"
                value={threshold}
                error={!!errors.threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="text-right font-mono"
              />
              {errors.threshold && (
                <p className="text-body-sm text-signal-risk">{errors.threshold}</p>
              )}
            </label>
          )}
          <div className="space-y-2">
            <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
              Canais
            </span>
            <div className="flex flex-col gap-2">
              <Checkbox checked={inApp} onChange={setInApp} label="Notificação in-app (sino)" />
              <Checkbox checked={email} onChange={setEmail} label="E-mail (Resend)" />
            </div>
            {errors.channels && <p className="text-body-sm text-signal-risk">{errors.channels}</p>}
          </div>
        </div>
      </FormDrawer>

      <ConfirmDialog
        isOpen={!!toDelete}
        title="Excluir regra de alerta"
        description={`A regra "${toDelete ? (CONDITION_LABELS[toDelete.conditionType as ConditionType] ?? toDelete.conditionType) : ""}" de ${toDelete?.assetName ?? ""} deixará de disparar. O histórico permanece na trilha de auditoria.`}
        confirmLabel="Excluir"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
