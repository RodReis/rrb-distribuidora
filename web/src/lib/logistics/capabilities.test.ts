import { describe, expect, it } from "vitest";
import { etaLabel, hasLogisticsCapability } from "./capabilities";

describe("LAC-10 capacidades e ETA", () => {
  it("nega acesso a papel sem permissão", () => {
    expect(hasLogisticsCapability("vendedor", "logistics.read")).toBe(false);
    expect(hasLogisticsCapability("estoque", "logistics.dispatch")).toBe(false);
    expect(hasLogisticsCapability("admin", "logistics.dispatch")).toBe(true);
  });
  it("não transforma ETA vencida em atraso confirmado", () => {
    const now = new Date("2026-11-05T15:00:00Z");
    expect(etaLabel(null, now)).toBe("Sem previsão");
    expect(etaLabel(new Date("2026-11-04T15:00:00Z"), now)).toBe("Atraso estimado");
    expect(etaLabel(new Date("2026-11-06T15:00:00Z"), now)).toBe("Previsão estimada");
  });
});
