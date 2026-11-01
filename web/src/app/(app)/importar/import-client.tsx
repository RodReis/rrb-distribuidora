"use client";

import * as React from "react";
import Papa from "papaparse";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { validateImport, commitImport, ImportError } from "./actions";
import { toast } from "sonner";
import {
  FileUp,
  Download,
  ScanSearch,
  CheckCircle2,
  XCircle,
  Database,
  FileSpreadsheet,
  RotateCcw,
} from "lucide-react";

type Row = Record<string, string>;

const ENTITIES: Record<
  string,
  {
    label: string;
    fields: { key: string; label: string; required: boolean }[];
    template: string;
  }
> = {
  produtos: {
    label: "Produtos Metálicos",
    fields: [
      { key: "sku", label: "SKU (opcional — gerado se vazio)", required: false },
      { key: "erp_code", label: "Código ERP (opcional)", required: false },
      { key: "family", label: "Família *", required: true },
      { key: "commercial_description", label: "Descrição Comercial *", required: true },
      { key: "fiscal_description", label: "Descrição Fiscal (opcional)", required: false },
      { key: "norm", label: "Norma Técnica *", required: true },
      { key: "ncm", label: "NCM (8 dígitos) *", required: true },
      { key: "thickness_mm", label: "Espessura [mm]", required: false },
      { key: "width_mm", label: "Largura [mm]", required: false },
      { key: "length_mm", label: "Comprimento [mm]", required: false },
      { key: "diameter_mm", label: "Diâmetro [mm]", required: false },
      { key: "wall_mm", label: "Parede [mm]", required: false },
      { key: "density_g_cm3", label: "Densidade [g/cm³] (opcional)", required: false },
      { key: "unit", label: "Unidade (kg/m/un/t) *", required: true },
      { key: "replacement_cost_base", label: "Custo Reposição (R$/kg) *", required: true },
      { key: "status", label: "Status (ativo/inativo/homologacao)", required: false },
    ],
    template:
      "sku;erp_code;family;commercial_description;fiscal_description;norm;ncm;thickness_mm;width_mm;length_mm;diameter_mm;wall_mm;density_g_cm3;unit;replacement_cost_base;status\n" +
      ";940021-USIMINAS;Chapa Grossa;Chapa Grossa Laminada ASTM A36 12.70mm x 2400 x 6000mm;CHAPA DE ACO CARBONO LAMINADA A QUENTE;ASTM A36;72085100;12,70;2400;6000;;;7,85;kg;5,36;ativo\n" +
      ";910408-CSN;Bobina;Bobina a Quente SAE 1008 3.00mm x 1500mm;BOBINA DE ACO LAMINADA A QUENTE;SAE 1008;72083890;3,00;1500;;;;7,85;kg;4,71;ativo\n" +
      "SKU-INX-304-200;520844-APERAM;Tubo;Tubo Redondo Inox 304L OD 50.80mm x 2.00mm x 6000mm;TUBOS DE ACO INOXIDAVEL;ASTM A554;73064000;;;6000;50,80;2,00;7,93;m;24,90;ativo",
  },
  fornecedores: {
    label: "Fornecedores & Usinas",
    fields: [
      { key: "legal_name", label: "Razão Social *", required: true },
      { key: "trade_name", label: "Nome Fantasia", required: false },
      { key: "cnpj", label: "CNPJ *", required: true },
      { key: "city", label: "Cidade", required: false },
      { key: "uf", label: "UF", required: false },
      { key: "type", label: "Tipo (usina/distribuidor/trader)", required: false },
      { key: "lead_time_days", label: "Lead Time (dias)", required: false },
      { key: "payment_terms", label: "Condições de Pagamento", required: false },
      { key: "contact_name", label: "Contato — Nome", required: false },
      { key: "email", label: "Contato — E-mail", required: false },
      { key: "phone", label: "Contato — Telefone", required: false },
      { key: "notes", label: "Observações", required: false },
    ],
    template:
      "legal_name;trade_name;cnpj;city;uf;type;lead_time_days;payment_terms;contact_name;email;phone;notes\n" +
      "Usinas Siderúrgicas de Minas Gerais S.A.;USIMINAS;60872504000123;Belo Horizonte;MG;usina;21;30/60 DDL;Roberto Silveira;comercial@usiminas.com;(31) 3499-8000;Pedido mínimo 12t por espessura\n" +
      "Companhia Siderúrgica Nacional;CSN;33042730000104;Volta Redonda;RJ;usina;28;45 DDL;Fernanda Lemos;vendas@csn.com.br;(24) 3344-4000;",
  },
  clientes: {
    label: "Clientes & Indústrias",
    fields: [
      { key: "legal_name", label: "Razão Social *", required: true },
      { key: "trade_name", label: "Nome Fantasia", required: false },
      { key: "document", label: "CNPJ ou CPF *", required: true },
      { key: "city", label: "Cidade", required: false },
      { key: "uf", label: "UF", required: false },
      { key: "state_registration", label: "Inscrição Estadual", required: false },
      { key: "segment", label: "Segmento", required: false },
      { key: "contact_name", label: "Contato — Nome", required: false },
      { key: "email", label: "Contato — E-mail", required: false },
      { key: "phone", label: "Contato — Telefone", required: false },
      { key: "notes", label: "Observações", required: false },
    ],
    template:
      "legal_name;trade_name;document;city;uf;state_registration;segment;contact_name;email;phone;notes\n" +
      "Estruturas Metálicas Paulistas Ltda;Paulista Estruturas;12345678000190;Guarulhos;SP;336123456789;Construção Metálica;Eng. Paulo Mendes;suprimentos@paulista.com.br;(11) 2440-1000;Recebimento até 16h\n" +
      "Caldeiraria Santa Luzia Eireli;Santa Luzia;98765432000110;Campinas;SP;244987654321;Caldeiraria Pesada;Juliana Andrade;compras@santaluzia.com.br;(19) 3788-9900;",
  },
};

