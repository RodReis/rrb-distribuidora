# SPEC LAC-01 — Compras operacionais e aprovação humana

**Projeto:** MetalAgents · **Versão:** 1.1 · **Data:** 03/11/2026  
**Status:** implementada localmente em 03/11/2026 (schema, serviço, API, telas, testes); **não homologada**. A emissão permanece bloqueada até o PI configurar e aprovar a matriz de alçadas (§3). A aprovação formal dos parâmetros de negócio continua pendente — ver §13.  
**Dependências:** M0 (usuários, fornecedores, produtos, depósitos, RBAC), M2 (lotes e movimentos), LAC-13 (autorização), LAC-15 (auditoria íntegra)  
**Complementos:** RFQ/comparativo multi-fornecedor e integração externa permanecem em etapa posterior/Fase 2, conforme plano.  
**Regras de interface:** seguir [`../regras-frontend.md`](../regras-frontend.md).

---

## 1. Objetivo

Permitir que um comprador autorizado crie manualmente pedido de compra (PC), solicite aprovação humana conforme alçada configurada, emita o pedido aprovado ao fornecedor e acompanhe confirmações e recebimentos parciais/totais. O recebimento atualiza estoque por lote e movimento com referência obrigatória ao PC e não pode ser usado para contornar aprovação.

O módulo entrega a primeira origem transacional para custo/preço médio pago, mantendo proveniência até os relatórios do M1. Não implementa RFQ, comparativo automático, contas a pagar, fiscal ou envio automático por WhatsApp/e-mail.

## 2. Decisões e invariantes

| Tema | Regra desta SPEC |
|---|---|
| Moeda | MVP aceita BRL apenas. Importação ou moeda estrangeira exige etapa futura com custo desembarcado definido. |
| Quantidade e preço | Valores positivos, unidade compatível com o produto; preço unitário e totais persistidos como decimal, sem `float` binário. |
| Estado inicial | `rascunho`; não reserva estoque, não altera saldos nem informa fornecedor. |
| Aprovação | Pedido não pode ser emitido antes de aprovação humana válida. Nenhum usuário ou job pode chamar a rotina de emissão ignorando esse gate. |
| Conteúdo aprovado | Aprovação vincula versão/hash dos cabeçalhos e itens. Qualquer mudança material invalida aprovações anteriores e retorna o PC a `rascunho`. |
| Segregação | Criador não pode aprovar o próprio pedido. Admin também não contorna essa regra; deve haver outra pessoa ativa com permissão de aprovador. |
| Emissão | A emissão é uma ação explícita após aprovação, grava ator e instante e gera número interno único. Envio externo automático não faz parte desta SPEC. |
| Estoque | Somente recebimento confirmado cria lote/movimento. Criar ou aprovar PC não altera saldo. Cada recebimento parcial referencia PC e item, depósito e usuário. |
| Fornecedor padrão | Não inferir fornecedor a partir do primeiro lote. Enquanto LAC-02 não existir, comprador escolhe fornecedor em cada PC. |
| Mínimo de compra | Campo opcional no item de produto/fornecedor fica reservado à LAC-02. Nesta SPEC, valor ausente não arredonda quantidade; comprador registra a quantidade negociada manualmente. |
| Sugestão M2 | “Gerar pedido” abre formulário pré-preenchido em rascunho, com vínculo à sugestão. Não emite, não aprova e não reserva nada. Se a integração M2 for feita depois, preservar essa semântica. |
| Auditoria | Registrar criação, edição, submissão, aprovação, rejeição, cancelamento, emissão, follow-up e recebimento, inclusive falhas de autorização. Segredos e dados de pagamento não entram na trilha. |

## 3. Decisões de negócio ainda exigidas

Não há dado no PRD/plano para fixar faixas monetárias. Portanto, alçada não tem default numérico nesta SPEC. Antes de ativar emissão em produção, o PI deve aprovar uma matriz versionada com: papel/permissão aprovadora, faixa inclusiva/exclusiva em BRL, eventual quantidade de aprovadores, validade da aprovação, substituição e limite de autoaprovação (a regra atual proíbe autoaprovação em qualquer faixa). Enquanto não houver faixa aplicável, PC pode ser criado e submetido, mas fica `aguardando_alcada_configurada` e emissão permanece bloqueada.

