export const COPILOT_OPEN_EVENT = "metalagents:copilot-open";

export interface CopilotOpenDetail {
  /** Texto a colocar no campo de pergunta. */
  prompt?: string;
  /** Envia o prompt na hora. Sem isso, o texto fica no campo para o usuário revisar. */
  send?: boolean;
}

export const COPILOT_QUICK_PROMPTS = [
  "Quais SKUs estão em ruptura crítica?",
  "Qual a margem média dos orçamentos aprovados esta semana?",
  "O dólar subiu quanto nos últimos 15 dias?",
  "Qual fornecedor entrega chapa 1/4 mais rápido hoje?",
] as const;

export function openCopilot(detail: CopilotOpenDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CopilotOpenDetail>(COPILOT_OPEN_EVENT, { detail }));
}
