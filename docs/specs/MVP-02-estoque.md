# Spec MVP-02 — Estoque Preventivo & Catálogo de Retalhos

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 01/11/2026  
**Duração estimada:** 5 semanas · **Dependências:** MVP-00 (Cadastros técnicos, Depósitos, Usuários) e MVP-01 (Preços de mercado para valorização e reposição)  
**Telas de referência:** `docs/telas/metalagents_estoque_preventivo_cat_logo_de_retalhos`
**Regras de implementação:** ⛔ conformidade obrigatória com [`docs/regras-frontend.md`](../regras-frontend.md)

---

## 1. Objetivo

Transformar a gestão de estoque da distribuidora de reativa para **preventiva**. Controlar saldos físicos por lotes e corridas (*heat numbers*), monitorar a velocidade de consumo, prever a data exata de ruptura com base no *lead time* dos fornecedores e catalogar retalhos (*offcuts*) de corte como ativos reutilizáveis com busca dimensional.

**Valor entregue:** Eliminar paradas por falta de material de alto giro, reduzir capital imobilizado em itens obsoletos e reaproveitar sobras de corte antes de consumir matéria-prima nova.

---

## 2. Decisões Técnicas (fechadas)

| Tema | Decisão |
|---|---|
| Rastreabilidade | Lotes vinculados a uma Corrida/Heat Number e Fornecedor de origem. Todo produto no armazém possui lote |
| Retalhos (Offcuts) | Tabela dedicada `stock_remnants` vinculada ao lote-mãe, com dimensões residuais exatas (L x C x E ou Diâmetro x Comprimento), peso calculado e status (`disponivel`, `reservado`, `consumido`, `sucateado`) |
| Motor Preventivo | Algoritmo determinístico diário em TypeScript executado pelo worker cron: calcula consumo médio diário ponderado (últimos 30/60/90 dias), desvio padrão ($\sigma$), Estoque de Segurança ($SS = Z \times \sigma \times \sqrt{LT}$), Ponto de Pedido ($ROP = d \times LT + SS$) e Dias de Cobertura |
| Classificação Curva ABC/XYZ | ABC por faturamento/valor imobilizado; XYZ por variabilidade de demanda (coeficiente de variação $CV = \sigma / \mu$) |
| Inventário Cíclico | Sugestão diária de contagem guiada por risco: prioriza itens com alta divergência histórica ou curva A com movimentação recente |
| Carga de Saldos Iniciais | Importador CSV com validação de saldo físico, custo unitário e lote inicial por produto |

---

## 3. User Stories e Critérios de Aceite

### US-01 — Controle de Lotes e Movimentações Físicas
Como **almoxarife/comprador**, quero registrar entradas, saídas e transferências de estoque com identificação de lote e corrida.

- Entradas por compra vinculadas ao fornecedor, nota fiscal, número de corrida (*heat number*) e depósito de estocagem.
- Saídas por venda direta ou requisição para corte.
- Cálculo de Custo Médio Ponderado e Custo da Última Entrada.
- Rastreamento de histórico completo de cada movimento (`stock_movements`).
- **Aceite:** Saldo físico bate exatamente com a soma dos saldos dos lotes; bloqueio de saldo negativo no armazém.

### US-02 — Matriz Preditiva de Ruptura (Lead Time vs. Cobertura)
Como **comprador/diretor**, quero visualizar em uma matriz quais itens correm risco de falta antes da entrega do fornecedor.

- Interface conforme mockup `metalagents_estoque_preventivo_cat_logo_de_retalhos`:
  - SKU e Descrição Técnica Metalúrgica
  - Saldo Físico Atual (kg e un)
  - Consumo Médio Diário / Mensal
  - Dias de Cobertura: $\text{Saldo Atual} / \text{Consumo Diário}$
  - Lead Time Homologado do Fornecedor (dias)
  - Status Preditivo:
    - 🔴 **RUPTURA CRÍTICA:** Cobertura < Lead Time (já deveria ter comprado)
    - 🟡 **ATENÇÃO:** Cobertura entre 1.0x e 1.3x do Lead Time (ponto de pedido atingido)
    - 🟢 **SAUDÁVEL:** Cobertura equilibrada
    - 🔵 **EXCESSO / ENVELHECIDO:** Cobertura > 180 dias sem giro
  - Ação Sugerida pelo Sistema: "Comprar X toneladas até DD/MM para evitar ruptura em DD/MM".
