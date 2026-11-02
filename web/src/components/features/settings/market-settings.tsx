"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, FlaskConical, Pencil, Play, Plus, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDrawer } from "@/components/shared/form-drawer";
import {
  importAssetCsv,
  runIngestionNow,
  saveMarketAsset,
  setMarketAssetActive,
  testMarketSource,
} from "@/app/(app)/configuracoes/actions";
import { fmtNum } from "@/lib/market/format";

export interface MarketAssetRow {
  id: string;
  symbol: string;
  name: string;
  market: string;
  baseCurrency: string;
  unit: string;
  provider: string;
  providerSymbol: string | null;
  active: boolean;
  points: number;
  lastAt: string | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  BCB_PTAX: "BCB · PTAX",
  METALS_API: "Metals-API",
  COMMODITY_PRICE_API: "CommodityPriceAPI",
  MANUAL: "Manual · CSV",
};

const MARKETS = ["LME", "CME", "SHFE", "DCE", "COMEX", "Platts", "Mysteel", "Outro"];

interface FormState {
  id?: string;
  symbol: string;
  name: string;
  market: string;
  baseCurrency: string;
  unit: string;
  provider: string;
  providerSymbol: string;
}

const EMPTY_FORM: FormState = {
  symbol: "",
  name: "",
  market: "LME",
  baseCurrency: "USD",
  unit: "ton",
  provider: "COMMODITY_PRICE_API",
  providerSymbol: "",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
      {children}
    </span>
  );
}

