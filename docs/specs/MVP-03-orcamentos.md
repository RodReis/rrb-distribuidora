# Spec MVP-03 — Vendas, Orçamentos Ágeis & Precificação Preventiva

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 01/11/2026  
**Duração estimada:** 4 semanas · **Dependências:** MVP-00 (Cadastros de Produtos, Clientes e Máquinas), MVP-01 (Índices de Reposição de Mercado), MVP-02 (Consulta a Retalhos e Estoque)  
**Telas de referência:** `docs/telas/metalagents_vendas_or_amentos_r_pidos_nesting_de_corte`
**Regras de implementação:** ⛔ conformidade obrigatória com [`docs/regras-frontend.md`](../regras-frontend.md)

---

## 1. Objetivo

Acelerar radicalmente o ciclo de vendas e orçamentos para corte sob medida de ferro, aço e alumínio. Substituir planilhas lentas e manuais por um calculador determinístico de peso teórico, tempo de máquina (laser, plasma, oxicorte, serra, guilhotina, dobra) e perdas de corte. Aplicar **precificação preventiva** baseada no custo de reposição atualizado pelo mercado (MVP-01) e gerar propostas comerciais em PDF com validade dinâmica vinculada à volatilidade dos insumos.

**Valor entregue:** Reduzir o tempo de elaboração de um orçamento complexo de 40 minutos para menos de 3 minutos, protegendo a margem contra vendas abaixo do custo de reposição.

---

## 2. Decisões Técnicas (fechadas)

| Tema | Decisão |
|---|---|
| Cálculo Metalúrgico | **100% Determinístico e Auditável em Código** (`lib/metalurgy/cut-calculator.ts`). Nenhum LLM é utilizado para calcular peso, preço ou margem |
| Fórmulas de Peso Teórico | - Chapa: $L \times C \times E \times \text{Densidade} \times 10^{-6}$<br>- Barra Redonda: $\pi \times (D/2)^2 \times C \times \text{Densidade} \times 10^{-6}$<br>- Tubo Redondo: $(OD - \text{Parede}) \times \text{Parede} \times 0{,}02466 \times C$ (para aço)<br>- Perfil estrutural: $\text{Peso/metro tabelado} \times C$ |
| Perda de Material | Estimativa por Bounding Box + Kerf de corte da máquina selecionada (laser: 1.5mm, plasma: 3mm, serra: 4mm, oxicorte: 5mm) |
| Custo de Reposição Dinâmico | Preço-base de reposição do produto atualizado pelo delta percentual do índice de mercado (M1) desde a última compra |
| Geração de PDF | `@react-pdf/renderer` executado no servidor com layout limpo e profissional, upload automático para Cloudflare R2 |
| Validade Dinâmica da Proposta | Calculada com base na volatilidade do ativo (M1): Mercado calmo = 5 a 7 dias; Mercado volátil (> 3% variação semanal) = 48 a 72 horas |
| Aprovação de Margem | Orçamentos com margem bruta inferior à mínima cadastrada ou preço de venda < custo de reposição entram em status `BLOQUEADO_MARGEM` exigindo liberação do diretor |

---

## 3. User Stories e Critérios de Aceite

### US-01 — Calculador Rápido de Geometria e Peso Teórico
Como **vendedor**, quero informar as dimensões e formato da peça cortada e obter instantaneamente o peso bruto, peso líquido e sucata gerada.

- Formatos suportados:
  - Chapa Cortada Retangular (Comprimento x Largura x Espessura)
  - Disco / Flange (Diâmetro Externo x Diâmetro Interno x Espessura)
  - Barra / Tarugo Seccionado (Diâmetro x Comprimento de Corte)
  - Tubo Cortado (Diâmetro x Espessura Parede x Comprimento)
- Preenchimento inteligente com densidade automática conforme a liga (Aço Carbono: 7,85 g/cm³, Inox 304: 7,90 g/cm³, Alumínio 5052: 2,70 g/cm³).
- Cálculo em tempo real de:
  - **Peso Líquido:** Peso exato da peça acabada.
  - **Peso Bruto:** Peso do bloco/blanque original consumido (incluindo kerf de corte).
  - **Perda / Sucata:** Diferença em kg e percentual (%).
- **Aceite:** Margem de erro do peso teórico < 0,5% em comparação com as tabelas técnicas de usina (Gerdau/Usiminas/Alcoa).

