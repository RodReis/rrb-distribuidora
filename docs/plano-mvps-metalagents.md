# Plano de MVPs — MetalAgents

**Versão:** 1.1  
**Data:** 01/11/2026  
**Autor:** Rodrigo Reis  
**Base:** `PRD.md` (PRD v1.0) + análise dos 14 mockups de tela + especificações detalhadas em `specs/`

---

## 1. Contexto

O repositório contém hoje:

| Artefato | Status |
|---|---|
| **PRD completo** — visão de produto, 7 dores, pesquisa de mercado (EUA/China), 9 agentes de IA, RF-01 a RF-11, RNFs, modelo de dados, roadmap de 4 fases, critérios de aceite | ✅ `prd_nexus_metal_analytics_saas_preventivo_perplexi.md` |
| **2 design systems** — `metalagents_industrial_intelligence` (dark/carbon) e `industrial_precision_steel` (claro), com tokens completos (cores, tipografia Inter + JetBrains Mono, componentes) | ✅ `DESIGN.md` em cada pasta |
| **14 telas mockadas** — HTML estático (Tailwind CDN) + PNG, cobrindo login multi-tenant, cadastros, command center, compras RFQ, estoque/retalhos, financeiro, inteligência de mercado, produção/corte, logística, qualidade, vendas/orçamentos, governança | ✅ 1 pasta por tela (`code.html` + `screen.png`) |
| **Código de aplicação** | ❌ Nenhum — produto ainda não iniciado |

**Leitura estratégica:** o PRD descreve a visão de 12–18 meses, não um MVP executável. Ele mistura 3 produtos: (1) terminal de inteligência de mercado, (2) ERP preventivo de distribuidora, (3) plataforma de agentes de IA. O plano abaixo fatia isso em **MVPs incrementais de 3–5 semanas**, cada um entregando valor utilizável sozinho, na ordem: **dados → operação → IA**. Os 14 mockups serão reusados como referência visual 1:1 das telas.

---

## 2. Decisões registradas (31/10/2026)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Primeiro usuário | **Uso interno** — a distribuidora é o cliente piloto. Single-tenant simplificado, sem billing. `tenant_id` no schema desde o dia 1 para o SaaS futuro não exigir reescrita |
| 2 | Stack | **Next.js + Railway** (não Supabase) |
| 3 | Hosting | **Tudo no Railway** — app Next.js + Postgres + worker de jobs no mesmo dashboard |
| 4 | Autenticação | **Auth.js / NextAuth v5** — self-hosted, sessões no Postgres |
| 5 | Ordem dos MVPs | **Como o PRD**: Mercado → Estoque → Orçamentos → Copiloto |
| 6 | Formato de especificação | **Spec por MVP em Markdown** (`specs/MVP-XX-*.md`), com user stories, modelo de dados, APIs, mapeamento de telas e critérios de aceite |

---

## 3. Arquitetura final

```
GitHub (main)
   │  deploy automático
   ▼
┌────────────── RAILWAY ──────────────┐
│  web      → Next.js 15 (SSR)        │
│  postgres → Postgres gerenciado     │
│             (partição mensal nas    │
│              séries de preço)       │
│  jobs     → worker node-cron        │
│             (ingestão, alertas,     │
│              briefing 07h)          │
└─────────────────────────────────────┘
   │
   ├── Cloudflare R2 → PDFs de propostas, certificados
   ├── Resend       → e-mails transacionais (magic link, alertas, briefing)
   └── Sentry       → monitoramento de erros
```

### Stack

| Camada | Escolha |
|---|---|
| App | Next.js 15 + TypeScript + Tailwind + shadcn/ui (tokens do `DESIGN.md`, tema carbon dark primeiro) |
| Banco/ORM | Postgres no Railway + **Drizzle ORM** + drizzle-kit migrations |
| Auth | **Auth.js v5** — e-mail+senha e/ou magic link, sessões no Postgres, papéis no banco |
| Papéis (RBAC) | diretor, comprador, vendedor, estoque, financeiro, admin |
| Tenancy | `tenant_id` em todas as tabelas; enforced **app-level** (RLS Postgres só na fase SaaS) |
| Jobs | Worker `node-cron` no mesmo repo (serviço separado no Railway) |
| Gráficos | TradingView Lightweight Charts |
| LLM (só M4) | Vercel AI SDK, roteador Claude/GPT, **tool-calling com funções determinísticas** — cálculo de negócio 100% em código, sem LLM |
| PDF | react-pdf |
| Observabilidade | Sentry + logs do Railway |
| CI/CD | GitHub → auto-deploy no Railway |
| Custo estimado | ~US$ 10–15/mês |

---

## 4. Os MVPs

