# SPEC LAC-09 — Financeiro, crédito e risco

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** fonte ERP/bancária a decidir, LAC-01, LAC-13, LAC-15

## Objetivo

Exibir contas a pagar/receber, limite de crédito, exposição e fluxo projetado com origem/reconciliação transparentes, sustentando indicadores financeiros sem inventar sinal quando faltam dados.

## Escopo de domínio

Cadastro de títulos por cliente/fornecedor com valor original, saldo, vencimento, moeda, status, origem e chave externa; eventos de liquidação/baixa são imutáveis e reconciliáveis. Crédito por cliente mantém limite vigente, fonte, aprovador e validade; consumo de limite agrega pedidos/faturas segundo regra aprovada. Atrasos são calculados por data de vencimento e saldo em aberto. Fluxo projetado separa confirmado, previsto e cenário; compras sugeridas não entram como obrigação até emissão/registro conforme decisão contábil.

Integração ERP é fonte provável, mas protocolo ainda não escolhido. Importação manual precisa idempotência por origem e relatório de divergências; não assumir saldo inicial ou conciliação bancária.

## Dados/rotas

`financial_titles(tenant_id, source_system, external_id, party_id, direction, amount, open_balance, currency, due_at, status, source_hash)`; `title_events(title_id, event_type, amount, occurred_at, source_ref, actor_id)`; `credit_limits(customer_id, limit_amount, currency, valid_from, valid_until, source, approved_by)`; `finance_import_runs(source, file_hash, counts, errors, started_at, finished_at)`.

`/financeiro` GET; `/api/finance/import` POST; `/api/finance/titles` read; `/api/finance/credit/:customerId` read/configure. Capacidades financeiras explícitas e deny-by-default. Copiloto recebe agregados mínimos conforme papel.

## Aceite

- Dados importados são idempotentes por origem/chave e divergências não são sobrescritas silenciosamente.
- Saldo aberto é reproduzível pela soma de eventos; estorno preserva evento original.
- Título vencido não pago é sinalizado pelo corte de data/fuso configurado; quitado não aparece vencido.
- Ausência de cobertura/fonte exibe “dados incompletos/indisponíveis”; nenhum cliente recebe risco baixo/alto por campo ausente.
- Limite vencido/inexistente não vira limite zero nem ilimitado; status é explícito.
- Termômetro do dashboard mostra cobertura, fonte e data; sem dados financeiros mostra indisponível e não alerta inadimplência.
- Acesso cruzado por papel/tenant é negado e registrado sem expor valor sensível.

## Fora e decisões

Fora: escrituração contábil, conciliação bancária, pagamentos, cobrança automática, scoring de bureau, hedge e recomendação de crédito autônoma. Decidir ERP/API/arquivo, fonte de bureau, componentes de limite, moeda/conversão, projeções, permissões, retenção e responsável financeiro. Até então ocultar termômetro/risco, substituindo por estado sem dados.
