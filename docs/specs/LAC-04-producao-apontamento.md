# SPEC LAC-04 — Ordens de produção e apontamento

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M3, LAC-03, LAC-11

## Objetivo

Converter pedido de venda confirmado em ordem de produção rastreável, com fila, estados executáveis, apontamento no chão de fábrica, consumo de lote/retalho e sincronização offline segura.

## Fluxo e invariantes

`planejada → liberada → em_corte → pausada (opcional) → concluida`; desvios vão a `cancelada` ou `bloqueada_qualidade`. Transições autorizadas e com justificativa; `em_corte` exige máquina/operador quando esses cadastros forem mandatórios por decisão. Orçamento isolado não consome material; conversão ocorre de pedido aprovado.

Cada ordem contém itens, especificação congelada do pedido, plano/manual de corte, quantidade planejada, prioridade e vínculo de venda. Reserva é feita via LAC-03; baixa física ocorre no apontamento confirmado, por movimentos idempotentes vinculados à ordem e lote. Retalho residual é criado como objeto filho do lote consumido com dimensões/peso medidos; perda não explicada fica como divergência pendente, não ajusta estoque por estimativa.

Apontamento offline tem UUID de operação gerado no cliente, data local + recebimento servidor, usuário/dispositivo, sequência e payload versionado. Servidor valida idempotência, permissão e saldo atual; conflito vai para fila de reconciliação e não sobrescreve estado/estoque silenciosamente. Nunca permitir quantidade negativa ou apontar ordem encerrada.

## Dados/rotas

`production_orders(tenant_id, number, sales_order_id, status, planned_start, due_at, version, created_by)`; `production_order_items(order_id, product_id, planned_qty, completed_qty, spec_snapshot)`; `production_operations(order_item_id, sequence, machine_id nullable, status, started_at, ended_at, operator_id)`; `production_consumptions(order_id, item_id, lot_id/remnant_id, quantity, movement_id, idempotency_key)`; `production_reports(id, tenant_id, order_id, operation_id, client_operation_id, device_id, payload, received_at, reconciliation_status)`; `production_residuals(... parent_lot_id, dimensions, weight, measured_by)`.

`/producao` GET, `/api/production/orders` POST (conversão autorizada), `/:id/transition` POST, `/:id/reports` POST offline/online, `/:id/consumptions` POST, `/:id/residuals` POST. Capabilities `production.read/release/report/consume/close`; estoque ainda exige capability de movimento. Guardas no servidor e auditoria.

## Aceite

- Pedido confirmado gera uma ordem única; retry não duplica.
- Ordem em `planejada` não tem consumo; transição para `em_corte` tem usuário e timestamp.
- Apontamento consome exatamente o saldo permitido uma vez; dois retries com mesmo client ID resultam em um movimento.
- Payload offline antigo/repetido é idempotente; saldo insuficiente/conflito vai para reconciliação sem mutação parcial.
- Fechar ordem exige quantidades produzidas/pendências justificadas e cada retalho tem origem rastreável.
- Usuário de vendas não pode apontar/baixar; operador sem permissão não libera ordem.
- Cancelamento libera reservas não consumidas, preserva consumo já realizado e exige regularização.

## Interface, limites e decisões

Fila kanban/tabular com detalhes, prioridades, botões de transição por papel e PWA de apontamento com estados sincronizado/pendente/conflito. Fora: nesting 2D/1D, CNC, sequenciamento ótimo, sensores/manutenção e custo real de produção. PI decide tolerância de rendimento, aprovação de perda/sucata, quem libera, campos mobile obrigatórios, expiração offline e se máquinas/operadores são obrigatórios. Sem essas decisões, operação manual controlada, sem automação de custo.
