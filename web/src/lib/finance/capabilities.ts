export type FinanceCapability = "finance.read" | "finance.import" | "finance.credit.configure";

// LAC-09 inativa: nenhum papel recebe acesso a valores antes da definição pelo PI.
export function hasFinanceCapability(_role: string, _capability: FinanceCapability): boolean {
  return false;
}

export const FINANCE_STATUS = {
  available: false,
  reason: "Fonte e regras financeiras ainda não configuradas.",
  coverage: "indisponível",
  source: null,
  updatedAt: null,
} as const;