function deaccent(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function autoGuess(header: string, fieldKey: string): boolean {
  const h = deaccent(header)
    .replace(/[\s\-\.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const aliases: Record<string, string[]> = {
    sku: ["sku", "codigo_sku", "cod_sku"],
    erp_code: ["erp_code", "codigo_erp", "cod_erp", "erp"],
    family: ["family", "familia", "família", "grupo", "tipo_produto"],
    commercial_description: [
      "commercial_description",
      "descricao",
      "descricao_comercial",
      "desc_comercial",
      "produto",
      "descricao_produto",
    ],
    fiscal_description: ["fiscal_description", "descricao_fiscal", "desc_fiscal"],
    norm: ["norm", "norma", "norma_tecnica", "especificacao"],
    ncm: ["ncm", "codigo_ncm"],
    thickness_mm: ["thickness_mm", "espessura", "espessura_mm", "esp"],
    width_mm: ["width_mm", "largura", "largura_mm"],
    length_mm: ["length_mm", "comprimento", "comprimento_mm", "comp"],
    diameter_mm: ["diameter_mm", "diametro", "diametro_mm", "od"],
    wall_mm: ["wall_mm", "parede", "parede_mm"],
    density_g_cm3: ["density_g_cm3", "densidade", "densidade_gcm3"],
    unit: ["unit", "unidade", "und", "um"],
    replacement_cost_base: [
      "replacement_cost_base",
      "custo",
      "preco",
      "preco_base",
      "custo_reposicao",
      "custo_base",
      "preco_kg",
    ],
    status: ["status", "situacao"],
    legal_name: ["legal_name", "razao_social", "razao", "nome"],
    trade_name: ["trade_name", "nome_fantasia", "fantasia"],
    cnpj: ["cnpj", "cnpj_raiz"],
    document: ["document", "documento", "cnpj", "cnpj_cpf", "cpf"],
    city: ["city", "cidade"],
    uf: ["uf", "estado"],
    state_registration: ["state_registration", "inscricao_estadual", "ie"],
    segment: ["segment", "segmento", "ramo"],
    lead_time_days: ["lead_time_days", "lead_time", "prazo_entrega", "leadtime"],
    payment_terms: ["payment_terms", "condicao_pagamento", "cond_pgto", "pagamento"],
    contact_name: ["contact_name", "contato", "nome_contato"],
    email: ["email", "e_mail", "mail"],
    phone: ["phone", "telefone", "tel", "fone"],
    notes: ["notes", "observacoes", "obs", "observacao"],
  };
  const alts = aliases[fieldKey] || [fieldKey];
  if (fieldKey === "commercial_description" && h.includes("fiscal")) return false;
  return alts.some((a) => {
    const alias = deaccent(a).replace(/[\s\-.]+/g, "_");
    return h === alias || (alias.length >= 8 && h.includes(alias));
  });
}

export function ImportClient() {
  const [entity, setEntity] = React.useState<string>("produtos");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Row[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<ImportError[] | null>(null);
  const [validCount, setValidCount] = React.useState(0);
  const [commitResult, setCommitResult] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const config = ENTITIES[entity];
  const requiredFields = config.fields.filter((f) => f.required);
  const allRequiredMapped = requiredFields.every((f) => mapping[f.key]);
  const hasFile = rawRows.length > 0;

  function resetFlow(keepEntity = true) {
    if (!keepEntity) setEntity("produtos");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setErrors(null);
    setValidCount(0);
    setCommitResult(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleEntityChange(next: string) {
    setEntity(next);
    resetFlow(true);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setErrors(null);
    setCommitResult(null);

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const data = results.data.filter((r) =>
          Object.values(r).some((v) => (v || "").trim() !== "")
        );
        if (data.length === 0) {
          toast.error("O arquivo não contém linhas de dados válidas.");
          return;
        }
        const hs = results.meta.fields || Object.keys(data[0]);
        setHeaders(hs);
        setRawRows(data);

        // auto-guess mapping
        const guessed: Record<string, string> = {};
        for (const field of config.fields) {
          const match = hs.find((h) => autoGuess(h, field.key));
          if (match) guessed[field.key] = match;
        }
        setMapping(guessed);
        toast.info(`${data.length} linhas lidas. Revise o mapeamento das colunas.`);
      },
      error: () => toast.error("Falha ao ler o arquivo CSV."),
    });
  }

  function mapRow(raw: Row): Row {
    const mapped: Row = {};
    for (const field of config.fields) {
      const source = mapping[field.key];
      mapped[field.key] = source ? (raw[source] ?? "") : "";
    }
    return mapped;
  }

  async function handleDryRun() {
    setBusy(true);
    setErrors(null);
    setCommitResult(null);
    try {
      const rows = rawRows.map(mapRow);
      const res = await validateImport(entity, rows);
      setValidCount(res.validCount);
      setErrors(res.errors);
      if (res.ok) {
        toast.success(`Validação concluída: ${res.validCount} linhas prontas para importação.`);
      } else {
        toast.error(`${res.errors.length} linha(s) com erro. Corrija ou exporte o relatório.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro no dry-run.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    try {
      const rows = rawRows.map(mapRow);
      const res = await commitImport(entity, rows);
      if (res.ok) {
        toast.success(res.message);
        setCommitResult(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na importação.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob(["\uFEFF" + config.template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_importacao_${entity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info(`Template de ${config.label} baixado.`);
  }

  function downloadErrorReport() {
    if (!errors?.length) return;
    const csv = Papa.unparse({
      fields: ["linha", "campo", "erro"],
      data: errors.map((e) => [e.row, e.field || "", e.message]),
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_erros_${entity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Cadastros Estratégicos" },
          { label: "Importador de Catálogo (CSV) — US-09" },
        ]}
      />

      <PageHeader
        title="Importação de Catálogo via CSV — Dry-Run Transacional"
        description="Mapeamento de colunas, validação linha a linha e importação com upsert (SKU/CNPJ) e rollback total em caso de erro"
        actions={
          <Button variant="secondary" size="sm" onClick={() => resetFlow(false)}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reiniciar Fluxo
          </Button>
        }
      />

      {/* STEP 1 — Entity & File */}
      <div className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-carbon-800">
          <span className="font-mono text-label-code text-carmine-signal">STEP 01</span>
          <span className="text-label-caps font-semibold uppercase text-titanium-light">
            Selecionar Entidade & Arquivo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Entidade de Destino *
            </label>
            <Select value={entity} onChange={(e) => handleEntityChange(e.target.value)}>
              <option value="produtos">Produtos Metálicos (RF-01)</option>
              <option value="fornecedores">Fornecedores & Usinas (RF-02)</option>
              <option value="clientes">Clientes & Indústrias (RF-03)</option>
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Arquivo CSV (separador , ou ;)
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
                id="csv-file"
              />
              <Button
                variant="terminal"
                size="md"
                className="flex-1"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="w-4 h-4 mr-2 text-titanium-muted" />
                {fileName || "Selecionar arquivo CSV..."}
              </Button>
              <Button variant="secondary" size="md" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Template
              </Button>
            </div>
          </div>
        </div>

        {hasFile && (
          <div className="flex items-center gap-2 font-mono text-label-code text-signal-buy pt-1">
            <Database className="w-3.5 h-3.5" />
            {rawRows.length} linhas carregadas • {headers.length} colunas detectadas
          </div>
        )}
      </div>

      {/* STEP 2 — Mapping */}
      {hasFile && (
        <div className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-carbon-800">
            <span className="font-mono text-label-code text-carmine-signal">STEP 02</span>
            <span className="text-label-caps font-semibold uppercase text-titanium-light">
              Mapeamento de Colunas
            </span>
            {allRequiredMapped ? (
              <span className="ml-auto font-mono text-label-code text-signal-buy">
                CAMPOS OBRIGATÓRIOS OK
              </span>
            ) : (
              <span className="ml-auto font-mono text-label-code text-signal-hold">
                MAPEIE TODOS OS CAMPOS OBRIGATÓRIOS (*)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.fields.map((field) => (
              <div key={field.key}>
                <label
                  className={`text-label-caps uppercase block mb-1 ${
                    field.required ? "font-semibold text-titanium-light" : "text-titanium-muted"
                  }`}
                >
                  {field.label}
                </label>
                <Select
                  value={mapping[field.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                  className={field.required && !mapping[field.key] ? "border-signal-hold/60" : ""}
                >
                  <option value="">— não mapeado —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          {/* Preview first 10 rows */}
          <div className="pt-2">
            <span className="font-mono text-label-code text-titanium-dark uppercase block mb-1.5">
              Preview das 10 primeiras linhas mapeadas
            </span>
            <div className="overflow-x-auto border border-carbon-800 rounded">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-carbon-950 text-label-caps text-titanium-muted uppercase">
                    <th className="py-1.5 px-2 border-b border-carbon-800">#</th>
                    {config.fields.slice(0, 8).map((f) => (
                      <th key={f.key} className="py-1.5 px-2 border-b border-carbon-800 font-mono">
                        {f.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 10).map((raw, i) => {
                    const m = mapRow(raw);
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-carbon-900/60" : ""}>
                        <td className="py-1.5 px-2 font-mono text-label-code text-titanium-dark">
                          {i + 2}
                        </td>
                        {config.fields.slice(0, 8).map((f) => (
                          <td
                            key={f.key}
                            className="py-1.5 px-2 font-mono text-label-code text-titanium-light max-w-[160px] truncate"
                            title={m[f.key]}
                          >
                            {m[f.key] || "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 — Dry-run */}
      {hasFile && allRequiredMapped && !commitResult && (
        <div className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-carbon-800">
            <span className="font-mono text-label-code text-carmine-signal">STEP 03</span>
            <span className="text-label-caps font-semibold uppercase text-titanium-light">
              Validação (Dry-Run) — nenhum dado gravado
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" size="md" onClick={handleDryRun} disabled={busy}>
              <ScanSearch className="w-4 h-4 mr-2" />
              {busy ? "Validando..." : "Executar Dry-Run"}
            </Button>
            {errors && errors.length === 0 && (
              <Button variant="primary" size="md" onClick={handleCommit} disabled={busy}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirmar Importação ({validCount} linhas)
              </Button>
            )}
            {errors && errors.length > 0 && (
              <Button variant="secondary" size="md" onClick={downloadErrorReport}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Relatório de Erros
              </Button>
            )}
          </div>

          {errors && errors.length === 0 && (
            <div className="flex items-center gap-2 bg-signal-buy/10 border border-signal-buy/30 rounded p-3">
              <CheckCircle2 className="w-5 h-5 text-signal-buy" />
              <span className="text-body-sm text-signal-buy">
                Todas as {validCount} linhas são válidas. A importação será transacional (rollback
                total se algo falhar).
              </span>
            </div>
          )}

          {errors && errors.length > 0 && (
            <div className="border border-signal-risk/30 rounded overflow-hidden">
              <div className="flex items-center gap-2 bg-signal-risk/10 px-3 py-2">
                <XCircle className="w-4 h-4 text-signal-risk" />
                <span className="font-mono text-label-code text-signal-risk">
                  {errors.length} LINHA(S) REJEITADA(S)
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-carbon-950 text-label-caps text-titanium-muted uppercase sticky top-0">
                      <th className="py-1.5 px-2 border-b border-carbon-800">LINHA</th>
                      <th className="py-1.5 px-2 border-b border-carbon-800">CAMPO</th>
                      <th className="py-1.5 px-2 border-b border-carbon-800">ERRO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-carbon-900/60" : ""}>
                        <td className="py-1.5 px-2 font-mono text-label-code text-signal-risk">
                          {e.row}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-label-code text-titanium-muted">
                          {e.field || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-body-sm text-titanium-light">
                          {e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4 — Result */}
      {commitResult && (
        <div className="bg-carbon-900 border border-signal-buy/30 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-carbon-800">
            <span className="font-mono text-label-code text-signal-buy">STEP 04</span>
            <span className="text-label-caps font-semibold uppercase text-titanium-light">
              Importação Concluída
            </span>
          </div>
          <div className="flex items-center gap-2 bg-signal-buy/10 border border-signal-buy/30 rounded p-3">
            <CheckCircle2 className="w-5 h-5 text-signal-buy" />
            <span className="text-body-sm text-signal-buy">{commitResult}</span>
          </div>
          <p className="text-body-sm text-titanium-muted">
            Os dados já estão disponíveis nos módulos correspondentes e cada operação foi registrada
            na Trilha de Auditoria.
          </p>
        </div>
      )}
    </div>
  );
}
