# SPEC LAC-10 — Expedição, romaneio e rastreio logístico

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** implementação manual em andamento · **Dependências:** LAC-02, LAC-03; pedido de venda M3. LAC-09 não fornece dados financeiros ativos.

## Objetivo

Controlar preparação e expedição de pedidos, romaneio, volumes/carga, eventos de transporte e visibilidade de importações com impacto de prazo no estoque.

## Regras

- Expedição só pode alocar itens de venda confirmados e material disponível/reservado conforme LAC-03. Romaneio congela composição, quantidades, peso/unidade e destino no momento da saída.
- Eventos logísticos incluem origem, ator/provedor, instante, localização opcional, evidência e status; correções geram novos eventos.
- Previsão de chegada é estimativa com fonte e timestamp. Atraso não ajusta automaticamente lead time nem dispara troca de fornecedor sem revisão.
- Rastreamento de importação guarda marcos navio/porto/desembaraço se houver fonte válida; sem integração, registro manual claramente identificado.
- Dados de localização/acesso por papel; cliente não tem portal nesta SPEC.

## Dados/rotas

`shipments(tenant_id, number, sales_order_id, status, origin, destination, carrier nullable, planned_at, dispatched_at, delivered_at)`; `shipment_items(shipment_id, sales_order_item_id, quantity, weight, unit)`; `shipment_events(shipment_id, type, occurred_at, source, location, evidence_ref, created_by)`; `import_tracking(tenant_id, purchase_order_id, reference, milestone, eta, source, observed_at)`.

`/logistica/expedicoes` GET/POST; `/api/shipments/:id/dispatch|event|deliver`; `/api/import-tracking` read/write manual. Permissões `logistics.read/prepare/dispatch/track`.

## Aceite

- Não despacha quantidade maior que pedido nem material sem alocação/estoque elegível.
- Emissão do romaneio registra hash/composição e usuário; alterações posteriores aparecem como evento/correção.
- Repetição de despacho com chave igual não duplica saída/movimento.
- ETA vencida aparece como atraso estimado, mantendo última fonte/data; não afirma atraso confirmado sem evento.
- Evento manual e integrado são distinguíveis; fonte ausente não produz ETA inventada.
- Operador sem permissão e tenant incorreto não cria nem consulta expedição.

## Fora/decisões

Fora: roteirização otimizada, cotação de frete, integração transportadora, portal do cliente, rastreamento de navio automático e faturamento fiscal. Decidir unidades/pesos legais, transportadoras, comprovante de entrega, segregação de endereço, fonte de eventos e custo do frete.

## Defaults autorizados pelo PI em 05/11/2026

- Operação manual, sem integração ou cálculo de frete. Fonte de todo evento e ETA criado pela tela: `manual`; ETA sem fonte não é aceita.
- Quantidade comercial permanece em unidades dos itens do orçamento; peso bruto em kg é fotografia informativa. Item só pode ser alocado após produção concluída, com `completedQty` suficiente. LAC-04 já baixa matéria-prima e consome reserva no apontamento: despacho não cria segunda movimentação de estoque. Não há conversão genérica entre unidades.
- Origem e destino são textos informados pelo operador e congelados no romaneio; endereço de cliente não é alterado. Transportadora opcional como texto. Um romaneio cobre pedido inteiro; fracionamento fica pendente de modelo de estoque acabado.
- Quantidade de volumes é inteiro positivo informado na preparação e entra no hash do romaneio. Peso bruto é soma dos itens do orçamento, sem balança integrada.
- Comprovante de entrega é referência textual opcional, sem upload ou afirmação de autenticidade. Entrega exige evento manual com ator e instante.
- Apenas pedido `pronto_faturamento` pode ser preparado. `admin` e `diretor` leem, preparam e despacham; `estoque` lê, prepara e registra eventos; demais papéis sem acesso. Despacho não grava segunda saída de matéria-prima.
- Importação: marcos manuais com referência de pedido de compra e fonte explícita. ETA vencida é rotulada `atraso estimado`; não altera lead time nem confirma atraso.
