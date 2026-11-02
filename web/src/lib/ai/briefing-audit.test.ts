import { describe, expect, it } from "vitest";
import {
  BRIEFING_AGENT_NAME,
  briefingFailureResponse,
  buildBriefingAuditEntry,
} from "./briefing-audit";

const input = {
  briefingDate: "2026-11-02",
  rupturesCount: 7,
  criticalCount: 5,
  pendingQuotesCount: 2,
  pendingQuotesTotal: 24284.12,
  usdRate: 5.4212,
  lmeAluRate: 2783.9111,
};

describe("buildBriefingAuditEntry", () => {
  it("descreve o briefing como geração automática, com a data em pt-BR", () => {
    const e = buildBriefingAuditEntry(input);
    expect(e.userPrompt).toContain("02/11/2026");
    expect(e.userPrompt).toContain("automática");
  });

  it("registra as três coletas com os números que foram para o modelo", () => {
    const e = buildBriefingAuditEntry(input);
    expect(e.toolsExecuted.map((t) => t.toolName)).toEqual([
      "briefing:rupturas_estoque",
      "briefing:propostas_pendentes",
      "briefing:mercado",
    ]);
    expect(e.toolsExecuted[0].resultSummary).toBe("7 SKUs (5 críticos)");
    expect(e.toolsExecuted[1].resultSummary).toContain("2 propostas");
    expect(e.toolsExecuted[2].resultSummary).toBe("USD-BRL-PTAX=5.4212; LME-ALU=2783.9111");
  });

  it("marca como indisponível o dado de mercado ausente, em vez de gravar zero", () => {
    const e = buildBriefingAuditEntry({ ...input, usdRate: null, lmeAluRate: null });
    expect(e.toolsExecuted[2].resultSummary).toBe(
      "USD-BRL-PTAX indisponível; LME-ALU indisponível"
    );
  });

  it("usa um nome de agente estável para filtrar na governança", () => {
    expect(BRIEFING_AGENT_NAME).toBe("briefing_07h");
  });
});

describe("briefingFailureResponse", () => {
  it("prefixa a falha e limita o tamanho", () => {
    expect(briefingFailureResponse(new Error("Rate limit"))).toBe("[falha] Rate limit");
    expect(briefingFailureResponse("x".repeat(900))).toHaveLength(500);
  });
});
