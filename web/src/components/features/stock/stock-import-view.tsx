"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { importInitialStockAction } from "@/app/(app)/estoque/actions";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";

export interface StockImportViewProps {
  onImportSuccess?: () => void;
}

export function StockImportView({ onImportSuccess }: StockImportViewProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [csvContent, setCsvContent] = React.useState<string>("");
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<any | null>(null);

  const sampleCsv = `SKU,Depósito,Lote,Corrida,Quantidade,Unidade,Custo Unitário,Data Entrada,Endereço
CG-A36-1270,Galpão Central - Box B,LT-GD-8910,C-99412B,18.5,t,5420.00,2026-10-15,Galpão Central - Box B-04
BQ-1008-200,Galpão Central - Box B,LT-CSN-4412,CSN-7781A,42.0,t,4710.00,2026-10-18,Pátio Slitter - Box 02
CF-1006-120,Galpão Central - Box B,LT-USI-2291,USI-4410,8.2,t,6100.00,2026-10-20,Rua A - Prateleira P-04
TB-304-200,Galpão Central - Box B,LT-AP-1088,INX-5510,120,un,380.00,2026-10-22,Rua C - Prateleira 02`;

  function handleDownloadTemplate() {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "modelo_carga_estoque_inicial.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.info("Modelo CSV para importação de estoque baixado.");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent(event.target?.result as string);
      };
      reader.readAsText(selected);
    }
  }

  async function handleImport() {
    if (!csvContent || csvContent.trim() === "") {
      toast.error("Selecione um arquivo CSV com dados para importar.");
      return;
    }

    setImporting(true);
    setResult(null);
    try {
      const res = await importInitialStockAction(csvContent);
      setResult(res);
      if (res.success) {
        toast.success(
          `Carga inicial concluída! ${res.importedLots} lotes importados (${res.totalQuantity} unidades). Reconciliação: R$ ${res.totalReconciledValueBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        );
        onImportSuccess?.();
      } else {
        toast.error(`Falha na validação atômica: ${res.errors.length} erro(s) encontrados no CSV.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na importação de estoque.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-carbon-800">
        <div>
          <h2 className="text-headline-sm font-semibold text-ice-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-tertiary" />
            Carga de Saldos Iniciais & Importação de Lotes (CSV)
          </h2>
          <p className="text-body-sm text-titanium-muted">
            Importação atômica com validação de SKU, conciliação do valor contábil e criação automática dos lotes com corridas.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
          <Download className="w-3.5 h-3.5 mr-1 text-titanium-muted" />
          Baixar Planilha Modelo (.CSV)
        </Button>
      </div>

      {/* Upload Box */}
      <div className="border-2 border-dashed border-carbon-700 bg-carbon-950/60 rounded p-8 flex flex-col items-center justify-center text-center">
        <UploadCloud className="w-10 h-10 text-titanium-steel mb-3" />
        <h3 className="text-body-lg font-semibold text-ice-white">
          Arraste o arquivo CSV de estoque inicial ou clique para selecionar
        </h3>
        <p className="text-body-sm text-titanium-muted mt-1 mb-4 max-w-md">
          Colunas requeridas: SKU, Depósito, Lote, Corrida/Heat, Quantidade, Custo Unitário, Endereço.
        </p>

        <label className="cursor-pointer">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <span className="bg-carbon-800 hover:bg-carbon-700 text-ice-white px-4 py-2 rounded font-mono text-label-caps border border-carbon-700 transition-colors inline-block">
            {file ? file.name : "Selecionar Arquivo CSV"}
          </span>
        </label>
      </div>

      {/* Execute Button */}
      {csvContent && (
        <div className="flex items-center justify-between p-3 bg-carbon-950 border border-carbon-800 rounded">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-tertiary" />
            <span className="font-mono text-body-sm text-ice-white">
              {file?.name} ({(csvContent.length / 1024).toFixed(1)} KB)
            </span>
          </div>

          <Button
            variant="primary"
            size="md"
            disabled={importing}
            onClick={handleImport}
          >
            {importing ? "Processando e Validando..." : "Validar e Importar Saldos Iniciais"}
          </Button>
        </div>
      )}

      {/* Result & Validation Report */}
      {result && (
        <div className="mt-4 pt-4 border-t border-carbon-800">
          {result.success ? (
            <div className="p-4 bg-signal-buy/10 border border-signal-buy/30 rounded flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-signal-buy shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-ice-white text-body-lg">
                  Carga Atômica Efetivada com Sucesso!
                </h4>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-label-code">
                  <div className="bg-carbon-900 p-2 rounded border border-carbon-800">
                    <span className="text-titanium-muted block">Lotes Criados:</span>
                    <span className="text-ice-white text-metric-regular font-bold">
                      {result.importedLots} lotes
                    </span>
                  </div>
                  <div className="bg-carbon-900 p-2 rounded border border-carbon-800">
                    <span className="text-titanium-muted block">Volume Total Físico:</span>
                    <span className="text-signal-buy text-metric-regular font-bold">
                      {result.totalQuantity.toLocaleString("pt-BR")} un/t
                    </span>
                  </div>
                  <div className="bg-carbon-900 p-2 rounded border border-carbon-800">
                    <span className="text-titanium-muted block">Valor Contábil Reconciliado:</span>
                    <span className="text-ice-white text-metric-regular font-bold">
                      R$ {result.totalReconciledValueBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-signal-risk/10 border border-signal-risk/30 rounded">
              <div className="flex items-center gap-2 text-carmine-signal font-semibold text-body-lg mb-2">
                <AlertCircle className="w-5 h-5" />
                A Carga Foi Abortada Devido a Divergências de Validação ({result.errors.length} erro(s))
              </div>
              <p className="text-body-sm text-titanium-muted mb-3">
                Para manter a integridade dos saldos e custos, nenhum registro foi inserido. Corrija as linhas abaixo e reenvie:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-label-code">
                {result.errors.map((err: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2 bg-carbon-950 border border-carbon-800 rounded flex items-center justify-between text-titanium-light"
                  >
                    <span>
                      Linha <strong className="text-carmine-signal">#{err.line}</strong> [Campo:{" "}
                      <span className="text-titanium-muted">{err.field}</span>]: {err.message}
                    </span>
                    {err.value && (
                      <span className="text-titanium-dark bg-carbon-900 px-1 py-0.5 rounded">
                        Valor: {String(err.value)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