- Filtros por família, fornecedor padrão, depósito e nível de urgência.
- **Aceite:** O sistema sinaliza corretamente 100% dos SKUs onde cobertura < lead time com cálculo de sugestão de compra em quantidade e prazo.

### US-03 — Catálogo e Gestão de Retalhos Sobressalentes (Offcuts 2D/3D)
Como **vendedor/operador de corte**, quero cadastrar e consultar retalhos disponíveis para reaproveitá-los em novos pedidos.

- Cadastro rápido de retalho gerado por corte de chapa ou barra:
  - Lote de origem (herda liga, norma e corrida)
  - Dimensões remanescentes: Espessura [mm], Largura [mm], Comprimento [mm] (para chapas) ou Diâmetro [mm] e Comprimento [mm] (para barras/tubos)
  - Peso calculado automaticamente pela densidade da liga
  - Endereço físico no armazém (ex: "Cavalete B - Gaveta 04")
  - Status: Disponível, Reservado para Orçamento, Consumido
- Visualização em cards ou grid com diagrama esquemático simples das dimensões residuais.
- Mecanismo de busca dimensional: "Buscar retalhos de Chapa A36 com no mínimo 600x800mm e espessura 1/4\"".
- **Aceite:** Busca dimensional retorna retalhos compatíveis ordenados pelo menor desperdício residual.

### US-04 — Matching Preventivo: Retalhos vs. Pedidos de Venda / Orçamentos
Como **vendedor/planejador**, quero que o sistema indique automaticamente quando um pedido pode ser atendido por um retalho existente.

- Ao criar um item sob medida no orçamento (M3), o motor executa o algoritmo de matching:
  - Compara dimensões necessárias com os retalhos `disponiveis` da mesma liga e espessura.
  - Exibe alerta: *"Encontrado retalho #RET-1049 (850x1200mm) no Depósito Central - Evita cortar chapa nova de 6000x1500mm"*.
  - Opção de reservar o retalho para o pedido com um clique.
- **Aceite:** Sugestão automática de uso de retalho com cálculo de economia gerada (material recuperado de sucata).

### US-05 — Inventário Cíclico Dirigido por Risco
Como **almoxarife/gerente de operações**, quero uma lista diária de contagem física baseada em criticidade.

- Geração automática de lista de contagem cíclica (5 a 10 itens por dia):
  - Prioridade 1: Itens com divergência em contagens anteriores.
  - Prioridade 2: Itens Curva A com movimentação recente.
  - Prioridade 3: Lotes sem conferência há mais de 90 dias.
- Interface de lançamento simplificada (mobile-friendly para tablet/celular do almoxarifado).
- Ajuste de estoque com justificativa obrigatória e registro automático em trilha de auditoria.
- **Aceite:** Registro de conferência física com cálculo automático de acuracidade do inventário (%).

### US-06 — Importação Inicial de Saldos e Lotes (CSV)
Como **admin/estoquista**, quero importar a posição de estoque inicial da distribuidora.

- Planilha padrão com colunas: SKU, Depósito, Lote, Corrida/Heat, Quantidade, Unidade, Custo Unitário, Data Entrada.
- Validação atômica e relatório de divergências antes da efetivação.
- **Aceite:** Carga completa do estoque com conciliação do valor contábil inicial.

---

## 4. Modelo de Dados (Drizzle ORM)

