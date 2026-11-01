# Spec MVP-01 — Inteligência de Mercado

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 01/11/2026  
**Duração estimada:** 4 semanas · **Dependências:** MVP-00 (Fundação — Auth, Tenant, Shell, Drizzle/Postgres)  
**Telas de referência:**  
- `docs/telas/metalagents_intelig_ncia_de_mercado_lme_arbitragem`  
- `docs/telas/metalagents_intelig_ncia_preventiva_para_o_mercado_do_a_o`
**Regras de implementação:** ⛔ conformidade obrigatória com [`docs/regras-frontend.md`](../regras-frontend.md)

---

## 1. Objetivo

Implementar o módulo de inteligência de preços e commodities, conectando a distribuidora ao mercado global (LME, CME, China FOB) e ao câmbio oficial (BCB PTAX). Fornece visualização gráfica em tempo real, simulador de paridade de importação vs. usina nacional e motor de alertas preventivos de variação cambial e de insumos.

**Valor entregue:** O comprador e a diretoria deixam de cotar no escuro e passam a enxergar tendências de repasse de usina e janelas de arbitragem de importação antes do fechamento de pedidos.

---

## 2. Decisões Técnicas (fechadas)

| Tema | Decisão |
|---|---|
| Ingestão Câmbio | API pública e gratuita do Banco Central do Brasil (BCB OData PTAX - Dólar Comercial Compra/Venda diário) |
| Ingestão Metais | Metals-API (LME Aluminium `ALU`, LME Steel HRC `STEEL-HRC`, FOB China HRC). Fallback inicial com carga histórica CSV de 2+ anos |
| Periodicidade Ingestão | Worker Railway (`node-cron`): PTAX às 13h15 e 18h00 (fechamento oficial); Metals-API a cada 60 min em horário de pregão (08h às 18h BRT) |
| Estrutura de Séries | Tabela `market_price_series` com partição mensal no Postgres (`timescaledb` descartado para manter compatibilidade com Railway Postgres padrão) |
| Visualização Gráfica | TradingView Lightweight Charts (v4.x) para candlestick OHLC e gráficos de linhas com overlay de médias móveis (SMA 20, SMA 50) e preço médio pago da empresa |
| Normalização | Motor determinístico em TypeScript (`lib/market/converter.ts`): converte US$/t, CWT, USD/lb para R$/kg com base na PTAX do dia |
| Alertas | Worker avalia regras ao final de cada ingestão; notificações via In-App (badge no header) e e-mail via Resend |

---

## 3. User Stories e Critérios de Aceite

### US-01 — Ingestão Automática de Câmbio (BCB PTAX)
Como **comprador/diretor**, quero que a cotação oficial da PTAX seja atualizada automaticamente todos os dias úteis.

- Endpoint BCB consumido: `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)`
- Captura de cotação de compra e venda (boletins intermediários + fechamento oficial PTAX P5).
- Resiliência: 3 retries com backoff exponencial; log de falhas com alerta para o admin.
- Carga histórica: script de seed para baixar os últimos 24 meses retroativos.
- **Aceite:** Cotação do dólar atualizada diariamente no banco com histórico contínuo de 2 anos sem lacunas em dias úteis.

### US-02 — Ingestão de Commodities Metálicas
Como **comprador**, quero monitorar os preços de fechamento e intradiários do Alumínio LME e Bobina a Quente (HRC).

- Ingestão via Metals-API com chave configurável via secret de ambiente.
- Armazenamento em `market_price_series` com granularidade diária (OHLC) e horário de coleta.
- Fallback / Modo Desenvolvimento: Mock/Fixtures históricos reais quando a chave da API estiver em tier gratuito limitado.
- **Aceite:** Tabela de séries com dados de LME Alumínio e HRC com último fechamento, variação 24h, 7D e 30D calculados.

### US-03 — Painel de Cotações e Gráficos de Tendência
Como **diretor/comprador**, quero visualizar gráficos interativos com indicadores de mercado e sobreposição do custo pago pela distribuidora.

- Tela baseada no mockup `metalagents_intelig_ncia_de_mercado_lme_arbitragem`.
- Gráfico principal: TradingView Lightweight Charts com toggle Candlestick / Linha.
- Intervalos: 7D, 30D, 90D, 1A, 2A, Máx.
- Indicadores overlay:
  - Média móvel SMA 20 e SMA 50 dias.
  - Linha horizontal ou dispersão com o **Preço Médio Pago** (calculado com base nas últimas compras do produto associado no ERP/M0).
- Tickers rápidos no topo: Dólar PTAX, LME Alumínio (US$/t), HRC US (US$/t), Custo Brasil Estimado (R$/kg).
- **Aceite:** Carregamento do gráfico com mais de 700 pontos em < 1.5s; alternância suave entre períodos e ativos.

