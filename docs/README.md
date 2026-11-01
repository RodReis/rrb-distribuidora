# Documentação — MetalAgents

SaaS de inteligência preventiva para distribuidoras de ferro, aço e alumínio.
**Status atual:** especificação concluída para os MVPs 0–4 · implementação não iniciada.

## Índice de documentos

| Documento | Descrição |
|---|---|
| [`PRD.md`](./PRD.md) | Product Requirements Document v1.0 — visão completa do produto (12–18 meses) |
| [`plano-mvps-metalagents.md`](./plano-mvps-metalagents.md) | **Plano mestre v1.1** — fatiamento em MVPs, decisões técnicas, arquitetura, cronograma |
| [`regras-frontend.md`](./regras-frontend.md) | ⛔ **Regras obrigatórias de frontend** — fidelidade ao protótipo, tokens, componentes, toasts, breadcrumbs, abas e CRUD completo |
| [`specs/MVP-00-fundacao.md`](./specs/MVP-00-fundacao.md) | Spec M0 — Auth/RBAC, shell, cadastros (RF-01), importação CSV (~3 sem) |
| [`specs/MVP-01-mercado.md`](./specs/MVP-01-mercado.md) | Spec M1 — Cotações LME/HRC/PTAX, gráficos, alertas, paridade de importação (~4 sem) |
| [`specs/MVP-02-estoque.md`](./specs/MVP-02-estoque.md) | Spec M2 — Lotes, movimentos, previsão de demanda, matriz de ruptura, retalhos (~5 sem) |
| [`specs/MVP-03-orcamentos.md`](./specs/MVP-03-orcamentos.md) | Spec M3 — Motor de custo, orçamento de corte, precificação preventiva, PDF (~4 sem) |
| [`specs/MVP-04-copiloto.md`](./specs/MVP-04-copiloto.md) | Spec M4 — Copiloto com tool-calling, briefing 07h, command center, governança (~4 sem) |

## Referências visuais

As 14 telas mockadas ficam em [`telas/`](./telas/) — cada pasta contém `code.html` (referência de implementação, com o `tailwind.config` completo dos tokens) e `screen.png`. Os dois design systems (`industrial_precision_steel`, `metalagents_industrial_intelligence`) definem cores, tipografia (Inter + JetBrains Mono) e componentes.

## Convenções

- Specs seguem o template: Objetivo → Decisões técnicas → User Stories + aceite → Modelo de dados → Rotas → Telas → Fora do escopo → Checklist de aceite → Tarefas → Riscos
- IDs UUID v7 · `numeric(12,4)` para medidas/valores · `timestamptz` · enums Postgres nativos
- `tenant_id` em toda tabela de negócio (enforced app-level no MVP; RLS na fase SaaS)
- Cálculos de negócio (peso, custo, sinais) **sempre em código determinístico**; LLM só interpreta/explica