```ts
// Lotes de Produto
export const stockLots = pgTable("stock_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  lotNumber: varchar("lot_number", { length: 50 }).notNull(),
  heatNumber: varchar("heat_number", { length: 50 }), // Número de corrida da usina
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  quantityInitial: numeric("quantity_initial", { precision: 12, scale: 4 }).notNull(),
  quantityCurrent: numeric("quantity_current", { precision: 12, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
  locationAddress: varchar("location_address", { length: 50 }), // Rua A, Prateleira 2
  entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).default("ativo").notNull(), // 'ativo', 'esgotado', 'bloqueado'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Movimentações de Estoque
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  lotId: uuid("lot_id").references(() => stockLots.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  movementType: varchar("movement_type", { length: 30 }).notNull(), // 'ENTRADA_COMPRA', 'SAIDA_VENDA', 'CORTE_CONSUMO', 'RETALHO_ENTRADA', 'AJUSTE_INVENTARIO'
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(), // Positivo para entrada, negativo para saída
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull(),
  referenceDocument: varchar("reference_document", { length: 100 }), // Chave NFe, Pedido Venda #1020, OS #50
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Catálogo de Retalhos Sobressalentes (Offcuts)
export const stockRemnants = pgTable("stock_remnants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: varchar("code", { length: 30 }).notNull().unique(), // ex: 'RET-00492'
  parentLotId: uuid("parent_lot_id").references(() => stockLots.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  thicknessMm: numeric("thickness_mm", { precision: 8, scale: 2 }).notNull(),
  widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
  lengthMm: numeric("length_mm", { precision: 8, scale: 2 }),
  diameterMm: numeric("diameter_mm", { precision: 8, scale: 2 }),
  weightKg: numeric("weight_kg", { precision: 10, scale: 3 }).notNull(),
  locationAddress: varchar("location_address", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("disponivel").notNull(), // 'disponivel', 'reservado', 'consumido', 'descarte'
  reservedForQuoteId: uuid("reserved_for_quote_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Cache / Métricas de Previsão de Demanda e Cobertura
export const stockPredictiveMetrics = pgTable("stock_predictive_metrics", {
  productId: uuid("product_id").primaryKey().references(() => products.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  currentStockQty: numeric("current_stock_qty", { precision: 12, scale: 4 }).notNull(),
  avgDailyConsumption30d: numeric("avg_daily_consumption_30d", { precision: 10, scale: 4 }).notNull(),
  leadTimeDays: integer("lead_time_days").default(15).notNull(),
  coverageDays: numeric("coverage_days", { precision: 8, scale: 1 }).notNull(),
  safetyStockQty: numeric("safety_stock_qty", { precision: 12, scale: 4 }).notNull(),
  reorderPointQty: numeric("reorder_point_qty", { precision: 12, scale: 4 }).notNull(),
  predictiveStatus: varchar("predictive_status", { length: 30 }).notNull(), // 'CRITICAL_RUPTURE', 'WARNING', 'HEALTHY', 'EXCESS'
  suggestedPurchaseQty: numeric("suggested_purchase_qty", { precision: 12, scale: 4 }).default("0").notNull(),
  suggestedPurchaseDate: timestamp("suggested_purchase_date", { withTimezone: true }),
  curveAbc: varchar("curve_abc", { length: 1 }).default("B").notNull(),
  curveXyz: varchar("curve_xyz", { length: 1 }).default("Y").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 5. Rotas e APIs

| Rota / Ação | Método | Papel | Descrição |
|---|---|---|---|
| `/estoque` | GET (Page) | Leitura | Dashboard do Estoque Preventivo e Matriz de Ruptura |
| `/estoque/retalhos` | GET (Page) | Leitura | Catálogo de Retalhos com busca dimensional |
| `/estoque/lotes` | GET | Estoque/Admin | Listagem de lotes e histórico de corridas |
| `/api/stock/matrix` | GET | Leitura | Dados da matriz preditiva filtráveis por status |
| `/api/stock/remnants` | GET / POST | Vendedor/Estoque | Busca dimensional de retalhos e cadastro de novo retalho |
| `/api/stock/movements` | POST | Estoque/Admin | Registro de entrada/saída manual de estoque |
| `/api/stock/cycle-count` | GET / POST | Estoque/Admin | Lista de itens para contagem e envio de conferência |
| `/api/internal/jobs/calculate-predictive-stock` | POST (Cron) | Sistema | Worker diário que recalcula coberturas, ROP e status |

---

## 6. Mapeamento de Telas (Mockups vs. Implementação)

| Mockup Referência | Página na Aplicação | Adaptações |
|---|---|---|
| `docs/telas/metalagents_estoque_preventivo_cat_logo_de_retalhos` | `/estoque` | Layout fiel: Seção superior com KPIs de ruptura e giro; Tabela central da Matriz Preditiva (Lead Time vs Cobertura); Seção inferior com Catálogo Técnico de Retalhos e buscador dimensional. |

---

## 7. Fora do Escopo do MVP-02

- Integração direta com balanças industriais IoT ou pontes rolantes via Modbus/OPC-UA (Fase 4).
- Otimização automática de rotas de empilhadeira no armazém.
- Emissão fiscal automática de NF de devolução ou ajuste (apenas registro contábil/físico no sistema).
- Algoritmos de Machine Learning não lineares (será mantido o modelo probabilístico paramétrico $Z \times \sigma$).

---

## 8. Critérios de Aceite (Checklist Final do PRD)

- [ ] Alerta de ruptura preventiva dispara para 100% dos SKUs onde cobertura < lead time.
- [ ] Sugestão de quantidade a comprar calcula adequadamente o lote mínimo e estoque de segurança.
- [ ] Retalhos cadastrados têm peso teórico calculado instantaneamente e aparecem na busca dimensional.
- [ ] Histórico de movimentações preserva integridade do saldo físico sem permitir estoque negativo.
- [ ] Importador CSV carrega o estoque inicial da distribuidora com reconciliação de lotes e custos.
- [ ] Classificação ABC e XYZ gerada e visível na tabela.

---

## 9. Tarefas de Implementação

1. **Migrations Drizzle:** Tabelas `stock_lots`, `stock_movements`, `stock_remnants` e `stock_predictive_metrics`.
2. **Motor Estatístico de Estoque:** Implementar `lib/stock/predictive-engine.ts` com cálculo de consumo diário, $\sigma$, $SS$, $ROP$ e status preditivo.
3. **Tela da Matriz de Ruptura:** Montar tabela interativa com ordenação por urgência e tags coloridas (Vermelho, Amarelo, Verde, Azul).
4. **Módulo de Retalhos:** Tela de cadastro e cards com renderização esquemática SVG das sobras de chapa/barra e busca dimensional.
5. **Ações de Movimentação:** Server actions para entradas de compra, baixas de venda e descarte de sucata.
6. **Módulo de Inventário Cíclico:** Endpoint e interface mobile para lançamento de contagens físicas diárias.
7. **Importador CSV de Estoque Inicial:** Parser com validação transacional e criação automática dos lotes iniciais.
8. **Worker de Recálculo Noturno:** Configurar agendamento diário às 04h00 para atualizar métricas de todos os produtos ativos.

---

## 10. Estado da implementação (02/11/2026)

> **Situação:** 🟡 implementado em ambiente local, **aguardando homologação**. Lint, `tsc`, `pnpm build` e 33 testes Vitest passam. **Não** houve comparação lado a lado com o `screen.png`, nem smoke ao vivo com login (Playwright). O checklist da seção 8 **não foi validado ponta a ponta**.

### 10.1 Tarefas da seção 9

| # | Tarefa | Estado |
|---|---|---|
| 1 | Migrations | ✅ `0003_hesitant_namora.sql` (`stock_lots`, `stock_movements`, `stock_remnants`, `stock_predictive_metrics` + `stock_cycle_counts`) |
| 2 | Motor estatístico | ✅ `lib/stock/predictive-engine.ts` (consumo ponderado 50/30/20, σ, SS, ROP, cobertura, status, ABC/XYZ) |
| 3 | Matriz de ruptura | 🟡 tabela com tags e filtro Críticos/Todos; **sem ordenação por clique no cabeçalho, sem paginação** |
| 4 | Módulo de retalhos | 🟡 cards com SVG, cadastro em `FormDrawer`, busca dimensional na API e no simulador; **sem editar, detalhe nem excluir** |
| 5 | Ações de movimentação | 🟡 entrada de compra e saída (server actions/API) ok; **drawer não permite saída/descarte** (só informa um toast) |
| 6 | Inventário cíclico | ✅ `lib/stock/cycle-count.ts`, API e aba (responsiva) |
| 7 | Importador CSV | ✅ `lib/stock/import-stock.ts` (validação atômica, reconciliação) + aba "Carga Inicial" |
| 8 | Worker 04h00 | 🟡 agendado no `market-worker` (`STOCK_PREDICTIVE_CRON = "0 4 * * *"`, fuso São Paulo, todos os dias); endpoint exige `CRON_SECRET` (503 sem ele, 401 com token errado). **Entra em vigor só após deploy do worker**; execução ainda não observada em produção |

### 10.2 Desvios e decisões em relação à spec

| Tema | Spec | Implementado | Motivo |
|---|---|---|---|
| Tabela extra | 4 tabelas | + `stock_cycle_counts`; coluna `stock_remnants.notes` | persistir contagens/acuracidade e a origem do retalho |
| Consumo | média 30/60/90 | média ponderada 50% / 30% / 20% | pesos não definidos na spec — **confirmar com o PI** |
| Lead time | do fornecedor homologado | A implementação descrita usa `suppliers.lead_time_days` do **primeiro lote com fornecedor** e padrão 15 d | Esta regra não identifica fornecedor padrão por produto e pode mascarar dado ausente. LAC-02 define preferência/lead time por produto; até migração e validação, o valor legado deve aparecer como estimativa com origem, não como lead time homologado |
| Curva ABC | faturamento/valor imobilizado | valor imobilizado (saldo em kg × `replacement_cost_base` em R$/kg), cortes 80/95%; sem conversão para kg usa o valor contábil dos lotes | não há vendas antes do M3 |
| Rotas | `/estoque/retalhos`, `/estoque/lotes` | redirecionam para `/estoque?tab=…` | `regras-frontend.md` §7 (abas com URL) |
| Rotas extras | — | `GET /api/stock/lots`, `GET /api/stock/movements` | apoiar as abas |
| Reposição | `RETALHO_ENTRADA`, lote mínimo | lote mínimo **não** modelado; sugestão = ROP − saldo + 30 dias de consumo | sem regra de lote mínimo definida — **pergunta em aberto ao PI** |
| Permissões | — | leitura e escrita exigem `estoque_retalhos` (`lib/stock/api-auth.ts` nas APIs; `checkPermission` + `Forbidden` na página) | corrigido; botões de escrita ainda aparecem para papéis só-leitura (a ação é recusada no servidor) |
| Matriz | todos os produtos | só produtos **com linha em `stock_predictive_metrics`** (após o 1º recálculo); status vem do motor, não é recalculado no cliente; ordenada por urgência | evitar "ruptura" falsa e divergência com o KPI |
| Status EXCESSO | azul | `titanium-light` sobre `titanium-steel/20` | `regras-frontend.md` §2.1 proíbe cores fora da paleta |
| Matching (US-04) | alerta no orçamento (M3) | bloco informativo "nenhum pedido sob medida" + simulador manual que **reserva** o retalho (`reserveRemnantAction`) | M3 não existe; o pedido PV-4491 do mockup era fictício |
| Sugestão de compra | botão "Gerar PO" | modal informativo (quantidade, comprar até, ruptura em); **não emite pedido** | LAC-01 especifica destino futuro para criar rascunho de PC; sugestão não aprova, não emite e não reserva estoque |
| Gráfico | "Projeção Prophet" com IC 95% | projeção **linear** (estoque − consumo × dia) com ROP, segurança e lead time | não há modelo Prophet nem IC; spec veda ML não linear |
| Removido do mockup | "Varredura LIDAR + RFID", "Matching IA 88,6%", "Redução -24% pós IA", "RFQ disparado (5 usinas)" | não implementados | não existem no produto |

### 10.3 KPIs e dados de demonstração

**KPIs agora calculados do banco** (`lib/stock/kpis.ts`):

| KPI | Definição |
|---|---|
| Ruptura iminente | nº de produtos com `predictive_status = CRITICAL_RUPTURE` |
| Déficit potencial | Σ (`suggested_purchase_qty` convertida para kg × `replacement_cost_base` em R$/kg) dos críticos; produto sem conversão conhecida (ex.: `un` sem peso por peça) fica de fora |
| Retalhos reclassificados (mês) | peso e valor dos retalhos `reservado`/`consumido` com `updated_at` no mês; variação vs mês anterior (omitida sem base). Valor só para produtos com custo em `kg` ou `t` |
| Capital parado | Σ (saldo × custo unitário) dos lotes ativos com entrada > 180 dias, e nº de lotes |
| DIO | valor em estoque ÷ (consumo dos últimos 90 dias em R$ ÷ 90); "—" sem consumo |
| Lead time médio | média de `lead_time_days` das métricas |
| Acuracidade | contagens sem diferença ÷ total; "—" sem contagens (antes havia 99,4% fixo) |
| Último ciclo | `counted_at` mais recente |

**Ainda não são reais:**

- Etiqueta/ZPL, "Nesting" e "Mill Cert": apenas toast.
- `seed-stock.ts` (só desenvolvimento) grava métricas com valores do mockup; em produção as tabelas começam vazias (ver `deploy.md` §4.4).

### 10.4 Não conformidades com `regras-frontend.md` (a corrigir)

- Sem `DataTable`/`SearchFilterBar`/`Pagination`/`MetricTile` compartilhados; tabelas e filtros montados na tela.
- ~~Cor fora da paleta (`blue-*`)~~ ✅ corrigido.
- Inputs e `textarea` com estilo repetido, sem componente `ui/`; ícones `lucide` no lugar de Material Symbols nas ações.
- Matriz sem os 4 estados completos (skeleton/erro com retry); sem 403 amigável.
- CRUD de retalhos incompleto (§8): falta editar, detalhe, excluir/descarte pela UI e coluna "Ações" com tooltip.
- Breadcrumb em `/estoque` usa "Início / Estoque & Retalhos / …" (ok), mas a ordenação por urgência da matriz não é por clique.

### 10.5 Pendências para aceitar o MVP-02

1. ~~Agendar o recálculo às 04h00 e tornar `CRON_SECRET` obrigatório~~ ✅ feito no código; **falta o deploy do `market-worker` e observar a 1ª execução** (log `[market-worker] … calculate-predictive-stock`).
2. ~~Trocar os valores fixos por consultas reais~~ ✅ (§10.3).
3. ~~`checkPermission` de leitura nas rotas GET e na página~~ ✅. Falta esconder botões de escrita para papéis só-leitura.
4. Implementar saída/descarte no drawer de movimentação e CRUD completo de retalhos (§8 das regras).
5. Migrar tabelas para `DataTable` padrão, remover cores fora da paleta e comparar com `screen.png`.
6. Gerar o código do retalho por sequência (hoje `RET-` + número aleatório de 4 dígitos, sujeito a colisão; coluna `code` é `unique`).
7. `recalculatePredictiveMetricsForTenant` roda para **todo o tenant a cada movimento**; avaliar execução assíncrona/fila se o volume crescer.
8. Validar a US-04 de verdade quando o M3 entregar o orçamento sob medida (reserva com `reserved_for_quote_id`).
9. Homologar os critérios da seção 8 com massa de dados real e registrar evidências.

### 10.6 Evidências

- `pnpm lint`, `tsc --noEmit`, `pnpm build` e `pnpm test` (48 testes: 10 do M1 + 38 do M2) passam.
- Testes do M2: consumo ponderado, σ, SS (`Z=1,645`), ROP, cobertura, transições de status, sugestão de compra, XYZ, peso teórico, encaixe direto/rotacionado, menor desperdício, importador CSV, **bloqueio de saldo negativo e ajuste com justificativa (`movements.ts`, `db` mockado)**, regra de divergência do inventário cíclico e fórmulas dos KPIs.
- Verificação manual local: rotas `/api/stock/*` sem sessão redirecionam ao login (307); job sem `CRON_SECRET` ou com token errado responde 503.
- **Não cobertos por teste:** seleção diária de candidatos (`getDailyCycleCountCandidates`), consultas de `getStockKpis` e as rotas/telas. Sem smoke autenticado nem comparação com `screen.png`.