### US-02 — Composição de Custos de Processo e Máquinas
Como **vendedor**, quero incluir operações de corte e conformação com custo/hora parametrizado por máquina.

- Seleção de máquina/processo cadastrado no M0 (Laser Fibra, Oxicorte CNC, Plasma HD, Guilhotina Hidráulica, Serra de Fita, Dobradeira).
- Cálculo do custo do serviço:
  - Tempo estimado de setup (minutos fixos) + Tempo de corte por metro linear ou por golpe/corte.
  - $\text{Custo de Processo} = \text{Tempo Total (horas)} \times \text{Custo Hora da Máquina}$.
- Possibilidade de adicionar serviços de terceiros (ex: zincagem, tratamento térmico, jateamento) como custo adicional.
- **Aceite:** Custo de fabricação calculado automaticamente e somado ao custo de matéria-prima.

### US-03 — Precificação com Proteção de Margem (Preço de Reposição)
Como **diretor comercial**, quero que os orçamentos utilizem o custo de reposição mais recente para evitar descapitalização.

- Alerta visual no formulário de orçamento:
  - *Custo Histórico no Estoque:* R$ 6,80/kg
  - *Custo de Reposição Atual (Mercado M1):* R$ 7,45/kg (+9,5%)
- Campo de Margem Bruta Alvo (% ou R$/kg). O sistema sugere o Preço Mínimo de Venda.
- Bloqueio Preventivo: Se o vendedor tentar aplicar preço que resulte em margem negativa sobre o custo de reposição, o botão de emissão é desabilitado e um pedido de alçada gerencial é criado.
- **Aceite:** Nenhuma proposta abaixo da margem mínima permitida é emitida sem a aprovação explícita do diretor.

### US-04 — Matching Integrado com Catálogo de Retalhos (M2)
Como **vendedor**, quero verificar se há sobras de corte no estoque antes de cotar uma chapa inteira nova.

- Ao adicionar um item, o sistema realiza busca automática nos retalhos disponíveis (MVP-02).
- Notificação na linha do item: *"Há 2 retalhos compatíveis no estoque (#RET-081 e #RET-114). Deseja cotar com preço de retalho?"*
- O uso de retalho permite aplicar desconto ao cliente e ainda aumentar a margem da distribuidora (material que seria sucateado).
- **Aceite:** Selecionar um retalho associa o item ao ID do retalho e reserva o material provisoriamente.

### US-05 — Geração e Envio da Proposta Comercial em PDF
Como **vendedor**, quero gerar um PDF com layout profissional com 1 clique para enviar ao cliente.

- Cabeçalho com logo da distribuidora, dados do cliente, canal de atendimento (WhatsApp, E-mail, Balcão).
- Tabela de itens com especificação detalhada (Norma, Liga, Dimensões, Peso, Quantidade, Preço Unitário e Total).
- Cláusula de Validade Preventiva: *"Proposta válida até DD/MM/AAAA às 18h00 devido à volatilidade de mercado do metal"*.
- Condições comerciais: Prazo de entrega, local de retirada/frete, condição de pagamento e dados bancários/PIX.
- Armazenamento automático do arquivo PDF no Cloudflare R2 com link compartilhável seguro.
- **Aceite:** PDF gerado em menos de 3 segundos com rendering perfeito e link disponível para download ou cópia.

### US-06 — Funil de Vendas e Conversão em Pedido
Como **vendedor/gerente**, quero acompanhar o status de cada orçamento emitido.

- Status da proposta: `RASCUNHO`, `ENVIADO`, `EM_NEGOCIACAO`, `APROVADO`, `PERDIDO`, `EXPIRADO`.
- Ação "Converter em Pedido de Venda":
  - Cria o Pedido de Venda simplificado no sistema.
  - Baixa a reserva de retalhos (tornando-os `consumidos`).
  - Prepara a requisição para o chão de fábrica (Fase 2).
- Motivo de perda obrigatório ao marcar como `PERDIDO` (ex: Preço da concorrência, Prazo de entrega, Desistência da obra).
- **Aceite:** Ciclo completo de orçamento aprovado virando pedido com atualização de saldo em < 5 cliques.

---

## 4. Modelo de Dados (Drizzle ORM)