Outras decisões para homologação: dados fiscais exigidos no documento externo; regra de preço médio pago (ponderado, componentes incluídos, devoluções e período); se follow-up será manual ou terá lembretes; numeração/identidade visual do PDF; prazo de tolerância e política de excesso/falta no recebimento. A primeira versão registra preço unitário bruto informado e custos adicionais discriminados, mas não os agrega ao preço médio até aprovação da fórmula contábil/comercial.

## 4. Histórias e critérios de aceite

### US-01 — Criar e editar rascunho

Como comprador, quero registrar fornecedor, previsão, itens, quantidades, unidades, preço e custos adicionais discriminados.

- Fornecedor e produto devem pertencer ao tenant e estar ativos.
- Cada item contém descrição congelada no momento do pedido, quantidade, unidade, preço unitário, desconto e observação; totais são calculados no servidor.
- Rascunho pode ser editado e excluído logicamente pelo criador ou comprador autorizado; rascunho vazio não pode ser submetido.
- Aceite: tentativas com tenant alheio, produto inativo, quantidade/preço inválidos ou total inconsistente são rejeitadas sem persistência parcial.

### US-02 — Submeter para aprovação

Como comprador, quero submeter a versão completa do PC para a alçada necessária.

- Submissão congela uma versão do conteúdo e calcula o total em BRL no servidor.
- Resolve alçada pela matriz vigente no instante da submissão. Ausência de faixa aplicável leva a `aguardando_alcada_configurada` e bloqueia emissão.
- Alteração posterior exige nova submissão e nova aprovação.
- Aceite: modificar quantidade, preço, fornecedor, desconto ou custo depois de aprovado invalida a aprovação antiga; tentativa de emitir essa versão responde conflito e não gera documento.

### US-03 — Aprovar ou rejeitar

Como aprovador habilitado, quero aprovar ou rejeitar a versão submetida, com justificativa quando rejeitar.

- A aprovação guarda usuário, papel/permissão efetiva, faixa, versão/hash e timestamp.
- Criador, usuário inativo, usuário sem permissão, tenant diferente e aprovador fora da alçada recebem 403/409 e não criam aprovação.
- Rejeição exige justificativa não vazia e devolve ao estado `rejeitado`; reenvio cria nova versão.
- Aceite: uma aprovação válida só libera a exata versão aprovada e toda decisão é visível no histórico do PC.

### US-04 — Emitir pedido

Como comprador autorizado, quero emitir ao fornecedor o PC aprovado.

- A emissão produz representação imutável (PDF) com empresa compradora, fornecedor, itens, quantidades, preços, totais, entrega e identificador do PC. Enquanto cadastro da distribuidora (LAC-12) não existir, a emissão fica em homologação ou usa os dados provisionados e verificados do tenant; não emitir PDF incompleto como documento final.
- Botão exige confirmação explícita e permissionamento de emissão.
- Endpoint usa chave de idempotência: repetição retorna o mesmo resultado, sem segundo número ou documento.
- Após emitir, mudanças materiais são proibidas; correção requer cancelar com justificativa e criar nova versão/PC.
- Aceite: PC sem aprovação válida, fora da faixa ou cuja versão diverge do hash aprovado não emite por UI nem API.

### US-05 — Acompanhar fornecedor

Como comprador, quero registrar confirmação, previsão atualizada, contato e ocorrência.

- Timeline manual registra data/hora, usuário, tipo, nota e previsão confirmada.
- Follow-up não é enviado automaticamente; lembrete automático depende de decisão posterior.
- Estados de entrega incluem `nao_confirmado`, `confirmado`, `parcialmente_recebido`, `recebido_completo`, `atrasado` e `cancelado`, com atraso derivado da data prometida e relógio configurado do tenant.
- Aceite: registro não altera o PC emitido nem estoque e aparece no histórico auditável.

### US-06 — Receber contra PC

Como estoque, quero registrar recebimento parcial/totais por item e depósito.

- Recebimento só pode apontar para PC emitido não cancelado, item aberto e fornecedor do próprio PC.
- Registra quantidade recebida, lote/corrida quando disponível, custo unitário documentado, depósito, data, documento de referência e usuário.
- Cria lote e movimento `ENTRADA_COMPRA` atomicamente, com `referenceDocument`/FK ao PC e item. Falha em qualquer gravação faz rollback integral.
- Bloqueia quantidade acima do saldo aberto até que a decisão de tolerância/excesso esteja aprovada; esta versão não aceita excesso.
- Estorno não apaga histórico: gera movimento compensatório autorizado, motivo e referência ao recebimento original.
- Aceite: dois recebimentos parciais atualizam saldo corretamente; repetir requisição idempotente não duplica lote/movimento; recebimento de PC não emitido retorna erro e saldo permanece igual.