### 🧱 M0 — Fundação (~3 semanas) — [`specs/MVP-00-fundacao.md`](./specs/MVP-00-fundacao.md)

| Item | Detalhe |
|---|---|
| Auth + RBAC | Auth.js v5; 6 papéis; proteção de rotas por papel |
| Shell da app | Sidebar + topbar conforme mockups; design tokens implementados no Tailwind |
| Cadastros (RF-01) | Produtos com atributos técnicos (norma, liga, forma, dimensões, densidade, peso/m), fornecedores, clientes, depósitos, máquinas |
| Carga inicial | Importação CSV/planilha (catálogo de produtos, clientes e fornecedores; saldos de estoque ficam para o M2) |
| Base | `tenant_id` em todas as tabelas, auditoria `created_by/updated_by`, Sentry, CI/CD, projeto Railway provisionado |

**Aceite:** login OK, CRUDs funcionando, catálogo real importado via CSV.

**Telas:** `metalagents_acesso_ao_sistema_multi_tenant`, `metalagents_cadastros_estrat_gicos_crud_de_produtos_met_licos_rf_01`.

### 📈 M1 — Inteligência de Mercado (~4 semanas) — [`specs/MVP-01-mercado.md`](./specs/MVP-01-mercado.md)

> **Status (02/11/2026):** 🟡 implementado e integrado na `main`; aguardando homologação (simulador × DI real, metais em produção, worker no Railway, e-mail de alerta). Detalhes e desvios na seção 10 da spec.

| Item | Detalhe |
|---|---|
| Ingestão | Metals-API (LME Alumínio, HRC) + **PTAX gratuita (BCB)**; worker diário + intradiário conforme plano contratado |
| Séries | `serie_preco_mercado` (fonte, símbolo, ts, OHLC, moeda, unidade) com partição mensal; normalização US$/t ↔ R$/kg via PTAX |
| Telas | Painel de cotações + gráficos candlestick/linha + comparativo multiativo + overlay "preço médio pago" |
| Alertas | Regras configuráveis (variação 1d/7d/30d, cruzamento de médias) → in-app + e-mail |

**Aceite (do PRD):** painel mostra LME Alumínio, HRC e PTAX atualizados, com gráfico e histórico de 2+ anos; latência < 2s.

**Telas:** `metalagents_intelig_ncia_preventiva_para_o_mercado_do_a_o`, `metalagents_intelig_ncia_de_mercado_lme_arbitragem`.

### 📦 M2 — Estoque Preventivo (~5 semanas) — [`specs/MVP-02-estoque.md`](./specs/MVP-02-estoque.md)

| Item | Detalhe |
|---|---|
| Modelo | Lote (heat/corrida, custo, localização), movimentos, retalho (cadastro e busca dimensional) |
| Motor preventivo | Previsão de demanda v1 = média móvel + desvio padrão ($\sigma$); estoque de segurança ($z \cdot \sigma \cdot \sqrt{LT}$); ponto de pedido dinâmico; dias de cobertura; curva ABC/XYZ |
| Alertas | Ruptura prevista (cobertura < lead time), excesso, envelhecimento >180/365 dias |
| Inventário | Cíclico guiado por risco (fila ordenada por chance de divergência) |
| Carga inicial | Importação CSV de saldos iniciais e lotes da distribuidora |

**Aceite:** alerta de ruptura dispara em 100% dos SKUs testados, com sugestão de reposição quantificada.

> **Status (02/11/2026):** 🟡 implementado localmente, ainda não integrado nem homologado. Motor preditivo, retalhos, movimentos, inventário cíclico e importador CSV prontos; faltam CRUD completo de retalhos, `DataTable` padrão e validação em produção (job 04h00 já agendado no código). Detalhes na seção 10 da spec.

**Telas:** `metalagents_estoque_preventivo_cat_logo_de_retalhos`.

### 💰 M3 — Orçamento de Corte (~4 semanas) — [`specs/MVP-03-orcamentos.md`](./specs/MVP-03-orcamentos.md)

| Item | Detalhe |
|---|---|
| Cálculo 100% determinístico | Peso teórico por forma (chapa: L×C×e×densidade; barra: peso/m; tubo), perda de corte por processo, custo/min de laser/plasma/serra/guilhotina/dobra — **sem LLM no cálculo** |
| Preço de reposição | Usa custo da última compra **ajustado pelo índice de mercado do M1** (precificação preventiva real) |
| Proposta | PDF (react-pdf) com validade ligada à volatilidade do mercado (2–7 dias); frete + ICMS configurável por estado |
| Funil | Rascunho → enviado → aprovado → perdido → pedido de venda simples |
| Bloqueio | Aviso/bloqueio quando preço < custo de reposição, com aprovação gerencial |

