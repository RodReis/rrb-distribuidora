"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDrawer } from "@/components/shared/form-drawer";
import {
  calculateParity,
  SPREAD_FAVORABLE_PCT,
  SPREAD_NEUTRAL_PCT,
  type ParityInput,
  type ParitySignal,
} from "@/lib/market/parity-calculator";
import { PARITY_DEFAULTS } from "@/lib/market/parity-defaults";
import { fmtBrl, fmtNum, fmtPct, fmtUsd } from "@/lib/market/format";

export interface ParityConfigRow {
  id: string;
  name: string;
  iiTaxPct: string;
  ipiTaxPct: string;
  pisTaxPct: string;
  cofinsTaxPct: string;
  icmsTaxPct: string;
  portExpensesPerTon: string;
  roadFreightPerTon: string;
  oceanFreightUsdPerTon: string;
  domesticPriceBrlPerTon: string;
}

type FormState = Record<
  | "volume"
  | "fob"
  | "ocean"
  | "insurance"
  | "ptax"
  | "ii"
  | "ipi"
  | "pis"
  | "cofins"
  | "icms"
  | "port"
  | "road"
  | "domestic",
  string
>;

const SIGNALS: Record<ParitySignal, { label: string; status: string; tone: string; text: string }> =
  {
    buy_import: {
      label: "IMPORTAR FAVORÁVEL",
      status: "buy",
      tone: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
      text: `Spread acima de ${SPREAD_FAVORABLE_PCT}%`,
    },
    hold: {
      label: "EMPATADO / RISCO CAMBIAL",
      status: "hold",
      tone: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
      text: `Spread entre ${SPREAD_NEUTRAL_PCT}% e ${SPREAD_FAVORABLE_PCT}%`,
    },
    buy_domestic: {
      label: "COMPRAR NACIONAL",
      status: "risk",
      tone: "border-signal-risk/40 bg-signal-risk/10 text-signal-risk",
      text: `Spread abaixo de ${SPREAD_NEUTRAL_PCT}%`,
    },
  };