### US-07 — Consultar e exportar

Como comprador/diretor, quero filtrar PCs e consultar totais, estado, itens e histórico.

- Filtros por estado, fornecedor, período, produto e número; paginação/ordenação server-side.
- CSV exporta a lista filtrada respeitando tenant e permissão; XLSX e comparativo multi-cotação ficam fora desta versão.
- Campo “preço médio pago” é apresentado apenas quando houver fórmula aprovada e registros elegíveis; até lá, fonte manual continua identificada como manual e nunca é silenciosamente sobrescrita.

## 5. Máquina de estados

```text
rascunho → submetido → aprovado → emitido → parcialmente_recebido → recebido_completo
                  ↘ rejeitado → rascunho (nova versão)
submetido/aprovado → cancelado (justificativa e permissão)
emitido → cancelado (justificativa, sem apagar emissão; recebimentos já feitos exigem estorno separado)
rascunho/submetido/aprovado podem aguardar_alcada_configurada; isso nunca permite emitir.
```

Transições são validadas no servidor. Não há mudança direta arbitrária de estado via PATCH.

## 6. Modelo de dados (DDL lógico)

Tipos monetários `numeric(14,4)` para preço unitário/custos e `numeric(16,2)` para total BRL; quantidades `numeric(12,4)`. IDs UUID, `tenant_id`, `created_by` e timestamps em todas as tabelas.

```text
purchase_orders(
 id, tenant_id, number nullable unique-per-tenant, supplier_id,
 status, currency='BRL', expected_delivery_at nullable,
 subtotal, discount_total, additional_costs_total, grand_total,
 current_version, approved_version_hash nullable,
 created_by, submitted_at, approved_at, issued_at, cancelled_at,
 cancellation_reason nullable, created_at, updated_at
)
purchase_order_items(
 id, tenant_id, purchase_order_id, product_id,
 product_description_snapshot, quantity_ordered, quantity_received default 0,
 unit, unit_price, discount_amount default 0, additional_costs jsonb,
 line_total, notes nullable, created_at, updated_at
)
purchase_order_versions(
 id, tenant_id, purchase_order_id, version, content jsonb, content_hash,
 created_by, created_at, unique(purchase_order_id, version)
)
purchase_approval_rules(
 id, tenant_id, version, min_total, max_total nullable, currency='BRL',
 approver_permission, required_approvals default 1, active_from, active_until nullable,
 created_by, approved_by nullable, created_at
)
purchase_approvals(
 id, tenant_id, purchase_order_id, order_version, content_hash,
 rule_version, decision enum(approved,rejected), actor_user_id,
 justification nullable, decided_at
)
purchase_events(
 id, tenant_id, purchase_order_id, item_id nullable, event_type,
 actor_user_id, payload jsonb, idempotency_key nullable, created_at
)
purchase_receipts(
 id, tenant_id, purchase_order_id, purchase_order_item_id, lot_id,
 warehouse_id, quantity, unit, unit_cost, received_at,
 supplier_document_reference nullable, received_by, reversed_by nullable,
 reversal_reason nullable, idempotency_key, created_at
)
```

Regras relacionais: FK composta com `tenant_id` para impedir referências cross-tenant; quantidade recebida total não pode exceder a pedida; uma aprovação por aprovador/versão/decisão; `idempotency_key` única por tenant/ação. Aplicar constraints e transação, não apenas validação de formulário. A trilha `purchase_events` registra eventos do domínio; a trilha de auditoria inviolável mais ampla é LAC-15.

### Preço médio pago

Não gravar agregado irreversível no PC. LAC-05 deverá derivá-lo de itens recebidos, com fórmula aprovada, janela e unidade normalizada por produto. Componentes discriminados nesta SPEC: preço, desconto e custos adicionais. Sem definição se frete/impostos entram, o agregado automático permanece desabilitado. Devoluções/estornos referenciam recebimentos e não apagam dados originais.

## 7. Rotas e autorização

