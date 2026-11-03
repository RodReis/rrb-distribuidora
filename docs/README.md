# Documentação — MetalAgents

SaaS de inteligência preventiva para distribuidoras de ferro, aço e alumínio.
**Status atual:** especificação concluída para os MVPs 0–4.

| MVP | Situação |
|---|---|
| M0 — Fundação | ✅ implementado e em produção (débitos em [`debitos-tecnicos.md`](./debitos-tecnicos.md)) |
| M1 — Inteligência de Mercado | 🟡 implementado e integrado na `main` (PRs #1 e #2); **aguardando homologação** — pendências em [`specs/MVP-01-mercado.md`](./specs/MVP-01-mercado.md#10-estado-da-implementação-02112026) |
| M2 — Estoque Preventivo | 🟡 implementado localmente (lint, build e 33 testes ok); **aguardando homologação** — falta CRUD completo de retalhos, `DataTable` padrão e validação em produção (job 04h00 agendado, aguardando deploy do worker); ver [`specs/MVP-02-estoque.md`](./specs/MVP-02-estoque.md#10-estado-da-implementação-02112026) |
| M3 — Orçamento de Corte | 🟡 implementado localmente (lint, build e 113 testes ok); **aguardando homologação** — falta exercitar o upload real no Cloudflare R2, testes de integração com Postgres e validar as fórmulas contra tabela de usina; ver [`specs/MVP-03-orcamentos.md`](./specs/MVP-03-orcamentos.md#10-estado-da-implementação-02112026) |
| M4 — Copiloto + Governança | 🟡 implementado parcialmente (briefing 07h, Command Center, auditoria, termos de uso, provedores de IA por tenant); **aguardando homologação** — pendências em [`specs/MVP-04-copiloto.md`](./specs/MVP-04-copiloto.md#103-pendências) |
| LAC-01 — Compras operacionais | 🟡 implementado localmente (schema, API, telas e testes); **não homologado** — emissão bloqueada até o PI aprovar a matriz de alçadas; ver [`specs/LAC-01-compras-operacionais.md`](./specs/LAC-01-compras-operacionais.md#13-estado-da-implementação-03112026) |

## Índice de documentos

| Documento | Descrição |
|---|---|
| [`PRD.md`](./PRD.md) | Product Requirements Document v1.0 — visão completa do produto (12–18 meses) |
| [`plano-mvps-metalagents.md`](./plano-mvps-metalagents.md) | **Plano mestre v1.1** — fatiamento em MVPs, decisões técnicas, arquitetura, cronograma |
| [`specs/BACKLOG-LACUNAS-PRD.md`](./specs/BACKLOG-LACUNAS-PRD.md) | Inventário rastreável das lacunas entre PRD, plano e specs; pacotes propostos e decisões ainda pendentes (não autoriza implementação) |
| [`specs/LAC-01-compras-operacionais.md`](./specs/LAC-01-compras-operacionais.md) | SPEC detalhada — pedido manual, aprovação, emissão e recebimento de compras. **Implementada localmente em 03/11/2026**; emissão bloqueada até o PI aprovar a matriz de alçadas |
| [`specs/LAC-02-fornecedores-desempenho.md`](./specs/LAC-02-fornecedores-desempenho.md) | SPEC proposta — fornecedor preferencial, lead time e OTIF |
| [`specs/LAC-03-estoque-reservas-depositos.md`](./specs/LAC-03-estoque-reservas-depositos.md) | SPEC proposta — reservas, depósitos, transferências, QR e sazonalidade |
| [`specs/LAC-04-producao-apontamento.md`](./specs/LAC-04-producao-apontamento.md) | SPEC proposta — ordens de produção, consumo e apontamento mobile/offline |
| [`specs/LAC-05-historico-preco-pago.md`](./specs/LAC-05-historico-preco-pago.md) | SPEC proposta — exportação de mercado, preço pago e alertas |
| [`specs/LAC-06-analises-mercado.md`](./specs/LAC-06-analises-mercado.md) | SPEC proposta — sazonalidade, correlações e spread histórico |
| [`specs/LAC-07-sinal-backtesting.md`](./specs/LAC-07-sinal-backtesting.md) | SPEC proposta — sinal composto e backtesting reproduzível |
| [`specs/LAC-08-noticias-regulatorio.md`](./specs/LAC-08-noticias-regulatorio.md) | SPEC proposta — notícias, sentimento e feed regulatório |
| [`specs/LAC-09-financeiro-credito.md`](./specs/LAC-09-financeiro-credito.md) | SPEC proposta — títulos, crédito, inadimplência e fluxo financeiro |
| [`specs/LAC-10-logistica.md`](./specs/LAC-10-logistica.md) | SPEC proposta — expedição, romaneio e rastreio |
| [`specs/LAC-11-qualidade-rastreabilidade.md`](./specs/LAC-11-qualidade-rastreabilidade.md) | SPEC proposta — certificados, qualidade e rastreabilidade de lotes |
| [`specs/LAC-12-parametros-comerciais-documentos.md`](./specs/LAC-12-parametros-comerciais-documentos.md) | SPEC proposta — parâmetros comerciais/fiscais e dados da distribuidora |
| [`specs/LAC-13-identidade-permissoes.md`](./specs/LAC-13-identidade-permissoes.md) | SPEC proposta — MFA, recuperação de senha, desativação, SSO e permissões de agente |
| [`specs/LAC-14-operacao-sre.md`](./specs/LAC-14-operacao-sre.md) | SPEC proposta — confiabilidade, backup/restore, migrations e jobs |
| [`specs/LAC-15-auditoria-integra-agentes.md`](./specs/LAC-15-auditoria-integra-agentes.md) | SPEC proposta — trilha de auditoria verificável e ações de agentes |
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