```ts
// Propostas / Orçamentos
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quoteNumber: serial("quote_number").notNull().unique(), // #1001, #1002...
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  sellerId: uuid("seller_id").notNull().references(() => users.id),
  channel: varchar("channel", { length: 30 }).default("whatsapp").notNull(), // 'whatsapp', 'email', 'phone', 'counter'
  status: varchar("status", { length: 30 }).default("rascunho").notNull(), // 'rascunho', 'bloqueado_margem', 'enviado', 'aprovado', 'perdido', 'expirado'
  totalMaterialCost: numeric("total_material_cost", { precision: 12, scale: 2 }).notNull(),
  totalProcessCost: numeric("total_process_cost", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalFreightCost: numeric("total_freight_cost", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  grossMarginPct: numeric("gross_margin_pct", { precision: 5, scale: 2 }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  pdfFileKey: varchar("pdf_file_key", { length: 255 }),
  lossReason: varchar("loss_reason", { length: 100 }),
  approvedByDirectorId: uuid("approved_by_director_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Itens da Proposta (Peças Cortadas / Produtos Padrão)
export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  remnantId: uuid("remnant_id").references(() => stockRemnants.id), // Se atendido por retalho
  geometryType: varchar("geometry_type", { length: 30 }).notNull(), // 'CHAPA_RETANGULAR', 'DISCO', 'BARRA_CORTE', 'TUBO_CORTE', 'PADRAO'
  thicknessMm: numeric("thickness_mm", { precision: 8, scale: 2 }).notNull(),
  widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
  lengthMm: numeric("length_mm", { precision: 8, scale: 2 }),
  diameterMm: numeric("diameter_mm", { precision: 8, scale: 2 }),
  quantity: integer("quantity").notNull(),
  netWeightKg: numeric("net_weight_kg", { precision: 10, scale: 3 }).notNull(),
  grossWeightKg: numeric("gross_weight_kg", { precision: 10, scale: 3 }).notNull(),
  scrapPct: numeric("scrap_pct", { precision: 5, scale: 2 }).default("0.00").notNull(),
  unitMaterialCost: numeric("unit_material_cost", { precision: 12, scale: 4 }).notNull(),
  unitProcessCost: numeric("unit_process_cost", { precision: 12, scale: 4 }).default("0.00").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalItemAmount: numeric("total_item_amount", { precision: 12, scale: 2 }).notNull(),
  itemMarginPct: numeric("item_margin_pct", { precision: 5, scale: 2 }).notNull(),
  machineId: uuid("machine_id").references(() => machines.id),
  estimatedCutTimeMinutes: numeric("estimated_cut_time_minutes", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Pedidos de Venda Simplificados (Conversão de Proposta)
export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderNumber: serial("order_number").notNull().unique(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  orderStatus: varchar("order_status", { length: 30 }).default("aguardando_producao").notNull(), // 'aguardando_producao', 'em_corte', 'pronto_faturamento', 'entregue', 'cancelado'
  deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 5. Rotas e APIs

| Rota / Ação | Método | Papel | Descrição |
|---|---|---|---|
| `/vendas/orcamentos` | GET (Page) | Leitura | Listagem e funil de propostas comerciais |
| `/vendas/orcamentos/novo` | GET (Page) | Vendedor/Admin | Tela de montagem de orçamento e corte |
| `/vendas/orcamentos/[id]` | GET (Page) | Leitura | Detalhe da proposta com abas de itens, composição de custo e condições |
| `/vendas/orcamentos/[id]/editar` | GET (Page) | Vendedor/Admin | Edição de propostas em `rascunho` ou `bloqueado_margem` |
| `/api/quotes` | GET / POST | Leitura / Vendedor | Lista paginada com KPIs do funil; cria nova proposta |
| `/api/quotes/[id]` | GET / PUT | Leitura / Vendedor | Carrega ou atualiza uma proposta editável |
| `/api/quotes/preview` | POST | Vendedor/Admin | Reprecifica o rascunho sem persistir (usado pelo builder) |
| `/api/quotes/calculate-geometry` | POST | Vendedor/Admin | Calcula peso, perda e tempo de corte de uma geometria |
| `/api/quotes/remnant-matches` | GET | Leitura | Busca retalhos compatíveis com as dimensões do item |
| `/api/quotes/[id]/status` | POST | Vendedor/Admin | Aplica transição de status (motivo obrigatório em `perdido`) |
| `/api/quotes/[id]/approve-margin` | POST | Diretor/Admin | Libera proposta travada por margem insuficiente |
| `/api/quotes/[id]/generate-pdf` | POST | Vendedor/Admin | Gera o PDF no servidor, grava no R2 (ou `.data/quotes` em dev) e retorna a URL |
| `/api/quotes/[id]/convert-to-order` | POST | Vendedor/Admin | Converte a proposta aprovada em Pedido de Venda e consome retalhos |
| `/api/files/download` | GET | Leitura | Baixa o PDF gerado, restrito ao prefixo do tenant |

---

## 6. Mapeamento de Telas (Mockups vs. Implementação)

| Mockup Referência | Página na Aplicação | Adaptações |
|---|---|---|
| `docs/telas/metalagents_vendas_or_amentos_r_pidos_nesting_de_corte` | `/vendas/orcamentos` e `/vendas/orcamentos/novo` | Implementa a tabela de propostas ativas com margem líquida, badges de canal e status; Drawer lateral de cálculo geométrico com inputs dimensionais e resumo em tempo real. |

---

## 7. Fora do Escopo do MVP-03

- Nesting 2D complexo com rotação de peças poligonais irregulares (SVGnest / no-fit polygon) — Fase 2.
- Exportação direta de código G-Code / CNC para as máquinas de corte.
- Disparo automático de WhatsApp pelo sistema (o vendedor copia o link/PDF e cola no WhatsApp manual no MVP).
- Módulo de comissões avançadas por vendedor.

---

## 8. Critérios de Aceite (Checklist Final do PRD)

- [x] Cálculo de peso teórico para chapas, discos, barras e tubos com erro < 1% vs. tabela oficial de usina. — fórmulas fechadas e 17 testes; falta comparar com tabela de usina real (§10.3).
- [x] Orçamento completo com 3 itens e serviços de corte gerado em menos de 3 minutos. — prévia responde em < 1 s por item; smoke montou e salvou proposta em ~40 s.
- [x] Bloqueio automático de propostas com margem abaixo da política ou abaixo do custo de reposição.
- [x] Geração de PDF elegante via `@react-pdf/renderer` armazenado com segurança no Cloudflare R2. — caminho R2 implementado; validado apenas com o fallback local (§10.3).
- [x] Matching automático de retalhos funcionando ao digitar dimensões compatíveis.
- [x] Conversão de orçamento em pedido de venda executada com sucesso.

---

## 9. Tarefas de Implementação

1. **Biblioteca Metalúrgica Pura:** Implementar `lib/metalurgy/weight-formulas.ts` com cobertura total de testes unitários para todas as formas geométricas.
2. **Migrations Drizzle:** Criar tabelas `quotes`, `quote_items` e `sales_orders`.
3. **Formulário Dinâmico de Orçamento:** Montar a interface em React com React Hook Form + Zod, cálculo instantâneo e drawer de peças.
4. **Integração de Custo de Reposição:** Conectar os produtos do orçamento aos índices de mercado do MVP-01.
5. **Integração com Retalhos (M2):** Adicionar chamada de busca dimensional nos retalhos disponíveis durante a inclusão do item.
6. **Gerador de PDF de Proposta:** Criar template `@react-pdf/renderer` com a identidade visual da distribuidora e upload para o Cloudflare R2.
7. **Fluxo de Aprovação de Margem:** Implementar notificação e tela de liberação para o Diretor/Gerente Comercial.
8. **Conversão em Pedido:** Implementar transação atômica que reserva estoque e gera o pedido de venda.

---

## 10. Estado da implementação (02/11/2026)

> **Situação:** 🟢 implementado e validado localmente (API + UI), **aguardando homologação**. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` e 65 testes Vitest passam. O smoke autenticado cobriu o fluxo completo e as telas foram inspecionadas em 1440×900 no tema escuro. Os dados de teste foram removidos do banco de dev ao final.