| Rota | Método | Permissão proposta | Comportamento |
|---|---|---|---|
| `/compras` | GET | `purchase.read` | Lista e filtros |
| `/api/purchases` | POST | `purchase.create` | Cria rascunho |
| `/api/purchases/:id` | GET/PATCH | read/edit + estado permitido | Lê ou altera rascunho |
| `/api/purchases/:id/submit` | POST | `purchase.submit` | Congela versão e resolve alçada |
| `/api/purchases/:id/decision` | POST | `purchase.approve` ou `purchase.reject` | Registra decisão separada |
| `/api/purchases/:id/issue` | POST | `purchase.issue` | Revalida hash/aprovações e emite idempotente |
| `/api/purchases/:id/events` | POST | `purchase.follow_up` | Confirmação/contato manual |
| `/api/purchases/:id/receipts` | POST | `stock.receive_purchase` | Recebe atomicamente contra item emitido |
| `/api/purchases/:id/cancel` | POST | `purchase.cancel` | Cancela com justificativa |
| `/api/purchases/:id/export` | GET | `purchase.read` | CSV filtrado/PC conforme permissão |
| `/configuracoes/compras/alçadas` | GET/POST | `purchase.configure_approval` | Versiona matriz; mudança exige ator autorizado e motivo |

Os nomes acima são capabilities novas, não inferir de `can_write` genérico. Atualizar a matriz do M0 separadamente como parte da implementação LAC-13. Padrão deny-by-default e checagem no servidor em cada endpoint/action.

## 8. Telas

- `/compras`: tabela com número, fornecedor, total, estado, entrega prometida e ações disponíveis pelo estado.
- `/compras/nova` e `/compras/:id`: formulário/tela de detalhe com itens, totais calculados, timeline, aprovações, recebimentos e documento emitido.
- Caixa “Aprovações pendentes”: só PCs dentro das faixas do usuário; exibe criador, total, versão, justificativa/contexto e diferenças desde submissão (esperado vazio).
- Configuração de alçadas: tabela versionada com validação de faixas sem lacunas/sobreposições para a faixa de ativação; tela não permite ativar conjunto incompleto.
- Do M2, “Gerar pedido” navega para `/compras/nova?fromStockSuggestion=<id>` com campos sugeridos marcados como estimativas e confirmação do comprador.
- Regras de feedback, acessibilidade, estados vazios/erro/carregamento e responsividade seguem `docs/regras-frontend.md`.

## 9. Fora de escopo

RFQ/disparo para vários fornecedores, comparativo, conectores/API de fornecedor, geração/registro de contas a pagar, NF-e/XML fiscal, câmbio/importação, aprovação pelo próprio usuário, envio externo automático, lembretes automáticos, orçamento de compra calculado por score, preço médio final sem fórmula aprovada e recebimento excedente.

## 10. Checklist de aceite

- [ ] Matriz de alçada aprovada e ativa antes de emissão; ausência dela bloqueia todas as emissões.
- [ ] Compra não emite sem aprovação humana válida da versão/hash exatos.
- [ ] Criador não aprova a própria compra; papel/tenant/estado incorretos são negados no servidor.
- [ ] Qualquer edição material invalida aprovação; não há bypass por API, job ou repetição.
- [ ] Emissão idempotente, numerada, auditada e documento reflete exatamente a versão aprovada.
- [ ] Rascunho/aprovação/emissão não altera estoque.
- [ ] Recebimento parcial vinculado a PC emitido cria lote/movimento atomicamente e não duplica sob retry.
- [ ] PC não emitido, cancelado ou de outro tenant não pode gerar entrada.
- [ ] Rejeição/cancelamento/estorno requer justificativa e preserva eventos anteriores.
- [ ] CSV respeita filtro, tenant e autorização; logs não expõem segredos.
- [ ] Testes de concorrência cobrem duas aprovações/recebimentos simultâneos e não excedem quantidade pedida.
- [ ] M1 apresenta proveniência manual versus transacional e não declara preço médio calculado enquanto regra de agregação não for aprovada.

## 11. Tarefas de implementação