**Aceite:** peso com erro < 1% vs tabela técnica; orçamento completo < 3 min.

> **Status (02/11/2026):** 🟡 implementado localmente (lint, build e 113 testes ok); aguardando homologação. Motor metalúrgico e de precificação, funil de status, reserva/consumo de retalhos, aprovação de margem pelo diretor, PDF e conversão em pedido prontos; faltam R2 real, testes de integração e validação das fórmulas contra tabela de usina. Detalhes e desvios na seção 10 da spec.

**Nota:** Nesting 2D real fica para a Fase 2 — no MVP só cálculo de área/perda teórica.

**Telas:** `metalagents_vendas_or_amentos_r_pidos_nesting_de_corte`.

### 🤖 M4 — Copiloto + Governança (~4 semanas) — [`specs/MVP-04-copiloto.md`](./specs/MVP-04-copiloto.md)

| Item | Detalhe |
|---|---|
| Copiloto | **Tool-calling com funções determinísticas** (`consultar_serie_preco`, `cobertura_sku`, `margem_cliente`...) — não text-to-SQL livre |
| Briefing 07h | Gerado por dados: rupturas previstas, movimentos de mercado, orçamentos pendentes → e-mail + tela Command Center |
| Auditoria | Tabela `acao_agente` (agente, entrada, tools usadas, saída, status, aprovador); copiloto **somente leitura** no MVP |
| Governança | Termos de uso + política de IA (LGPD), conforme mockup |

**Aceite:** 20 perguntas de teste com > 90% de precisão; toda ação registrada em trilha; nenhuma ação destrutiva automática.

> **Status (02/11/2026):** 🟡 implementado parcialmente, não homologado. Briefing agendado, e-mail, Command Center, governança e drawer do copiloto refeitos nesta data. Bateria das 20 perguntas criada (`pnpm eval:copilot`) e aprovada com 20/20; revelou que a rota do copiloto não gerava resposta final. Tema claro implementado para o app inteiro, com alternador no topo. Faltam termos de uso (texto do PI) e revisão das 20 perguntas pelo PI. Detalhes na seção 10 da spec.

**Telas:** `metalagents_command_center_do_diretor_briefing_07h`, `metalagents_termos_de_uso_governan_a_de_ia_privacidade`.

---

## 5. Fora de escopo (Fases 2–4 do PRD)

- NF-e / fiscal completo (SPED, ICMS-ST, DIFAL)
- WhatsApp Business (agente de vendas via WhatsApp)
- RFQ automático multi-fornecedor + comparativo
- Nesting 2D / corte linear 1D / slitting reais (OR-Tools)
- OCR de mill certs + rastreabilidade completa por corrida
- Portal B2B para clientes
- Billing multi-tenant / onboarding SaaS
- Sinais de compra/venda com score composto + backtesting
- Logística (romaneio, rastreio de importação) e Financeiro completo (crédito, hedge)

---

## 6. Cronograma resumido

| MVP | Duração | Semanas |
|---|---|---|
| M0 — Fundação | ~3 sem | 0–3 |
| M1 — Inteligência de Mercado | ~4 sem | 3–7 |
| M2 — Estoque Preventivo | ~5 sem | 7–12 |
| M3 — Orçamento de Corte | ~4 sem | 12–16 |
| M4 — Copiloto + Governança | ~4 sem | 16–20 |

**Total: ~20 semanas.** O PRD pedia 4 meses só para o MVP 1; este fatiamento entrega valor a cada 3–5 semanas.

---

## 7. Pendências menores (decididas nas specs)

| # | Pendência | Onde se resolve |
|---|---|---|
| 1 | Fonte de preço do M1: Metals-API pago vs. começar só com PTAX (BCB, gratuita) + índices públicos | **Resolvido (02/11/2026):** PTAX gratuita (BCB) + provedor pago **por mercado** (Metals-API ou CommodityPriceAPI, ambos suportados) + modo Manual · CSV sem custo. Escolha do plano e licença em aberto (spec M1 §10.4) |
| 2 | Provedor de e-mail | Definido: Resend (confirmação na spec M0) |
| 3 | Qual plano do LLM para o M4 (Claude vs GPT) | Spec M4 — roteador permite trocar sem refatorar |

---

## 8. Próximos passos

1. Escrever `specs/MVP-00-fundacao.md` … `specs/MVP-04-copiloto.md`
   — cada spec com: objetivo, user stories, modelo de dados (DDL Drizzle), APIs/rotas, mapeamento tela-a-tela dos mockups, critérios de aceite e tarefas de implementação.
2. Provisionar Railway (web + postgres + jobs) e R2/Resend/Sentry.
3. Iniciar implementação do M0.