### US-04 — Simulador Dinâmico de Paridade de Importação vs. Usina Nacional
Como **comprador**, quero simular o custo final desembarcado de uma bobina/chapa importada da China comparando com a tabela da usina brasileira.

- Tela baseada na tabela do mockup `metalagents_intelig_ncia_de_mercado_lme_arbitragem` e `metalagents_intelig_ncia_preventiva_para_o_mercado_do_a_o`.
- Parâmetros de entrada configuráveis pelo usuário:
  - Preço FOB China (US$/ton)
  - Frete marítimo internacional (US$/ton ou container)
  - Taxa PTAX vigente ou travamento simulado (R$/US$)
  - Alíquotas de impostos: II (Imposto de Importação), IPI, PIS, COFINS, ICMS (com crédito presumido se aplicável)
  - Despesas alfandegárias portuárias (THC, armazenagem, despachante)
  - Frete rodoviário Porto (Santos/Itapoá) até a Distribuidora (R$/ton)
  - Custo Usina Nacional concorrente (ex: Usiminas/CSN/Gerdau em R$/kg ou R$/ton)
- Cálculo determinístico das etapas:
  1. Valor CIF (FOB + Frete Marítimo + Seguro)
  2. Base de cálculo dos impostos em cascata
  3. Custo final desembarcado em R$/kg e R$/ton
  4. Spread / Arbitragem: `(Preço Usina - Custo Importado) / Preço Usina * 100` (%)
- Indicador visual: **VERDE (Importar Favorável - spread > 12%)**, **AMARELO (Empatado/Risco cambial - spread entre 5% e 12%)**, **VERMELHO (Comprar Nacional - spread < 5%)**.
- **Aceite:** Fórmula tributária validada matematicamente; alteração de qualquer input recalcula a tabela em tempo real sem reload.

### US-05 — Motor de Alertas de Mercado
Como **comprador/diretor**, quero receber alertas automáticos quando houver variações bruscas de preço ou cruzamento de médias.

- Configuração de regras pelo usuário:
  - Variação cambial diária > X%
  - Variação semanal da commodity > Y%
  - Cruzamento de SMA 20 sobre SMA 50 (sinal técnico de reversão)
  - Spread de importação favorável atingido (> Z%)
- Canais de notificação:
  - Notificação In-App (sino no cabeçalho com contador não lido)
  - Disparo de e-mail via Resend para compradores cadastrados
- **Aceite:** Job pós-ingestão detecta a violação do threshold e gera notificação no banco e envio de e-mail dentro de 2 minutos.

---

## 4. Modelo de Dados (Drizzle ORM)