export function MarketSettings({
  assets,
  canWrite,
  keys,
  metalsCron,
}: {
  assets: MarketAssetRow[];
  canWrite: boolean;
  metalsCron: string;
  keys: { metals: boolean; commodity: boolean };
}) {
  const router = useRouter();
  const [drawer, setDrawer] = React.useState<"form" | "csv" | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [csvAsset, setCsvAsset] = React.useState<MarketAssetRow | null>(null);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [toggleAsset, setToggleAsset] = React.useState<MarketAssetRow | null>(null);

  const editing = !!form.id;
  const isSystem = assets.find((a) => a.id === form.id)?.provider === "BCB_PTAX";
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setForm(EMPTY_FORM);
    setErrors({});
    setDrawer("form");
  }

  function openEdit(a: MarketAssetRow) {
    setForm({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      market: a.market,
      baseCurrency: a.baseCurrency,
      unit: a.unit,
      provider: a.provider,
      providerSymbol: a.providerSymbol ?? "",
    });
    setErrors({});
    setDrawer("form");
  }

  function validate() {
    const next: typeof errors = {};
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/.test(form.symbol.trim()))
      next.symbol = "Use 2 a 30 caracteres: letras, números e hífen.";
    if (form.name.trim().length < 2) next.name = "Informe o nome do mercado.";
    if (form.provider !== "MANUAL" && !form.providerSymbol.trim())
      next.providerSymbol = "Informe o símbolo na fonte de preços.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) {
      toast.error("Revise os campos destacados.");
      return;
    }
    setBusy(true);
    const res = await saveMarketAsset({
      id: form.id,
      symbol: form.symbol,
      name: form.name,
      market: form.market,
      baseCurrency: form.baseCurrency as "USD" | "BRL",
      unit: form.unit as "ton" | "kg",
      provider: form.provider as "METALS_API" | "COMMODITY_PRICE_API" | "MANUAL",
      providerSymbol: form.providerSymbol || null,
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(
      editing
        ? `Mercado ${form.symbol.toUpperCase()} atualizado com sucesso.`
        : `Mercado ${form.symbol.toUpperCase()} cadastrado. Ele já aparece no Radar de Cotações.`
    );
    setDrawer(null);
    router.refresh();
  }

  async function testSource(provider: string, providerSymbol: string, key: string) {
    setTesting(key);
    const res = await testMarketSource(
      provider as "METALS_API" | "COMMODITY_PRICE_API",
      providerSymbol
    );
    setTesting(null);
    if (res.ok) toast.success(`Fonte OK: ${providerSymbol} = US$ ${fmtNum(res.data?.price)} / t.`);
    else toast.error(res.error);
  }

  async function runNow() {
    setRunning(true);
    const res = await runIngestionNow();
    setRunning(false);
    if (!res.ok) return void toast.error(res.error);
    const d = res.data!;
    const summary = `PTAX: ${d.ptax} dia(s) · Metais: ${d.metals} cotação(ões)`;
    if (d.errors.length > 0) toast.warning(`${summary}. Falhas: ${d.errors.join(" | ")}`);
    else toast.success(`Ingestão concluída. ${summary}.`);
    router.refresh();
  }

  async function submitCsv() {
    if (!csvAsset || !csvFile) {
      toast.error("Selecione um arquivo CSV.");
      return;
    }
    setBusy(true);
    const res = await importAssetCsv(csvAsset.id, await csvFile.text());
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    const d = res.data!;
    toast.success(
      `${d.imported} linha(s) importada(s) em ${csvAsset.symbol}${d.skipped ? ` (${d.skipped} ignorada(s))` : ""}.`
    );
    setDrawer(null);
    setCsvFile(null);
    router.refresh();
  }

  async function confirmToggle() {
    if (!toggleAsset) return;
    setBusy(true);
    const res = await setMarketAssetActive(toggleAsset.id, !toggleAsset.active);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(
      toggleAsset.active
        ? `${toggleAsset.symbol} desativado. Histórico mantido.`
        : `${toggleAsset.symbol} reativado.`
    );
    setToggleAsset(null);
    router.refresh();
  }

  const automated = assets.filter(
    (a) => a.active && (a.provider === "METALS_API" || a.provider === "COMMODITY_PRICE_API")
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
          <FieldLabel>Chaves dos provedores</FieldLabel>
          <div className="mt-2 space-y-1.5">
            {[
              { label: "CommodityPriceAPI", env: "COMMODITY_PRICE_API_KEY", ok: keys.commodity },
              { label: "Metals-API", env: "METALS_API_KEY", ok: keys.metals },
            ].map((k) => (
              <div key={k.env} className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm text-titanium-light" title={k.env}>
                  {k.label}
                </span>
                <StatusBadge
                  status={k.ok ? "buy" : "hold"}
                  label={k.ok ? "CONFIGURADA" : "AUSENTE"}
                  pulse={false}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
          <FieldLabel>Agendamento (America/São Paulo)</FieldLabel>
          <p className="mt-2 font-mono text-body-sm text-ice-white">
            PTAX 13:15 e 18:00 · dias úteis
          </p>
          <p className="font-mono text-body-sm text-ice-white" title="Variável METALS_CRON">
            Metais: cron {metalsCron}
          </p>
        </div>
        <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
          <FieldLabel>Mercados</FieldLabel>
          <p className="mt-1 font-mono text-metric-display text-ice-white">
            {assets.filter((a) => a.active).length}
            <span className="ml-2 text-body-sm text-titanium-muted">
              ativos · {automated} automáticos
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-headline-sm text-ice-white">Mercados monitorados</h2>
          <p className="text-body-sm text-titanium-muted">
            Cada mercado ativo entra no Radar de Cotações. Os automáticos são coletados pelo worker.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={runNow} disabled={running}>
              <Play className={cn("mr-1 h-3.5 w-3.5", running && "animate-pulse")} />
              {running ? "Executando..." : "Executar ingestão agora"}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Novo Mercado
            </Button>
          </div>
        )}
      </div>

      {assets.length === 0 ? (
        <EmptyState
          title="Nenhum mercado cadastrado"
          description="Cadastre o primeiro mercado para alimentar o Radar de Cotações."
          actionLabel={canWrite ? "Cadastrar mercado" : undefined}
          onAction={canWrite ? openNew : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-carbon-800 bg-carbon-900">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-carbon-950 text-left font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Mercado</th>
                <th className="px-3 py-2 font-semibold">Bolsa</th>
                <th className="px-3 py-2 font-semibold">Unidade</th>
                <th className="px-3 py-2 font-semibold">Fonte</th>
                <th className="px-3 py-2 text-right font-semibold">Pontos</th>
                <th className="px-3 py-2 font-semibold">Última coleta</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => (
                <tr
                  key={a.id}
                  className={cn(
                    "h-10",
                    i % 2 === 0 ? "bg-carbon-900" : "bg-carbon-800/40",
                    !a.active && "opacity-60"
                  )}
                >
                  <td className="px-3 font-mono text-ice-white">{a.symbol}</td>
                  <td className="px-3 text-ice-white">{a.name}</td>
                  <td className="px-3 font-mono text-titanium-muted">{a.market}</td>
                  <td className="px-3 font-mono text-titanium-muted">
                    {a.baseCurrency}/{a.unit}
                  </td>
                  <td className="px-3 font-mono text-titanium-light">
                    {PROVIDER_LABEL[a.provider] ?? a.provider}
                    {a.providerSymbol && (
                      <span className="text-titanium-dark"> · {a.providerSymbol}</span>
                    )}
                  </td>
                  <td className="px-3 text-right font-mono text-titanium-light">
                    {fmtNum(a.points, 0)}
                  </td>
                  <td className="px-3 font-mono text-titanium-muted">
                    {a.lastAt
                      ? new Date(a.lastAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                      : "—"}
                  </td>
                  <td className="px-3">
                    <StatusBadge status={a.active ? "ativo" : "inativo"} pulse={false} />
                  </td>
                  <td className="px-3">
                    <div className="flex items-center justify-end gap-0.5">
                      {(a.provider === "METALS_API" || a.provider === "COMMODITY_PRICE_API") &&
                        a.providerSymbol &&
                        canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Testar fonte de ${a.symbol}`}
                            title="Testar fonte"
                            disabled={testing === a.id}
                            onClick={() => testSource(a.provider, a.providerSymbol!, a.id)}
                          >
                            <FlaskConical className="h-4 w-4" />
                          </Button>
                        )}
                      {canWrite && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Importar CSV em ${a.symbol}`}
                            title="Importar histórico CSV"
                            onClick={() => {
                              setCsvAsset(a);
                              setCsvFile(null);
                              setDrawer("csv");
                            }}
                          >
                            <FileUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${a.symbol}`}
                            title="Editar"
                            onClick={() => openEdit(a)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${a.active ? "Desativar" : "Reativar"} ${a.symbol}`}
                            title={a.active ? "Desativar" : "Reativar"}
                            onClick={() => (a.active ? setToggleAsset(a) : void toggleDirect(a))}
                          >
                            <Power
                              className={cn(
                                "h-4 w-4",
                                a.active ? "text-signal-buy" : "text-titanium-dark"
                              )}
                            />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormDrawer
        isOpen={drawer === "form"}
        onClose={() => setDrawer(null)}
        title={editing ? `Edição de Mercado - ${form.symbol}` : "+ Cadastrar Novo Mercado"}
        subtitle={
          isSystem
            ? "Mercado de sistema: só o nome pode ser alterado."
            : "Defina a fonte de preços para automatizar a coleta."
        }
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawer(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1">
            <FieldLabel>Código interno</FieldLabel>
            <Input
              value={form.symbol}
              disabled={editing}
              error={!!errors.symbol}
              maxLength={30}
              placeholder="Ex.: SHFE-REBAR"
              onChange={(e) => set("symbol")(e.target.value.toUpperCase())}
              className="font-mono"
            />
            {errors.symbol && <p className="text-body-sm text-signal-risk">{errors.symbol}</p>}
          </label>
          <label className="block space-y-1">
            <FieldLabel>Nome exibido</FieldLabel>
            <Input
              value={form.name}
              error={!!errors.name}
              maxLength={100}
              placeholder="Ex.: Vergalhão SHFE"
              onChange={(e) => set("name")(e.target.value)}
            />
            {errors.name && <p className="text-body-sm text-signal-risk">{errors.name}</p>}
          </label>
          <div className="space-y-1">
            <FieldLabel>Bolsa / mercado</FieldLabel>
            <SelectMenu
              aria-label="Bolsa"
              value={form.market}
              onChange={set("market")}
              disabled={isSystem}
              options={[...new Set([form.market, ...MARKETS])].map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel>Moeda</FieldLabel>
              <SelectMenu
                aria-label="Moeda"
                value={form.baseCurrency}
                onChange={set("baseCurrency")}
                disabled={isSystem}
                options={[
                  { value: "USD", label: "USD" },
                  { value: "BRL", label: "BRL" },
                ]}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Unidade</FieldLabel>
              <SelectMenu
                aria-label="Unidade"
                value={form.unit}
                onChange={set("unit")}
                disabled={isSystem}
                options={[
                  { value: "ton", label: "Tonelada" },
                  { value: "kg", label: "Quilo" },
                ]}
              />
            </div>
          </div>
          {!isSystem && (
            <>
              <div className="space-y-1">
                <FieldLabel>Fonte de preços</FieldLabel>
                <SelectMenu
                  aria-label="Fonte de preços"
                  value={form.provider}
                  onChange={set("provider")}
                  options={[
                    { value: "COMMODITY_PRICE_API", label: "CommodityPriceAPI (automática)" },
                    { value: "METALS_API", label: "Metals-API (automática)" },
                    { value: "MANUAL", label: "Manual · importação CSV" },
                  ]}
                />
              </div>
              {form.provider !== "MANUAL" && (
                <div className="space-y-1">
                  <label className="block space-y-1">
                    <FieldLabel>Símbolo na fonte</FieldLabel>
                    <Input
                      value={form.providerSymbol}
                      error={!!errors.providerSymbol}
                      maxLength={50}
                      placeholder={form.provider === "METALS_API" ? "Ex.: LME-ALU" : "Ex.: AL-SPOT"}
                      onChange={(e) => set("providerSymbol")(e.target.value.trim())}
                      className="font-mono"
                    />
                  </label>
                  {errors.providerSymbol && (
                    <p className="text-body-sm text-signal-risk">{errors.providerSymbol}</p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!form.providerSymbol || testing === "form"}
                    onClick={() => testSource(form.provider, form.providerSymbol, "form")}
                  >
                    <FlaskConical className="mr-1 h-3.5 w-3.5" />
                    {testing === "form" ? "Testando..." : "Testar símbolo"}
                  </Button>
                  <p className="font-mono text-label-code text-titanium-dark">
                    Preço esperado em US$ por tonelada. O histórico inicial entra por CSV.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </FormDrawer>

      <FormDrawer
        isOpen={drawer === "csv"}
        onClose={() => setDrawer(null)}
        title={`Importar histórico - ${csvAsset?.symbol ?? ""}`}
        subtitle="Colunas: date (AAAA-MM-DD), open, high, low, close, volume. Só close é obrigatório."
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawer(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submitCsv} disabled={busy || !csvFile}>
              {busy ? "Importando..." : "Importar"}
            </Button>
          </>
        }
      >
        <label className="block space-y-2">
          <FieldLabel>Arquivo CSV [máx. 5 MB]</FieldLabel>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded border border-carbon-700 bg-carbon-950 p-2 text-body-sm text-titanium-light file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-carbon-800 file:px-3 file:py-1 file:text-body-sm file:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
          />
          {csvFile && (
            <p className="font-mono text-label-code text-titanium-muted">{csvFile.name}</p>
          )}
        </label>
      </FormDrawer>

      <ConfirmDialog
        isOpen={!!toggleAsset}
        title="Desativar mercado"
        description={`${toggleAsset?.name ?? ""} sairá do Radar e deixará de ser coletado. O histórico é mantido e ele pode ser reativado.`}
        confirmLabel="Desativar"
        loading={busy}
        onConfirm={confirmToggle}
        onCancel={() => setToggleAsset(null)}
      />
    </div>
  );

  async function toggleDirect(a: MarketAssetRow) {
    const res = await setMarketAssetActive(a.id, true);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${a.symbol} reativado.`);
    router.refresh();
  }
}
