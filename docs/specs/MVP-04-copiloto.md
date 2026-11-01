# Spec MVP-04 — Copiloto Executivo, Briefing 07h & Governança de IA

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 01/11/2026  
**Duração estimada:** 4 semanas · **Dependências:** MVP-00 (Auth e Usuários), MVP-01 (Dados de Mercado), MVP-02 (Estoque Preventivo), MVP-03 (Orçamentos e Margens)  
**Telas de referência:**  
- `docs/telas/metalagents_command_center_do_diretor_briefing_07h`  
- `docs/telas/metalagents_command_center_do_diretor_briefing_07h_tema_claro`  
- `docs/telas/metalagents_termos_de_uso_governan_a_de_ia_privacidade`
**Regras de implementação:** ⛔ conformidade obrigatória com [`docs/regras-frontend.md`](../regras-frontend.md)

---

## 1. Objetivo

Consolidar a camada de inteligência do MetalAgents. Entregar o **Command Center do Diretor** com o **Briefing Matinal das 07h**, um assistente de linguagem natural (**Copiloto**) operando com *tool-calling* estritamente determinístico sobre a base de dados dos MVPs anteriores, e uma estrutura rigorosa de **Governança de IA** com trilha de auditoria completa (*human-in-the-loop*).

**Valor entregue:** O dono/diretor da distribuidora inicia o dia sabendo exatamente onde estão os riscos de estoque, as melhores oportunidades de compra de metal e as decisões pendentes de aprovação, podendo interrogar a operação inteira em linguagem natural.

---

## 2. Decisões Técnicas (fechadas)

| Tema | Decisão |
|---|---|
| Arquitetura do Copiloto | Vercel AI SDK (`ai` e `@ai-sdk/openai` ou `@ai-sdk/anthropic`) integrado ao Next.js App Router |
| Segurança & Alucinação | **Proibido Text-to-SQL livre**. O Copiloto opera exclusivamente via **Tool Calling (Function Calling)** com schemas Zod rigorosos apontando para funções de domínio compiladas em TypeScript |
| Escopo de Ação do Copiloto | **100% Somente-Leitura (Read-Only) no MVP**. O Copiloto consulta, calcula, sintetiza e explica, mas **nunca altera dados ou executa compras diretamente** |
| Briefing Diário 07h | Gerado automaticamente por worker Railway às 06h55: compila dados do M1 (mercado), M2 (rupturas), M3 (propostas abertas) e formata um resumo executivo sintetizado por LLM |
| Entrega do Briefing | Disponível na tela principal do Command Center + disparo de e-mail via Resend para a diretoria |
| Trilha de Auditoria de IA | Tabela `agent_actions` grava toda interação do usuário, ferramentas executadas, dados retornados, tempo de resposta e tokens consumidos |
| Governança & LGPD | Página de termos de uso e privacidade (`/governanca`) explicando o modelo de human-in-the-loop e conformidade de dados |

---

## 3. User Stories e Critérios de Aceite

### US-01 — Command Center do Diretor
Como **diretor/proprietário**, quero um painel único que resuma a saúde e os alertas da distribuidora ao abrir o sistema.

- Tela baseada nos mockups `metalagents_command_center_do_diretor_briefing_07h`:
  - **KPIs Críticos do Dia:**
    - Faturamento Previsto em Propostas Abertas (R$)
    - Margem Bruta Média do Mês (%)
    - SKUs em Ruptura Crítica iminente (Qtd)
    - Custo de Reposição Médio vs. Mês Anterior (Variação %)
    - Dólar PTAX Oficial e Spread Médio de Importação
  - **Termômetro Departamental:** Status sintético (Compras, Vendas, Estoque, Chão de Fábrica, Financeiro).
  - **Matriz Preditiva de Recomendações:** Tabela de ações preventivas sugeridas ordenadas por impacto financeiro estimado.
- Suporte a alternância de tema escuro industrial (`carbon`) e tema claro (`precision steel`).
- **Aceite:** Carregamento consolidado do Command Center em < 2 segundos.

### US-02 — Briefing Automático das 07h
Como **diretor/gestor**, quero receber às 07h da manhã um resumo executivo inteligente das prioridades do dia.