### 10.1 Tarefas da seção 9

| # | Tarefa | Estado |
|---|---|---|
| 1 | Biblioteca metalúrgica | ✅ `lib/metallurgy/weight-formulas.ts` — chapa retangular, disco, barra e tubo (+ `PADRAO`), densidades (aço 7,85 / inox 7,90 / alumínio 2,70 g/cm³), kerf por processo (laser 1,5 / plasma 3 / serra 4 / oxicorte 5 mm) e tempo de corte; 17 testes |
| 2 | Migrations | ✅ `0004_fat_james_howlett.sql` (`quotes`, `quote_items`, `sales_orders`) e `0005_lazy_ben_grimm.sql` (`target_margin_pct`, `discount_pct`) |
| 3 | Formulário dinâmico | ✅ `/vendas/orcamentos/novo` e `/editar`; drawer geométrico com prévia local e recálculo no servidor (`/api/quotes/preview`, debounce de 350 ms) |
| 4 | Custo de reposição | ✅ `lib/quotes/replacement-cost.ts` + `market-delta.ts`; índices `LME-ALU` (alumínio) e `CME-HRC` (aço/inox), delta semanal limitado a ±20% e normalização de unidade para R$/kg |
| 5 | Retalhos (M2) | ✅ `/api/quotes/remnant-matches`; reserva dentro da transação do orçamento (`SELECT … FOR UPDATE`), liberação em `perdido`/`expirado` e consumo na conversão |
| 6 | Gerador de PDF | ✅ `lib/quotes/pdf/*` com `@react-pdf/renderer`; R2 quando as 4 variáveis existem, fallback local em `.data/quotes` + `/api/files/download` (prefixo do tenant e bloqueio de traversal). O PDF do cliente não expõe margem |
| 7 | Aprovação de margem | ✅ `POST /api/quotes/[id]/approve-margin` restrito a diretor/admin (`guardMarginApproval`); grava `approvedByDirectorId`/`approvedAt` e devolve a `rascunho` |
| 8 | Conversão em pedido | ✅ `POST /api/quotes/[id]/convert-to-order` transacional, bloqueia conversão duplicada e consome retalhos; o número do pedido aparece na lista e no detalhe |