1. Aprovar faixas, capabilities por papel, fórmula de custo médio, tolerâncias e dados fiscais/comerciais do documento.
2. Detalhar/fechar LAC-13 e LAC-15; provisionar cadastro validado da empresa via LAC-12.
3. Migrar schema e chaves compostas/constraints; mapear compatibilidade de `stock_movements` do M2.
4. Implementar máquina de estados, versionamento/hash, alçada e idempotência server-side.
5. Construir telas de pedido, fila de aprovação, timeline, recebimento e configuração.
6. Gerar PDF e implementar emissão; ativar apenas após configuração aprovada e homologada.
7. Integrar entrada do M2 por referência imutável ao pedido; retirar/limitar entrada “por compra” sem PC, mantendo ajustes de inventário em fluxo distinto e auditado.
8. Implementar CSV, logs, métricas e testes de permissão, concorrência, transação, retry e tenant.
9. Definir LAC-05 para fórmula/agregado de preço médio e ligar overlay apenas quando aceito.

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Alçada não decidida impede operação | Bloqueio explícito de emissão; PI precisa ativar matriz antes do go-live |
| Entrada manual M2 contorna aprovação | Separar recebimento de compra de ajuste de inventário; toda entrada normal exige PC emitido |
| Aprovação de versão alterada | Hash imutável e revalidação transacional no endpoint de emissão |
| Concorrência duplica emissão/estoque | Chaves de idempotência, constraints e transações |
| Preço médio distorcido por componentes desconhecidos | Persistir componentes e manter agregado automático desligado até regra aprovada |
| Diretor somente leitura no M0 | Capability explícita e usuários aprovadores nomeados; não presumir que role implica alçada |
| PDF sem dados da distribuidora | Bloquear emissão final até LAC-12 fornecer cadastro verificado |

---

## 13. Estado da implementação (03/11/2026)

**Implementado localmente, ainda não homologado.** A emissão continua bloqueada até o PI configurar e aprovar a matriz de alçadas (§3); sem faixa aplicável o PC fica em `aguardando_alcada_configurada` e nenhuma rota emite. Os valores de negócio continuam pendentes — nada foi inferido em código.

### 13.1 O que existe

| Camada | Entrega |
|---|---|
| Banco | migration `0012` com as 7 tabelas do §6, FKs compostas `(id, tenant_id)` para barrar referência cross-tenant, unicidade de número por tenant e sequência `purchase_order_number_seq` (consumida só na emissão) |
| Domínio | `web/src/lib/purchases/`: máquina de estados (§5), hash canônico do conteúdo aprovado, alçada versionada com validação de lacunas/sobreposições, capabilities por papel, precificação no servidor, serviço de rascunho/submissão/decisão/emissão/follow-up/cancelamento, recebimento e estorno atômicos |
| API | `GET/POST /api/purchases`, `GET/PATCH/DELETE /api/purchases/[id]`, `POST .../submit`, `.../decision`, `.../issue`, `.../events`, `.../cancel`, `.../receipts`, `POST /api/purchases/receipts/[receiptId]/reverse`, `GET/POST /api/purchases/approval-rules`, `GET /api/purchases/export` (CSV) e `GET /api/purchases/[id]/pdf` |
| Telas | `/compras` (lista, KPIs, filtros, abas e ações por estado), `/compras/nova`, `/compras/[id]` (abas Itens/Aprovações/Timeline/Recebimentos/Documento), `/compras/[id]/editar` e Configurações › Compras (matriz de alçadas versionada) |
| Integração M2 | “Gerar pedido” da sugestão de compra abre `/compras/nova` com a quantidade sugerida marcada como estimativa; não emite, não aprova e não reserva estoque |
| Testes | regras puras (precificação, hash, estados, capabilities, matriz), fluxo de integração com Postgres real (rascunho → submissão → aprovação → emissão idempotente → edição que invalida aprovação → rejeição → cancelamento) e recebimento/estorno (parcial, retry, excesso, cross-tenant, concorrência) |

### 13.2 Decisões técnicas da implementação