- Execução programada via worker:
  1. Coleta itens em risco de ruptura do M2.
  2. Coleta variações de fechamento do LME e PTAX do M1.
  3. Coleta propostas aguardando aprovação de margem do M3.
  4. Chama o LLM (com prompt de sistema industrial) para sintetizar em tópicos claros:
     - ⚠️ *Atenção Imediata (Rupturas & Atrasos)*
     - 📈 *Oportunidades de Compra & Mercado*
     - 💼 *Propostas Comerciais Estratégicas*
- Disponível em destaque no topo do Command Center com botão "Ouvir áudio / Ler resumo".
- Envio simultâneo por e-mail com layout mobile responsivo.
- **Aceite:** Briefing gerado pontualmente às 07h com dados matematicamente exatos e sem alucinações de estoque ou preço.

### US-03 — Copiloto em Linguagem Natural (Read-Only)
Como **usuário do sistema**, quero fazer perguntas sobre a operação e receber respostas embasadas em dados reais.

- Interface de chat lateral acessível em qualquer tela (atalho `CMD+K` ou ícone no header).
- Exemplos de perguntas respondidas:
  - *"Quais chapas A36 estão com menos de 10 dias de cobertura?"* -> Chama ferramenta `get_critical_stock_skus`
  - *"Qual foi a margem média dos orçamentos aprovados esta semana?"* -> Chama ferramenta `get_sales_metrics`
  - *"O dólar subiu quanto nos últimos 15 dias?"* -> Chama ferramenta `get_market_history`
  - *"Qual fornecedor entrega chapa 1/4 mais rápido hoje?"* -> Chama ferramenta `get_supplier_lead_times`
- Transparência Total: O Copiloto exibe na interface quais ferramentas e filtros foram consultados para formular a resposta.
- **Aceite:** 20 perguntas de negócio pré-definidas no PRD respondidas com precisão superior a 90%.

### US-04 — Ferramentas Determinísticas do Copiloto (Tool Calling)
Como **desenvolvedor/auditor**, quero garantir que o Copiloto só acesse dados através de funções auditadas.

- Ferramentas nativas expostas ao modelo (Zod Schema):
  - `consultar_ruptura_estoque(familia, limite)`
  - `consultar_cotacao_mercado(ativo, dias)`
  - `consultar_orcamentos_pendentes(status, vendedor)`
  - `consultar_retalhos_disponiveis(espessura_min, espessura_max, liga)`
  - `calcular_impacto_aumento_insumo(percentual_alta, familia_produto)`
- Todas as funções rodam no backend com o `tenant_id` da sessão autenticada.
- **Aceite:** Tentativa de injeção de prompt ou solicitação de SQL arbitrário é recusada e registrada.

### US-05 — Trilha de Auditoria e Governança de IA
Como **responsável pela conformidade/diretor**, quero visualizar o histórico de todas as interações de IA no sistema.

- Tela baseada no mockup `metalagents_termos_de_uso_governan_a_de_ia_privacidade`.
- Registro na tabela `agent_actions`:
  - Data/Hora
  - Usuário Solicitante
  - Entrada original (Prompt)
  - Ferramentas acionadas e parâmetros passados
  - Resposta final gerada
  - Custo em tokens e latência (ms)
- Painel de Governança com as políticas ativas:
  - Política de Alçadas e Aprovação Humana obrigatória.
  - Conformidade LGPD: Nenhum dado de cliente é utilizado para treinamento de modelos públicos.
- **Aceite:** Toda consulta ao Copiloto gera um registro imutável de auditoria.

---

## 4. Modelo de Dados (Drizzle ORM)

