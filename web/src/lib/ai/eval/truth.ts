/** Gabarito calculado direto do banco, independente das ferramentas do Copiloto. */

export interface RiskSku {
  sku: string;
  family: string;
  coverageDays: number;
  status: "CRITICAL_RUPTURE" | "WARNING";
  suggestedQty: number;
}

export interface MarketTruth {
  last: number | null;
  change7d: number | null;
  change15d: number | null;
  change30d: number | null;
}

export interface Truth {
  skus: string[];
  /** Rupturas críticas e em atenção, da menor cobertura para a maior. */
  risk: RiskSku[];
  market: { ptax: MarketTruth; aluminium: MarketTruth; hrc: MarketTruth };
  quotes: {
    totalCount: number;
    approvedCount: number;
    approvedAvgMargin: number | null;
    sentCount: number;
    sentTotal: number;
    blockedCount: number;
    seller: { name: string; count: number } | null;
  };
  remnants: { availableCount: number; thicknessesMm: number[] };
  suppliers: { minLeadTimeDays: number; names: string[] } | null;
  impact: { family: string; pct: number; total: number } | null;
}
