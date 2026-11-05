# SPEC LAC-04 — Ordens de produção e apontamento

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** em implementação (decisões delegadas pelo PI em 05/11/2026) · **Dependências:** M3, LAC-03; integração futura com LAC-11

## Objetivo

Converter pedido de venda confirmado em ordem de produção rastreável, com fila, estados executáveis, apontamento no chão de fábrica, consumo de lote/retalho e sincronização offline segura.

## Fluxo e invariantes

`planejada → liberada → em_corte → pausada (opcional) → concluida`; desvios vão a `cancelada` ou `bloqueada_qualidade`. Transições autorizadas e com justificativa; `em_corte` exige máquina/operador quando esses cadastros forem mandatórios por decisão. Orçamento isolado não consome material; conversão ocorre de pedido aprovado.

Cada ordem contém itens, especificação congelada do pedido, plano/manual de corte, quantidade planejada, prioridade e vínculo de venda. Reserva é feita via LAC-03; baixa física ocorre no apontamento confirmado, por movimentos idempotentes vinculados à ordem e lote. Retalho residual é criado como objeto filho do lote consumido com dimensões/peso medidos; perda não explicada fica como divergência pendente, não ajusta estoque por estimativa.

Apontamento offline tem UUID de operação gerado no cliente, data local + recebimento servidor, usuário/dispositivo, sequência e payload versionado. Não há expiração automática; envio exige sessão válida e mesmo usuário que registrou localmente. Servidor valida idempotência, versão da ordem, permissão e saldo atual; conflito vai para reconciliação e não sobrescreve estado/estoque. Nunca permitir quantidade negativa ou apontar ordem encerrada.

## Dados/rotas

`production_orders(tenant_id, number, sales_order_id, status, planned_start, due_at, version, created_by)`; `production_order_items(order_id, product_id, planned_qty, completed_qty, cancelled_qty, spec_snapshot)`; `production_operations(order_item_id, sequence, machine_id nullable, status, started_at, ended_at, operator_id)`; `production_consumptions(order_id, item_id, reservation_id nullable, lot_id/remnant_id, quantity, movement_id, client_operation_id)`; `production_reports(id, tenant_id, order_id, operation_id, client_operation_id, device_id, sequence, payload_version, expected_order_version, payload, received_at, reconciliation_status)`; `production_residuals(... parent_lot_id, dimensions, measured_weight, measured_by, client_operation_id)`.

`/producao` GET; `/api/production/orders` GET/POST (criação também ocorre atomicamente na conversão autorizada do pedido); `/:id/transition` POST; `/:id/reports` POST offline/online; `/:id/consumptions` POST; `/:id/residuals` POST. Capabilities `production.read/release/report/consume/close`; consumo também exige escrita no módulo de estoque. Guardas no servidor e auditoria.

## Aceite

- Pedido confirmado gera uma ordem única; retry não duplica.
- Ordem em `planejada` não tem consumo; transição para `em_corte` tem usuário e timestamp.
- Apontamento consome exatamente o saldo permitido uma vez; dois retries com mesmo client ID resultam em um movimento.
- Payload offline antigo/repetido é idempotente; saldo insuficiente/conflito vai para reconciliação sem mutação parcial.
- Fechar ordem exige quantidades produzidas iguais às planejadas ou saldo pendente explicitamente cancelado com motivo e aprovação de admin/diretor; cada retalho tem origem rastreável.
- Usuário de vendas não pode apontar/baixar; operador sem permissão não libera ordem.
- Cancelamento libera reservas não consumidas, preserva consumo já realizado e exige regularização.

## Interface, limites e decisões

Fila kanban/tabular com detalhes, prioridades, botões de transição por papel e PWA de apontamento com estados sincronizado/pendente/conflito. Fora: nesting 2D/1D, CNC, sequenciamento ótimo, sensores/manutenção e custo real de produção. Sem automação de custo.

## Decisões delegadas pelo PI (05/11/2026)

- **Papéis:** admin recebe todas as capabilities; diretor pode ler, liberar, fechar e aprovar perda; estoque pode ler, apontar e consumir; vendedor pode apenas ler; comprador e financeiro não recebem acesso ao módulo. Consumo também exige `estoque_retalhos.write`.
- **Execução:** operador é sempre o usuário autenticado que aponta; máquina é opcional enquanto houver operação manual e cadastro não for obrigatório.
- **Offline:** sem expiração automática. Cliente persiste UUID, dispositivo, sequência, horário local, versão do payload e versão esperada da ordem. Sincronização exige sessão válida e mesmo usuário; saldo/versão divergente vai para reconciliação sem mutação parcial.
- **Rendimento e sucata:** tolerância automática zero. Qualquer diferença entre material consumido e quantidade produzida exige motivo e aprovação de admin/diretor antes da baixa. Nenhuma sucata/retalho é estimada.
- **Fechamento/cancelamento:** fechamento parcial só com quantidade pendente formalmente cancelada, motivo e aprovação de admin/diretor. Cancelamento libera reserva ainda não consumida e preserva baixas confirmadas; exige motivo e, havendo consumo, admin/diretor.
- **LAC-11:** para quebrar dependência circular, LAC-04 usa somente a proteção existente: lote com `status=bloqueado` não pode ser consumido; nenhum status de certificado/conformidade é inferido. Fluxos e decisões de qualidade seguem fora até LAC-11.
- **Retalhos:** orçamento/pedido mantém reserva do retalho; conversão não dá baixa física. Consumo ocorre em apontamento confirmado, e retalho residual exige medição explícita de peso e dimensões.