const num = (s: string) => {
  const t = s.trim();
  if (!t) return NaN;
  // Com vírgula: padrão pt-BR (ponto = milhar). Sem vírgula: ponto é decimal.
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
const fmtField = (n: number) => String(n).replace(".", ",");

function Field({
  label,
  value,
  onChange,
  invalid,
  currency,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  currency?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
        {label}
      </span>
      {currency ? (
        <CurrencyInput
          value={value ? num(value) : null}
          onValueChange={(next) => onChange(String(next).replace(".", ","))}
          error={invalid}
          className="text-right font-mono"
        />
      ) : (
        <Input
          inputMode="decimal"
          value={value}
          error={invalid}
          onChange={(e) => onChange(e.target.value)}
          className="text-right font-mono"
        />
      )}
      {invalid && <span className="text-body-sm text-signal-risk">Valor inválido.</span>}
    </label>
  );
}

export function ParitySimulator({
  defaultPtax,
  defaultFob,
  initialConfigs,
  canWrite,
}: {
  defaultPtax: number | null;
  defaultFob: number | null;
  initialConfigs: ParityConfigRow[];
  canWrite: boolean;
}) {
  const [form, setForm] = React.useState<FormState>({
    volume: fmtField(PARITY_DEFAULTS.volumeTons),
    fob: defaultFob ? fmtField(Number(defaultFob.toFixed(2))) : "510",
    ocean: fmtField(PARITY_DEFAULTS.oceanFreightUsdPerTon),
    insurance: "0",
    ptax: defaultPtax ? fmtField(Number(defaultPtax.toFixed(4))) : "5,4820",
    ii: fmtField(PARITY_DEFAULTS.iiPct),
    ipi: fmtField(PARITY_DEFAULTS.ipiPct),
    pis: fmtField(PARITY_DEFAULTS.pisPct),
    cofins: fmtField(PARITY_DEFAULTS.cofinsPct),
    icms: fmtField(PARITY_DEFAULTS.icmsPct),
    port: fmtField(PARITY_DEFAULTS.portExpensesBrlPerTon),
    road: fmtField(PARITY_DEFAULTS.roadFreightBrlPerTon),
    domestic: fmtField(PARITY_DEFAULTS.domesticPriceBrlPerTon),
  });
  const [recover, setRecover] = React.useState(true);
  const [configs, setConfigs] = React.useState(initialConfigs);
  const [configId, setConfigId] = React.useState("");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const parsed = React.useMemo(
    () =>
      Object.fromEntries(Object.entries(form).map(([k, v]) => [k, num(v)])) as Record<
        keyof FormState,
        number
      >,
    [form]
  );
  const invalid = (k: keyof FormState) => !Number.isFinite(parsed[k]) || parsed[k] < 0;
  const hasError = (Object.keys(form) as (keyof FormState)[]).some(invalid) || parsed.ptax <= 0;

  const input: ParityInput | null = hasError
    ? null
    : {
        fobUsdPerTon: parsed.fob,
        oceanFreightUsdPerTon: parsed.ocean,
        insuranceUsdPerTon: parsed.insurance,
        ptax: parsed.ptax,
        iiPct: parsed.ii,
        ipiPct: parsed.ipi,
        pisPct: parsed.pis,
        cofinsPct: parsed.cofins,
        icmsPct: parsed.icms,
        portExpensesBrlPerTon: parsed.port,
        roadFreightBrlPerTon: parsed.road,
        domesticPriceBrlPerTon: parsed.domestic,
        volumeTons: parsed.volume,
        recoverTaxes: recover,
      };
  const r = input ? calculateParity(input) : null;

  function loadConfig(id: string) {
    setConfigId(id);
    const c = configs.find((x) => x.id === id);
    if (!c) return;
    setForm((f) => ({
      ...f,
      ii: fmtField(Number(c.iiTaxPct)),
      ipi: fmtField(Number(c.ipiTaxPct)),
      pis: fmtField(Number(c.pisTaxPct)),
      cofins: fmtField(Number(c.cofinsTaxPct)),
      icms: fmtField(Number(c.icmsTaxPct)),
      port: fmtField(Number(c.portExpensesPerTon)),
      road: fmtField(Number(c.roadFreightPerTon)),
      ocean: fmtField(Number(c.oceanFreightUsdPerTon)),
      domestic: fmtField(Number(c.domesticPriceBrlPerTon)),
    }));
    toast.info(`Parâmetros "${c.name}" carregados.`);
  }

  async function saveConfig() {
    if (!saveName.trim()) {
      toast.error("Informe um nome para a configuração.");
      return;
    }
    if (hasError) {
      toast.error("Revise os campos destacados antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/market/parity-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          iiTaxPct: parsed.ii,
          ipiTaxPct: parsed.ipi,
          pisTaxPct: parsed.pis,
          cofinsTaxPct: parsed.cofins,
          icmsTaxPct: parsed.icms,
          portExpensesPerTon: parsed.port,
          roadFreightPerTon: parsed.road,
          oceanFreightUsdPerTon: parsed.ocean,
          domesticPriceBrlPerTon: parsed.domestic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfigs((c) => [data.config, ...c]);
      setConfigId(data.config.id);
      setSaveOpen(false);
      setSaveName("");
      toast.success(`Configuração "${data.config.name}" salva com sucesso.`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível salvar a configuração."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig() {
    const c = configs.find((x) => x.id === configId);
    if (!c) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/market/parity-configs?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConfigs((list) => list.filter((x) => x.id !== c.id));
      setConfigId("");
      setDeleteOpen(false);
      toast.success(`Configuração "${c.name}" excluída. Histórico mantido em auditoria.`);
    } catch {
      toast.error("Não foi possível excluir a configuração.");
    } finally {
      setSaving(false);
    }
  }

  const ptaxV = parsed.ptax;
  const usd = (brl: number) => (ptaxV > 0 ? brl / ptaxV : 0);
  const perKg = (brl: number) => brl / 1000;

  type Row = {
    label: string;
    base: string;
    brl: number;
    usd?: number;
    tone?: string;
    strong?: boolean;
  };
  const rows: Row[] = r
    ? [
        { label: "1. Cotação FOB China", base: "USD Spot", brl: r.fobBrl, usd: parsed.fob },
        {
          label: "2. Frete marítimo internacional",
          base: "Frete + seguro",
          brl: r.oceanFreightBrl + r.insuranceBrl,
          usd: parsed.ocean + parsed.insurance,
        },
        {
          label: `3. Imposto de Importação (II ${fmtNum(parsed.ii)}%)`,
          base: "Sobre CIF",
          brl: r.iiBrl,
        },
        { label: `4. IPI (${fmtNum(parsed.ipi)}%)`, base: "CIF + II", brl: r.ipiBrl },
        { label: `5. PIS-Importação (${fmtNum(parsed.pis)}%)`, base: "Sobre CIF", brl: r.pisBrl },
        {
          label: `6. COFINS-Importação (${fmtNum(parsed.cofins)}%)`,
          base: "Sobre CIF",
          brl: r.cofinsBrl,
        },
        {
          label: `7. ICMS (${fmtNum(parsed.icms)}%, por dentro)`,
          base: `Base R$ ${fmtNum(r.icmsBaseBrl)}`,
          brl: r.icmsBrl,
        },
        {
          label: "8. Despesas portuárias (THC, armazenagem, despachante)",
          base: "Porto",
          brl: r.portExpensesBrl,
        },
        {
          label: "9. Frete rodoviário Porto → Distribuidora",
          base: "Carreta",
          brl: r.roadFreightBrl,
        },
        ...(recover
          ? [
              {
                label: "10. (−) Créditos recuperáveis (IPI, PIS, COFINS, ICMS)",
                base: "Crédito contábil",
                brl: -r.recoverableBrl,
                tone: "text-signal-buy",
              },
            ]
          : []),
      ]
    : [];

  const signal = r ? SIGNALS[r.signal] : null;

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-carbon-800 bg-carbon-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-headline-sm text-ice-white">
              Simulador de Paridade de Importação vs. Usina Nacional
            </h2>
            <p className="text-body-sm text-titanium-muted">
              Cálculo determinístico em tempo real · valores em R$ por tonelada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <SelectMenu
                aria-label="Configurações salvas"
                value={configId}
                onChange={loadConfig}
                placeholder="Configurações salvas"
                options={configs.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            {canWrite && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
                  <Save className="mr-1 h-3.5 w-3.5" /> Salvar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Excluir configuração selecionada"
                  title="Excluir configuração selecionada"
                  disabled={!configId}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Field
            label="Volume simulado [t]"
            value={form.volume}
            onChange={set("volume")}
            invalid={invalid("volume")}
          />
          <Field
            label="FOB Ásia [US$/t]"
            value={form.fob}
            onChange={set("fob")}
            invalid={invalid("fob")}
          />
          <Field
            label="Frete marítimo [US$/t]"
            value={form.ocean}
            onChange={set("ocean")}
            invalid={invalid("ocean")}
          />
          <Field
            label="Seguro [US$/t]"
            value={form.insurance}
            onChange={set("insurance")}
            invalid={invalid("insurance")}
          />
          <Field
            label="PTAX [R$/US$]"
            value={form.ptax}
            onChange={set("ptax")}
            invalid={invalid("ptax") || parsed.ptax <= 0}
          />
          <Field
            label="Usina nacional [R$/t]"
            value={form.domestic}
            onChange={set("domestic")}
            invalid={invalid("domestic")}
            currency
          />
          <Field label="II [%]" value={form.ii} onChange={set("ii")} invalid={invalid("ii")} />
          <Field label="IPI [%]" value={form.ipi} onChange={set("ipi")} invalid={invalid("ipi")} />
          <Field label="PIS [%]" value={form.pis} onChange={set("pis")} invalid={invalid("pis")} />
          <Field
            label="COFINS [%]"
            value={form.cofins}
            onChange={set("cofins")}
            invalid={invalid("cofins")}
          />
          <Field
            label="ICMS [%]"
            value={form.icms}
            onChange={set("icms")}
            invalid={invalid("icms")}
          />
          <Field
            label="Porto [R$/t]"
            value={form.port}
            onChange={set("port")}
            invalid={invalid("port")}
            currency
          />
          <Field
            label="Frete rodoviário [R$/t]"
            value={form.road}
            onChange={set("road")}
            invalid={invalid("road")}
            currency
          />
          <div className="flex items-end pb-2">
            <Checkbox checked={recover} onChange={setRecover} label="Créditos recuperáveis" />
          </div>
        </div>
      </section>

      {r && signal ? (
        <>
          <section className="overflow-hidden rounded-md border border-carbon-800 bg-carbon-900">
            <div className="flex items-center justify-between border-b border-carbon-800 px-4 py-2">
              <h3 className="text-headline-sm text-ice-white">Composição do Custo Desembarcado</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-label-code uppercase tracking-wider",
                  signal.tone
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {signal.label}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="bg-carbon-950 font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                    <th className="px-4 py-2 text-left font-semibold">Componente</th>
                    <th className="px-4 py-2 text-left font-semibold">Base</th>
                    <th className="px-4 py-2 text-right font-semibold">US$/t</th>
                    <th className="px-4 py-2 text-right font-semibold">R$/t</th>
                    <th className="px-4 py-2 text-right font-semibold">R$/kg</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.label}
                      className={cn("h-9", i % 2 === 0 ? "bg-carbon-900" : "bg-carbon-800/40")}
                    >
                      <td className="px-4 text-titanium-light">{row.label}</td>
                      <td className="px-4 font-mono text-titanium-muted">{row.base}</td>
                      <td
                        className={cn(
                          "px-4 text-right font-mono",
                          row.tone ?? "text-titanium-light"
                        )}
                      >
                        {fmtUsd(row.usd ?? usd(row.brl))}
                      </td>
                      <td className={cn("px-4 text-right font-mono", row.tone ?? "text-ice-white")}>
                        {fmtBrl(row.brl)}
                      </td>
                      <td
                        className={cn(
                          "px-4 text-right font-mono",
                          row.tone ?? "text-titanium-light"
                        )}
                      >
                        {fmtNum(perKg(row.brl), 3)}
                      </td>
                    </tr>
                  ))}
                  <tr className="h-12 border-t border-carbon-700 bg-carbon-950">
                    <td className="px-4 font-semibold text-signal-buy">CUSTO FINAL DESEMBARCADO</td>
                    <td className="px-4 font-mono text-titanium-muted">Moeda nacional</td>
                    <td className="px-4 text-right font-mono text-titanium-light">
                      {fmtUsd(r.landedUsdPerTon)}
                    </td>
                    <td className="px-4 text-right font-mono text-metric-display text-signal-buy">
                      {fmtBrl(r.landedBrlPerTon)}
                    </td>
                    <td className="px-4 text-right font-mono text-signal-buy">
                      {fmtNum(r.landedBrlPerKg, 3)}
                    </td>
                  </tr>
                  <tr className="h-12 bg-carbon-950">
                    <td className="px-4 font-semibold text-signal-risk">COTAÇÃO USINA NACIONAL</td>
                    <td className="px-4 font-mono text-titanium-muted">Tabela concorrente</td>
                    <td className="px-4 text-right font-mono text-titanium-light">
                      {fmtUsd(usd(parsed.domestic))}
                    </td>
                    <td className="px-4 text-right font-mono text-metric-display text-signal-risk">
                      {fmtBrl(parsed.domestic)}
                    </td>
                    <td className="px-4 text-right font-mono text-titanium-light">
                      {fmtNum(r.domesticBrlPerKg, 3)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
              <div className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                Spread de arbitragem
              </div>
              <div
                className={cn("mt-1 font-mono text-metric-display", signal.tone.split(" ").pop())}
              >
                {fmtPct(r.spreadPct)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={signal.status} label={signal.label} pulse={false} />
              </div>
              <div className="mt-1 font-mono text-label-code text-titanium-dark">{signal.text}</div>
            </div>
            <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
              <div className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                Arbitragem líquida por tonelada
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-metric-display",
                  r.savingBrlPerTon >= 0 ? "text-signal-buy" : "text-signal-risk"
                )}
              >
                {fmtBrl(r.savingBrlPerTon)}
              </div>
              <div className="mt-1 font-mono text-label-code text-titanium-dark">
                importado vs. usina nacional
              </div>
            </div>
            <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
              <div className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                Ganho total no lote ({fmtNum(parsed.volume, 0)} t)
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-metric-display",
                  r.savingTotalBrl >= 0 ? "text-signal-buy" : "text-signal-risk"
                )}
              >
                {fmtBrl(r.savingTotalBrl)}
              </div>
              <div className="mt-1 font-mono text-label-code text-titanium-dark">
                economia direta de OPEX
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-dashed border-carbon-700 bg-carbon-900/40 p-8 text-center text-body-md text-titanium-muted">
          Revise os campos destacados para calcular a paridade.
        </div>
      )}

      <FormDrawer
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="+ Salvar Configuração de Paridade"
        subtitle="Guarda alíquotas, despesas e preço de usina para reutilizar."
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
            Nome da configuração
          </span>
          <Input
            value={saveName}
            maxLength={100}
            autoFocus
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveConfig()}
            placeholder="Ex.: Bobina a quente — Santos"
          />
        </label>
      </FormDrawer>

      <ConfirmDialog
        isOpen={deleteOpen}
        title="Excluir configuração de paridade"
        description={`A configuração "${configs.find((c) => c.id === configId)?.name ?? ""}" será removida. O histórico permanece na trilha de auditoria.`}
        confirmLabel="Excluir"
        loading={saving}
        onConfirm={deleteConfig}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