```ts
// Tabela de Ativos/Símbolos monitorados
export const marketAssets = pgTable("market_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: varchar("symbol", { length: 30 }).notNull().unique(), // ex: 'LME-ALU', 'CME-HRC', 'USD-BRL-PTAX'
  name: varchar("name", { length: 100 }).notNull(),
  market: varchar("market", { length: 50 }).notNull(), // 'LME', 'CME', 'BCB', 'SHFE'
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(), // 'USD', 'BRL'
  unit: varchar("unit", { length: 20 }).notNull(), // 'ton', 'kg', 'ptax'
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Tabela de Séries Temporais (Particionada por RANGE de data)
export const marketPriceSeries = pgTable("market_price_series", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => marketAssets.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  open: numeric("open", { precision: 12, scale: 4 }),
  high: numeric("high", { precision: 12, scale: 4 }),
  low: numeric("low", { precision: 12, scale: 4 }),
  close: numeric("close", { precision: 12, scale: 4 }).notNull(),
  volume: numeric("volume", { precision: 14, scale: 2 }),
  source: varchar("source", { length: 50 }).notNull(), // 'BCB_API', 'METALS_API', 'MANUAL_IMPORT'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    assetTimeIdx: index("idx_market_price_asset_time").on(table.assetId, table.timestamp),
  };
});

// Parâmetros salvos para simulações de paridade
export const importParityConfigs = pgTable("import_parity_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  associatedProductId: uuid("associated_product_id").references(() => products.id),
  iiTaxPct: numeric("ii_tax_pct", { precision: 5, scale: 2 }).default("12.00").notNull(),
  ipiTaxPct: numeric("ipi_tax_pct", { precision: 5, scale: 2 }).default("3.25").notNull(),
  pisTaxPct: numeric("pis_tax_pct", { precision: 5, scale: 2 }).default("2.10").notNull(),
  cofinsTaxPct: numeric("cofins_tax_pct", { precision: 5, scale: 2 }).default("9.65").notNull(),
  icmsTaxPct: numeric("icms_tax_pct", { precision: 5, scale: 2 }).default("18.00").notNull(),
  portExpensesPerTon: numeric("port_expenses_per_ton", { precision: 10, scale: 2 }).default("150.00").notNull(),
  roadFreightPerTon: numeric("road_freight_per_ton", { precision: 10, scale: 2 }).default("280.00").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Regras e Histórico de Alertas
export const marketAlertRules = pgTable("market_alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  assetId: uuid("asset_id").notNull().references(() => marketAssets.id),
  conditionType: varchar("condition_type", { length: 30 }).notNull(), // 'PERCENT_CHANGE_24H', 'THRESHOLD_ABOVE', 'THRESHOLD_BELOW'
  thresholdValue: numeric("threshold_value", { precision: 10, scale: 4 }).notNull(),
  channels: jsonb("channels").$type<("in_app" | "email")[]>().notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketAlertNotifications = pgTable("market_alert_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  ruleId: uuid("rule_id").references(() => marketAlertRules.id),
  title: varchar("title", { length: 150 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 5. Rotas e APIs

| Rota / Ação | Método | Papel | Descrição |
|---|---|---|---|
| `/mercado` | GET (Page) | Leitura | Terminal de mercado com tickers, gráficos e simulações |
| `/api/market/quotes` | GET | Leitura | Lista de tickers com último fechamento e variações |
| `/api/market/series/[symbol]` | GET | Leitura | Dados de séries temporais para o gráfico (parâmetros: `from`, `to`, `resolution`) |
| `/api/market/simulate-parity` | POST | Comprador/Admin | Executa o cálculo determinístico de paridade tributária |
| `/api/market/alerts` | GET / POST | Comprador/Admin | Listagem e criação de regras de alerta |
| `/api/market/notifications` | GET / PATCH | Leitura | Central de notificações in-app e marcar como lido |
| `/api/internal/jobs/ingest-ptax` | POST (Cron) | Sistema / Bearer Token | Ingestão diária PTAX BCB |
| `/api/internal/jobs/ingest-metals` | POST (Cron) | Sistema / Bearer Token | Ingestão horário de pregão Metals-API |

---

## 6. Mapeamento de Telas (Mockups vs. Implementação)

| Mockup Referência | Página na Aplicação | Adaptações |
|---|---|---|
| `docs/telas/metalagents_intelig_ncia_de_mercado_lme_arbitragem` | `/mercado` | Renderização modular: Card de Tickers no topo, Gráfico centralizado TradingView, Tabela de Simulador de Paridade abaixo. |
| `docs/telas/metalagents_intelig_ncia_preventiva_para_o_mercado_do_a_o` | `/mercado/arbitragem` ou Drawer de Detalhe | Módulo focado na composição tributária detalhada (II, PIS, COFINS, ICMS) do lote de 120t. |

---

## 7. Fora do Escopo do MVP-01

- Algoritmos de Machine Learning complexos (Prophet, Chronos, Deep Learning para séries temporais) — serão avaliados na Fase 2.
- Ordens de compra automatizadas em bolsa ou plataformas B2B.
- Scraping automatizado de portais fechados sem API autorizada.
- Cobertura de commodities fora do catálogo da distribuidora (ex: níquel, chumbo, ouro).

---

## 8. Critérios de Aceite (Checklist Final do PRD)

- [ ] Painel mostra LME Alumínio, HRC e PTAX atualizados sem falhas de conexão.
- [ ] Gráfico com histórico de 2+ anos navegável (OHLC e linha).
- [ ] Latência de carregamento inicial do painel inferior a 2 segundos.
- [ ] Simulador de importação calcula corretamente o desembarcado brasileiro (com margem de erro < 0,1% vs. planilha fiscal da empresa).
- [ ] Alerta de variação testado e disparado com envio de e-mail e badge no sistema.
- [ ] Worker no Railway rodando nos horários programados via cron com logs de auditoria.

---

## 9. Tarefas de Implementação

1. **Setup de Séries e Migrations:** Criar as tabelas `market_assets`, `market_price_series`, `import_parity_configs` e alertas via Drizzle.
2. **Ingestor BCB PTAX:** Criar serviço `lib/market/ingest-ptax.ts` para consumir a API OData do Banco Central e script de seed com 2 anos de histórico.
3. **Ingestor Metals-API:** Criar client com cache em banco e chave rotativa / fallback mock para dev.
4. **Endpoint de Séries Temporais:** Criar rota `/api/market/series/[symbol]` otimizada com agregação diária.
5. **Componente de Gráfico:** Integrar TradingView Lightweight Charts na UI com suporte a tema escuro carbon, tooltips e overlay de médias móveis.
6. **Módulo de Cálculo de Paridade:** Criar `lib/market/parity-calculator.ts` e interface interativa com sliders/inputs numéricos formatados.
7. **Motor de Alertas e Notificações:** Criar worker de checagem de thresholds e integração com Resend para envio de e-mails de alerta.
8. **Configuração de Worker Cron no Railway:** Configurar serviço secundário ou endpoint protegido acionado pelo Railway Cron.
9. **Testes e Homologação:** Testar com dados reais da distribuidora e comparar o simulador com a última DI (Declaração de Importação) real.