```ts
// Trilha de Auditoria de Ações dos Agentes / Copiloto
export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  agentName: varchar("agent_name", { length: 50 }).notNull(), // 'copilot_chat', 'briefing_07h', 'market_monitor'
  userPrompt: text("user_prompt"),
  toolsExecuted: jsonb("tools_executed").$type<{
    toolName: string;
    params: Record<string, unknown>;
    resultSummary: string;
  }[]>(),
  agentResponse: text("agent_response").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  latencyMs: integer("latency_ms"),
  feedbackScore: integer("feedback_score"), // 1 (positivo) ou -1 (negativo) para RLHF interno
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Histórico de Briefings Diários Gerados
export const dailyBriefings = pgTable("daily_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  briefingDate: date("briefing_date").notNull(),
  summaryHtml: text("summary_html").notNull(),
  summaryText: text("summary_text").notNull(),
  keyMetrics: jsonb("key_metrics").$type<{
    criticalRupturesCount: number;
    pendingQuotesCount: number;
    potentialLossAmount: number;
    usdRate: number;
    lmeAluRate: number;
  }>().notNull(),
  recommendedActions: jsonb("recommended_actions").$type<{
    department: string;
    action: string;
    financialImpact: string;
    priority: "alta" | "media" | "baixa";
  }[]>(),
  sentViaEmailAt: timestamp("sent_via_email_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 5. Rotas e APIs

| Rota / Ação | Método | Papel | Descrição |
|---|---|---|---|
| `/` ou `/dashboard` | GET (Page) | Leitura | Command Center do Diretor |
| `/governanca` | GET (Page) | Leitura | Central de Governança, Termos e Auditoria de IA |
| `/api/copilot/chat` | POST (Stream) | Autenticado | Endpoint de chat com stream (Vercel AI SDK `streamText`) |
| `/api/copilot/feedback` | POST | Autenticado | Avaliação positiva/negativa de uma resposta do assistente |
| `/api/briefing/latest` | GET | Leitura | Retorna o último briefing matinal gerado |
| `/api/internal/jobs/generate-daily-briefing` | POST (Cron) | Sistema | Worker agendado às 06h55 que gera e envia o briefing |

---

## 6. Mapeamento de Telas (Mockups vs. Implementação)

| Mockup Referência | Página na Aplicação | Adaptações |
|---|---|---|
| `docs/telas/metalagents_command_center_do_diretor_briefing_07h` | `/` (Dashboard Principal) | Implementação no tema escuro oficial com cards de KPIs, seção expansível do Briefing 07h e tabela de ações preventivas dos agentes. |
| `docs/telas/metalagents_command_center_do_diretor_briefing_07h_tema_claro` | Alternador de Tema | Mesma tela com classe Tailwind `light` para usuários que preferem o tema de alto contraste em escritórios claros. |
| `docs/telas/metalagents_termos_de_uso_governan_a_de_ia_privacidade` | `/governanca` | Tela de governança, exibição de termos LGPD e tabela de auditoria de chamadas de IA. |

---

## 7. Fora do Escopo do MVP-04

- Agentes autônomos com poder de compra direta sem aprovação humana (*zero autonomous spend*).
- Síntese de voz em áudio gerada por IA (TTS) no briefing — fica apenas texto formatado no MVP.
- Treinamento ou fine-tuning de modelos proprietários.
- Roteamento multi-agente complexo assíncrono (CrewAI / AutoGen) — Vercel AI SDK com tool-calling atende com muito mais velocidade e confiabilidade no MVP.

---

## 8. Critérios de Aceite (Checklist Final do PRD)

- [ ] Briefing matinal gerado automaticamente todos os dias às 07h com dados reais da operação.
- [ ] Copiloto responde 20 perguntas de negócio pré-definidas com acurácia factual > 90%.
- [ ] Todas as ações de ferramentas e respostas são registradas em `agent_actions`.
- [ ] Nenhuma query SQL arbitrária ou alucinação de dados de estoque ocorre durante as respostas.
- [ ] Interface Command Center carrega em menos de 2 segundos.
- [ ] Política de aprovação humana (*human-in-the-loop*) garantida em todas as decisões recomendadas.

---

## 9. Tarefas de Implementação

1. **Migrations Drizzle:** Criar tabelas `agent_actions` e `daily_briefings`.
2. **Setup do Vercel AI SDK:** Instalar dependências (`ai`, `@ai-sdk/openai` ou `@ai-sdk/anthropic`) e configurar rota `/api/copilot/chat` com streaming.
3. **Desenvolvimento das Ferramentas (Tools):** Escrever em `lib/ai/tools/` as funções com schema Zod (`consultarRupturas`, `consultarPrecosMercado`, `consultarOrcamentos`).
4. **Interface do Copiloto (Drawer/Chat):** Componente de chat moderno, com markdown render, badges das ferramentas acionadas e histórico de sessão.
5. **Worker do Briefing 07h:** Criar script `lib/ai/briefing-generator.ts` que agrega métricas da madrugada e compila o briefing executivo.
6. **Command Center UI:** Montar a página do Dashboard do Diretor integrando os KPIs dos MVPs 0, 1, 2 e 3.
7. **Página de Governança e Auditoria:** Montar a tela `/governanca` com visualizador da trilha de ações de IA.
8. **Bateria de Testes de Aceite:** Executar o script de teste com as 20 perguntas do PRD e mensurar o índice de acerto.
