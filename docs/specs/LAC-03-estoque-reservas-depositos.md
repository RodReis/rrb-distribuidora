# SPEC LAC-03 — Estoque reservado, depósitos, QR e sazonalidade

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** implementação local validada em PostgreSQL e aprovação visual do PI · **Dependências:** M2, M3, LAC-01, LAC-02

## Estado da implementação (04/11/2026)

- Base existente: cadastro de depósitos, lotes/movimentos por depósito e previsão de ruptura do MVP-02.
- Implementado nesta etapa: reserva por lote ligada a pedido aprovado, com tenant/status/produto validados; liberação idempotente e trilha auditável; lock concorrente por lote. Saída, ajuste e transferência não consomem saldo reservado. API `/api/stock/reservations`; tela lista, libera e cria reserva. Matriz distingue físico/reservado/disponível e cobertura local; risco/cobertura usam disponível. Transferência atômica via `/api/stock/transfers`, movimentos e lotes pareados, chave idempotente; sem estado em trânsito. Etiquetas de lote/retalho usam token aleatório, persistem somente SHA-256, revogam token anterior e resolvem em `/q/:token` com autenticação/tenant. QR SVG local, sem serviço terceiro. Fixture sintética `lac03-rupture-v1` inclui hash SHA-256 e runner para acurácia, falsos positivos/negativos e empate de cobertura. Perfil sazonal informativo `monthly-average-v1`: média mensal por mês do ano sobre 2 ciclos completos, janela de 24 meses; salva cobertura e execução. Não altera consumo, estoque de segurança nem compra. Migrations `0015_stock_reservations.sql` a `0018_seasonality_runs.sql` e snapshots gerados.
- Reserva comercial não expira automaticamente; cancelamento do pedido libera reservas ativas na mesma transação, com justificativa e auditoria. API `POST /api/stock/orders/:id/cancel`; apenas pedidos em `aguardando_producao` ou `em_corte` podem ser cancelados.
- A tabela de estoque disponível é derivada das reservas ativas e lotes físicos. Retalhos seguem entidade separada; ainda não participam da exclusão mútua de reservas gerais.
- Verificação local: `tsc --noEmit`, Prettier, ESLint focal, `drizzle-kit generate` (sem diferenças de schema), `git diff --check` e build de produção passaram. Migrations locais pendentes foram aplicadas ao `metalagents` e reexecutadas com sucesso. Integração PostgreSQL: 6/6 passaram, cobrindo conversão, idempotência, concorrência, cancelamento com liberação/auditoria, transferência idempotente, rotação/resolução de etiqueta e sazonalidade com 24 meses. Fixture `lac03-rupture-v1`: 5/5 casos elegíveis corretos, 0 falsos positivos/negativos; resultado vale somente para corpus sintético. `predictive-engine.test.ts`: 19/19 passaram. QR validado na geração/resolução de token; leitura por câmera e impressão física não verificadas. Em 04/11/2026, PI aprovou visualmente modal de reserva tokenizado e QR visível na etiqueta.

## Objetivo e escopo

Complementar M2 com reserva de material para pedidos de venda, matriz multi-depósito, transferências, QR rastreável e sazonalidade de demanda. Saldo físico, reservado e disponível são medidas distintas: `disponível = físico - reservas ativas`; a operação não pode comprometer estoque já reservado.

## Regras de negócio

- Reserva nasce de pedido de venda confirmado (M3), vinculada a produto, depósito, lote e quantidade; orçamento não aprovado não reserva estoque geral. Reservas de retalho existentes conservam sua entidade/regra própria, mas compartilham exclusão mútua do saldo.
- Alocação escolhe depósito/lote pelo operador nesta versão; não inventar FIFO/FEFO sem decisão. Quantidade reservada não excede saldo disponível. Cancelamento/expiração libera por evento auditável.
- Transferência é movimento pareado origem/destino, com trânsito opcional se houver expedição/recebimento em momentos distintos. Ambos os lados são atômicos ou têm estado em trânsito reconciliável; não criar estoque líquido.
- Matriz mostra estoque e cobertura por depósito e consolidado, distinguindo cobertura local da consolidada. Não prometer venda a partir de estoque em outro depósito sem prazo de transferência.
- QR codifica identificador aleatório/URL opaca, nunca dados de cliente, custo ou credencial. Resolver QR exige autenticação e permissão; etiqueta anulada não volta a ser válida. QR de lote e retalho aponta para a ficha corrente e histórico autorizado.
- **Decisão PI (04/11/2026):** mínimo de 2 ciclos anuais completos. Método v1 calcula média de cada mês do calendário com 2 observações anuais e índice sazonal relativo à média global mensal. Janela móvel usa os 24 meses completos anteriores; cada mês precisa ter ao menos um movimento registrado para comprovar observação. Cobertura incompleta ou consumo total zero = “dados insuficientes”. Resultado não muda consumo, segurança ou sugestão.

## Dados e rotas

`stock_reservations(tenant_id, source_type, source_id, product_id, lot_id, warehouse_id, quantity, status, reserved_by, released_at)`; `stock_transfers(tenant_id, number, from_warehouse, to_warehouse, status, created_by)`; `stock_transfer_items(transfer_id, lot_id, quantity)`; `stock_labels(tenant_id, object_type, object_id, token_hash, status, issued_at, revoked_at)`; `seasonality_runs(tenant_id, product_id, method_version, window, coverage, result, calculated_at)`.

APIs: `/api/stock/reservations` POST/DELETE (`stock.reserve/release`); `/api/stock/transfers` POST e `/:id/dispatch|receive|cancel`; `/api/stock/labels` POST e `/resolve/:token` GET; `/api/stock/matrix` aceita dimensão depósito; sazonalidade leitura. Toda mutação confere tenant, estado e saldo sob lock/transação.

## Aceite

- Concorrência de duas reservas sobre saldo 10 e pedidos 7+5 permite no máximo total 10; operação rejeitada não deixa reserva parcial.
- Cancelar pedido libera apenas sua reserva; retalho não pode ser reservado simultaneamente por pedido e orçamento.
- Transferir 5 unidades diminui origem e aumenta destino uma única vez; repetição idempotente não duplica.
- Matriz diferencia físico/reservado/disponível por depósito e consolidado, sem somar quantidades em trânsito como disponíveis.
- QR revogado retorna inválido; usuário não autenticado não recebe detalhe; token não revela ID sequencial.
- Cenário de ruptura usa fixture versionada (SKUs e casos elegíveis), incluindo histórico ausente, consumo zero, lead time ausente, saldo negativo, reservado e empate. Métrica: corretos/elegíveis, com falsos positivos/negativos e hash da fixture; 100% vale somente para esse corpus.
- Sazonalidade informa cobertura e não retorna previsão quando não há ciclos suficientes conforme parâmetro aprovado.

## UI, fora de escopo, decisões

Painel por depósito, modal de reserva, fluxo de transferência e ficha imprimível com QR. Fora: otimização automática de alocação, roteirização, inventário via câmera offline e estoque em trânsito de importação (LAC-10). Regras acordadas: alocação manual; reserva sem expiração automática e liberada ao cancelar pedido; perfil sazonal exige dois ciclos anuais completos. Dependência de eventos de venda e granularidade de movimento deve ser compatibilizada com schema M2.
