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