| Tema | Decisão |
|---|---|
| Autorização | capabilities `purchase.*` / `stock.receive_purchase` mapeadas por papel em código (`lib/purchases/capabilities.ts`), negando por padrão. Não deriva de `role_permissions.can_write` (§7); a substituição por autorização configurável fica na LAC-13 |
| Faixas | `min_total` inclusivo e `max_total` exclusivo; última faixa aberta. Matriz sem faixa aplicável ⇒ `aguardando_alcada_configurada` |
| Versão aprovada | hash SHA-256 de JSON canônico (chaves ordenadas, decimais normalizados) gravado em `purchase_order_versions`; a emissão recalcula o hash do conteúdo atual e recusa divergência, inclusive edição feita fora da aplicação |
| Alçada na emissão | além do hash, a emissão exige que a versão da matriz ainda seja a vigente e que as aprovações exigidas existam |
| Idempotência | emissão, recebimento e estorno usam chave por tenant (`purchase_events.idempotency_key` e `purchase_receipts.idempotency_key`); mesma chave + conteúdo diferente ⇒ 409 |
| Numeração | sequência global consumida na emissão, unicidade por tenant (`number` nulo enquanto rascunho) |
| Recebimento | lote + movimento `ENTRADA_COMPRA` + `purchase_receipts` + saldo do item + estado do PC na mesma transação, com `FOR UPDATE` no pedido (serializa concorrência) |
| Estorno | não apaga nada: marca o recebimento e grava movimento compensatório `ESTORNO_COMPRA`; estorno é sempre do recebimento inteiro |
| Documento | PDF do PC emitido com aviso fixo de homologação enquanto a LAC-12 (cadastro fiscal) não existir |
| CSV | lista filtrada, BOM UTF-8, separador `;`, teto de 5.000 linhas com aviso `X-Export-Truncated` |
| Telas de alçada | `/configuracoes?tab=compras` (adaptação da rota `/configuracoes/compras/alçadas` do §7 ao padrão de abas já existente) |

### 13.3 Desvios registrados em relação à SPEC

1. `deleted_at`/`deleted_by` foram adicionados a `purchase_orders` para a exclusão lógica de rascunho exigida no US-01, que não constava do DDL do §6.
2. O vínculo movimento ↔ pedido é feito por `purchase_receipts` (FK para PC e item) mais `referenceDocument = #PC-0001`; não foram criadas colunas novas em `stock_movements` para não alterar o modelo do M2.
3. O cabeçalho do PC não tem campo de observações (a SPEC só prevê observação por item); a timeline cobre o contexto.
4. O estorno parcial de um recebimento não está previsto na SPEC e não foi implementado.
5. A navegação exibe “Compras & RFQ Auto”; o RFQ continua fora desta entrega (Fase 2).
6. A entrada manual de estoque “por compra” do M2 (`recordStockEntry`) continua existindo; restringi-la a PC emitido é a tarefa 7 do §11 e fica para a homologação, para não quebrar fluxos do M2 já em uso.

### 13.4 Checklist de aceite (§10)

| Item | Situação |
|---|---|
| Matriz de alçada aprovada e ativa antes de emissão | 🟡 bloqueio implementado e testado; **aprovação dos valores pelo PI pendente** |
| Emissão só com aprovação válida da versão/hash exatos | ✅ |
| Criador não aprova; papel/tenant/estado negados no servidor | ✅ |
| Edição material invalida aprovação; sem bypass por API/job/retry | ✅ (revalidação de hash na emissão) |
| Emissão idempotente, numerada, auditada e documento da versão aprovada | ✅ |
| Rascunho/aprovação/emissão não altera estoque | ✅ |
| Recebimento parcial atômico e sem duplicar sob retry | ✅ |
| PC não emitido/cancelado/de outro tenant não gera entrada | ✅ |
| Rejeição/cancelamento/estorno com justificativa e histórico preservado | ✅ |
| CSV respeita filtro, tenant e autorização; logs sem segredos | ✅ |
| Concorrência em aprovações e recebimentos | 🟡 recebimentos cobertos por teste; aprovação protegida por constraint/`FOR UPDATE`, sem teste dedicado |
| M1 diferencia preço pago manual × transacional | ⏳ depende da LAC-05 (fórmula aprovada); nada foi alterado no M1 |

### 13.5 Pendências de homologação

1. PI aprovar faixas, aprovadores e quantidades da matriz (sem isso não há go-live de emissão).
2. LAC-12/termos: cadastro fiscal da distribuidora para o PDF deixar de ser “homologação”.
3. LAC-05: fórmula de preço médio pago (componentes, janela, devoluções) e overlay no M1.
4. LAC-13: trocar o mapa de capabilities em código por autorização configurável e revisar MFA/sessão.
5. LAC-15: encadeamento/immutabilidade da trilha (hoje `audit_log` e `purchase_events` são append-only na aplicação).
6. Retirar/limitar a entrada manual “por compra” do M2 (tarefa 7 do §11) depois de validar os fluxos equivalentes no PC.
7. Smoke ao vivo com Playwright e homologação do PDF gerado no ambiente real.

