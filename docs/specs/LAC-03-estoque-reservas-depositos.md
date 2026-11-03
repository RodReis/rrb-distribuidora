# SPEC LAC-03 — Estoque reservado, depósitos, QR e sazonalidade

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M2, M3, LAC-01, LAC-02

## Objetivo e escopo

Complementar M2 com reserva de material para pedidos de venda, matriz multi-depósito, transferências, QR rastreável e sazonalidade de demanda. Saldo físico, reservado e disponível são medidas distintas: `disponível = físico - reservas ativas`; a operação não pode comprometer estoque já reservado.

## Regras de negócio

- Reserva nasce de pedido de venda confirmado (M3), vinculada a produto, depósito, lote e quantidade; orçamento não aprovado não reserva estoque geral. Reservas de retalho existentes conservam sua entidade/regra própria, mas compartilham exclusão mútua do saldo.
- Alocação escolhe depósito/lote pelo operador nesta versão; não inventar FIFO/FEFO sem decisão. Quantidade reservada não excede saldo disponível. Cancelamento/expiração libera por evento auditável.
- Transferência é movimento pareado origem/destino, com trânsito opcional se houver expedição/recebimento em momentos distintos. Ambos os lados são atômicos ou têm estado em trânsito reconciliável; não criar estoque líquido.
- Matriz mostra estoque e cobertura por depósito e consolidado, distinguindo cobertura local da consolidada. Não prometer venda a partir de estoque em outro depósito sem prazo de transferência.
- QR codifica identificador aleatório/URL opaca, nunca dados de cliente, custo ou credencial. Resolver QR exige autenticação e permissão; etiqueta anulada não volta a ser válida. QR de lote e retalho aponta para a ficha corrente e histórico autorizado.
- Sazonalidade só é calculada com série suficiente para o número de ciclos definido pelo PI; ausente/incompleta = “dados insuficientes”. Não muda consumo, segurança ou sugestão sem opção/versionamento explícito.

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

Painel por depósito, modal de reserva, fluxo de transferência e ficha imprimível com QR. Fora: otimização automática de alocação, roteirização, inventário via câmera offline e estoque em trânsito de importação (LAC-10). Decidir regra de alocação, validade de reserva, ciclos mínimos de sazonalidade, tolerância, sequência de etiquetas e política de transferência antes de ativar. Dependência de eventos de venda e granularidade de movimento deve ser compatibilizada com schema M2.