### 10.2 Desvios e decisões em relação à spec

| Tema | Spec | Implementado | Motivo |
|---|---|---|---|
| Margem mínima | "margem bruta" sem denominador | `(preço − custo) / preço` | convenção comercial; custo = material + máquina |
| Peso pago | não definido | chapa virgem cobra peso **bruto** (kerf/sucata pagos); retalho cobra só o peso líquido a 65% da reposição | cobrar a perda apenas no material virgem |
| Índice por família | atualização "pelo mercado" | alumínio → `LME-ALU`; aço/inox → `CME-HRC` | únicos índices correlatos disponíveis no MVP-01 |
| Delta de mercado | atualização pelo mercado | delta semanal limitado a ±20% | evitar preço absurdo em série curta |
| Validade dinâmica | 5–7 dias calmo; 48–72 h volátil (> 3%/semana) | ≤ 1,5% → 7 dias (até 18h); 1,5–3% → 72 h; > 3% → 48 h | usa a maior volatilidade entre os itens do orçamento |
| Unidade do custo de reposição | `replacement_cost_base` em R$/kg | lido direto como R$/kg; só o custo de **lote** (por unidade de estoque) é convertido, por `lib/stock/units.ts` | corrigido em 02/11/2026: o campo passou a ser sempre R$/kg (antes o M2 gravava por `t`/`un` e o M3 normalizava na leitura) |
| `aprovado` | status do funil | significa **cliente aprovou**; a liberação interna de margem volta a `rascunho` | separa alçada interna de aceite do cliente |
| Funil na API | spec lista os status, sem grafo de transições | `enviado → aprovado` só passa por `em_negociacao` (o atalho existia e foi fechado) | UI e API contam a mesma história; o aceite fica registrado na etapa de negociação |
| Piso de reposição | bloqueio de margem | diretor libera margem abaixo da política, **nunca** preço abaixo do custo de reposição | proteção contra venda com prejuízo real |
| Edição | não definida | somente `rascunho`/`bloqueado_margem`; editar reprecifica com a reposição do momento | evita reabrir proposta enviada/aprovada e descartar o aceite |
| Expiração | status `EXPIRADO` | `expired` calculado pelo relógio + selo "Fora da validade"; transição manual para `expirado` | não há worker de expiração no MVP |
| Status do pedido | `aguardando_producao`, `em_corte`, … | rótulos PT-BR centralizados (`ORDER_STATUS_LABELS`) | consistência entre lista, detalhe e PDF |
| Modalidade de entrega | não definida | **obrigatória** no builder e no contrato de criação/edição (`min 1`); a prévia aceita vazio | a proposta não pode sair sem a modalidade; a prévia roda enquanto o vendedor digita |
| Valores em R$ | não definido | máscara pt-BR (`1.234,56`) em todo campo monetário; percentuais e PTAX sem máscara | evitar erro de leitura/typing de `1.234,56` como `1,234` |
| Modalidade ausente no PDF | não definido | `A combinar` (não inventa `Retirada no balcão`) | mesmo tratamento dos demais campos livres |

### 10.3 Pendências e dívidas técnicas

