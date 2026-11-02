import { describe, expect, it } from "vitest";
import {
  isBriefingFromToday,
  marginDeltaPp,
  quotesLevel,
  rankRecommendations,
  splitBriefingSections,
  stockLevel,
  volatilityLevel,
  worstLevel,
  type Recommendation,
} from "./insights";

describe("volatilityLevel", () => {
  it("usa os cortes de 1,5% e 3% da validade dinâmica", () => {
    expect(volatilityLevel(1.5)).toBe("ok");
    expect(volatilityLevel(1.51)).toBe("attention");
    expect(volatilityLevel(3)).toBe("attention");
    expect(volatilityLevel(3.01)).toBe("risk");
  });

  it("considera o módulo da variação", () => {
    expect(volatilityLevel(-4)).toBe("risk");
    expect(volatilityLevel(-2)).toBe("attention");
  });

  it("sem dado vira nodata", () => {
    expect(volatilityLevel(null)).toBe("nodata");
    expect(volatilityLevel(Number.NaN)).toBe("nodata");
  });
});

describe("stockLevel e quotesLevel", () => {
  it("ruptura crítica pesa mais que atenção", () => {
    expect(stockLevel(1, 5)).toBe("risk");
    expect(stockLevel(0, 2)).toBe("attention");
    expect(stockLevel(0, 0)).toBe("ok");
  });

  it("proposta bloqueada exige atenção", () => {
    expect(quotesLevel(0)).toBe("ok");
    expect(quotesLevel(3)).toBe("attention");
  });
});

describe("worstLevel", () => {
  it("escolhe o pior nível com dado", () => {
    expect(worstLevel(["ok", "attention", "ok"])).toBe("attention");
    expect(worstLevel(["ok", "risk", "attention"])).toBe("risk");
  });

  it("ignora info e nodata", () => {
    expect(worstLevel(["info", "nodata", "ok"])).toBe("ok");
    expect(worstLevel(["info", "nodata"])).toBe("nodata");
    expect(worstLevel([])).toBe("nodata");
  });
});

describe("marginDeltaPp", () => {
  it("devolve a diferença em pontos percentuais", () => {
    expect(marginDeltaPp(24.6, 22.8)).toBe(1.8);
    expect(marginDeltaPp(20, 22.5)).toBe(-2.5);
  });

  it("sem um dos lados não inventa comparação", () => {
    expect(marginDeltaPp(null, 20)).toBeNull();
    expect(marginDeltaPp(20, null)).toBeNull();
  });
});

describe("rankRecommendations", () => {
  const mk = (id: string, amountBrl: number | null): Recommendation => ({
    id,
    department: "Estoque",
    action: id,
    detail: "",
    amountBrl,
    href: "/",
  });

  it("ordena por valor envolvido decrescente, itens sem valor por último", () => {
    const ranked = rankRecommendations([mk("a", 10), mk("b", null), mk("c", 500), mk("d", 70)]);
    expect(ranked.map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("respeita o limite", () => {
    const many = Array.from({ length: 12 }, (_, i) => mk(`r${i}`, i));
    expect(rankRecommendations(many, 5)).toHaveLength(5);
  });

  it("não altera a lista original", () => {
    const list = [mk("a", 1), mk("b", 2)];
    rankRecommendations(list);
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("splitBriefingSections", () => {
  const text = [
    "Bom dia, diretor.",
    "⚠️ Atenção Imediata (Rupturas & Atrasos)",
    "- CHA-0001 com 3,2 dias de cobertura.",
    "",
    "📈 Oportunidades de Compra & Mercado",
    "- Dólar PTAX em 5,4820.",
    "💼 Propostas Comerciais Estratégicas",
    "- 2 propostas pendentes.",
  ].join("\n");

  it("separa as três seções pelos títulos exigidos no prompt", () => {
    const parts = splitBriefingSections(text);
    expect(parts.map((p) => p.key)).toEqual(["attention", "market", "quotes"]);
    expect(parts[0].body).toContain("CHA-0001");
    expect(parts[1].body).toContain("5,4820");
    expect(parts[2].body).toContain("2 propostas");
  });

  it("aceita títulos em markdown", () => {
    const parts = splitBriefingSections(
      "## **Atenção Imediata**\nitem A\n### Propostas Comerciais\nitem B"
    );
    expect(parts.map((p) => p.key)).toEqual(["attention", "quotes"]);
  });

  it("descarta seção sem corpo e texto fora das seções", () => {
    const parts = splitBriefingSections("Intro\nAtenção Imediata\n\nOportunidades de Compra\nitem");
    expect(parts.map((p) => p.key)).toEqual(["market"]);
  });

  it("sem títulos devolve lista vazia", () => {
    expect(splitBriefingSections("Texto livre sem seções.")).toEqual([]);
  });
});

describe("isBriefingFromToday", () => {
  it("compara a data em São Paulo", () => {
    expect(isBriefingFromToday("2026-11-02", "2026-11-02")).toBe(true);
    expect(isBriefingFromToday("2026-11-01", "2026-11-02")).toBe(false);
  });
});
