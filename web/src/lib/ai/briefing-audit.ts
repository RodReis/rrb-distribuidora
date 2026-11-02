/**
 * Registro do briefing diário na trilha de IA (`agent_actions`).
 *
 * O briefing não chama ferramentas do modelo: o código coleta os dados e o modelo só redige.
 * Mesmo assim a trilha mostra o que foi coletado, para auditar de onde veio cada número.
 */
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";

export const BRIEFING_AGENT_NAME = "briefing_07h";

export interface BriefingAuditInput {
  briefingDate: string;
  rupturesCount: number;
  criticalCount: number;
  pendingQuotesCount: number;
  pendingQuotesTotal: number;
  usdRate: number | null;
  lmeAluRate: number | null;
}

export interface AuditToolEntry {
  toolName: string;
  params: Record<string, unknown>;
  resultSummary: string;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const brDate = (iso: string) => iso.split("-").reverse().join("/");

export function buildBriefingAuditEntry(input: BriefingAuditInput): {
  userPrompt: string;
  toolsExecuted: AuditToolEntry[];
} {
  const market: string[] = [];
  market.push(
    input.usdRate != null ? `${ASSET_SYMBOLS.PTAX}=${input.usdRate}` : `${ASSET_SYMBOLS.PTAX} indisponível`
  );
  market.push(
    input.lmeAluRate != null
      ? `${ASSET_SYMBOLS.LME_ALU}=${input.lmeAluRate}`
      : `${ASSET_SYMBOLS.LME_ALU} indisponível`
  );

  return {
    userPrompt: `Briefing diário de ${brDate(input.briefingDate)} (geração automática, sem usuário)`,
    toolsExecuted: [
      {
        toolName: "briefing:rupturas_estoque",
        params: { status: ["CRITICAL_RUPTURE", "WARNING"], limite: 20 },
        resultSummary: `${input.rupturesCount} SKUs (${input.criticalCount} críticos)`,
      },
      {
        toolName: "briefing:propostas_pendentes",
        params: { status: ["bloqueado_margem", "enviado", "em_negociacao"] },
        resultSummary: `${input.pendingQuotesCount} propostas, ${brl(input.pendingQuotesTotal)}`,
      },
      {
        toolName: "briefing:mercado",
        params: { ativos: [ASSET_SYMBOLS.PTAX, ASSET_SYMBOLS.LME_ALU] },
        resultSummary: market.join("; "),
      },
    ],
  };
}

/** Texto gravado como resposta quando o modelo falha, para a falha também ficar na trilha. */
export function briefingFailureResponse(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[falha] ${message}`.slice(0, 500);
}