1. **R2 real não exercitado** — sem credenciais, o smoke usou o fallback local. Homologar upload/download em bucket real e definir retenção; o fallback `.data` não deve rodar em produção sem volume persistente.
2. ~~**Normalização do custo de reposição** na borda do MVP-03~~ ✅ resolvido em 02/11/2026 (débito OR2): `replacement_cost_base` é sempre R$/kg e `normalizeReplacementCostPerKg` foi removida. Conversões em `lib/stock/units.ts`.
3. **Sem testes de integração de rota/serviço** — a cobertura é unitária (motor, precificação, delta, normalização, storage) + smoke manual. Falta automatizar reserva/consumo de retalho e conversão contra Postgres.
4. **Edição reprecifica** — `manualUnitPrice` não é restaurado ao abrir a edição, então um preço manual do rascunho é substituído pelo preço sugerido. Se o PI quiser preço congelado, persistir o override por item.
5. **Expiração não automática** — não há job marcando `expirado`; o vendedor precisa encerrar manualmente. Definir cron se o funil exigir.
6. **Sem envio automático da proposta** — o PDF é baixado e enviado manualmente (fora do escopo declarado).
7. **Validação metrológica** — falta comparar as fórmulas com tabela oficial de usina; os testes comparam com cálculo manual.

### 10.4 Evidências

- `pnpm lint`, `pnpm exec tsc --noEmit` e `pnpm build` passam; **129 testes** Vitest (13 arquivos): 17 de metalurgia, 29 de precificação/status, 11 de delta de mercado, 5 de normalização de reposição, 3 de armazenamento (traversal e content-type), 16 da máscara de moeda e o restante da plataforma.
- **Máscara de moeda (smoke de browser):** frete `1234567` → `1.234.567`, serviços `1250,5` → `1.250,5`, usina nacional `4321.5` → `43.215` (ponto é milhar: só a vírgula é decimal), porto `98765` → `98.765`. Os helpers (`sanitize`/`format`/`parse`/`toText`) são puros, ficam em `lib/utils.ts` e têm teste de ciclo digitar → exibir → ler sem deriva.
- **Modalidade obrigatória (smoke de API):** `POST /api/quotes` sem `deliveryMethod` → 422 `expected string, received undefined`; com `"   "` → 422 `Informe a modalidade de entrega.`; com valor → 200 e orçamento criado. No builder, salvar sem modalidade é bloqueado por toast e o select abre em *"Selecione a modalidade"*.
- **Condição de pagamento na conversão:** `convert-to-order` copia `quote.payment_terms` para `sales_orders` (o orçamento #1017 com *À vista (PIX)* gerou o pedido #9 com o mesmo valor). Pedidos com `payment_terms` nulo vêm de orçamentos criados por script sem o campo — não é perda na conversão.
- **Smoke de API** (PowerShell, sessão autenticada): prévia A36 ≈ R$ 5,55/kg com validade de 72 h → criação → transição inválida 400 → `enviado` → `em_negociacao` → `aprovado` → PDF local → pedido gerado → conversão duplicada 400 → matching e reserva de `RET-8942` → perda libera o retalho → bloqueio a 10% de margem → liberação pelo diretor → `rascunho` → `RET-8943` consumido na conversão → busca por número do orçamento.
- **Guarda de edição:** `PUT` em orçamento `enviado` responde 400; orçamento `bloqueado_margem` aceita edição e volta a `rascunho` com a margem recalculada.
- **Guarda de conversão:** com a reserva do retalho removida por fora, `convert-to-order` responde 400 e **nenhum pedido é criado** (transação revertida); com a reserva restaurada, o pedido é gerado e o retalho fica `consumido`.
- **Smoke de UI** (Playwright/REA, Chrome headless, 1440×900, tema escuro): lista vazia com KPIs zerados, builder com drawer (CG-A36-1270, 1000 × 500 × 12,7 mm, 199,390 kg líquido / 200,288 kg bruto, margem 24%), detalhe com as 3 abas, detalhe bloqueado como diretor, tela de bloqueio de edição e PDF final.
- **Migrações:** `pnpm db:migrate` aplica `0004`/`0005` sem erro e é idempotente; `pnpm db:generate` responde *"No schema changes, nothing to migrate"* (schema Drizzle e banco em sincronia, 24 tabelas).
- **Segurança:** o storage recusa traversal (`r2.test.ts`), o download exige o prefixo `quotes/<tenantId>/` e a edição é bloqueada por status no serviço (não só na UI).
